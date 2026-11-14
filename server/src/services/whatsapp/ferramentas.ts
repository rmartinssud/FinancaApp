import type { MemberRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Decimal, ZERO, diasNoMes, intervaloDoMes, mesAtual, partesLocais, somarMeses } from "../../lib/money.js";
import { contasComSaldo } from "../saldos.js";
import { cartoesComFatura, datasDaFatura, dividirParcelas, mesDaFatura, somarMesesNaData } from "../cartoes.js";
import { Calculadora, ativoNoMes, categoriasDoFiltro, serializarProgresso } from "../orcamentos.js";
import { comProgresso as objetivosComProgresso } from "../objetivos.js";
import { calcularSaldo, montarPlano, pagoPorDivida, type DividaPlano } from "../dividas.js";
import { comSubcategorias, filtroCategorias, mapaDePais, selecionarPorcoes, somarPorCategoria, valorNasCategorias } from "../porcoes.js";
import { diaLocal, formatarDia, formatarReais, inicioDoDiaLocal, somarDias } from "../alertas/regras.js";
import { normalizar } from "./parser.js";
import { acharCategoria, acharConta, categoriaPeloNome, type CategoriaSimples, type ContaSimples } from "./casamento.js";
import { VALIDADE_RASCUNHO_MIN, categoriasDoEspaco, contasDoEspaco, hojeLocal, nomeFatura, rascunhoPendente, textoDoRascunho } from "./rascunhos.js";
import { buscarNaAjuda, artigosDaAjuda } from "./conhecimento.js";
import type { FerramentaIA } from "./ia.js";

// ─────────────────────────────────────────────
// Ferramentas do assistente do WhatsApp (function calling).
//
// Regras de segurança (valem para todas):
// - o espaço e a pessoa vêm SEMPRE do contexto do número ligado (ctx), nunca dos argumentos da IA;
// - consultas só leem; nada aqui grava lançamento. As ferramentas de rascunho criam/alteram
//   um RASCUNHO, que só vira lançamento quando a pessoa confirma (botão Confirmar ou "sim");
// - Visualizador (VIEWER) só consulta: as ferramentas de rascunho nem são oferecidas e, se chamadas, recusam.
// Os valores voltam já formatados em reais ("R$ 1.234,56") para a IA não errar a conta ao escrever.
// ─────────────────────────────────────────────

export type ContextoAgente = {
  waId: string;
  userId: string;
  nome: string;
  householdId: string;
  espaco: string;
  role: MemberRole;
};

// O que aconteceu no turno (o bot usa para mandar os botões do rascunho)
export type EstadoTurno = { rascunhoId: string | null; cancelouRascunho: boolean; ferramentas: string[] };

type Args = Record<string, unknown>;
type Ferramenta = FerramentaIA & { escrita?: boolean; executar(ctx: ContextoAgente, args: Args, estado: EstadoTurno): Promise<Record<string, unknown>> };

const brl = (v: Prisma.Decimal | number | string) => formatarReais(v);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const pct = (parte: Prisma.Decimal, todo: Prisma.Decimal) => (todo.gt(0) ? `${parte.div(todo).times(100).toDecimalPlaces(1).toNumber().toLocaleString("pt-BR")}%` : null);

// ── Leitura de argumentos (a IA pode mandar qualquer coisa) ──

