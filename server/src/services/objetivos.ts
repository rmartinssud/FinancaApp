import { Prisma, type Goal, type GoalEntry, type FinancialAccount } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Decimal, ZERO, partesLocais, somarMeses } from "../lib/money.js";

// ─────────────────────────────────────────────
// Objetivos: cálculos (funções puras, testáveis com qualquer "hoje")
// ─────────────────────────────────────────────

const FUSO = "America/Sao_Paulo";
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

// Dia "AAAA-MM-DD" em Brasília de uma data
export const diaLocal = (data: Date = new Date()) => formatoDia.format(data);

// Dias entre dois dias "AAAA-MM-DD" (b − a)
function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

const numeroDoMes = (dia: string) => {
  const [ano, m] = dia.split("-").map(Number);
  return ano * 12 + m;
};

export type DadosProgresso = {
  targetAmount: Prisma.Decimal;
  initialAmount: Prisma.Decimal;
  targetDate: string | null;
  inicio: string; // dia em que o objetivo começou (criação), "AAAA-MM-DD"
};

export type Progresso = {
  saved: Prisma.Decimal;
  deposits: Prisma.Decimal;
  withdrawals: Prisma.Decimal;
  remaining: Prisma.Decimal;
  percent: number; // 0 a 100+ (1 casa, para baixo: só mostra 100% quando chegou)
  reached: boolean;
  monthsLeft: number | null; // meses contando o atual e o da data alvo; 0 = data passou
  perMonth: Prisma.Decimal | null; // quanto guardar por mês até a data (arredondado para cima no centavo)
  overdue: boolean;
  expected: Prisma.Decimal | null; // quanto era para ter hoje (linear da criação até a data)
  onTrack: boolean | null;
};

