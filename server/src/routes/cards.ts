import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { Decimal, ZERO, valorNaoNegativo, valorPositivo, dataSchema, mesSchema } from "../lib/money.js";
import { cartoesComFatura, datasDaFatura, faturaAtual, situacaoDaFatura } from "../services/cartoes.js";
import { incluir, serializar } from "../services/lancamentos.js";

export const cardsRouter = Router();

// Cartões de crédito. Por baixo, são contas do tipo CREDIT_CARD (FinancialAccount),
// assim cartões criados na Fase 3 continuam funcionando.
cardsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const bandeira = z.enum(["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OTHER"]);
const dia = z.number({ error: "Use um dia de 1 a 31." }).int().min(1, "Use um dia de 1 a 31.").max(31, "Use um dia de 1 a 31.");
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");

const novoCartao = z.object({
  name: z.string().trim().min(1).max(60),
  brand: bandeira,
  creditLimit: valorNaoNegativo,
  closingDay: dia,
  dueDay: dia,
  color: cor,
  paymentAccountId: z.string().min(1).nullable().optional(),
});

const edicaoCartao = novoCartao.partial().extend({ archived: z.boolean().optional() });

const filtro = z.object({
  archived: z.enum(["true", "false"]).optional(),
});

// Conta que paga a fatura: precisa ser da família e não pode ser outro cartão
async function conferirContaPagamento(req: Request, id: string | null | undefined) {
  if (!id) return null;
  const conta = await prisma.financialAccount.findFirst({ where: { id, ...scope(req) } });
  if (!conta) return { status: 404, error: "Conta de pagamento não encontrada." };
  if (conta.type === "CREDIT_CARD") return { status: 400, error: "A fatura precisa ser paga por uma conta ou carteira, não por outro cartão." };
  return null;
}

async function buscarCartao(req: Request) {
  return prisma.financialAccount.findFirst({ where: { id: String(req.params.id), type: "CREDIT_CARD", ...scope(req) } });
}

async function cartaoCompleto(req: Request, id: string) {
  const [cartao] = await cartoesComFatura(scope(req).householdId, { id });
  return cartao;
}

// GET /api/cards?archived=true → cartões da família (arquivados só com archived=true)
cardsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { archived } = res.locals.query as z.infer<typeof filtro>;
  const filtroArquivo = archived === "true" ? { archivedAt: { not: null } } : { archivedAt: null };
  res.json(await cartoesComFatura(scope(req).householdId, filtroArquivo));
});

// POST /api/cards → cria um cartão
cardsRouter.post("/", validateBody(novoCartao), async (req, res) => {
  const d = req.body as z.infer<typeof novoCartao>;
  const erro = await conferirContaPagamento(req, d.paymentAccountId);
  if (erro) return res.status(erro.status).json({ error: erro.error });

  const cartao = await prisma.financialAccount.create({
    data: { ...scope(req), ...d, paymentAccountId: d.paymentAccountId ?? null, type: "CREDIT_CARD", initialBalance: 0 },
  });
  res.status(201).json(await cartaoCompleto(req, cartao.id));
});

// GET /api/cards/:id → um cartão com limite e fatura atual
cardsRouter.get("/:id", async (req, res) => {
  const cartao = await buscarCartao(req);
  if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });
  res.json(await cartaoCompleto(req, cartao.id));
});

// PATCH /api/cards/:id → altera os dados; { archived: true } arquiva, { archived: false } reativa
cardsRouter.patch("/:id", validateBody(edicaoCartao), async (req, res) => {
  const { archived, ...d } = req.body as z.infer<typeof edicaoCartao>;
  const cartao = await buscarCartao(req);
  if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });

  const erro = await conferirContaPagamento(req, d.paymentAccountId);
  if (erro) return res.status(erro.status).json({ error: erro.error });

  await prisma.financialAccount.update({
    where: { id: cartao.id },
    data: {
      ...d,
      ...(archived === undefined ? {} : { archivedAt: archived ? (cartao.archivedAt ?? new Date()) : null }),
    },
  });
  res.json(await cartaoCompleto(req, cartao.id));
});

