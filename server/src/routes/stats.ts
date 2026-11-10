import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";
import { ZERO, mesSchema, mesAtual, intervaloDoMes, somarMeses } from "../lib/money.js";
import { mesesDoIntervalo } from "../services/orcamentos.js";
import { mapaDePais, somarPorCategoria, porcoes, mesDoLancamento, selecionarPorcoes } from "../services/porcoes.js";

// ─────────────────────────────────────────────
// Estatísticas e Gráficos + Economia mensal.
// Regras comuns: transferências (e pagamentos de fatura) e ajustes de saldo nunca contam;
// compras no cartão contam no mês da fatura; só confirmados, a não ser com includePending=true.
// ─────────────────────────────────────────────

export const statsRouter = Router();
export const savingsRouter = Router();
statsRouter.use(requireAuth, withHousehold);
savingsRouter.use(requireAuth, withHousehold);

const simNao = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const MAX_MESES = 24;

// Lançamentos de receita/despesa entre os meses "de" e "ate" (inclusive)
function filtroPeriodo(req: Request, de: string, ate: string, incluirPendentes: boolean): Prisma.TransactionWhereInput {
  const meses = mesesDoIntervalo(de, ate);
  return {
    ...scope(req),
    type: { in: ["INCOME", "EXPENSE"] },
    isAdjustment: false,
    ...(incluirPendentes ? {} : { status: "CONFIRMED" as const }),
    OR: [
      { invoiceMonth: null, date: { gte: intervaloDoMes(de).gte, lt: intervaloDoMes(ate).lt } },
      { invoiceMonth: { in: meses } },
    ],
  };
}

const textoDecimal = (v: Prisma.Decimal) => v.toFixed(2);

// ─── GET /api/stats ─────────────────────────────
// ?from=2026-09&to=2026-11&type=EXPENSE&includePending=false&categoryId=<pai>
// Total do período e as divisões por categoria (subcategorias somam na pai), por subcategoria
// (da categoria pedida), por conta/cartão e por tag. Respeita "Ignorar em Estatísticas".
const filtroStats = z
  .object({
    from: mesSchema.optional(),
    to: mesSchema.optional(),
    type: z.enum(["INCOME", "EXPENSE"], { error: "Use INCOME ou EXPENSE." }).default("EXPENSE"),
    includePending: simNao,
    categoryId: z.string().min(1).optional(),
  })
  .transform((f) => {
    const to = f.to ?? mesAtual();
    return { ...f, to, from: f.from ?? to };
  })
  .refine((f) => f.from <= f.to, { message: "O mês inicial precisa vir antes do final.", path: ["from"] })
  .refine((f) => mesesDoIntervalo(f.from, f.to).length <= MAX_MESES, { message: `Até ${MAX_MESES} meses.`, path: ["from"] });

