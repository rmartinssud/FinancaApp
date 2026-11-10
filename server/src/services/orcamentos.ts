import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Decimal, ZERO, intervaloDoMes, somarMeses, mesAtual } from "../lib/money.js";
import { incluir, serializar } from "./lancamentos.js";
import { filtroCategorias, valorNasCategorias, selecionarPorcoes } from "./porcoes.js";

// ─────────────────────────────────────────────
// Orçamentos: meta, quanto já foi usado e saldo de cada período.
//
// Quais lançamentos contam:
// - do mesmo tipo do orçamento (despesa ou receita); transferências e ajustes de saldo nunca contam;
// - das categorias escolhidas (sem categoria escolhida = todas), com as subcategorias delas;
//   multicategorias: conta só a parte das categorias escolhidas;
// - lançamentos com "Ignorar em Orçamentos" nunca contam;
// - das contas/cartões escolhidos (só despesa; sem conta escolhida = todas);
// - contas com "Ignorar nos totais" ficam de fora, a não ser que o orçamento peça para considerar;
// - no período: mês (mensal) ou intervalo de datas (personalizado), em Brasília.
//   Compras no cartão contam pela data da compra (padrão) ou pelo mês da fatura.
// - Confirmados sempre; pendentes só com "Previsto" ligado.
// ─────────────────────────────────────────────

export const incluirOrcamento = {
  categories: { select: { categoryId: true, category: { select: { children: { select: { id: true } } } } } },
  accounts: { select: { accountId: true } },
  goals: true,
  components: { select: { budgetId: true } },
} satisfies Prisma.BudgetInclude;

export type Orcamento = Prisma.BudgetGetPayload<{ include: typeof incluirOrcamento }>;

type Periodo = { gte: Date; lt: Date; meses: string[] };

// "2026-11-07" → 00:00 desse dia em Brasília (UTC-3 fixo)
function inicioDoDia(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 3));
}