// GET /api/cards/:id/invoices/:month → fatura do mês (mês do vencimento): compras, pagamentos e totais.
// Use "atual" no lugar do mês para a fatura aberta hoje.
cardsRouter.get("/:id/invoices/:month", async (req, res) => {
  const cartao = await buscarCartao(req);
  if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });
  if (!cartao.closingDay || !cartao.dueDay) {
    return res.status(409).json({ error: "Cadastre o dia de fechamento e de vencimento do cartão para ver as faturas." });
  }
  const dias = { closingDay: cartao.closingDay, dueDay: cartao.dueDay };
  const pedido = String(req.params.month);
  const mes = pedido === "atual" ? faturaAtual(dias) : pedido;
  if (!mesSchema.safeParse(mes).success) return res.status(400).json({ error: "Use o formato AAAA-MM (ex.: 2026-11)." });

  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...scope(req),
      invoiceMonth: mes,
      OR: [
        { accountId: cartao.id, type: "EXPENSE" },
        { toAccountId: cartao.id, type: "TRANSFER" },
      ],
    },
    include: incluir,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const compras = lancamentos.filter((l) => l.type === "EXPENSE");
  const pagamentos = lancamentos.filter((l) => l.type === "TRANSFER");
  const total = compras.reduce((s, l) => s.plus(l.amount), ZERO);
  const pago = pagamentos.filter((l) => l.status === "CONFIRMED").reduce((s, l) => s.plus(l.amount), ZERO);
  const { closingDate, dueDate } = datasDaFatura(mes, dias);

  res.json({
    cardId: cartao.id,
    month: mes,
    closingDate: closingDate.toISOString(),
    dueDate: dueDate.toISOString(),
    status: situacaoDaFatura(total, pago, closingDate, dueDate),
    total: total.toFixed(2),
    paid: pago.toFixed(2),
    remaining: Decimal.max(total.minus(pago), ZERO).toFixed(2),
    purchases: compras.map(serializar),
    payments: pagamentos.map(serializar),
  });
});

const pagamentoFatura = z.object({
  accountId: z.string().min(1).optional(), // sem accountId usa a conta de pagamento do cartão
  date: dataSchema.optional(),
  amount: valorPositivo.optional(), // sem amount paga o que falta
});

// POST /api/cards/:id/invoices/:month/pay → paga a fatura.
// Vira uma transferência da conta escolhida para o cartão: o saldo da conta diminui
// e NÃO conta como despesa de novo (as compras já contaram).
cardsRouter.post("/:id/invoices/:month/pay", validateBody(pagamentoFatura), async (req, res) => {
  const d = req.body as z.infer<typeof pagamentoFatura>;
  const cartao = await buscarCartao(req);
  if (!cartao) return res.status(404).json({ error: "Cartão não encontrado." });
  const mes = String(req.params.month);
  if (!mesSchema.safeParse(mes).success) return res.status(400).json({ error: "Use o formato AAAA-MM (ex.: 2026-11)." });

  const contaId = d.accountId ?? cartao.paymentAccountId;
  if (!contaId) {
    return res.status(400).json({ error: "Escolha a conta que vai pagar a fatura.", detalhes: { accountId: ["Escolha a conta."] } });
  }
  const erro = await conferirContaPagamento(req, contaId);
  if (erro) return res.status(erro.status).json({ error: erro.error });

  const where = { ...scope(req), invoiceMonth: mes };
  const pagamento = await prisma.$transaction(async (tx) => {
    const [compras, pagos] = await Promise.all([
      tx.transaction.aggregate({ where: { ...where, accountId: cartao.id, type: "EXPENSE" }, _sum: { amount: true } }),
      tx.transaction.aggregate({ where: { ...where, toAccountId: cartao.id, type: "TRANSFER", status: "CONFIRMED" }, _sum: { amount: true } }),
    ]);
    const falta = (compras._sum.amount ?? ZERO).minus(pagos._sum.amount ?? ZERO);
    if (falta.lte(0)) return null;
    const valor = d.amount ?? falta;
    const [ano, m] = mes.split("-");
    return tx.transaction.create({
      data: {
        ...scope(req),
        createdById: req.user!.id,
        type: "TRANSFER",
        accountId: contaId,
        toAccountId: cartao.id,
        invoiceMonth: mes,
        amount: valor,
        description: `Fatura ${cartao.name} ${m}/${ano}`,
        date: d.date ?? new Date(),
        status: "CONFIRMED",
      },
      include: incluir,
    });
  });

  if (!pagamento) return res.status(409).json({ error: "Esta fatura já está paga (ou não tem compras)." });
  res.status(201).json(serializar(pagamento));
});
