import type { Debt, DebtPayment, FinancialAccount, Prisma, Transaction } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ZERO, mesAtual, somarMeses } from "../lib/money.js";

// ─────────────────────────────────────────────
// Saldo devedor e situação
// ─────────────────────────────────────────────

type DividaComConta = Debt & { account?: FinancialAccount | null };

// Quanto já foi pago em cada dívida (soma do valor ATUAL dos lançamentos de pagamento)
export async function pagoPorDivida(ids: string[]) {
  const mapa = new Map<string, Prisma.Decimal>(ids.map((id) => [id, ZERO]));
  if (!ids.length) return mapa;
  const pagamentos = await prisma.debtPayment.findMany({ where: { debtId: { in: ids } }, select: { debtId: true, transaction: { select: { amount: true } } } });
  for (const p of pagamentos) mapa.set(p.debtId, mapa.get(p.debtId)!.plus(p.transaction.amount));
  return mapa;
}

// Saldo atual (nunca negativo), já pago e % quitado em relação ao saldo de referência
export function calcularSaldo(startingBalance: Prisma.Decimal, pago: Prisma.Decimal) {
  const restante = startingBalance.minus(pago);
  const atual = restante.lt(0) ? ZERO : restante;
  const percent = startingBalance.gt(0) ? Math.min(100, Math.round(pago.div(startingBalance).times(1000).toNumber()) / 10) : atual.isZero() ? 100 : 0;
  return { currentBalance: atual, paid: pago, percent };
}

// Situação que a dívida deveria ter pelo saldo: zerou → quitada; voltou a ter saldo → ativa. Arquivada não muda.
export function situacaoPeloSaldo(status: Debt["status"], saldo: Prisma.Decimal): Debt["status"] {
  if (status === "ARCHIVED") return status;
  return saldo.isZero() ? "PAID" : "ACTIVE";
}

// Acerta a situação gravada quando o saldo mudou (pagamento novo, pagamento ou lançamento apagado...)
export async function acertarSituacoes(dividas: Debt[], pagos: Map<string, Prisma.Decimal>) {
  for (const d of dividas) {
    const { currentBalance } = calcularSaldo(d.startingBalance, pagos.get(d.id) ?? ZERO);
    const certa = situacaoPeloSaldo(d.status, currentBalance);
    if (certa !== d.status) {
      const paidAt = certa === "PAID" ? new Date() : null;
      await prisma.debt.update({ where: { id: d.id }, data: { status: certa, paidAt } });
      d.status = certa;
      d.paidAt = paidAt;
    }
  }
}

