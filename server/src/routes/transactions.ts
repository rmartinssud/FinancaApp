import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { valorPositivo, dataSchema, mesSchema, mesAtual, intervaloDoMes } from "../lib/money.js";
import { incluir, serializar, faturasComPagamento } from "../services/lancamentos.js";

export const transactionsRouter = Router();

// Todas as rotas daqui exigem login e família. VIEWER só lê.
transactionsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

// Receita, despesa ou transferência entre duas contas da família.
// Compras no cartão têm rota própria (/api/card-expenses).
const tipoLancamento = z.enum(["INCOME", "EXPENSE", "TRANSFER"], { error: "Use INCOME, EXPENSE ou TRANSFER." });
const situacao = z.enum(["PENDING", "CONFIRMED"]);

const filtro = z.object({
  month: mesSchema.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
});

const novoLancamento = z
  .object({
    type: tipoLancamento,
    amount: valorPositivo,
    // Na transferência a descrição é opcional (vira "Transferência")
    description: z.string().trim().max(120).optional(),
    date: dataSchema,
    accountId: z.string().min(1),
    toAccountId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    status: situacao.default("CONFIRMED"),
  })
  .superRefine((d, ctx) => {
    if (d.type !== "TRANSFER" && !d.description) {
      ctx.addIssue({ code: "custom", path: ["description"], message: "Escreva uma descrição." });
    }
  });

const edicaoLancamento = z.object({
  type: tipoLancamento.optional(),
  amount: valorPositivo.optional(),
  description: z.string().trim().max(120).optional(),
  date: dataSchema.optional(),
  accountId: z.string().min(1).optional(),
  toAccountId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  status: situacao.optional(),
});

type Erro = { status: number; error: string; detalhes?: Record<string, string[]> };
const invalido = (campo: string, msg: string): Erro => ({ status: 400, error: "Dados inválidos.", detalhes: { [campo]: [msg] } });

// Confere o lançamento final (conta, destino, categoria e tipo).
// contaOriginal: num lançamento antigo feito direto num cartão, deixa editar sem trocar a conta.
async function conferirReferencias(
  req: Request,
  d: { type: string; accountId: string; toAccountId: string | null; categoryId: string | null },
  contaOriginal?: string,
): Promise<Erro | null> {
  const conta = await prisma.financialAccount.findFirst({ where: { id: d.accountId, ...scope(req) } });
  if (!conta) return { status: 404, error: "Conta não encontrada." };

  if (d.type === "TRANSFER") {
    if (!d.toAccountId) return invalido("toAccountId", "Escolha a conta de destino.");
    if (d.toAccountId === d.accountId) return invalido("toAccountId", "A conta de destino precisa ser diferente da de origem.");
    const destino = await prisma.financialAccount.findFirst({ where: { id: d.toAccountId, ...scope(req) } });
    if (!destino) return { status: 404, error: "Conta de destino não encontrada." };
    if (conta.type === "CREDIT_CARD" || destino.type === "CREDIT_CARD") {
      return { status: 400, error: "Transferência é só entre contas e carteiras. Para pagar um cartão, use “Pagar fatura”." };
    }
    if (d.categoryId) return invalido("categoryId", "Transferência não tem categoria.");
    return null;
  }

  if (d.toAccountId) return invalido("toAccountId", "Só transferências têm conta de destino.");
  if (conta.type === "CREDIT_CARD" && conta.id !== contaOriginal) {
    return { status: 400, error: "Para compras no cartão, use “Despesa cartão”." };
  }

  if (d.categoryId) {
    const categoria = await prisma.category.findFirst({ where: { id: d.categoryId, ...scope(req) } });
    if (!categoria) return { status: 404, error: "Categoria não encontrada." };
    if (categoria.type !== d.type) return { status: 400, error: "A categoria não combina com o tipo do lançamento." };
  }
  return null;
}

const responderErro = (res: import("express").Response, e: Erro) =>
  res.status(e.status).json({ error: e.error, ...(e.detalhes ? { detalhes: e.detalhes } : {}) });

