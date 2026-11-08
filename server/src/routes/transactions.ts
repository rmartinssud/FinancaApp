import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { valorPositivo, dataSchema, mesSchema, mesAtual, intervaloDoMes } from "../lib/money.js";

export const transactionsRouter = Router();

// Todas as rotas daqui exigem login e família. VIEWER só lê.
transactionsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

// Transferência entre contas fica para depois
const tipoLancamento = z.enum(["INCOME", "EXPENSE"], {
  error: "Use INCOME ou EXPENSE (transferências ainda não são aceitas).",
});
const situacao = z.enum(["PENDING", "CONFIRMED"]);

const filtro = z.object({
  month: mesSchema.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
});

const novoLancamento = z.object({
  type: tipoLancamento,
  amount: valorPositivo,
  description: z.string().trim().min(1).max(120),
  date: dataSchema,
  accountId: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  status: situacao.default("CONFIRMED"),
});

const edicaoLancamento = z.object({
  type: tipoLancamento.optional(),
  amount: valorPositivo.optional(),
  description: z.string().trim().min(1).max(120).optional(),
  date: dataSchema.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  status: situacao.optional(),
});

// Junta categoria e conta em todo lançamento devolvido
const incluir = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

type LancamentoCompleto = Prisma.TransactionGetPayload<{ include: typeof incluir }>;

function serializar(t: LancamentoCompleto) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount.toFixed(2),
    description: t.description,
    date: t.date.toISOString(),
    status: t.status,
    installmentNumber: t.installmentNumber,
    installmentTotal: t.installmentTotal,
    source: t.source,
    createdById: t.createdById,
    category: t.category,
    account: t.account,
  };
}

// Confere se a conta e a categoria são da família e se a categoria combina com o tipo.
// Devolve uma mensagem de erro (com o status) ou null se estiver tudo certo.
async function conferirReferencias(req: Request, accountId: string, categoryId: string | null, type: string) {
  const conta = await prisma.financialAccount.findFirst({ where: { id: accountId, ...scope(req) } });
  if (!conta) return { status: 404, error: "Conta não encontrada." };

  if (categoryId) {
    const categoria = await prisma.category.findFirst({ where: { id: categoryId, ...scope(req) } });
    if (!categoria) return { status: 404, error: "Categoria não encontrada." };
    if (categoria.type !== type) return { status: 400, error: "A categoria não combina com o tipo do lançamento." };
  }
  return null;
}

// GET /api/transactions?month=2026-11&accountId=&categoryId=&type= → lançamentos do mês (mais recentes primeiro)
transactionsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtro>;

  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...scope(req),
      date: intervaloDoMes(f.month ?? mesAtual()),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.type ? { type: f.type } : {}),
    },
    include: incluir,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  res.json(lancamentos.map(serializar));
});

// POST /api/transactions → cria uma receita ou despesa
transactionsRouter.post("/", validateBody(novoLancamento), async (req, res) => {
  const d = req.body as z.infer<typeof novoLancamento>;

  const erro = await conferirReferencias(req, d.accountId, d.categoryId ?? null, d.type);
  if (erro) return res.status(erro.status).json({ error: erro.error });

  const lancamento = await prisma.transaction.create({
    data: { ...d, categoryId: d.categoryId ?? null, ...scope(req), createdById: req.user!.id },
    include: incluir,
  });
  res.status(201).json(serializar(lancamento));
});

// PATCH /api/transactions/:id → altera qualquer campo do lançamento
transactionsRouter.patch("/:id", validateBody(edicaoLancamento), async (req, res) => {
  const d = req.body as z.infer<typeof edicaoLancamento>;
  const atual = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });

  // Confere o resultado final (o que mudou + o que já existia)
  const categoryId = d.categoryId !== undefined ? d.categoryId : atual.categoryId;
  const erro = await conferirReferencias(req, d.accountId ?? atual.accountId, categoryId, d.type ?? atual.type);
  if (erro) return res.status(erro.status).json({ error: erro.error });

  const lancamento = await prisma.transaction.update({ where: { id: atual.id }, data: d, include: incluir });
  res.json(serializar(lancamento));
});

// DELETE /api/transactions/:id → apaga o lançamento
transactionsRouter.delete("/:id", async (req, res) => {
  const atual = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });

  await prisma.transaction.delete({ where: { id: atual.id } });
  res.status(204).end();
});