export function serializarDivida(d: DividaComConta, pago: Prisma.Decimal) {
  const s = calcularSaldo(d.startingBalance, pago);
  return {
    id: d.id,
    name: d.name,
    creditor: d.creditor,
    type: d.type,
    status: d.status,
    showOnHome: d.showOnHome,
    currentBalance: s.currentBalance.toFixed(2),
    originalBalance: d.startingBalance.toFixed(2),
    paidAmount: s.paid.toFixed(2),
    percentPaid: s.percent,
    interestRateMonthly: trimTaxa(d.interestRateMonthly),
    minimumPayment: d.minimumPayment.toFixed(2),
    dueDay: d.dueDay,
    notes: d.notes,
    accountId: d.accountId,
    account: d.account ? { id: d.account.id, name: d.account.name, type: d.account.type } : null,
    paidAt: d.paidAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// Taxa sem zeros à direita: 2.5000 → "2.5", 0 → "0"
function trimTaxa(v: Prisma.Decimal) {
  return v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export async function comSaldo(dividas: DividaComConta[]) {
  const pagos = await pagoPorDivida(dividas.map((d) => d.id));
  await acertarSituacoes(dividas, pagos);
  return dividas.map((d) => serializarDivida(d, pagos.get(d.id) ?? ZERO));
}

export type PagamentoComLancamento = DebtPayment & { transaction: Transaction & { account: FinancialAccount } };

// ─────────────────────────────────────────────
// Plano de quitação (avalanche × bola de neve)
// ─────────────────────────────────────────────

export type Metodo = "AVALANCHE" | "SNOWBALL";
export const LIMITE_MESES = 600;

export interface DividaPlano {
  id: string;
  name: string;
  balance: Prisma.Decimal; // saldo devedor atual
  rate: Prisma.Decimal; // % ao mês
  minimum: Prisma.Decimal;
}

export interface ResultadoPlano {
  ok: true;
  method: Metodo;
  months: number;
  totalInterest: number; // centavos
  totalPaid: number; // centavos
  debts: { id: string; name: string; order: number; payoffMonth: number; interestPaid: number; totalPaid: number }[];
  schedule: { index: number; payments: { debtId: string; amount: number; interest: number; balance: number }[]; totalPaid: number; totalBalance: number }[];
}

export type FalhaPlano = { ok: false; reason: "BUDGET_BELOW_MINIMUMS" | "NEVER_ENDS"; minimumsTotal: number };

const centavos = (v: Prisma.Decimal) => Math.round(v.times(100).toNumber());

// Simula mês a mês (valores em centavos):
// 1) juros compostos do mês em cada saldo (arredondados no centavo);
// 2) paga o mínimo de todas (ou o saldo, se for menor);
// 3) o que sobra do orçamento vai para a dívida-alvo: avalanche = maior taxa; bola de neve = menor saldo.
// Quando uma dívida acaba, o mínimo dela continua no orçamento e vai para a próxima (efeito "bola de neve").
export function simularPlano(dividas: DividaPlano[], orcamentoMensal: Prisma.Decimal, metodo: Metodo): ResultadoPlano | FalhaPlano {
  const ds = dividas
    .map((d) => ({ id: d.id, name: d.name, saldo: centavos(d.balance), taxa: d.rate.toNumber() / 100, minimo: centavos(d.minimum), juros: 0, pago: 0, fim: 0 }))
    .filter((d) => d.saldo > 0);
  const orcamento = centavos(orcamentoMensal);
  const minimos = ds.reduce((s, d) => s + Math.min(d.minimo, d.saldo), 0);
  if (orcamento < minimos || orcamento <= 0) return { ok: false, reason: "BUDGET_BELOW_MINIMUMS", minimumsTotal: minimos };

  const schedule: ResultadoPlano["schedule"] = [];
  let mes = 0;
  const ordemQuitacao: string[] = [];
  while (ds.some((d) => d.saldo > 0)) {
    mes += 1;
    if (mes > LIMITE_MESES) return { ok: false, reason: "NEVER_ENDS", minimumsTotal: minimos };
    const pagMes = new Map<string, { amount: number; interest: number }>();
    for (const d of ds) {
      if (d.saldo <= 0) continue;
      const j = Math.round(d.saldo * d.taxa);
      d.saldo += j;
      d.juros += j;
      pagMes.set(d.id, { amount: 0, interest: j });
    }
    let disponivel = orcamento;
    const pagar = (d: (typeof ds)[number], valor: number) => {
      const v = Math.min(valor, d.saldo, disponivel);
      if (v <= 0) return;
      d.saldo -= v;
      d.pago += v;
      disponivel -= v;
      pagMes.get(d.id)!.amount += v;
    };
    for (const d of ds) if (d.saldo > 0) pagar(d, d.minimo);
    const alvos = ds
      .filter((d) => d.saldo > 0)
      .sort((a, b) => (metodo === "AVALANCHE" ? b.taxa - a.taxa || a.saldo - b.saldo : a.saldo - b.saldo || b.taxa - a.taxa));
    for (const d of alvos) {
      if (disponivel <= 0) break;
      pagar(d, disponivel);
    }
    for (const d of ds) {
      if (d.saldo <= 0 && d.fim === 0 && pagMes.has(d.id)) {
        d.fim = mes;
        ordemQuitacao.push(d.id);
      }
    }
    schedule.push({
      index: mes,
      payments: ds.filter((d) => pagMes.has(d.id)).map((d) => ({ debtId: d.id, amount: pagMes.get(d.id)!.amount, interest: pagMes.get(d.id)!.interest, balance: d.saldo })),
      totalPaid: orcamento - disponivel,
      totalBalance: ds.reduce((s, d) => s + d.saldo, 0),
    });
  }

  return {
    ok: true,
    method: metodo,
    months: mes,
    totalInterest: ds.reduce((s, d) => s + d.juros, 0),
    totalPaid: ds.reduce((s, d) => s + d.pago, 0),
    debts: ordemQuitacao.map((id, i) => {
      const d = ds.find((x) => x.id === id)!;
      return { id, name: d.name, order: i + 1, payoffMonth: d.fim, interestPaid: d.juros, totalPaid: d.pago };
    }),
    schedule,
  };
}

const reais = (c: number) => (c / 100).toFixed(2);
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function mensagemFalha(f: FalhaPlano, orcamento: Prisma.Decimal) {
  if (f.reason === "BUDGET_BELOW_MINIMUMS") {
    return `O orçamento mensal (${brl(centavos(orcamento))}) é menor que a soma dos pagamentos mínimos (${brl(f.minimumsTotal)}). Aumente o orçamento para pelo menos esse valor.`;
  }
  return "Com esse orçamento as dívidas não acabam em 50 anos: os juros crescem mais rápido que os pagamentos. Aumente o orçamento ou renegocie as taxas.";
}

// Monta a resposta da API: o método escolhido com o cronograma e a comparação dos dois métodos
export function montarPlano(dividas: DividaPlano[], orcamento: Prisma.Decimal, metodo: Metodo, mesInicial = somarMeses(mesAtual(), 1)) {
  const escolhido = simularPlano(dividas, orcamento, metodo);
  const outro = simularPlano(dividas, orcamento, metodo === "AVALANCHE" ? "SNOWBALL" : "AVALANCHE");
  const mesDo = (i: number) => somarMeses(mesInicial, i - 1);
  const minimos = dividas.reduce((s, d) => s.plus(d.minimum.gt(d.balance) ? d.balance : d.minimum), ZERO);

  // Mínimo que não cobre os juros do mês: sozinha, a dívida só cresce
  const avisos = dividas
    .filter((d) => d.balance.gt(0) && d.rate.gt(0))
    .filter((d) => d.minimum.lt(d.balance.times(d.rate).div(100).toDecimalPlaces(2)))
    .map((d) => `O mínimo de “${d.name}” não cobre os juros do mês (${brl(centavos(d.balance.times(d.rate).div(100)))}). Sem pagamento extra, essa dívida só cresce.`);

  if (!escolhido.ok) return { ok: false as const, error: mensagemFalha(escolhido, orcamento), reason: escolhido.reason, minimumsTotal: reais(escolhido.minimumsTotal) };

  const resumo = (r: ResultadoPlano | FalhaPlano) => (r.ok ? { months: r.months, totalInterest: reais(r.totalInterest), totalPaid: reais(r.totalPaid), debtFreeMonth: r.months ? mesDo(r.months) : null } : null);
  const av = escolhido.method === "AVALANCHE" ? escolhido : outro;
  const sn = escolhido.method === "SNOWBALL" ? escolhido : outro;
  const nomes = new Map(dividas.map((d) => [d.id, d]));

  return {
    ok: true as const,
    method: metodo,
    monthlyBudget: orcamento.toFixed(2),
    minimumsTotal: minimos.toFixed(2),
    extraPerMonth: orcamento.minus(minimos).toFixed(2),
    startMonth: mesInicial,
    months: escolhido.months,
    debtFreeMonth: escolhido.months ? mesDo(escolhido.months) : null,
    totalInterest: reais(escolhido.totalInterest),
    totalPaid: reais(escolhido.totalPaid),
    debts: escolhido.debts.map((d) => {
      const o = nomes.get(d.id)!;
      return {
        id: d.id,
        name: d.name,
        order: d.order,
        payoffMonth: d.payoffMonth,
        payoffDate: mesDo(d.payoffMonth),
        interestPaid: reais(d.interestPaid),
        totalPaid: reais(d.totalPaid),
        currentBalance: o.balance.toFixed(2),
        interestRateMonthly: trimTaxa(o.rate),
        minimumPayment: o.minimum.toFixed(2),
      };
    }),
    schedule: escolhido.schedule.map((m) => ({
      month: mesDo(m.index),
      index: m.index,
      totalPaid: reais(m.totalPaid),
      totalBalance: reais(m.totalBalance),
      payments: m.payments.map((p) => ({ debtId: p.debtId, amount: reais(p.amount), interest: reais(p.interest), balance: reais(p.balance) })),
    })),
    comparison: {
      AVALANCHE: resumo(av),
      SNOWBALL: resumo(sn),
      // Positivo: quanto a avalanche economiza em juros (e meses) em relação à bola de neve
      interestSavedByAvalanche: av.ok && sn.ok ? reais(sn.totalInterest - av.totalInterest) : null,
      monthsSavedByAvalanche: av.ok && sn.ok ? sn.months - av.months : null,
    },
    warnings: avisos,
  };
}