// GET /api/transactions?month=2026-11&accountId=&categoryId=&type= → lançamentos do mês (mais recentes primeiro).
// Com accountId, traz também as transferências que entraram nessa conta.
transactionsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtro>;

  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...scope(req),
      date: intervaloDoMes(f.month ?? mesAtual()),
      ...(f.accountId ? { OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.type ? { type: f.type } : {}),
    },
    include: incluir,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  res.json(lancamentos.map(serializar));
});

// POST /api/transactions → cria uma receita, despesa ou transferência
transactionsRouter.post("/", validateBody(novoLancamento), async (req, res) => {
  const d = req.body as z.infer<typeof novoLancamento>;
  const final = {
    type: d.type,
    accountId: d.accountId,
    toAccountId: d.toAccountId ?? null,
    categoryId: d.categoryId ?? null,
  };

  const erro = await conferirReferencias(req, final);
  if (erro) return responderErro(res, erro);

  const lancamento = await prisma.transaction.create({
    data: {
      ...final,
      amount: d.amount,
      description: d.description || "Transferência",
      date: d.date,
      status: d.status,
      ...scope(req),
      createdById: req.user!.id,
    },
    include: incluir,
  });
  res.status(201).json(serializar(lancamento));
});

// PATCH /api/transactions/:id → altera o lançamento (as duas pontas da transferência mudam juntas: é um registro só)
transactionsRouter.patch("/:id", validateBody(edicaoLancamento), async (req, res) => {
  const d = req.body as z.infer<typeof edicaoLancamento>;
  const atual = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });

  if (atual.invoiceMonth !== null) {
    const msg =
      atual.type === "TRANSFER"
        ? "Pagamento de fatura não pode ser alterado. Apague e pague de novo."
        : "Compra no cartão: altere pela tela de despesa do cartão.";
    return res.status(409).json({ error: msg });
  }

  // Confere o resultado final (o que mudou + o que já existia)
  const type = d.type ?? atual.type;
  const transferencia = type === "TRANSFER";
  const final = {
    type,
    accountId: d.accountId ?? atual.accountId,
    // Deixou de ser transferência: some o destino. Virou transferência: some a categoria.
    toAccountId: transferencia ? (d.toAccountId !== undefined ? d.toAccountId : atual.toAccountId) : (d.toAccountId ?? null),
    categoryId: transferencia ? (d.categoryId ?? null) : d.categoryId !== undefined ? d.categoryId : atual.categoryId,
  };
  if (!transferencia && d.description === "") return responderErro(res, invalido("description", "Escreva uma descrição."));

  const erro = await conferirReferencias(req, final, atual.accountId);
  if (erro) return responderErro(res, erro);

  const lancamento = await prisma.transaction.update({
    where: { id: atual.id },
    data: {
      ...d,
      ...final,
      ...(d.description === "" ? { description: "Transferência" } : {}),
    },
    include: incluir,
  });
  res.json(serializar(lancamento));
});

// DELETE /api/transactions/:id → apaga o lançamento.
// Parcela de compra no cartão: apaga a compra inteira (todas as parcelas).
// Pagamento de fatura: desfaz o pagamento (a fatura volta a ficar em aberto).
transactionsRouter.delete("/:id", async (req, res) => {
  const atual = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });

  if (atual.purchaseId && atual.type === "EXPENSE") {
    const parcelas = await prisma.transaction.findMany({ where: { ...scope(req), purchaseId: atual.purchaseId } });
    const travadas = await faturasComPagamento(scope(req).householdId, atual.accountId, parcelas.map((p) => p.invoiceMonth!));
    if (travadas.length) {
      return res.status(409).json({ error: "Esta compra está numa fatura que já tem pagamento. Desfaça o pagamento antes." });
    }
    await prisma.transaction.deleteMany({ where: { ...scope(req), purchaseId: atual.purchaseId } });
    return res.status(204).end();
  }

  await prisma.transaction.delete({ where: { id: atual.id } });
  res.status(204).end();
});
