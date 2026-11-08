import { Router, type Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { valorPositivo, dataSchema, somarMeses } from "../lib/money.js";
import { dividirParcelas, mesDaFatura, somarMesesNaData } from "../services/cartoes.js";
import { incluir, serializar, faturasComPagamento } from "../services/lancamentos.js";

export const cardExpensesRouter = Router();

// Compras no cartão de crédito (à vista ou parceladas).
// Cada parcela é um lançamento EXPENSE no cartão com o mês da fatura (invoiceMonth).
// Nas somas do mês, a compra conta como despesa no mês do VENCIMENTO da fatura.
cardExpensesRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const compra = z.object({
  cardId: z.string().min(1),
  amount: valorPositivo, // valor TOTAL da compra (dividido entre as parcelas)
  description: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).nullable().optional(),
  date: dataSchema, // data da compra
  installments: z.number().int().min(1, "De 1 a 24 parcelas.").max(24, "De 1 a 24 parcelas.").default(1),
});

type Compra = z.infer<typeof compra>;
type Erro = { status: number; error: string };

async function conferir(req: Request, d: Compra): Promise<Erro | { closingDay: number; dueDay: number }> {
  const cartao = await prisma.financialAccount.findFirst({ where: { id: d.cardId, type: "CREDIT_CARD", ...scope(req) } });
  if (!cartao) return { status: 404, error: "Cartão não encontrado." };
  if (cartao.archivedAt) return { status: 400, error: "Este cartão está arquivado. Reative para lançar compras." };
  if (!cartao.closingDay || !cartao.dueDay) {
    return { status: 400, error: "Cadastre o dia de fechamento e de vencimento do cartão antes de lançar compras." };
  }
  if (d.categoryId) {
    const categoria = await prisma.category.findFirst({ where: { id: d.categoryId, ...scope(req) } });
    if (!categoria) return { status: 404, error: "Categoria não encontrada." };
    if (categoria.type !== "EXPENSE") return { status: 400, error: "Use uma categoria de despesa." };
  }
  return { closingDay: cartao.closingDay, dueDay: cartao.dueDay };
}

// Monta as parcelas: uma por mês, cada uma na fatura seguinte à anterior
function montarParcelas(req: Request, d: Compra, dias: { closingDay: number; dueDay: number }, purchaseId: string) {
  const primeiraFatura = mesDaFatura(d.date, dias);
  const valores = dividirParcelas(d.amount, d.installments);
  const parcelado = d.installments > 1;
  return valores.map((valor, i) => ({
    ...scope(req),
    createdById: req.user!.id,
    type: "EXPENSE" as const,
    accountId: d.cardId,
    categoryId: d.categoryId ?? null,
    amount: valor,
    description: d.description,
    date: somarMesesNaData(d.date, i),
    status: "CONFIRMED" as const,
    invoiceMonth: somarMeses(primeiraFatura, i),
    purchaseId,
    installmentNumber: parcelado ? i + 1 : null,
    installmentTotal: parcelado ? d.installments : null,
  }));
}

async function devolverCompra(req: Request, purchaseId: string) {
  const parcelas = await prisma.transaction.findMany({
    where: { ...scope(req), purchaseId },
    include: incluir,
    orderBy: { date: "asc" },
  });
  return { purchaseId, installments: parcelas.map(serializar) };
}

// Busca a compra e confere se nenhuma parcela está numa fatura com pagamento
async function compraEditavel(req: Request) {
  const purchaseId = String(req.params.purchaseId);
  const parcelas = await prisma.transaction.findMany({ where: { ...scope(req), purchaseId, type: "EXPENSE" } });
  if (parcelas.length === 0) return { status: 404, error: "Compra não encontrada." } as Erro;
  const travadas = await faturasComPagamento(scope(req).householdId, parcelas[0].accountId, parcelas.map((p) => p.invoiceMonth!));
  if (travadas.length) return { status: 409, error: "Esta compra está numa fatura que já tem pagamento. Desfaça o pagamento antes." } as Erro;
  return { purchaseId };
}

// POST /api/card-expenses → lança uma compra no cartão (gera as parcelas)
cardExpensesRouter.post("/", validateBody(compra), async (req, res) => {
  const d = req.body as Compra;
  const r = await conferir(req, d);
  if ("error" in r) return res.status(r.status).json({ error: r.error });

  const purchaseId = randomUUID();
  await prisma.transaction.createMany({ data: montarParcelas(req, d, r, purchaseId) });
  res.status(201).json(await devolverCompra(req, purchaseId));
});

// GET /api/card-expenses/:purchaseId → a compra com todas as parcelas
cardExpensesRouter.get("/:purchaseId", async (req, res) => {
  const compraAtual = await devolverCompra(req, String(req.params.purchaseId));
  if (compraAtual.installments.length === 0) return res.status(404).json({ error: "Compra não encontrada." });
  res.json(compraAtual);
});

// PUT /api/card-expenses/:purchaseId → refaz a compra com os dados novos (troca todas as parcelas de uma vez)
cardExpensesRouter.put("/:purchaseId", validateBody(compra), async (req, res) => {
  const d = req.body as Compra;
  const atual = await compraEditavel(req);
  if ("error" in atual) return res.status(atual.status).json({ error: atual.error });
  const r = await conferir(req, d);
  if ("error" in r) return res.status(r.status).json({ error: r.error });

  const novas = montarParcelas(req, d, r, atual.purchaseId);
  const travadas = await faturasComPagamento(scope(req).householdId, d.cardId, novas.map((p) => p.invoiceMonth));
  if (travadas.length) return res.status(409).json({ error: "A compra cairia numa fatura que já tem pagamento. Desfaça o pagamento antes." });

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { ...scope(req), purchaseId: atual.purchaseId } }),
    prisma.transaction.createMany({ data: novas }),
  ]);
  res.json(await devolverCompra(req, atual.purchaseId));
});

// DELETE /api/card-expenses/:purchaseId → apaga a compra e todas as parcelas
cardExpensesRouter.delete("/:purchaseId", async (req, res) => {
  const atual = await compraEditavel(req);
  if ("error" in atual) return res.status(atual.status).json({ error: atual.error });
  await prisma.transaction.deleteMany({ where: { ...scope(req), purchaseId: atual.purchaseId } });
  res.status(204).end();
});
