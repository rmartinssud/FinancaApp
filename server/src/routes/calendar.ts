import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";
import { ZERO, mesSchema, mesAtual, intervaloDoMes } from "../lib/money.js";
import { incluir, serializar } from "../services/lancamentos.js";
import { faturasDoMes } from "../services/cartoes.js";
import { fimDeHojeEmBrasilia } from "../services/autoEfetivar.js";
import { diaEmBrasilia } from "./reports.js";

// ─────────────────────────────────────────────
// Calendário: o mês dia a dia. Em cada dia, o total de receitas e despesas (efetivadas e pendentes),
// quantos pendentes e quantos pendentes vencidos. As faturas de cartão entram no dia do vencimento
// com o valor da fatura (as compras no cartão não aparecem uma a uma, como em Lançamentos).
// Transferências, pagamentos de fatura e ajustes de saldo aparecem na lista do dia, mas não nos totais;
// lançamentos com "Ignorar nos totais" também ficam fora dos totais.
// Efetivar um pendente: PATCH /api/transactions/:id { status: "CONFIRMED" } (VIEWER não pode).
// ─────────────────────────────────────────────

export const calendarRouter = Router();
calendarRouter.use(requireAuth, withHousehold);

const filtro = z.object({ month: mesSchema.optional() });

type Dia = { income: Prisma.Decimal; expense: Prisma.Decimal; invoices: Prisma.Decimal; pending: number; overdue: number; count: number };

calendarRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { month } = res.locals.query as z.infer<typeof filtro>;
  const mes = month ?? mesAtual();
  const householdId = scope(req).householdId;
  const intervalo = intervaloDoMes(mes);
  // Pendente "vencido": a data é antes de hoje (em Brasília)
  const inicioDeHoje = new Date(fimDeHojeEmBrasilia().getTime() - 24 * 60 * 60 * 1000);
  const pendenteComum = { status: "PENDING" as const, type: { in: ["INCOME" as const, "EXPENSE" as const] }, isAdjustment: false };

  const [lancamentos, faturas, vencidosAntes] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...scope(req), date: intervalo, NOT: { type: "EXPENSE", invoiceMonth: { not: null } } },
      include: incluir,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    faturasDoMes(householdId, mes),
    // Pendentes vencidos de meses anteriores (para avisar no topo)
    prisma.transaction.count({
      where: { ...scope(req), ...pendenteComum, invoiceMonth: null, date: { lt: intervalo.gte < inicioDeHoje ? intervalo.gte : inicioDeHoje } },
    }),
  ]);

  const dias = new Map<string, Dia>();
  const doDia = (d: string) => {
    let x = dias.get(d);
    if (!x) {
      x = { income: ZERO, expense: ZERO, invoices: ZERO, pending: 0, overdue: 0, count: 0 };
      dias.set(d, x);
    }
    return x;
  };

  const itens = lancamentos.map((t) => {
    const dia = diaEmBrasilia(t.date);
    const d = doDia(dia);
    d.count += 1;
    const conta = (t.type === "INCOME" || t.type === "EXPENSE") && !t.isAdjustment;
    if (conta && !t.ignoreInTotals) {
      if (t.type === "INCOME") d.income = d.income.plus(t.amount);
      else d.expense = d.expense.plus(t.amount);
    }
    const vencido = t.status === "PENDING" && t.date < inicioDeHoje;
    if (t.status === "PENDING") d.pending += 1;
    if (vencido) d.overdue += 1;
    return { ...serializar(t), day: dia, overdue: vencido };
  });

  const invoices = faturas.map((f) => {
    const dia = f.dueDate ? diaEmBrasilia(new Date(f.dueDate)) : `${mes}-01`;
    const d = doDia(dia);
    d.count += 1;
    d.invoices = d.invoices.plus(f.total);
    if (f.status === "OVERDUE") d.overdue += 1;
    return { ...f, day: dia, overdue: f.status === "OVERDUE" };
  });

  const texto = (v: Prisma.Decimal) => v.toFixed(2);
  const lista = [...dias.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, d]) => ({
      date,
      income: texto(d.income),
      // Despesas do dia + faturas que vencem no dia
      expense: texto(d.expense.plus(d.invoices)),
      invoices: texto(d.invoices),
      pending: d.pending,
      overdue: d.overdue,
      count: d.count,
    }));
  const income = lista.reduce((s, d) => s.plus(d.income), ZERO);
  const expense = lista.reduce((s, d) => s.plus(d.expense), ZERO);

  res.json({
    month: mes,
    today: diaEmBrasilia(new Date()),
    totals: {
      income: texto(income),
      expense: texto(expense),
      balance: texto(income.minus(expense)),
      pending: lista.reduce((s, d) => s + d.pending, 0),
      overdue: lista.reduce((s, d) => s + d.overdue, 0),
      overdueBefore: vencidosAntes,
    },
    days: lista,
    transactions: itens,
    invoices,
  });
});
