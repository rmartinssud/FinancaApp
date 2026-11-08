import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";
import { ZERO, mesSchema, mesAtual, intervaloDoMes } from "../lib/money.js";
import { contasComSaldo } from "../services/saldos.js";

export const summaryRouter = Router();

summaryRouter.use(requireAuth, withHousehold);

const filtro = z.object({
  month: mesSchema.optional(),
});

// GET /api/summary?month=2026-11 → resumo do mês (só lançamentos confirmados)
summaryRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { month } = res.locals.query as z.infer<typeof filtro>;
  const mes = month ?? mesAtual();
  const doMes = { ...scope(req), status: "CONFIRMED" as const, date: intervaloDoMes(mes) };

  // Totais de receitas e despesas
  const totais = await prisma.transaction.groupBy({
    by: ["type"],
    where: { ...doMes, type: { in: ["INCOME", "EXPENSE"] } },
    _sum: { amount: true },
  });
  const income = totais.find((t) => t.type === "INCOME")?._sum.amount ?? ZERO;
  const expense = totais.find((t) => t.type === "EXPENSE")?._sum.amount ?? ZERO;

  // Despesas por categoria (a maior primeiro)
  const porCategoria = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { ...doMes, type: "EXPENSE" },
    _sum: { amount: true },
  });
  const categorias = await prisma.category.findMany({
    where: { ...scope(req), id: { in: porCategoria.flatMap((p) => (p.categoryId ? [p.categoryId] : [])) } },
  });

  const byCategory = porCategoria
    .map((p) => {
      const c = categorias.find((x) => x.id === p.categoryId);
      return {
        categoryId: p.categoryId,
        name: c?.name ?? "Sem categoria",
        color: c?.color ?? "#94a3b8",
        total: p._sum.amount ?? ZERO,
      };
    })
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((p) => ({ ...p, total: p.total.toFixed(2) }));

  res.json({
    month: mes,
    totals: {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: income.minus(expense).toFixed(2),
    },
    byCategory,
    accounts: await contasComSaldo(scope(req).householdId),
  });
});