statsRouter.get("/", validateQuery(filtroStats), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroStats>;
  const householdId = scope(req).householdId;

  const [lancamentos, pais, categorias] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...filtroPeriodo(req, f.from, f.to, f.includePending), type: f.type, ignoreInStatistics: false },
      select: { ...selecionarPorcoes, accountId: true, tags: { select: { tagId: true } } },
    }),
    mapaDePais(householdId),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, color: true, icon: true, parentId: true } }),
  ]);
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const total = lancamentos.reduce((t, l) => t.plus(l.amount), ZERO);

  const ordenar = <T extends { total: Prisma.Decimal }>(lista: T[]) =>
    lista.sort((a, b) => b.total.comparedTo(a.total)).map((x) => ({ ...x, total: textoDecimal(x.total) }));

  // Por categoria (principal)
  const byCategory = ordenar(
    [...somarPorCategoria(lancamentos, pais).entries()].map(([id, valor]) => {
      const c = id ? cat.get(id) : undefined;
      return {
        categoryId: id,
        name: c?.name ?? "Sem categoria",
        color: c?.color ?? "#94a3b8",
        icon: c?.icon ?? null,
        hasChildren: Boolean(id && categorias.some((x) => x.parentId === id)),
        total: valor,
      };
    }),
  );

  // Por subcategoria da categoria pedida (a parte lançada direto na pai aparece como a própria pai)
  let bySubcategory = null;
  if (f.categoryId) {
    const pai = cat.get(f.categoryId);
    if (!pai) return res.status(404).json({ error: "Categoria não encontrada." });
    const somas = new Map<string, Prisma.Decimal>();
    for (const l of lancamentos) {
      for (const p of porcoes(l)) {
        if (!p.categoryId || (p.categoryId !== pai.id && pais.get(p.categoryId) !== pai.id)) continue;
        somas.set(p.categoryId, (somas.get(p.categoryId) ?? ZERO).plus(p.amount));
      }
    }
    bySubcategory = ordenar(
      [...somas.entries()].map(([id, valor]) => {
        const c = cat.get(id)!;
        return {
          categoryId: id,
          name: id === pai.id ? `${pai.name} (sem subcategoria)` : c.name,
          color: c.color,
          icon: c.icon,
          total: valor,
        };
      }),
    );
  }

  // Por conta / cartão
  const porConta = new Map<string, Prisma.Decimal>();
  for (const l of lancamentos) porConta.set(l.accountId, (porConta.get(l.accountId) ?? ZERO).plus(l.amount));
  const contas = await prisma.financialAccount.findMany({
    where: { householdId, id: { in: [...porConta.keys()] } },
    select: { id: true, name: true, type: true, bankLogo: true, color: true },
  });
  const byAccount = ordenar(
    contas.map((c) => ({ accountId: c.id, name: c.name, type: c.type, bankLogo: c.bankLogo, color: c.color, total: porConta.get(c.id)! })),
  );

  // Por tag (um lançamento com 2 tags conta nas duas; "Sem tag" junta os que não têm)
  const porTag = new Map<string | null, Prisma.Decimal>();
  for (const l of lancamentos) {
    const chaves = l.tags.length ? l.tags.map((t) => t.tagId) : [null];
    for (const k of chaves) porTag.set(k, (porTag.get(k) ?? ZERO).plus(l.amount));
  }
  const tags = await prisma.tag.findMany({ where: { householdId, id: { in: [...porTag.keys()].flatMap((k) => (k ? [k] : [])) } } });
  const byTag = ordenar(
    [...porTag.entries()].map(([id, valor]) => {
      const t = tags.find((x) => x.id === id);
      return { tagId: id, name: t?.name ?? "Sem tag", color: t?.color ?? "#94a3b8", total: valor };
    }),
  );

  res.json({
    from: f.from,
    to: f.to,
    type: f.type,
    includePending: f.includePending,
    total: textoDecimal(total),
    count: lancamentos.length,
    byCategory,
    bySubcategory,
    byAccount,
    byTag,
  });
});

// ─── GET /api/stats/evolution ────────────────────
// ?month=2026-11&months=6&includePending=false → receitas × despesas mês a mês (o mais antigo primeiro),
// saldo do mês (receitas − despesas) e saldo acumulado no período. Respeita "Ignorar em Estatísticas".
const filtroEvolucao = z.object({
  month: mesSchema.optional(),
  months: z.coerce.number().int().min(1, "De 1 a 24 meses.").max(MAX_MESES, "De 1 a 24 meses.").default(6),
  includePending: simNao,
});