// Meses de "de" até "ate", inclusive
export function mesesDoIntervalo(de: string, ate: string) {
  const meses: string[] = [];
  for (let m = de; m <= ate && meses.length < 240; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

// O orçamento aparece neste mês? Mensal: da vigência até antes do mês arquivado. Personalizado: se o período encosta no mês.
export function ativoNoMes(b: Orcamento, mes: string) {
  if (b.period === "CUSTOM") return b.startDate!.slice(0, 7) <= mes && b.endDate!.slice(0, 7) >= mes;
  if (!b.startMonth || b.startMonth > mes) return false;
  return !b.archivedFromMonth || mes < b.archivedFromMonth;
}

// Período calculado: o mês pedido (mensal) ou o intervalo inteiro (personalizado, independe do mês)
export function periodoDe(b: Orcamento, mes: string): Periodo {
  if (b.period === "CUSTOM") {
    const fim = inicioDoDia(b.endDate!);
    return {
      gte: inicioDoDia(b.startDate!),
      lt: new Date(fim.getTime() + 24 * 60 * 60 * 1000),
      meses: mesesDoIntervalo(b.startDate!.slice(0, 7), b.endDate!.slice(0, 7)),
    };
  }
  return { ...intervaloDoMes(mes), meses: [mes] };
}

// Filtro do Prisma com os lançamentos que contam no orçamento (sem olhar a situação)
// Categorias do filtro + as subcategorias delas
export function categoriasDoFiltro(b: Orcamento) {
  return [...new Set(b.categories.flatMap((c) => [c.categoryId, ...c.category.children.map((f) => f.id)]))];
}

export function filtroLancamentos(b: Orcamento, periodo: Periodo): Prisma.TransactionWhereInput {
  const data = { gte: periodo.gte, lt: periodo.lt };
  const porFatura = b.kind === "EXPENSE" && b.cardDateRef === "INVOICE";
  const categorias = categoriasDoFiltro(b);
  const contas = b.kind === "EXPENSE" ? b.accounts.map((c) => c.accountId) : [];
  return {
    householdId: b.householdId,
    type: b.kind,
    isAdjustment: false,
    ignoreInBudgets: false,
    ...(categorias.length ? { AND: [filtroCategorias(categorias)] } : {}),
    ...(contas.length ? { accountId: { in: contas } } : {}),
    ...(b.includeIgnored ? {} : { account: { ignoreInTotals: false } }),
    // Mês da fatura: compras no cartão (invoiceMonth preenchido) contam no mês da fatura; o resto pela data
    ...(porFatura ? { OR: [{ invoiceMonth: null, date: data }, { invoiceMonth: { in: periodo.meses } }] } : { date: data }),
  };
}

const arredondar = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// Meta fixa de um mês, pelo histórico: "só neste mês" > última "deste mês em diante" até o mês > a primeira
export function metaFixaDoMes(b: Orcamento, mes: string) {
  const metas = b.goals.filter((g) => !g.isTransfer);
  const porData = (a: { createdAt: Date }, c: { createdAt: Date }) => a.createdAt.getTime() - c.createdAt.getTime();
  const soNeste = metas.filter((g) => g.onlyMonth && g.fromMonth === mes).sort(porData).at(-1);
  if (soNeste) return soNeste.amount;
  const emDiante = metas.filter((g) => !g.onlyMonth).sort((a, c) => (a.fromMonth === c.fromMonth ? porData(a, c) : a.fromMonth < c.fromMonth ? -1 : 1));
  let valor = emDiante[0]?.amount ?? ZERO;
  for (const g of emDiante) if (g.fromMonth <= mes) valor = g.amount;
  return valor;
}

// Ajustes de "Transferir saldo" no mês (+ recebeu, − mandou)
function ajustesDoMes(b: Orcamento, mes: string) {
  return b.goals.filter((g) => g.isTransfer && g.fromMonth === mes).reduce((s, g) => s.plus(g.amount), ZERO);
}

export type Progresso = {
  goal: Prisma.Decimal;
  confirmed: Prisma.Decimal;
  pending: Prisma.Decimal;
  used: Prisma.Decimal;
  balance: Prisma.Decimal;
};

// Calcula metas e uso dos orçamentos de um espaço (com cache por pedido)
export class Calculadora {
  private receitas = new Map<string, Promise<Prisma.Decimal>>();
  private progressos = new Map<string, Promise<Progresso>>();

  constructor(
    readonly householdId: string,
    readonly orcamentos: Map<string, Orcamento>,
  ) {}

  static async carregar(householdId: string) {
    const lista = await prisma.budget.findMany({ where: { householdId }, include: incluirOrcamento, orderBy: { createdAt: "asc" } });
    return new Calculadora(householdId, new Map(lista.map((b) => [b.id, b])));
  }

  get lista() {
    return [...this.orcamentos.values()];
  }

  // Total de receitas confirmadas do mês (o mesmo número de Receitas no Início)
  totalReceitas(mes: string) {
    let p = this.receitas.get(mes);
    if (!p) {
      p = prisma.transaction
        .aggregate({
          where: {
            householdId: this.householdId,
            type: "INCOME",
            status: "CONFIRMED",
            isAdjustment: false,
            ignoreInTotals: false,
            OR: [{ invoiceMonth: null, date: intervaloDoMes(mes) }, { invoiceMonth: mes }],
          },
          _sum: { amount: true },
        })
        .then((r) => r._sum.amount ?? ZERO);
      this.receitas.set(mes, p);
    }
    return p;
  }

  // Componentes do agrupado que valem no mês
  componentes(b: Orcamento, mes: string) {
    return b.components.flatMap((c) => {
      const comp = this.orcamentos.get(c.budgetId);
      return comp && ativoNoMes(comp, mes) ? [comp] : [];
    });
  }

  // Meta do período
  async meta(b: Orcamento, mes: string, profundidade = 0): Promise<Prisma.Decimal> {
    if (profundidade > 3) return ZERO;
    if (b.isGroup) {
      let soma = ZERO;
      for (const c of this.componentes(b, mes)) soma = soma.plus(await this.meta(c, mes, profundidade + 1));
      return soma;
    }
    if (b.period === "CUSTOM") return b.amount ?? ZERO;
    let base = ZERO;
    const pct = b.percent ?? ZERO;
    if (b.goalType === "FIXED") base = metaFixaDoMes(b, mes);
    else if (b.goalType === "PERCENT_INCOME") base = arredondar((await this.totalReceitas(mes)).times(pct).dividedBy(100));
    else {
      const ref = b.percentOfBudgetId ? this.orcamentos.get(b.percentOfBudgetId) : undefined;
      base = ref ? arredondar((await this.meta(ref, mes, profundidade + 1)).times(pct).dividedBy(100)) : ZERO;
    }
    return base.plus(ajustesDoMes(b, mes));
  }

  // Meta, efetivado, pendente, usado e saldo no período
  progresso(b: Orcamento, mes: string): Promise<Progresso> {
    const chave = `${b.id}:${b.period === "CUSTOM" ? "*" : mes}`;
    let p = this.progressos.get(chave);
    if (!p) {
      p = this.calcular(b, mes);
      this.progressos.set(chave, p);
    }
    return p;
  }

  private async calcular(b: Orcamento, mes: string): Promise<Progresso> {
    if (b.isGroup) {
      const partes = await Promise.all(this.componentes(b, mes).map((c) => this.progresso(c, mes)));
      const soma = (k: keyof Progresso) => partes.reduce((s, x) => s.plus(x[k]), ZERO);
      const goal = soma("goal");
      const used = soma("used");
      return { goal, confirmed: soma("confirmed"), pending: soma("pending"), used, balance: goal.minus(used) };
    }
    const [goal, usados] = await Promise.all([
      this.meta(b, mes),
      prisma.transaction.findMany({ where: filtroLancamentos(b, periodoDe(b, mes)), select: { ...selecionarPorcoes, status: true } }),
    ]);
    // Com categorias no filtro, multicategorias contam só pela parte dessas categorias
    const categorias = categoriasDoFiltro(b);
    const dentro = new Set(categorias);
    const valor = (t: (typeof usados)[number]) => (categorias.length ? valorNasCategorias(t, dentro) : t.amount);
    let confirmed = ZERO;
    let pending = ZERO;
    for (const t of usados) {
      if (t.status === "CONFIRMED") confirmed = confirmed.plus(valor(t));
      else pending = pending.plus(valor(t));
    }
    const used = b.includePending ? confirmed.plus(pending) : confirmed;
    return { goal, confirmed, pending, used, balance: goal.minus(used) };
  }

  // Lançamentos que contaram no período (do agrupado: de todos os componentes, sem repetir)
  async lancamentos(b: Orcamento, mes: string) {
    const fontes = b.isGroup ? this.componentes(b, mes) : [b];
    const vistos = new Map<string, ReturnType<typeof serializar>>();
    for (const f of fontes) {
      const lista = await prisma.transaction.findMany({
        where: { ...filtroLancamentos(f, periodoDe(f, mes)), ...(f.includePending ? {} : { status: "CONFIRMED" }) },
        include: incluir,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 500,
      });
      for (const t of lista) vistos.set(t.id, serializar(t));
    }
    return [...vistos.values()].sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : 0));
  }

  // Meta recomendada: média do usado nos 3 últimos meses completos, arredondada para cima (R$ 10).
  // Só quando o espaço já tem lançamentos desde o primeiro desses 3 meses.
  async recomendada(b: Orcamento) {
    if (b.isGroup || b.period !== "MONTHLY") return null;
    const atual = mesAtual();
    const meses = [somarMeses(atual, -3), somarMeses(atual, -2), somarMeses(atual, -1)];
    const primeiro = await prisma.transaction.findFirst({
      where: { householdId: this.householdId, isAdjustment: false },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (!primeiro || primeiro.date >= intervaloDoMes(meses[0]).lt) return null;
    let soma = ZERO;
    for (const m of meses) soma = soma.plus((await this.calcular(b, m)).used);
    const media = soma.dividedBy(3);
    const valor = media.dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_CEIL).times(10);
    return { amount: valor.toFixed(2), average: arredondar(media).toFixed(2), months: meses };
  }
}

// ─────────────────────────────────────────────
// JSON
// ─────────────────────────────────────────────

export function serializarOrcamento(b: Orcamento) {
  return {
    id: b.id,
    kind: b.kind,
    isGroup: b.isGroup,
    name: b.name,
    color: b.color,
    icon: b.icon,
    period: b.period,
    startMonth: b.startMonth,
    archivedFromMonth: b.archivedFromMonth,
    startDate: b.startDate,
    endDate: b.endDate,
    goalType: b.goalType,
    amount: b.amount?.toFixed(2) ?? null,
    percent: b.percent?.toFixed(2) ?? null,
    percentOfBudgetId: b.percentOfBudgetId,
    includeIgnored: b.includeIgnored,
    includePending: b.includePending,
    cardDateRef: b.cardDateRef,
    alertPercent: b.alertPercent,
    showOnHome: b.showOnHome,
    categoryIds: b.categories.map((c) => c.categoryId),
    accountIds: b.accounts.map((c) => c.accountId),
    componentIds: b.components.map((c) => c.budgetId),
  };
}

// Situação: OVER (estourado), ALERT (passou do alerta), REACHED (receita alcançada) ou OK
export function serializarProgresso(b: Orcamento, p: Progresso) {
  const percent = p.goal.gt(0) ? Number(p.used.dividedBy(p.goal).times(100).toFixed(1)) : null;
  let status = "OK";
  if (b.kind === "EXPENSE") {
    if (p.balance.lt(0)) status = "OVER";
    else if (b.alertPercent !== null && percent !== null && percent >= b.alertPercent) status = "ALERT";
  } else if (p.goal.gt(0) && p.used.gte(p.goal)) status = "REACHED";
  return {
    goal: p.goal.toFixed(2),
    confirmed: p.confirmed.toFixed(2),
    pending: p.pending.toFixed(2),
    used: p.used.toFixed(2),
    balance: p.balance.toFixed(2),
    percent,
    status,
  };
}
