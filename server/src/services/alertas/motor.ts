import { Prisma, type AlertType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Decimal, ZERO, somarMeses } from "../../lib/money.js";
import { Calculadora, ativoNoMes, type Orcamento } from "../orcamentos.js";
import { datasDaFatura } from "../cartoes.js";
import { CANAIS, type CanalAlerta, type MensagemAlerta } from "./canais.js";
import { inscritosDoEspaco, DIAS_FATURA_MAX, type Inscrito } from "./preferencias.js";
import {
  agruparContas,
  dentroDoHorario,
  diaLocal,
  diasEntre,
  faturaNoPrazo,
  formatarDia,
  formatarPercentual,
  formatarReais,
  inicioDoDiaLocal,
  nivelDoOrcamento,
  percentual,
  quandoVence,
  somarDias,
  type ContaPendente,
  type NivelOrcamento,
} from "./regras.js";

// ─────────────────────────────────────────────
// Motor dos alertas: roda de hora em hora (ver agendarAlertas) e, para cada espaço,
// descobre o que avisar e manda para quem tem o alerta ligado, em cada canal.
//
// Sem repetição: antes de enviar, grava um SentAlert (chave única por pessoa, espaço, canal,
// tipo e refKey). Se já existia, não envia. Se o envio falhar, apaga o registro para tentar
// de novo na próxima hora. Funciona mesmo com várias instâncias rodando ao mesmo tempo.
// ─────────────────────────────────────────────

type Espaco = { id: string; name: string };

export type Resultado = { enviados: number; porTipo: Record<AlertType, number>; erros: number };

