import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";
import { ZERO, mesSchema, mesAtual, intervaloDoMes, somarMeses, partesLocais } from "../lib/money.js";
import { contasComSaldo } from "../services/saldos.js";
import { selecionarPorcoes, mapaDePais, somarPorCategoria, comSubcategorias, filtroCategorias, porcoes } from "../services/porcoes.js";

export const summaryRouter = Router();

summaryRouter.use(requireAuth, withHousehold);

const filtro = z.object({
  month: mesSchema.optional(),
});

// Regras do resumo (Início): só confirmados e sem ajustes de saldo.
// "Despesas por categoria" e o histórico da categoria usam exatamente este filtro.
function baseDoResumo(req: Request) {
  return {
    ...scope(req),
    status: "CONFIRMED" as const,
    // Ajuste de saldo só acerta o saldo da conta: não é receita nem despesa
    isAdjustment: false,
  };
}

// GET /api/summary?month=2026-11 → resumo do mês (só lançamentos confirmados).
// Transferências (e pagamentos de fatura) e ajustes de saldo não entram em receitas nem despesas.
// Compras no cartão contam como despesa no mês do vencimento da fatura, não no dia da compra.
summaryRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { month } = res.locals.query as z.infer<typeof filtro>;
  const mes = month ?? mesAtual();
  const doMes = {
    ...baseDoResumo(req),
    OR: [{ invoiceMonth: null, date: intervaloDoMes(mes) }, { invoiceMonth: mes }],
  };

  // Totais de receitas e despesas (lançamentos com "Ignorar nos totais" ficam de fora;
  // o saldo das contas continua real, com eles)
  const totais = await prisma.transaction.groupBy({
    by: ["type"],
    where: { ...doMes, type: { in: ["INCOME", "EXPENSE"] }, ignoreInTotals: false },
    _sum: { amount: true },
  });
  const income = totais.find((t) => t.type === "INCOME")?._sum.amount ?? ZERO;
  const expense = totais.find((t) => t.type === "EXPENSE")?._sum.amount ?? ZERO;

  // Despesas por categoria (a maior primeiro). Subcategorias somam na categoria-pai,
  // multicategorias contam pelas partes e "Ignorar em Estatísticas" fica de fora.
  const [despesas, pais] = await Promise.all([
    prisma.transaction.findMany({ where: { ...doMes, type: "EXPENSE", ignoreInStatistics: false }, select: selecionarPorcoes }),
    mapaDePais(scope(req).householdId),
  ]);
  const porCategoria = somarPorCategoria(despesas, pais);
  const categorias = await prisma.category.findMany({
    where: { ...scope(req), id: { in: [...porCategoria.keys()].flatMap((k) => (k ? [k] : [])) } },
  });

  const byCategory = [...porCategoria.entries()]
    .map(([categoryId, total]) => {
      const c = categorias.find((x) => x.id === categoryId);
      return {
        categoryId,
        name: c?.name ?? "Sem categoria",
        color: c?.color ?? "#94a3b8",
        // Ícone e tipo para o Início (editar a categoria direto do cartão)
        icon: c?.icon ?? null,
        type: c?.type ?? null,
        total,
      };
    })
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((p) => ({ ...p, total: p.total.toFixed(2) }));

  // Saldo das contas (sem cartões): total e quanto está em investimentos.
  // Contas com "Ignorar nos totais" ficam de fora; "Exibir na tela de Resumo" só esconde da lista, não do total.
  const accounts = await contasComSaldo(scope(req).householdId);
  const somadas = accounts.filter((c) => c.type !== "CREDIT_CARD" && !c.ignoreInTotals);
  const somar = (lista: typeof accounts) => lista.reduce((t, c) => t.plus(c.currentBalance), ZERO).toFixed(2);

  res.json({
    month: mes,
    totals: {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: income.minus(expense).toFixed(2),
    },
    byCategory,
    accounts,
    accountsTotals: {
      total: somar(somadas),
      investments: somar(somadas.filter((c) => c.type === "INVESTMENT")),
    },
  });
});

const filtroHistorico = z.object({
  // Id da categoria ou "none" (despesas sem categoria)
  categoryId: z.string().min(1, "Escolha a categoria."),
  // Último mês do histórico (padrão: mês atual)
  month: mesSchema.optional(),
  months: z.coerce.number().int().min(1, "De 1 a 12 meses.").max(12, "De 1 a 12 meses.").default(6),
});

// GET /api/summary/category-history?categoryId=...&month=2026-11&months=6
// → despesas da categoria mês a mês (o mais antigo primeiro), com as mesmas regras de
// "Despesas por categoria": só confirmadas, sem transferências nem ajustes, compras no cartão
// no mês da fatura. categoryId=none = despesas sem categoria.
summaryRouter.get("/category-history", validateQuery(filtroHistorico), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroHistorico>;
  const fim = f.month ?? mesAtual();
  const semCategoria = f.categoryId === "none";

  let categoria = null;
  if (!semCategoria) {
    categoria = await prisma.category.findFirst({ where: { id: f.categoryId, ...scope(req) } });
    if (!categoria) return res.status(404).json({ error: "Categoria não encontrada." });
  }

  const meses = Array.from({ length: f.months }, (_, i) => somarMeses(fim, i - (f.months - 1)));
  // A categoria e as subcategorias dela (como no gráfico, que agrega na pai)
  const ids = semCategoria ? [] : await comSubcategorias(scope(req).householdId, [f.categoryId]);
  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...baseDoResumo(req),
      type: "EXPENSE",
      ignoreInStatistics: false,
      AND: [
        semCategoria ? { OR: [{ categoryId: null, splits: { none: {} } }, { splits: { some: { categoryId: null } } }] } : filtroCategorias(ids),
        {
          OR: [
            { invoiceMonth: null, date: { gte: intervaloDoMes(meses[0]).gte, lt: intervaloDoMes(fim).lt } },
            { invoiceMonth: { in: meses } },
          ],
        },
      ],
    },
    select: { ...selecionarPorcoes, date: true, invoiceMonth: true },
  });

  const dentro = new Set(ids);
  const somas = new Map(meses.map((m) => [m, ZERO]));
  for (const l of lancamentos) {
    const m = l.invoiceMonth ?? partesLocais(l.date).mes;
    const atual = somas.get(m);
    if (!atual) continue;
    const valor = porcoes(l).reduce(
      (t, p) => ((semCategoria ? p.categoryId === null : p.categoryId !== null && dentro.has(p.categoryId)) ? t.plus(p.amount) : t),
      ZERO,
    );
    somas.set(m, atual.plus(valor));
  }
  const total = [...somas.values()].reduce((t, v) => t.plus(v), ZERO);

  res.json({
    categoryId: semCategoria ? null : categoria!.id,
    name: categoria?.name ?? "Sem categoria",
    color: categoria?.color ?? "#94a3b8",
    month: fim,
    months: meses.map((m) => ({ month: m, total: somas.get(m)!.toFixed(2) })),
    // Média simples dos meses mostrados (o mês atual inclusive)
    average: total.dividedBy(meses.length).toFixed(2),
  });
});