async function receitasEDespesasPorMes(
  req: Request,
  fim: string,
  quantos: number,
  incluirPendentes: boolean,
  extra: Prisma.TransactionWhereInput,
) {
  const meses = Array.from({ length: quantos }, (_, i) => somarMeses(fim, i - (quantos - 1)));
  const lancamentos = await prisma.transaction.findMany({
    where: { ...filtroPeriodo(req, meses[0], fim, incluirPendentes), ...extra },
    select: { amount: true, type: true, date: true, invoiceMonth: true },
  });
  const somas = new Map(meses.map((m) => [m, { income: ZERO, expense: ZERO }]));
  for (const l of lancamentos) {
    const s = somas.get(mesDoLancamento(l));
    if (!s) continue;
    if (l.type === "INCOME") s.income = s.income.plus(l.amount);
    else s.expense = s.expense.plus(l.amount);
  }
  return meses.map((m) => ({ month: m, ...somas.get(m)! }));
}

statsRouter.get("/evolution", validateQuery(filtroEvolucao), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroEvolucao>;
  const fim = f.month ?? mesAtual();
  const meses = await receitasEDespesasPorMes(req, fim, f.months, f.includePending, { ignoreInStatistics: false });
  let acumulado = ZERO;
  res.json({
    month: fim,
    includePending: f.includePending,
    months: meses.map((m) => {
      const saldo = m.income.minus(m.expense);
      acumulado = acumulado.plus(saldo);
      return {
        month: m.month,
        income: textoDecimal(m.income),
        expense: textoDecimal(m.expense),
        balance: textoDecimal(saldo),
        accumulated: textoDecimal(acumulado),
      };
    }),
  });
});

// ─── GET /api/savings ──────────────────────────
// ?month=2026-11&months=12&includePending=false → economia mês a mês: receitas − despesas, e % da receita.
// Fora: "Ignorar em Economia mensal", contas/cartões com "Ignorar nos totais", transferências e ajustes.
// Média, melhor e pior mês consideram só os meses com algum lançamento.
const filtroEconomia = z.object({
  month: mesSchema.optional(),
  months: z.coerce.number().int().min(1, "De 1 a 24 meses.").max(MAX_MESES, "De 1 a 24 meses.").default(12),
  includePending: simNao,
});

savingsRouter.get("/", validateQuery(filtroEconomia), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroEconomia>;
  const fim = f.month ?? mesAtual();
  const meses = await receitasEDespesasPorMes(req, fim, f.months, f.includePending, {
    ignoreInMonthlySavings: false,
    account: { ignoreInTotals: false },
  });

  const linhas = meses.map((m) => {
    const savings = m.income.minus(m.expense);
    return {
      month: m.month,
      income: m.income,
      expense: m.expense,
      savings,
      percent: m.income.gt(0) ? Number(savings.dividedBy(m.income).times(100).toFixed(1)) : null,
      hasData: m.income.gt(0) || m.expense.gt(0),
    };
  });
  const comDados = linhas.filter((l) => l.hasData);
  const totalEconomia = comDados.reduce((t, l) => t.plus(l.savings), ZERO);
  const totalReceita = comDados.reduce((t, l) => t.plus(l.income), ZERO);
  const melhor = comDados.reduce<(typeof linhas)[number] | null>((b, l) => (!b || l.savings.gt(b.savings) ? l : b), null);
  const pior = comDados.reduce<(typeof linhas)[number] | null>((b, l) => (!b || l.savings.lt(b.savings) ? l : b), null);
  const json = (l: (typeof linhas)[number]) => ({
    month: l.month,
    income: textoDecimal(l.income),
    expense: textoDecimal(l.expense),
    savings: textoDecimal(l.savings),
    percent: l.percent,
    hasData: l.hasData,
  });

  res.json({
    month: fim,
    includePending: f.includePending,
    months: linhas.map(json),
    total: textoDecimal(totalEconomia),
    average: comDados.length ? totalEconomia.dividedBy(comDados.length).toDecimalPlaces(2).toFixed(2) : "0.00",
    averagePercent: totalReceita.gt(0) ? Number(totalEconomia.dividedBy(totalReceita).times(100).toFixed(1)) : null,
    best: melhor ? json(melhor) : null,
    worst: pior ? json(pior) : null,
  });
});