// Progresso do objetivo: guardado = inicial + depósitos − retiradas
export function calcularProgresso(g: DadosProgresso, depositos: Prisma.Decimal, retiradas: Prisma.Decimal, hoje: string): Progresso {
  const saved = g.initialAmount.plus(depositos).minus(retiradas);
  const falta = Decimal.max(g.targetAmount.minus(saved), ZERO);
  const reached = saved.gte(g.targetAmount);
  const percent = g.targetAmount.gt(0) ? saved.div(g.targetAmount).times(100).toDecimalPlaces(1, Decimal.ROUND_DOWN).toNumber() : 0;

  let monthsLeft: number | null = null;
  let perMonth: Prisma.Decimal | null = null;
  let expected: Prisma.Decimal | null = null;
  let onTrack: boolean | null = null;
  let overdue = false;

  if (g.targetDate) {
    if (g.targetDate < hoje) {
      monthsLeft = 0;
      overdue = !reached;
      perMonth = reached ? ZERO : falta; // passou da data: falta tudo de uma vez
    } else {
      monthsLeft = numeroDoMes(g.targetDate) - numeroDoMes(hoje) + 1;
      perMonth = reached ? ZERO : falta.div(monthsLeft).toDecimalPlaces(2, Decimal.ROUND_UP);
    }
    // Ritmo: linha reta do valor inicial (na criação) até a meta (na data alvo)
    const total = diasEntre(g.inicio, g.targetDate);
    const passados = Math.min(Math.max(diasEntre(g.inicio, hoje), 0), Math.max(total, 0));
    expected =
      total <= 0
        ? g.targetAmount
        : g.initialAmount.plus(g.targetAmount.minus(g.initialAmount).times(passados).div(total)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (expected.gt(g.targetAmount)) expected = g.targetAmount;
    onTrack = saved.gte(expected);
  }

  return { saved, deposits: depositos, withdrawals: retiradas, remaining: falta, percent, reached, monthsLeft, perMonth, overdue, expected, onTrack };
}

export function serializarProgresso(p: Progresso) {
  return {
    saved: p.saved.toFixed(2),
    deposits: p.deposits.toFixed(2),
    withdrawals: p.withdrawals.toFixed(2),
    remaining: p.remaining.toFixed(2),
    percent: p.percent,
    reached: p.reached,
    monthsLeft: p.monthsLeft,
    perMonth: p.perMonth?.toFixed(2) ?? null,
    overdue: p.overdue,
    expected: p.expected?.toFixed(2) ?? null,
    onTrack: p.onTrack,
  };
}

// Evolução do guardado no fim de cada mês (do começo do objetivo até o mês atual, no máximo 12 meses)
export function evolucao(g: { initialAmount: Prisma.Decimal; inicio: string }, entradas: Pick<GoalEntry, "kind" | "amount" | "date">[], hoje: string) {
  const mesHoje = hoje.slice(0, 7);
  let primeiro = g.inicio.slice(0, 7);
  for (const e of entradas) {
    const m = partesLocais(e.date).mes;
    if (m < primeiro) primeiro = m;
  }
  if (primeiro > mesHoje) primeiro = mesHoje;
  let desde = primeiro;
  if (numeroDoMes(`${mesHoje}-01`) - numeroDoMes(`${primeiro}-01`) > 11) desde = somarMeses(mesHoje, -11);

  const meses: { month: string; saved: string }[] = [];
  for (let m = desde; m <= mesHoje; m = somarMeses(m, 1)) {
    let saldo = g.initialAmount;
    for (const e of entradas) {
      if (partesLocais(e.date).mes > m) continue;
      saldo = e.kind === "DEPOSIT" ? saldo.plus(e.amount) : saldo.minus(e.amount);
    }
    meses.push({ month: m, saved: saldo.toFixed(2) });
  }
  return meses;
}

// ─────────────────────────────────────────────
// Banco
// ─────────────────────────────────────────────

export type ObjetivoComConta = Goal & { account: FinancialAccount | null };

export const dadosProgresso = (g: Goal): DadosProgresso => ({
  targetAmount: g.targetAmount,
  initialAmount: g.initialAmount,
  targetDate: g.targetDate,
  inicio: diaLocal(g.createdAt),
});

// Somas de depósitos e retiradas por objetivo
export async function somasPorObjetivo(ids: string[]) {
  const mapa = new Map<string, { dep: Prisma.Decimal; ret: Prisma.Decimal }>();
  if (!ids.length) return mapa;
  const somas = await prisma.goalEntry.groupBy({ by: ["goalId", "kind"], where: { goalId: { in: ids } }, _sum: { amount: true } });
  for (const id of ids) mapa.set(id, { dep: ZERO, ret: ZERO });
  for (const s of somas) {
    const atual = mapa.get(s.goalId)!;
    if (s.kind === "DEPOSIT") atual.dep = s._sum.amount ?? ZERO;
    else atual.ret = s._sum.amount ?? ZERO;
  }
  return mapa;
}

export function serializarObjetivo(g: ObjetivoComConta, p: Progresso) {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    icon: g.icon,
    targetAmount: g.targetAmount.toFixed(2),
    initialAmount: g.initialAmount.toFixed(2),
    targetDate: g.targetDate,
    description: g.description,
    accountId: g.accountId,
    account: g.account ? { id: g.account.id, name: g.account.name, type: g.account.type, bankLogo: g.account.bankLogo } : null,
    status: g.status,
    showOnHome: g.showOnHome,
    completedAt: g.completedAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
    startDate: diaLocal(g.createdAt),
    progress: serializarProgresso(p),
  };
}

// Objetivos com progresso (na ordem dada)
export async function comProgresso(lista: ObjetivoComConta[], hoje = diaLocal()) {
  const somas = await somasPorObjetivo(lista.map((g) => g.id));
  return lista.map((g) => {
    const s = somas.get(g.id)!;
    return serializarObjetivo(g, calcularProgresso(dadosProgresso(g), s.dep, s.ret, hoje));
  });
}
