import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { randomUUID } from "node:crypto";
import { valorPositivo, dataSchema, mesSchema, mesAtual, intervaloDoMes } from "../lib/money.js";
import { incluir, serializar, faturasComPagamento } from "../services/lancamentos.js";
import { dividirParcelas, somarMesesNaData, faturasDoMes } from "../services/cartoes.js";

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
  // Forma de pagamento, tirada do tipo da conta: CREDIT_CARD = cartão, BANK = débito/Pix, WALLET = dinheiro
  accountType: z.enum(["WALLET", "BANK", "CREDIT_CARD"], { error: "Use WALLET, BANK ou CREDIT_CARD." }).optional(),
  // Quem lançou (filtro "Pessoa" no espaço da família)
  createdById: z.string().min(1).optional(),
});

// Repetição (só receita e despesa):
// NONE = não recorrente; INSTALLMENT = parcelar (divide o valor em N meses);
// REPEAT = repetir (o mesmo valor por N meses); FIXED = fixa mensal (12 meses, o mesmo valor).
const repeticao = z.enum(["NONE", "INSTALLMENT", "REPEAT", "FIXED"], { error: "Use NONE, INSTALLMENT, REPEAT ou FIXED." });
const MESES_FIXA = 12;
const observacoes = z.string().trim().max(1000, "Até 1000 caracteres.").nullable().optional();

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
    notes: observacoes,
    recurrence: repeticao.default("NONE"),
    // Quantas vezes (parcelar ou repetir): de 2 a 48
    times: z.number().int().min(2, "De 2 a 48 vezes.").max(48, "De 2 a 48 vezes.").optional(),
  })
  .superRefine((d, ctx) => {
    if (d.type !== "TRANSFER" && !d.description) {
      ctx.addIssue({ code: "custom", path: ["description"], message: "Escreva uma descrição." });
    }
    if (d.type === "TRANSFER" && d.recurrence !== "NONE") {
      ctx.addIssue({ code: "custom", path: ["recurrence"], message: "Transferência não tem repetição." });
    }
    if ((d.recurrence === "INSTALLMENT" || d.recurrence === "REPEAT") && !d.times) {
      ctx.addIssue({ code: "custom", path: ["times"], message: "Diga quantas vezes (de 2 a 48)." });
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
  notes: observacoes,
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

// GET /api/transactions?month=2026-11&accountId=&categoryId=&type=&accountType= → lançamentos do mês (mais recentes primeiro).
// Com accountId, traz também as transferências que entraram nessa conta.
// Com accountType (forma de pagamento), a transferência aparece se a origem OU o destino for desse tipo
// (ex.: em "Cartão" aparece o pagamento da fatura; em "Débito/Pix", o Pix da conta para a carteira).
//
// Compras no cartão NÃO aparecem uma a uma: no lugar delas o app mostra uma linha por fatura
// (GET /api/transactions/invoices). Elas só voltam quando o filtro é o próprio cartão
// (accountId de um cartão) ou accountType=CREDIT_CARD.
transactionsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtro>;
  const mes = f.month ?? mesAtual();

  // Filtro por pessoa: mostra as compras no cartão uma a uma (ex.: cartão adicional do filho)
  let comComprasDoCartao = f.accountType === "CREDIT_CARD" || Boolean(f.createdById);
  if (f.accountId && !comComprasDoCartao) {
    const conta = await prisma.financialAccount.findFirst({ where: { id: f.accountId, ...scope(req) }, select: { type: true } });
    comComprasDoCartao = conta?.type === "CREDIT_CARD";
  }

  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...scope(req),
      // Compras no cartão aparecem no mês da fatura (invoiceMonth), como no Início e na fatura.
      // O resto (inclusive pagamento de fatura) aparece pelo dia em que aconteceu.
      AND: [
        {
          OR: [
            { NOT: { type: "EXPENSE", invoiceMonth: { not: null } }, date: intervaloDoMes(mes) },
            ...(comComprasDoCartao ? [{ type: "EXPENSE" as const, invoiceMonth: mes }] : []),
          ],
        },
        ...(f.accountId ? [{ OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] }] : []),
        ...(f.accountType
          ? [{ OR: [{ account: { type: f.accountType } }, { type: "TRANSFER" as const, toAccount: { type: f.accountType } }] }]
          : []),
      ],
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.createdById ? { createdById: f.createdById } : {}),
    },
    include: incluir,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  res.json(lancamentos.map(serializar));
});

// GET /api/transactions/invoices?month=2026-11 → uma linha por cartão com fatura no mês (vencimento no mês).
// É o que a tela de Lançamentos mostra no lugar das compras no cartão.
transactionsRouter.get("/invoices", validateQuery(z.object({ month: mesSchema.optional() })), async (req, res) => {
  const { month } = res.locals.query as { month?: string };
  res.json(await faturasDoMes(scope(req).householdId, month ?? mesAtual()));
});

// POST /api/transactions → cria uma receita, despesa ou transferência.
// Com repetição, cria um lançamento por mês (mesmo groupId) e devolve o 1º com "group" (todos).
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

  const base = {
    ...final,
    description: d.description || "Transferência",
    notes: d.notes || null,
    ...scope(req),
    createdById: req.user!.id,
  };

  if (d.recurrence === "NONE") {
    const lancamento = await prisma.transaction.create({
      data: { ...base, amount: d.amount, date: d.date, status: d.status },
      include: incluir,
    });
    return res.status(201).json(serializar(lancamento));
  }

  // Repetição: um lançamento por mês. O 1º respeita "Efetivada"; os próximos ficam pendentes.
  const vezes = d.recurrence === "FIXED" ? MESES_FIXA : d.times!;
  const valores = d.recurrence === "INSTALLMENT" ? dividirParcelas(d.amount, vezes) : Array.from({ length: vezes }, () => d.amount);
  const comNumero = d.recurrence !== "FIXED";
  const groupId = randomUUID();
  const criados = await prisma.$transaction(
    valores.map((amount, i) =>
      prisma.transaction.create({
        data: {
          ...base,
          amount,
          date: somarMesesNaData(d.date, i),
          status: i === 0 ? d.status : "PENDING",
          groupId,
          recurrence: d.recurrence as "INSTALLMENT" | "REPEAT" | "FIXED",
          installmentNumber: comNumero ? i + 1 : null,
          installmentTotal: comNumero ? vezes : null,
        },
        include: incluir,
      }),
    ),
  );
  res.status(201).json({ ...serializar(criados[0]), group: criados.map(serializar) });
});

// PATCH /api/transactions/:id → altera o lançamento (as duas pontas da transferência mudam juntas: é um registro só)
transactionsRouter.patch("/:id", validateBody(edicaoLancamento), async (req, res) => {
  const d = req.body as z.infer<typeof edicaoLancamento>;
  const atual = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });

  if (atual.isAdjustment) {
    return res.status(409).json({ error: "Ajuste de saldo não pode ser alterado. Apague e ajuste o saldo de novo em Contas." });
  }

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
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
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