// Grava o "já enviei". false = já tinha sido enviado.
async function reservar(userId: string, householdId: string, canal: CanalAlerta, type: AlertType, refKey: string) {
  try {
    await prisma.sentAlert.create({ data: { userId, householdId, channel: canal.id, type, refKey } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

async function liberar(userId: string, householdId: string, canal: CanalAlerta, type: AlertType, refKey: string) {
  await prisma.sentAlert.deleteMany({ where: { userId, householdId, channel: canal.id, type, refKey } });
}

class Envio {
  r: Resultado = { enviados: 0, erros: 0, porTipo: { BUDGET_WARNING: 0, BUDGET_OVER: 0, INVOICE_DUE: 0, BILLS_DIGEST: 0 } };

  async mandar(canal: CanalAlerta, espaco: Espaco, pessoa: Inscrito, type: AlertType, refKey: string, montar: () => MensagemAlerta) {
    if (!(await reservar(pessoa.userId, espaco.id, canal, type, refKey))) return false;
    try {
      await canal.enviar({ userId: pessoa.userId, nome: pessoa.nome, email: pessoa.email }, montar());
      this.r.enviados++;
      this.r.porTipo[type]++;
      return true;
    } catch (e) {
      this.r.erros++;
      console.error(`Alerta ${type} (${canal.id}) para ${pessoa.userId} falhou`, e);
      await liberar(pessoa.userId, espaco.id, canal, type, refKey);
      return false;
    }
  }
}

// ── Orçamentos ─────────────────────────────────

type AvisoOrcamento = { b: Orcamento; mes: string; chave: string; nivel: Exclude<NivelOrcamento, null>; meta: Prisma.Decimal; usado: Prisma.Decimal };

const nomesMes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => `${nomesMes[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

// Orçamentos de despesa ativos hoje que chegaram ao alerta ou estouraram
export async function avisosDeOrcamento(householdId: string, hoje: string): Promise<AvisoOrcamento[]> {
  const mes = hoje.slice(0, 7);
  const calc = await Calculadora.carregar(householdId);
  const avisos: AvisoOrcamento[] = [];
  for (const b of calc.lista) {
    if (b.kind !== "EXPENSE") continue;
    const ativo = b.period === "CUSTOM" ? b.startDate! <= hoje && hoje <= b.endDate! : ativoNoMes(b, mes);
    if (!ativo) continue;
    const p = await calc.progresso(b, mes);
    const nivel = nivelDoOrcamento(p.used, p.goal, b.alertPercent);
    if (!nivel) continue;
    const chave = b.period === "CUSTOM" ? `${b.id}:${b.startDate}_${b.endDate}` : `${b.id}:${mes}`;
    avisos.push({ b, mes, chave, nivel, meta: p.goal, usado: p.used });
  }
  return avisos;
}

function mensagemOrcamento(a: AvisoOrcamento, espaco: Espaco): MensagemAlerta {
  const pct = formatarPercentual(percentual(a.usado, a.meta));
  const periodo = a.b.period === "CUSTOM" ? `de ${formatarDia(a.b.startDate!)} a ${formatarDia(a.b.endDate!)}` : `de ${nomeDoMes(a.mes)}`;
  const estourou = a.nivel === "OVER";
  const titulo = estourou ? `O orçamento “${a.b.name}” estourou` : `O orçamento “${a.b.name}” chegou a ${pct}`;
  return {
    assunto: estourou ? `Orçamento “${a.b.name}” estourou (${pct} da meta)` : `Orçamento “${a.b.name}” chegou a ${pct} da meta`,
    titulo,
    paragrafos: [
      estourou
        ? `Os gastos ${periodo} já passaram da meta: ${pct} usados.`
        : `Os gastos ${periodo} já usaram ${pct} da meta. Ainda dá tempo de ajustar.`,
    ],
    grupos: [
      {
        itens: [
          { rotulo: "Meta", valor: formatarReais(a.meta) },
          { rotulo: "Usado", valor: formatarReais(a.usado) },
          estourou
            ? { rotulo: "Passou da meta", valor: formatarReais(a.usado.minus(a.meta)) }
            : { rotulo: "Ainda cabe", valor: formatarReais(Decimal.max(a.meta.minus(a.usado), ZERO)) },
        ],
      },
    ],
    botao: { texto: "Ver orçamento", caminho: `/app/orcamentos/${a.b.id}${a.b.period === "MONTHLY" ? `?mes=${a.mes}` : ""}` },
    espaco: espaco.name,
  };
}

// ── Faturas ────────────────────────────────────

type AvisoFatura = {
  cartao: { id: string; name: string };
  mes: string;
  vencimento: string; // AAAA-MM-DD
  dias: number;
  total: Prisma.Decimal;
  pago: Prisma.Decimal;
};

// Faturas com valor a pagar que vencem nos próximos DIAS_FATURA_MAX dias (cada pessoa filtra pelo seu prazo)
export async function avisosDeFatura(householdId: string, hoje: string): Promise<AvisoFatura[]> {
  const cartoes = await prisma.financialAccount.findMany({
    where: { householdId, type: "CREDIT_CARD", archivedAt: null, closingDay: { not: null }, dueDay: { not: null } },
    select: { id: true, name: true, closingDay: true, dueDay: true },
    orderBy: { createdAt: "asc" },
  });
  const mes = hoje.slice(0, 7);
  const avisos: AvisoFatura[] = [];
  for (const c of cartoes) {
    const dias = { closingDay: c.closingDay!, dueDay: c.dueDay! };
    for (const m of [somarMeses(mes, -1), mes, somarMeses(mes, 1)]) {
      const vencimento = diaLocal(datasDaFatura(m, dias).dueDate);
      const faltam = diasEntre(hoje, vencimento);
      if (!faturaNoPrazo(faltam, DIAS_FATURA_MAX)) continue;
      const [compras, pagos] = await Promise.all([
        prisma.transaction.aggregate({ where: { householdId, accountId: c.id, type: "EXPENSE", invoiceMonth: m }, _sum: { amount: true } }),
        prisma.transaction.aggregate({
          where: { householdId, toAccountId: c.id, type: "TRANSFER", status: "CONFIRMED", invoiceMonth: m },
          _sum: { amount: true },
        }),
      ]);
      const total = compras._sum.amount ?? ZERO;
      const pago = pagos._sum.amount ?? ZERO;
      if (!total.gt(pago)) continue; // sem compras ou já paga
      avisos.push({ cartao: { id: c.id, name: c.name }, mes: m, vencimento, dias: faltam, total, pago });
    }
  }
  return avisos;
}

function mensagemFatura(a: AvisoFatura, espaco: Espaco): MensagemAlerta {
  const aPagar = a.total.minus(a.pago);
  const quando = quandoVence(a.dias);
  const itens = [
    { rotulo: "Vencimento", valor: formatarDia(a.vencimento) },
    { rotulo: "Valor da fatura", valor: formatarReais(a.total) },
    ...(a.pago.gt(0) ? [{ rotulo: "Já pago", valor: formatarReais(a.pago) }, { rotulo: "Falta pagar", valor: formatarReais(aPagar) }] : []),
  ];
  return {
    assunto: `Fatura ${a.cartao.name} ${quando}: ${formatarReais(aPagar)}`,
    titulo: `A fatura do cartão ${a.cartao.name} ${quando}`,
    paragrafos: [`Valor a pagar: ${formatarReais(aPagar)}, com vencimento em ${formatarDia(a.vencimento)}.`],
    grupos: [{ itens }],
    botao: { texto: "Ver fatura", caminho: `/app/cartoes/${a.cartao.id}?mes=${a.mes}` },
    espaco: espaco.name,
  };
}

// ── Contas a pagar (resumo do dia) ─────────────

// Despesas pendentes (não efetivadas) que vencem hoje ou amanhã. Compras no cartão ficam de fora (vão na fatura).
export async function contasPendentes(householdId: string, hoje: string): Promise<ContaPendente[]> {
  const lista = await prisma.transaction.findMany({
    where: {
      householdId,
      type: "EXPENSE",
      status: "PENDING",
      invoiceMonth: null,
      isAdjustment: false,
      date: { gte: inicioDoDiaLocal(hoje), lt: inicioDoDiaLocal(somarDias(hoje, 2)) },
    },
    select: { id: true, description: true, amount: true, date: true, account: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return lista.map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: t.date, accountName: t.account.name }));
}

function mensagemContas(grupos: ReturnType<typeof agruparContas>, hoje: string, espaco: Espaco): MensagemAlerta {
  const soma = (l: ContaPendente[]) => l.reduce((s, c) => s.plus(c.amount), ZERO);
  const total = soma([...grupos.hoje, ...grupos.amanha]);
  const qtd = grupos.hoje.length + grupos.amanha.length;
  const partes = [
    grupos.hoje.length ? `${grupos.hoje.length} hoje` : null,
    grupos.amanha.length ? `${grupos.amanha.length} amanhã` : null,
  ].filter(Boolean);
  const item = (c: ContaPendente) => ({ rotulo: c.description, valor: formatarReais(c.amount), detalhe: c.accountName });
  return {
    assunto: `Contas a pagar: ${partes.join(" e ")} (${formatarReais(total)})`,
    titulo: qtd === 1 ? "Você tem 1 conta a pagar" : `Você tem ${qtd} contas a pagar`,
    paragrafos: ["Despesas ainda não efetivadas que vencem hoje ou amanhã. Depois de pagar, marque como efetivada em Lançamentos."],
    grupos: [
      ...(grupos.hoje.length ? [{ titulo: `Vencem hoje (${formatarDia(hoje)})`, itens: grupos.hoje.map(item) }] : []),
      ...(grupos.amanha.length ? [{ titulo: `Vencem amanhã (${formatarDia(somarDias(hoje, 1))})`, itens: grupos.amanha.map(item) }] : []),
      { itens: [{ rotulo: "Total", valor: formatarReais(total) }] },
    ],
    botao: { texto: "Ver lançamentos", caminho: `/app/lancamentos?mes=${hoje.slice(0, 7)}` },
    espaco: espaco.name,
  };
}

// ── Rodada ─────────────────────────────────────

type Opcoes = { agora?: Date; canais?: CanalAlerta[]; ignorarHorario?: boolean; householdIds?: string[] };

export async function rodarAlertas({ agora = new Date(), canais = CANAIS, ignorarHorario = false, householdIds }: Opcoes = {}): Promise<Resultado> {
  const envio = new Envio();
  if (!ignorarHorario && !dentroDoHorario(agora)) return envio.r;
  const hoje = diaLocal(agora);

  const espacos = await prisma.household.findMany({
    where: householdIds ? { id: { in: householdIds } } : {},
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  for (const espaco of espacos) {
    try {
      await alertasDoEspaco(espaco, hoje, canais, envio);
    } catch (e) {
      envio.r.erros++;
      console.error(`Alertas do espaço ${espaco.id} falharam`, e);
    }
  }
  return envio.r;
}

async function alertasDoEspaco(espaco: Espaco, hoje: string, canais: CanalAlerta[], envio: Envio) {
  // Cálculos do espaço (feitos uma vez só, e só se alguém quiser aquele tipo)
  let orcamentos: Promise<AvisoOrcamento[]> | null = null;
  let faturas: Promise<AvisoFatura[]> | null = null;
  let contas: Promise<ReturnType<typeof agruparContas>> | null = null;

  for (const canal of canais) {
    const pessoas = await inscritosDoEspaco(espaco.id, canal.id);
    for (const pessoa of pessoas) {
      if (pessoa.prefs.budget) {
        orcamentos ??= avisosDeOrcamento(espaco.id, hoje);
        for (const a of await orcamentos) {
          if (a.nivel === "OVER") {
            const foi = await envio.mandar(canal, espaco, pessoa, "BUDGET_OVER", a.chave, () => mensagemOrcamento(a, espaco));
            // Pulou direto para mais de 100%: o aviso de 80% não sai mais neste período
            if (foi) await reservar(pessoa.userId, espaco.id, canal, "BUDGET_WARNING", a.chave);
          } else {
            await envio.mandar(canal, espaco, pessoa, "BUDGET_WARNING", a.chave, () => mensagemOrcamento(a, espaco));
          }
        }
      }
      if (pessoa.prefs.invoice) {
        faturas ??= avisosDeFatura(espaco.id, hoje);
        for (const a of await faturas) {
          if (!faturaNoPrazo(a.dias, pessoa.prefs.invoiceDaysBefore)) continue;
          await envio.mandar(canal, espaco, pessoa, "INVOICE_DUE", `${a.cartao.id}:${a.mes}`, () => mensagemFatura(a, espaco));
        }
      }
      if (pessoa.prefs.bills) {
        contas ??= contasPendentes(espaco.id, hoje).then((l) => agruparContas(l, hoje));
        const g = await contas;
        if (g.hoje.length + g.amanha.length > 0) {
          await envio.mandar(canal, espaco, pessoa, "BILLS_DIGEST", hoje, () => mensagemContas(g, hoje, espaco));
        }
      }
    }
  }
}

// ── Agendamento (mesmo padrão da efetivação automática) ──

const UMA_HORA = 60 * 60 * 1000;

// Roda 1 minuto depois do start (depois da efetivação automática) e então a cada hora.
// Uma rodada por vez: se a anterior ainda não terminou, pula.
export function agendarAlertas() {
  let rodando = false;
  const rodar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const r = await rodarAlertas();
      if (r.enviados || r.erros) console.log(`Alertas: ${r.enviados} enviado(s), ${r.erros} erro(s).`);
    } catch (e) {
      console.error("Alertas falharam", e);
    } finally {
      rodando = false;
    }
  };
  let timer: NodeJS.Timeout | null = null;
  const inicio = setTimeout(() => {
    void rodar();
    timer = setInterval(() => void rodar(), UMA_HORA);
    timer.unref();
  }, 60 * 1000);
  inicio.unref();
  return () => {
    clearTimeout(inicio);
    if (timer) clearInterval(timer);
  };
}