const texto = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const mesArg = (v: unknown) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
const diaArg = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);
function inteiro(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
// 45.9, "45,90", "1.234,56", "R$ 300" → Decimal com 2 casas
export function valorArg(v: unknown): Prisma.Decimal | null {
  let s: string;
  if (typeof v === "number") s = String(v);
  else if (typeof v === "string") {
    s = v.replace(/r\$|\s/gi, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  } else return null;
  if (!/^\d{1,9}(\.\d+)?$/.test(s)) return null;
  const d = new Decimal(s).toDecimalPlaces(2);
  return d.gt(0) ? d : null;
}

// ── Totais do mês (mesmas regras do Início) ──

function filtroDoMes(householdId: string, mes: string) {
  return {
    householdId,
    isAdjustment: false,
    OR: [{ invoiceMonth: null, date: intervaloDoMes(mes) }, { invoiceMonth: mes }],
  } satisfies Prisma.TransactionWhereInput;
}

async function totaisDoMes(householdId: string, mes: string) {
  const somas = await prisma.transaction.groupBy({
    by: ["type", "status"],
    where: { ...filtroDoMes(householdId, mes), type: { in: ["INCOME", "EXPENSE"] }, ignoreInTotals: false },
    _sum: { amount: true },
  });
  const pegar = (type: string, status: string) => somas.find((s) => s.type === type && s.status === status)?._sum.amount ?? ZERO;
  return {
    receitas: pegar("INCOME", "CONFIRMED"),
    despesas: pegar("EXPENSE", "CONFIRMED"),
    receitasPendentes: pegar("INCOME", "PENDING"),
    despesasPendentes: pegar("EXPENSE", "PENDING"),
  };
}

// Média dos 3 meses completos anteriores (receitas e despesas confirmadas)
async function mediaDos3Meses(householdId: string) {
  const atual = mesAtual();
  const meses = [1, 2, 3].map((i) => somarMeses(atual, -i));
  const totais = await Promise.all(meses.map((m) => totaisDoMes(householdId, m)));
  const comDados = totais.filter((t) => t.receitas.gt(0) || t.despesas.gt(0));
  if (!comDados.length) return null;
  const n = comDados.length;
  const receitas = comDados.reduce((s, t) => s.plus(t.receitas), ZERO).div(n).toDecimalPlaces(2);
  const despesas = comDados.reduce((s, t) => s.plus(t.despesas), ZERO).div(n).toDecimalPlaces(2);
  return { meses: n, receitas, despesas, folga: receitas.minus(despesas) };
}

// ── Contas, cartões e categorias pelo nome ──

const PALAVRAS_DE_CONTA = new Set(["cartao", "cartoes", "credito", "conta", "banco", "no", "na", "do", "da", "de"]);

type ContaDoEspaco = Awaited<ReturnType<typeof contasDoEspaco>>[number];

// Acha a conta/cartão que a IA escreveu ("cartão Santander", "Nubank", "dinheiro", "pix").
export function resolverConta(contas: ContaDoEspaco[], nome: string | null, opcoes: { cartao?: boolean } = {}) {
  const ativas = contas.filter((c) => !c.archivedAt);
  const cartoes = ativas.filter((c) => c.type === "CREDIT_CARD");
  const comuns = ativas.filter((c) => c.type !== "CREDIT_CARD");
  const lista = (l: ContaDoEspaco[]) => l.map((c) => c.name);
  const normal = nome ? normalizar(nome) : "";
  const pediuCartao = opcoes.cartao || /\bcartao\b|\bcredito\b/.test(normal);
  const palavras = normal.split(/[^a-z0-9]+/).filter((p) => p && !PALAVRAS_DE_CONTA.has(p));
  const candidatas = pediuCartao ? cartoes : ativas;

  if (palavras.length) {
    const alvo = palavras.join(" ");
    const exata = candidatas.filter((c) => normalizar(c.name) === alvo);
    if (exata.length === 1) return { ok: true as const, conta: exata[0] };
    const contem = candidatas.filter((c) => normalizar(c.name).includes(alvo) || alvo.includes(normalizar(c.name)));
    if (contem.length === 1) return { ok: true as const, conta: contem[0] };
    if (contem.length > 1) return { ok: false as const, erro: `Mais de uma conta combina com "${nome}".`, opcoes: lista(contem) };
    const forma = palavras.includes("dinheiro") || palavras.includes("especie") ? "dinheiro" : palavras.includes("pix") ? "pix" : palavras.includes("debito") ? "debito" : null;
    const r = acharConta(palavras, contas as ContaSimples[], { cartao: pediuCartao, forma });
    if (r.ok && (forma || r.usadas.length)) return { ok: true as const, conta: ativas.find((c) => c.id === r.conta.id)! };
    return { ok: false as const, erro: `Não achei "${nome}" entre as ${pediuCartao ? "cartões" : "contas e cartões"} do espaço.`, opcoes: lista(pediuCartao ? cartoes : ativas) };
  }
  if (pediuCartao) {
    if (cartoes.length === 1) return { ok: true as const, conta: cartoes[0] };
    if (!cartoes.length) return { ok: false as const, erro: "Não há cartão de crédito cadastrado neste espaço (cadastre em famicash.com › Cartões).", opcoes: [] };
    return { ok: false as const, erro: "Qual cartão? Pergunte à pessoa.", opcoes: lista(cartoes) };
  }
  const padrao = comuns.find((c) => c.isDefault) ?? comuns.find((c) => c.type === "WALLET") ?? comuns[0];
  if (padrao) return { ok: true as const, conta: padrao };
  return { ok: false as const, erro: "Não há conta neste espaço (crie em famicash.com › Contas).", opcoes: [] };
}

function resolverCategoria(categorias: CategoriaSimples[], nome: string | null, tipo: "INCOME" | "EXPENSE") {
  if (!nome) return null;
  return categoriaPeloNome(nome, categorias, tipo);
}

const nomesDasCategorias = (categorias: CategoriaSimples[], tipo: "INCOME" | "EXPENSE") => categorias.filter((c) => c.type === tipo).map((c) => c.name).slice(0, 60);

// ─────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────

const PARAM_MES = { type: "STRING", description: "Mês AAAA-MM. Sem valor: o mês atual." };

const resumoFinanceiro: Ferramenta = {
  nome: "resumo_financeiro",
  descricao:
    "Visão geral das finanças do espaço: saldo de cada conta, receitas e despesas do mês (efetivadas e pendentes), comparação com os 3 meses anteriores e as categorias onde mais gastou. Use para 'como estão minhas finanças', 'quanto gastei este mês', 'tenho dinheiro?'.",
  parametros: { type: "OBJECT", properties: { mes: PARAM_MES } },
  async executar(ctx, args) {
    const mes = mesArg(args.mes) ?? mesAtual();
    const contas = (await contasComSaldo(ctx.householdId)).filter((c) => c.type !== "CREDIT_CARD" && !c.archivedAt);
    const total = contas.filter((c) => !c.ignoreInTotals).reduce((s, c) => s.plus(c.currentBalance), ZERO);
    const doMes = await totaisDoMes(ctx.householdId, mes);
    const anteriores = await Promise.all([1, 2, 3].map(async (i) => ({ mes: somarMeses(mes, -i), ...(await totaisDoMes(ctx.householdId, somarMeses(mes, -i))) })));

    const [despesas, pais] = await Promise.all([
      prisma.transaction.findMany({ where: { ...filtroDoMes(ctx.householdId, mes), status: "CONFIRMED", type: "EXPENSE", ignoreInStatistics: false }, select: selecionarPorcoes }),
      mapaDePais(ctx.householdId),
    ]);
    const top = [...somarPorCategoria(despesas, pais).entries()].sort((a, b) => b[1].comparedTo(a[1])).slice(0, 5);
    const nomes = await prisma.category.findMany({ where: { householdId: ctx.householdId, id: { in: top.flatMap(([id]) => (id ? [id] : [])) } }, select: { id: true, name: true } });

    const atual = mes === mesAtual();
    const hoje = hojeLocal();
    return {
      espaco: ctx.espaco,
      mes: nomeDoMes(mes),
      ...(atual ? { diaDeHoje: Number(hoje.slice(8, 10)), diasNoMes: diasNoMes(mes) } : {}),
      saldoTotalDasContas: brl(total),
      contas: contas.map((c) => ({ nome: c.name, saldo: brl(c.currentBalance), ...(c.ignoreInTotals ? { foraDoTotal: true } : {}) })),
      mesAtual: {
        receitasEfetivadas: brl(doMes.receitas),
        despesasEfetivadas: brl(doMes.despesas),
        saldoDoMes: brl(doMes.receitas.minus(doMes.despesas)),
        receitasPendentes: brl(doMes.receitasPendentes),
        despesasPendentes: brl(doMes.despesasPendentes),
        saldoPrevistoComPendentes: brl(doMes.receitas.plus(doMes.receitasPendentes).minus(doMes.despesas).minus(doMes.despesasPendentes)),
      },
      mesesAnteriores: anteriores.map((a) => ({ mes: nomeDoMes(a.mes), receitas: brl(a.receitas), despesas: brl(a.despesas), saldo: brl(a.receitas.minus(a.despesas)) })),
      ondeMaisGastou: top.map(([id, v]) => ({ categoria: nomes.find((n) => n.id === id)?.name ?? "Sem categoria", valor: brl(v), doTotal: pct(v, doMes.despesas) })),
      observacao: "Compras no cartão contam no mês da fatura (vencimento). Valores só do espaço " + ctx.espaco + ".",
    };
  },
};

const orcamentos: Ferramenta = {
  nome: "orcamentos",
  descricao:
    "Orçamentos do mês com meta, quanto já usou, saldo e, no mês atual, a projeção pelo ritmo de gasto até hoje (se vai estourar). Use para 'como está meu orçamento', 'vou estourar?'.",
  parametros: { type: "OBJECT", properties: { mes: PARAM_MES } },
  async executar(ctx, args) {
    const mes = mesArg(args.mes) ?? mesAtual();
    const calc = await Calculadora.carregar(ctx.householdId);
    const doMes = calc.lista.filter((b) => ativoNoMes(b, mes));
    if (!doMes.length) return { mes: nomeDoMes(mes), orcamentos: [], observacao: "Nenhum orçamento neste mês. Dá para criar em famicash.com › Orçamentos." };
    const atual = mes === mesAtual();
    const dia = Number(hojeLocal().slice(8, 10));
    const dias = diasNoMes(mes);
    const lista = await Promise.all(
      doMes.map(async (b) => {
        const p = await calc.progresso(b, mes);
        const s = serializarProgresso(b, p);
        const item: Record<string, unknown> = {
          nome: b.name,
          tipo: b.kind === "EXPENSE" ? "despesa" : "receita",
          ...(b.isGroup ? { agrupado: true } : {}),
          meta: brl(p.goal),
          usado: brl(p.used),
          saldo: brl(p.balance),
          percentual: s.percent === null ? null : `${s.percent.toLocaleString("pt-BR")}%`,
          situacao: { OVER: "estourado", ALERT: "passou do alerta", REACHED: "meta de receita alcançada", OK: "ok" }[s.status],
        };
        if (atual && b.kind === "EXPENSE" && b.period === "MONTHLY" && p.goal.gt(0)) {
          const projecao = p.used.div(Math.max(dia, 1)).times(dias).toDecimalPlaces(2);
          item.projecaoNoFimDoMes = brl(projecao);
          item.vaiEstourarNoRitmoAtual = projecao.gt(p.goal);
          item.podeGastarPorDiaAteOFim = brl(Decimal.max(p.balance, ZERO).div(Math.max(dias - dia + 1, 1)).toDecimalPlaces(2));
          if (dia < 7) item.cedoParaProjetar = true;
        }
        return item;
      }),
    );
    return { mes: nomeDoMes(mes), ...(atual ? { diaDeHoje: dia, diasNoMes: dias } : {}), orcamentos: lista };
  },
};

const objetivos: Ferramenta = {
  nome: "objetivos",
  descricao:
    "Objetivos/metas de economia ativos: meta, quanto já guardou, quanto falta, data alvo, quanto precisa guardar por mês, o ritmo médio dos últimos 3 meses e se nesse ritmo alcança no prazo.",
  async executar(ctx) {
    const lista = await prisma.goal.findMany({ where: { householdId: ctx.householdId, status: "ACTIVE" }, include: { account: true }, orderBy: { createdAt: "asc" } });
    if (!lista.length) return { objetivos: [], observacao: "Nenhum objetivo ativo. Dá para criar em famicash.com › Objetivos." };
    const comP = await objetivosComProgresso(lista);
    const desde = intervaloDoMes(somarMeses(mesAtual(), -3)).gte;
    const entradas = await prisma.goalEntry.groupBy({ by: ["goalId", "kind"], where: { goalId: { in: lista.map((g) => g.id) }, date: { gte: desde } }, _sum: { amount: true } });
    return {
      objetivos: comP.map((g) => {
        const dep = entradas.find((e) => e.goalId === g.id && e.kind === "DEPOSIT")?._sum.amount ?? ZERO;
        const ret = entradas.find((e) => e.goalId === g.id && e.kind !== "DEPOSIT")?._sum.amount ?? ZERO;
        const ritmo = dep.minus(ret).div(3).toDecimalPlaces(2);
        const falta = new Decimal(g.progress.remaining);
        const porMes = g.progress.perMonth ? new Decimal(g.progress.perMonth) : null;
        return {
          nome: g.name,
          meta: brl(g.targetAmount),
          guardado: brl(g.progress.saved),
          falta: brl(falta),
          percentual: `${g.progress.percent.toLocaleString("pt-BR")}%`,
          dataAlvo: g.targetDate ? formatarDia(g.targetDate) : null,
          mesesRestantes: g.progress.monthsLeft,
          precisaGuardarPorMes: porMes ? brl(porMes) : null,
          ritmoMedioPorMesUltimos3Meses: brl(ritmo),
          mesesParaChegarNoRitmoAtual: falta.lte(0) ? 0 : ritmo.gt(0) ? Math.ceil(falta.div(ritmo).toNumber()) : null,
          alcancaNoPrazoNoRitmoAtual: porMes ? ritmo.gte(porMes) : null,
          noRitmoEsperadoAteHoje: g.progress.onTrack,
          atrasado: g.progress.overdue,
        };
      }),
    };
  },
};

const cartoesEFaturas: Ferramenta = {
  nome: "cartoes_e_faturas",
  descricao:
    "Cartões de crédito: limite total, usado e disponível, fatura atual (aberta) com total, fechamento e vencimento, fatura fechada a pagar e o total já comprometido nas próximas faturas (parcelas).",
  async executar(ctx) {
    const cartoes = (await cartoesComFatura(ctx.householdId)).filter((c) => !c.archived);
    if (!cartoes.length) return { cartoes: [], observacao: "Nenhum cartão cadastrado neste espaço." };
    const atual = mesAtual();
    const futuros = await prisma.transaction.groupBy({
      by: ["accountId", "invoiceMonth"],
      where: { householdId: ctx.householdId, accountId: { in: cartoes.map((c) => c.id) }, type: "EXPENSE", invoiceMonth: { gte: atual, lte: somarMeses(atual, 6) } },
      _sum: { amount: true },
    });
    const fatura = (f: (typeof cartoes)[number]["currentInvoice"]) =>
      f && {
        mes: nomeFatura(f.month),
        total: brl(f.total),
        pago: brl(f.paid),
        aPagar: brl(f.remaining),
        fecha: formatarDia(diaLocal(new Date(f.closingDate))),
        vence: formatarDia(diaLocal(new Date(f.dueDate))),
        situacao: { OPEN: "aberta", CLOSED: "fechada", PAID: "paga", OVERDUE: "vencida" }[f.status],
      };
    return {
      cartoes: cartoes.map((c) => ({
        nome: c.name,
        fechaDia: c.closingDay,
        venceDia: c.dueDay,
        limite: c.creditLimit ? brl(c.creditLimit) : "não informado",
        limiteUsado: brl(c.usedLimit),
        limiteDisponivel: c.creditLimit ? brl(c.availableLimit) : null,
        faturaAtual: fatura(c.currentInvoice),
        faturaFechadaAPagar: fatura(c.closedInvoice),
        proximasFaturas: futuros
          .filter((f) => f.accountId === c.id && f.invoiceMonth && f.invoiceMonth > (c.currentInvoice?.month ?? atual))
          .sort((a, b) => (a.invoiceMonth! < b.invoiceMonth! ? -1 : 1))
          .map((f) => ({ mes: nomeFatura(f.invoiceMonth!), jaComprometido: brl(f._sum.amount ?? ZERO) })),
      })),
    };
  },
};

const contasAPagar: Ferramenta = {
  nome: "contas_a_pagar",
  descricao: "Despesas pendentes (contas a pagar) vencidas e dos próximos dias, receitas a receber e faturas de cartão que vencem no período.",
  parametros: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Quantos dias para frente (1 a 60). Padrão 15." } } },
  async executar(ctx, args) {
    const dias = inteiro(args.dias, 1, 60) ?? 15;
    const hoje = hojeLocal();
    const fim = inicioDoDiaLocal(somarDias(hoje, dias + 1));
    const pendentes = await prisma.transaction.findMany({
      where: { householdId: ctx.householdId, status: "PENDING", type: { in: ["INCOME", "EXPENSE"] }, invoiceMonth: null, date: { lt: fim } },
      include: { account: { select: { name: true } } },
      orderBy: { date: "asc" },
      take: 40,
    });
    const item = (t: (typeof pendentes)[number]) => {
      const d = diaLocal(t.date);
      return { descricao: t.description, valor: brl(t.amount), vence: formatarDia(d), conta: t.account.name, ...(d < hoje ? { vencida: true } : {}) };
    };
    const despesas = pendentes.filter((t) => t.type === "EXPENSE");
    const receitas = pendentes.filter((t) => t.type === "INCOME");
    const cartoes = (await cartoesComFatura(ctx.householdId)).filter((c) => !c.archived);
    const faturas = cartoes
      .flatMap((c) => [c.closedInvoice, c.currentInvoice].filter(Boolean).map((f) => ({ cartao: c.name, f: f! })))
      .filter(({ f }) => Number(f.remaining) > 0 && diaLocal(new Date(f.dueDate)) <= somarDias(hoje, dias))
      .map(({ cartao, f }) => ({ cartao, fatura: nomeFatura(f.month), aPagar: brl(f.remaining), vence: formatarDia(diaLocal(new Date(f.dueDate))), ...(f.status === "OVERDUE" ? { vencida: true } : {}) }));
    return {
      periodo: `até ${formatarDia(somarDias(hoje, dias))}`,
      contasAPagar: despesas.slice(0, 20).map(item),
      totalAPagar: brl(despesas.reduce((s, t) => s.plus(t.amount), ZERO)),
      aReceber: receitas.slice(0, 10).map(item),
      totalAReceber: brl(receitas.reduce((s, t) => s.plus(t.amount), ZERO)),
      faturasDeCartao: faturas,
    };
  },
};

const dividas: Ferramenta = {
  nome: "dividas",
  descricao:
    "Dívidas ativas (saldo, juros ao mês, pagamento mínimo, vencimento) e o plano de quitação do Planejador de dívidas: em quantos meses fica livre e quanto paga de juros. Pode simular um valor mensal maior.",
  parametros: {
    type: "OBJECT",
    properties: {
      valorMensal: { type: "NUMBER", description: "Quanto a pessoa pode pagar por mês nas dívidas (opcional; padrão = soma dos mínimos)." },
      metodo: { type: "STRING", enum: ["AVALANCHE", "SNOWBALL"], description: "AVALANCHE = maior juros primeiro (padrão); SNOWBALL = bola de neve, menor saldo primeiro." },
    },
  },
  async executar(ctx, args) {
    const ativas = await prisma.debt.findMany({ where: { householdId: ctx.householdId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    if (!ativas.length) return { dividas: [], observacao: "Nenhuma dívida ativa cadastrada." };
    const pagos = await pagoPorDivida(ativas.map((d) => d.id));
    const lista: DividaPlano[] = ativas
      .map((d) => ({ id: d.id, name: d.name, balance: calcularSaldo(d.startingBalance, pagos.get(d.id) ?? ZERO).currentBalance, rate: d.interestRateMonthly, minimum: d.minimumPayment }))
      .filter((d) => d.balance.gt(0));
    const minimos = lista.reduce((s, d) => s.plus(Decimal.min(d.minimum, d.balance)), ZERO);
    const orcamento = valorArg(args.valorMensal) ?? (minimos.gt(0) ? minimos : null);
    const metodo = args.metodo === "SNOWBALL" ? "SNOWBALL" : "AVALANCHE";
    const plano = orcamento && lista.length ? montarPlano(lista, orcamento, metodo) : null;
    return {
      dividas: ativas.map((d) => {
        const saldo = lista.find((x) => x.id === d.id)?.balance ?? ZERO;
        return { nome: d.name, credor: d.creditor, saldo: brl(saldo), jurosAoMes: `${d.interestRateMonthly.toNumber().toLocaleString("pt-BR")}%`, minimo: brl(d.minimumPayment), venceDia: d.dueDay };
      }),
      somaDosMinimos: brl(minimos),
      plano: !plano
        ? null
        : plano.ok
          ? {
              metodo: metodo === "AVALANCHE" ? "avalanche (maior juros primeiro)" : "bola de neve (menor saldo primeiro)",
              valorMensal: brl(plano.monthlyBudget),
              meses: plano.months,
              livreDasDividasEm: plano.debtFreeMonth ? nomeDoMes(plano.debtFreeMonth) : null,
              totalDeJuros: brl(plano.totalInterest),
              ordem: plano.debts.map((d) => `${d.order}. ${d.name} (quita em ${nomeDoMes(d.payoffDate)})`),
              avisos: plano.warnings,
              comparacao: plano.comparison,
            }
          : { erro: plano.error },
    };
  },
};

const gastosPorCategoria: Ferramenta = {
  nome: "gastos_por_categoria",
  descricao:
    "Histórico mês a mês de uma categoria (com subcategorias) e a média. Sem categoria: as categorias de despesa do mês atual comparadas com a média dos 3 meses anteriores (onde subiu ou caiu).",
  parametros: {
    type: "OBJECT",
    properties: {
      categoria: { type: "STRING", description: "Nome da categoria (ex.: Mercado). Opcional." },
      meses: { type: "INTEGER", description: "Quantos meses de histórico (2 a 12). Padrão 6." },
    },
  },
  async executar(ctx, args) {
    const categorias = await categoriasDoEspaco(ctx.householdId);
    const nome = texto(args.categoria, 60);
    const atual = mesAtual();
    const base = { status: "CONFIRMED" as const, ignoreInStatistics: false };
    if (nome) {
      const c = resolverCategoria(categorias, nome, "EXPENSE") ?? resolverCategoria(categorias, nome, "INCOME");
      if (!c) return { erro: `Categoria "${nome}" não encontrada.`, categoriasDeDespesa: nomesDasCategorias(categorias, "EXPENSE") };
      const n = inteiro(args.meses, 2, 12) ?? 6;
      const ids = await comSubcategorias(ctx.householdId, [c.id]);
      const dentro = new Set(ids);
      const meses = Array.from({ length: n }, (_, i) => somarMeses(atual, i - n + 1));
      const valores = await Promise.all(
        meses.map(async (m) => {
          const lista = await prisma.transaction.findMany({ where: { ...filtroDoMes(ctx.householdId, m), ...base, type: c.type, AND: [filtroCategorias(ids)] }, select: selecionarPorcoes });
          return lista.reduce((s, t) => s.plus(valorNasCategorias(t, dentro)), ZERO);
        }),
      );
      const fechados = valores.slice(0, -1);
      const media = fechados.length ? fechados.reduce((s, v) => s.plus(v), ZERO).div(fechados.length).toDecimalPlaces(2) : ZERO;
      return {
        categoria: c.name,
        tipo: c.type === "EXPENSE" ? "despesa" : "receita",
        porMes: meses.map((m, i) => ({ mes: nomeDoMes(m), valor: brl(valores[i]), ...(m === atual ? { mesEmAndamento: true } : {}) })),
        mediaDosMesesFechados: brl(media),
      };
    }
    const pais = await mapaDePais(ctx.householdId);
    const somar = async (m: string) =>
      somarPorCategoria(await prisma.transaction.findMany({ where: { ...filtroDoMes(ctx.householdId, m), ...base, type: "EXPENSE" }, select: selecionarPorcoes }), pais);
    const agora = await somar(atual);
    const anteriores = await Promise.all([1, 2, 3].map((i) => somar(somarMeses(atual, -i))));
    const chaves = new Set([...agora.keys(), ...anteriores.flatMap((a) => [...a.keys()])]);
    const nomes = new Map(categorias.map((c) => [c.id, c.name]));
    const linhas = [...chaves]
      .map((id) => {
        const media = anteriores.reduce((s, a) => s.plus(a.get(id) ?? ZERO), ZERO).div(3).toDecimalPlaces(2);
        const v = agora.get(id) ?? ZERO;
        return { id, v, media };
      })
      .sort((a, b) => b.v.comparedTo(a.v))
      .slice(0, 10);
    return {
      mes: nomeDoMes(atual),
      mesEmAndamento: true,
      categorias: linhas.map((l) => ({ categoria: l.id ? (nomes.get(l.id) ?? "?") : "Sem categoria", esteMes: brl(l.v), mediaDos3MesesAnteriores: brl(l.media) })),
    };
  },
};

const buscarLancamentos: Ferramenta = {
  nome: "buscar_lancamentos",
  descricao: "Procura lançamentos do espaço por texto da descrição, categoria, mês e tipo. Devolve os mais recentes (até 15) e o total encontrado. Use para 'quanto gastei com uber', 'quais foram meus gastos no mercado'.",
  parametros: {
    type: "OBJECT",
    properties: {
      texto: { type: "STRING", description: "Trecho da descrição (ex.: uber)." },
      categoria: { type: "STRING", description: "Nome da categoria." },
      mes: PARAM_MES,
      tipo: { type: "STRING", enum: ["DESPESA", "RECEITA"] },
      limite: { type: "INTEGER", description: "Quantos mostrar (1 a 15). Padrão 10." },
    },
  },
  async executar(ctx, args) {
    const mes = mesArg(args.mes) ?? mesAtual();
    const limite = inteiro(args.limite, 1, 15) ?? 10;
    const where: Prisma.TransactionWhereInput = {
      ...filtroDoMes(ctx.householdId, mes),
      type: args.tipo === "RECEITA" ? "INCOME" : args.tipo === "DESPESA" ? "EXPENSE" : { in: ["INCOME", "EXPENSE"] },
    };
    const busca = texto(args.texto, 60);
    if (busca) where.description = { contains: busca, mode: "insensitive" };
    const nomeCat = texto(args.categoria, 60);
    if (nomeCat) {
      const categorias = await categoriasDoEspaco(ctx.householdId);
      const c = resolverCategoria(categorias, nomeCat, args.tipo === "RECEITA" ? "INCOME" : "EXPENSE");
      if (!c) return { erro: `Categoria "${nomeCat}" não encontrada.` };
      where.AND = [filtroCategorias(await comSubcategorias(ctx.householdId, [c.id]))];
    }
    const [lista, soma] = await Promise.all([
      prisma.transaction.findMany({ where, include: { account: { select: { name: true } }, category: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limite }),
      prisma.transaction.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return {
      mes: nomeDoMes(mes),
      encontrados: soma._count,
      total: brl(soma._sum.amount ?? ZERO),
      lancamentos: lista.map((t) => ({
        data: formatarDia(diaLocal(t.date)),
        descricao: t.description,
        valor: brl(t.amount),
        tipo: t.type === "INCOME" ? "receita" : "despesa",
        categoria: t.category?.name ?? "sem categoria",
        conta: t.account.name,
        ...(t.status === "PENDING" ? { pendente: true } : {}),
        ...(t.installmentTotal ? { parcela: `${t.installmentNumber}/${t.installmentTotal}` } : {}),
      })),
    };
  },
};

// ─────────────────────────────────────────────
// Simulação de compra parcelada (não grava nada)
// ─────────────────────────────────────────────

const simularCompra: Ferramenta = {
  nome: "simular_compra_parcelada",
  descricao:
    "SIMULA (não lança) uma compra no cartão de crédito, à vista ou parcelada: em quais faturas caem as parcelas e como ficam essas faturas, o limite disponível depois, quanto a parcela pesa na renda média e na folga do mês, os orçamentos afetados e o efeito nos objetivos. Precisa de valor e parcelas; sem cartão, usa o único cartão ou pede para escolher.",
  parametros: {
    type: "OBJECT",
    properties: {
      valor: { type: "NUMBER", description: "Preço total da compra em reais." },
      parcelas: { type: "INTEGER", description: "Número de parcelas (1 a 24)." },
      cartao: { type: "STRING", description: "Nome do cartão." },
      categoria: { type: "STRING", description: "Categoria de despesa da compra (ex.: Casa, Eletrônicos). Opcional." },
      data: { type: "STRING", description: "Data da compra AAAA-MM-DD. Padrão hoje." },
    },
    required: ["valor", "parcelas"],
  },
  async executar(ctx, args) {
    const valor = valorArg(args.valor);
    if (!valor) return { erro: "Falta o preço da compra. Pergunte quanto custa." };
    const parcelas = inteiro(args.parcelas, 1, 24);
    if (!parcelas) return { erro: "Falta o número de parcelas (1 a 24). Pergunte em quantas vezes." };
    const [contas, categorias] = await Promise.all([contasDoEspaco(ctx.householdId), categoriasDoEspaco(ctx.householdId)]);
    const r = resolverConta(contas, texto(args.cartao, 60), { cartao: true });
    if (!r.ok) return { erro: r.erro, cartoes: r.opcoes };
    const cartao = r.conta;
    if (!cartao.closingDay || !cartao.dueDay) return { erro: `O cartão ${cartao.name} está sem dia de fechamento/vencimento cadastrado no app.` };
    const dias = { closingDay: cartao.closingDay, dueDay: cartao.dueDay };
    const dia = diaArg(args.data) ?? hojeLocal();
    const dataCompra = new Date(`${dia}T12:00:00.000Z`);
    const nomeCat = texto(args.categoria, 60);
    const categoria = nomeCat ? resolverCategoria(categorias, nomeCat, "EXPENSE") : null;

    // Mesma regra do app: compra no dia do fechamento ou depois vai para a fatura seguinte
    const primeira = mesDaFatura(dataCompra, dias);
    const valores = dividirParcelas(valor, parcelas);
    const meses = valores.map((_, i) => somarMeses(primeira, i));

    const [doCartao, todosCartoes, situacao, media] = await Promise.all([
      prisma.transaction.groupBy({ by: ["invoiceMonth"], where: { householdId: ctx.householdId, accountId: cartao.id, type: "EXPENSE", invoiceMonth: { in: meses } }, _sum: { amount: true } }),
      prisma.transaction.groupBy({ by: ["invoiceMonth"], where: { householdId: ctx.householdId, type: "EXPENSE", invoiceMonth: { in: meses }, account: { type: "CREDIT_CARD" } }, _sum: { amount: true } }),
      cartoesComFatura(ctx.householdId, { id: cartao.id }),
      mediaDos3Meses(ctx.householdId),
    ]);
    const info = situacao[0];
    const faturas = meses.slice(0, 12).map((m, i) => {
      const hoje = doCartao.find((x) => x.invoiceMonth === m)?._sum.amount ?? ZERO;
      const todos = todosCartoes.find((x) => x.invoiceMonth === m)?._sum.amount ?? ZERO;
      return {
        fatura: nomeFatura(m),
        vence: formatarDia(diaLocal(datasDaFatura(m, dias).dueDate)),
        parcela: `${i + 1}/${parcelas}: ${brl(valores[i])}`,
        faturaDesteCartaoHoje: brl(hoje),
        faturaDesteCartaoComACompra: brl(hoje.plus(valores[i])),
        todasAsFaturasDoMesComACompra: brl(todos.plus(valores[i])),
      };
    });

    const limite = info?.creditLimit ? new Decimal(info.creditLimit) : null;
    const disponivel = info && limite ? new Decimal(info.availableLimit) : null;
    const parcela = valores.at(-1)!;

    // Orçamentos de despesa (mensais) que essa compra afeta nas 3 primeiras parcelas
    const calc = await Calculadora.carregar(ctx.householdId);
    const afetados: Record<string, unknown>[] = [];
    for (const b of calc.lista.filter((x) => x.kind === "EXPENSE" && !x.isGroup && x.period === "MONTHLY")) {
      const cats = categoriasDoFiltro(b);
      if (cats.length && (!categoria || !cats.includes(categoria.id))) continue;
      if (b.accounts.length && !b.accounts.some((a) => a.accountId === cartao.id)) continue;
      for (let i = 0; i < Math.min(parcelas, 3); i++) {
        const mes = b.cardDateRef === "INVOICE" ? meses[i] : partesLocais(somarMesesNaData(dataCompra, i)).mes;
        if (!ativoNoMes(b, mes)) continue;
        const p = await calc.progresso(b, mes);
        if (!p.goal.gt(0)) continue;
        const depois = p.used.plus(valores[i]);
        afetados.push({
          orcamento: b.name,
          mes: nomeDoMes(mes),
          meta: brl(p.goal),
          jaUsadoOuAgendado: brl(p.used),
          comAParcela: brl(depois),
          percentualDepois: pct(depois, p.goal),
          estoura: depois.gt(p.goal),
        });
      }
    }

    // Objetivos: quanto precisa guardar por mês (os que têm data)
    const metas = await objetivosComProgresso(await prisma.goal.findMany({ where: { householdId: ctx.householdId, status: "ACTIVE" }, include: { account: true } }));
    const precisaPorMes = metas.reduce((s, g) => s.plus(g.progress.perMonth ?? 0), ZERO);

    const ultima = meses.at(-1)!;
    return {
      simulacao: true,
      nadaFoiLancado: true,
      compra: { valor: brl(valor), parcelas, valorDaParcela: brl(parcela), ...(parcelas > 1 && !valores[0].eq(parcela) ? { primeiraParcela: brl(valores[0]) } : {}), cartao: cartao.name, data: formatarDia(dia), categoria: categoria?.name ?? null },
      regraDaFatura: `O cartão fecha dia ${dias.closingDay} e vence dia ${dias.dueDay}; compra no dia do fechamento ou depois cai na fatura seguinte.`,
      primeiraFatura: nomeFatura(primeira),
      ultimaFatura: nomeFatura(ultima),
      faturas,
      ...(parcelas > 12 ? { obs: "Mostrando só as 12 primeiras faturas." } : {}),
      limite: limite
        ? {
            limiteTotal: brl(limite),
            disponivelHoje: brl(disponivel!),
            disponivelDepois: brl(disponivel!.minus(valor)),
            cabeNoLimite: disponivel!.gte(valor),
            observacao: "No cartão, a compra parcelada ocupa o limite pelo valor total e libera aos poucos, conforme as faturas são pagas.",
          }
        : { observacao: "O cartão não tem limite cadastrado no app." },
      renda: media
        ? {
            mesesConsiderados: media.meses,
            receitaMediaMensal: brl(media.receitas),
            despesaMediaMensal: brl(media.despesas),
            folgaMediaMensal: brl(media.folga),
            parcelaSobreARenda: pct(parcela, media.receitas),
            parcelaSobreAFolga: media.folga.gt(0) ? pct(parcela, media.folga) : "sem folga (gasta tudo ou mais do que recebe)",
            folgaDepoisDaParcela: brl(media.folga.minus(parcela)),
          }
        : { observacao: "Sem histórico de receitas/despesas dos últimos 3 meses para comparar." },
      orcamentosAfetados: afetados,
      objetivos: metas.length
        ? {
            ativos: metas.length,
            precisaGuardarPorMesNosObjetivos: brl(precisaPorMes),
            ...(media ? { sobraParaObjetivosDepoisDaParcela: brl(media.folga.minus(parcela)), aindaCobreOsObjetivos: media.folga.minus(parcela).gte(precisaPorMes) } : {}),
          }
        : null,
      lembrete: "É uma simulação. A decisão é da pessoa; só prepare o lançamento se ela pedir.",
    };
  },
};

// ─────────────────────────────────────────────
// Rascunho (nada é gravado como lançamento aqui)
// ─────────────────────────────────────────────

type DadosRascunho = {
  tipo: "INCOME" | "EXPENSE";
  valor: Prisma.Decimal;
  dia: string;
  conta: ContaDoEspaco;
  categoryId: string | null;
  descricao: string;
  parcelas: number;
};

function validarRascunho(d: DadosRascunho): { erro: string } | { data: Omit<Prisma.WhatsAppDraftUncheckedCreateInput, "userId" | "householdId" | "waId" | "expiresAt"> } {
  const cartao = d.conta.type === "CREDIT_CARD";
  if (cartao && d.tipo === "INCOME") return { erro: "Receita não entra no cartão de crédito. Use uma conta." };
  if (d.parcelas > 1 && !cartao) return { erro: "Parcelado só no cartão de crédito." };
  const hoje = hojeLocal();
  if (d.dia < somarDias(hoje, -730) || d.dia > somarDias(hoje, 400)) return { erro: "Data fora do intervalo aceito (até 2 anos para trás e 1 ano para frente)." };
  let invoiceMonth: string | null = null;
  const date = new Date(`${d.dia}T12:00:00.000Z`);
  if (cartao) {
    if (!d.conta.closingDay || !d.conta.dueDay) return { erro: `Cadastre o dia de fechamento e de vencimento do cartão ${d.conta.name} no app antes de lançar compras.` };
    invoiceMonth = mesDaFatura(date, { closingDay: d.conta.closingDay, dueDay: d.conta.dueDay });
  }
  return {
    data: {
      type: d.tipo,
      amount: d.valor,
      description: d.descricao,
      date,
      accountId: d.conta.id,
      categoryId: d.categoryId,
      installments: cartao ? d.parcelas : 1,
      invoiceMonth,
    },
  };
}

const descricaoBonita = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 120);

const PARAMS_RASCUNHO = {
  tipo: { type: "STRING", enum: ["DESPESA", "RECEITA"] },
  valor: { type: "NUMBER", description: "Valor total em reais (ex.: 45.9)." },
  descricao: { type: "STRING", description: "Nome/descrição do lançamento (ex.: Almoço com a equipe)." },
  data: { type: "STRING", description: "Data AAAA-MM-DD (hoje, ontem... já convertidos)." },
  conta: { type: "STRING", description: "Conta ou cartão pelo nome como está no app (ex.: Carteira, Itaú, cartão Nubank). Também aceita dinheiro, pix ou débito." },
  categoria: { type: "STRING", description: "Nome da categoria como está no app." },
  parcelas: { type: "INTEGER", description: "Parcelas no cartão (1 a 24). Padrão 1." },
};

async function responderRascunho(ctx: ContextoAgente, id: string, estado: EstadoTurno, avisos: string[]) {
  const r = await prisma.whatsAppDraft.findUniqueOrThrow({ where: { id } });
  estado.rascunhoId = r.id;
  estado.cancelouRascunho = false;
  return {
    ok: true,
    rascunho: await textoDoRascunho(r, ctx.espaco),
    ...(avisos.length ? { avisos } : {}),
    instrucao:
      "Rascunho pronto e NÃO gravado. O bot mostra o resumo com os botões Confirmar / Corrigir / Cancelar logo abaixo da sua mensagem: não repita todos os campos. Se a descrição for genérica, pergunte se quer dar um nome.",
  };
}

const podeLancar = (ctx: ContextoAgente) => ctx.role !== "VIEWER";
const somenteLeitura = { erro: "Acesso somente leitura neste espaço: a pessoa só pode consultar, não lançar." };

const prepararLancamento: Ferramenta = {
  nome: "preparar_lancamento",
  escrita: true,
  descricao:
    "Monta um RASCUNHO de despesa ou receita para a pessoa confirmar (não grava). Substitui o rascunho pendente anterior. Use quando a pessoa contar um gasto/recebimento com valor. Datas relativas (ontem, sexta) você converte para AAAA-MM-DD.",
  parametros: { type: "OBJECT", properties: PARAMS_RASCUNHO, required: ["tipo", "valor"] },
  async executar(ctx, args, estado) {
    if (!podeLancar(ctx)) return somenteLeitura;
    const valor = valorArg(args.valor);
    if (!valor) return { erro: "Valor inválido ou faltando. Pergunte o valor." };
    const tipo = args.tipo === "RECEITA" ? "INCOME" : "EXPENSE";
    const parcelas = args.parcelas === undefined || args.parcelas === null ? 1 : inteiro(args.parcelas, 1, 24);
    if (!parcelas) return { erro: "Parcelas: de 1 a 24." };
    const [contas, categorias] = await Promise.all([contasDoEspaco(ctx.householdId), categoriasDoEspaco(ctx.householdId)]);
    const conta = resolverConta(contas, texto(args.conta, 60), { cartao: parcelas > 1 });
    if (!conta.ok) return { erro: conta.erro, opcoes: conta.opcoes };
    const avisos: string[] = [];
    const nomeCat = texto(args.categoria, 60);
    const descricao = texto(args.descricao, 120);
    let categoria = resolverCategoria(categorias, nomeCat, tipo);
    if (nomeCat && !categoria) return { erro: `Categoria "${nomeCat}" não existe neste espaço.`, categorias: nomesDasCategorias(categorias, tipo) };
    if (!categoria && descricao) categoria = acharCategoria(descricao.split(/\s+/), categorias, tipo);
    if (!categoria) avisos.push("Ficou sem categoria. Sugira uma da lista do espaço ou pergunte.");
    const v = validarRascunho({
      tipo,
      valor,
      dia: diaArg(args.data) ?? hojeLocal(),
      conta: conta.conta,
      categoryId: categoria?.id ?? null,
      descricao: descricaoBonita(descricao ?? categoria?.name ?? (tipo === "INCOME" ? "Receita" : "Despesa")),
      parcelas,
    });
    if ("erro" in v) return v;
    // Um rascunho pendente por vez
    await prisma.whatsAppDraft.updateMany({ where: { waId: ctx.waId, status: "PENDING" }, data: { status: "CANCELED", awaitingCategory: false } });
    const r = await prisma.whatsAppDraft.create({
      data: { ...v.data, userId: ctx.userId, householdId: ctx.householdId, waId: ctx.waId, expiresAt: new Date(Date.now() + VALIDADE_RASCUNHO_MIN * 60 * 1000) },
    });
    return responderRascunho(ctx, r.id, estado, avisos);
  },
};

const alterarRascunho: Ferramenta = {
  nome: "alterar_rascunho",
  escrita: true,
  descricao:
    "Corrige o rascunho pendente (ainda não gravado) com o que a pessoa pediu: 'foi no cartão Santander', 'muda para ontem', 'categoria lazer', 'o nome é almoço', 'foi 52', 'em 3x'. Mande só os campos que mudam.",
  parametros: { type: "OBJECT", properties: PARAMS_RASCUNHO },
  async executar(ctx, args, estado) {
    if (!podeLancar(ctx)) return somenteLeitura;
    const r = await rascunhoPendente(ctx.waId, ctx.userId);
    if (!r || r.householdId !== ctx.householdId) return { erro: "Não há rascunho pendente para corrigir (pode ter expirado). Se a pessoa quiser, prepare um novo." };
    const [contas, categorias] = await Promise.all([contasDoEspaco(ctx.householdId), categoriasDoEspaco(ctx.householdId)]);
    const tipo = args.tipo === "RECEITA" ? "INCOME" : args.tipo === "DESPESA" ? "EXPENSE" : r.type === "INCOME" ? "INCOME" : "EXPENSE";
    const valor = args.valor === undefined || args.valor === null ? r.amount : valorArg(args.valor);
    if (!valor) return { erro: "Valor inválido." };
    const parcelas = args.parcelas === undefined || args.parcelas === null ? r.installments : inteiro(args.parcelas, 1, 24);
    if (!parcelas) return { erro: "Parcelas: de 1 a 24." };
    let conta = contas.find((c) => c.id === r.accountId);
    const nomeConta = texto(args.conta, 60);
    if (nomeConta || !conta || (parcelas > 1 && conta.type !== "CREDIT_CARD")) {
      const achada = resolverConta(contas, nomeConta, { cartao: parcelas > 1 });
      if (!achada.ok) return { erro: achada.erro, opcoes: achada.opcoes };
      conta = achada.conta;
    }
    let categoryId = tipo === r.type ? r.categoryId : null;
    const nomeCat = texto(args.categoria, 60);
    if (nomeCat) {
      if (["sem categoria", "nenhuma", "nenhum"].includes(normalizar(nomeCat))) categoryId = null;
      else {
        const c = resolverCategoria(categorias, nomeCat, tipo);
        if (!c) return { erro: `Categoria "${nomeCat}" não existe neste espaço.`, categorias: nomesDasCategorias(categorias, tipo) };
        categoryId = c.id;
      }
    }
    const descricao = texto(args.descricao, 120);
    const v = validarRascunho({
      tipo,
      valor,
      dia: diaArg(args.data) ?? diaLocal(r.date),
      conta,
      categoryId,
      descricao: descricao ? descricaoBonita(descricao) : r.description,
      parcelas,
    });
    if ("erro" in v) return v;
    const feito = await prisma.whatsAppDraft.updateMany({
      where: { id: r.id, status: "PENDING" },
      data: { ...v.data, awaitingCategory: false, expiresAt: new Date(Date.now() + VALIDADE_RASCUNHO_MIN * 60 * 1000) },
    });
    if (!feito.count) return { erro: "O rascunho acabou de ser resolvido. Prepare um novo se a pessoa quiser." };
    return responderRascunho(ctx, r.id, estado, []);
  },
};

const cancelarRascunho: Ferramenta = {
  nome: "cancelar_rascunho",
  escrita: true,
  descricao: "Descarta o rascunho pendente (nada é lançado). Use quando a pessoa desistir do lançamento.",
  async executar(ctx, _args, estado) {
    if (!podeLancar(ctx)) return somenteLeitura;
    const r = await prisma.whatsAppDraft.updateMany({ where: { waId: ctx.waId, userId: ctx.userId, status: "PENDING" }, data: { status: "CANCELED", awaitingCategory: false } });
    estado.rascunhoId = null;
    estado.cancelouRascunho = r.count > 0;
    return r.count ? { ok: true, mensagem: "Rascunho descartado. Nada foi lançado." } : { ok: false, mensagem: "Não havia rascunho pendente." };
  },
};

const ajuda: Ferramenta = {
  nome: "ajuda_famicash",
  descricao:
    "Busca na Central de Ajuda do Famicash como usar o app (cartões, faturas, orçamentos, objetivos, dívidas, família, WhatsApp, relatórios...). Use antes de explicar qualquer função do app; não invente telas ou recursos.",
  parametros: { type: "OBJECT", properties: { pergunta: { type: "STRING", description: "A dúvida, com palavras-chave." } }, required: ["pergunta"] },
  async executar(_ctx, args) {
    const pergunta = texto(args.pergunta, 300) ?? "";
    const achados = buscarNaAjuda(pergunta, 2);
    if (!achados.length) return { encontrados: 0, artigosDisponiveis: artigosDaAjuda().map((a) => a.titulo), dica: "Se não souber, diga que não encontrou e indique famicash.com › Ajuda." };
    return { encontrados: achados.length, artigos: achados.map((a) => ({ titulo: a.titulo, conteudo: a.corpo.slice(0, 3500) })), linkDaAjuda: "famicash.com › Ajuda" };
  },
};

export const FERRAMENTAS: Ferramenta[] = [
  resumoFinanceiro,
  orcamentos,
  objetivos,
  cartoesEFaturas,
  contasAPagar,
  dividas,
  gastosPorCategoria,
  buscarLancamentos,
  simularCompra,
  prepararLancamento,
  alterarRascunho,
  cancelarRascunho,
  ajuda,
];

// Ferramentas que a pessoa pode usar (Visualizador: só consultas)
export function ferramentasPara(ctx: ContextoAgente) {
  return FERRAMENTAS.filter((f) => !f.escrita || podeLancar(ctx));
}

// Executa uma chamada da IA. Erros viram resposta (a IA explica), nunca derrubam o bot.
export async function executarFerramenta(ctx: ContextoAgente, nome: string, args: Args, estado: EstadoTurno): Promise<Record<string, unknown>> {
  const f = ferramentasPara(ctx).find((x) => x.nome === nome);
  estado.ferramentas.push(nome);
  if (!f) return { erro: `Ferramenta "${nome}" não disponível.` };
  try {
    return await f.executar(ctx, args && typeof args === "object" ? args : {}, estado);
  } catch (e) {
    console.error(`WhatsApp IA: falha na ferramenta ${nome}`, e);
    return { erro: "Falha ao consultar os dados agora. Diga que não conseguiu e sugira tentar de novo ou ver no app." };
  }
}
