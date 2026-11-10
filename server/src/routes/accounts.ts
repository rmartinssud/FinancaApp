import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { valorComSinal, valorNaoNegativo, hojeComoData } from "../lib/money.js";
import { contasComSaldo, serializarConta, saldoEDisponivel } from "../services/saldos.js";
import { incluir, serializar } from "../services/lancamentos.js";
import { logoBanco } from "../lib/bancos.js";

export const accountsRouter = Router();

// Todas as rotas daqui exigem login e família. VIEWER só lê.
accountsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const tipoConta = z.enum(["WALLET", "BANK", "CREDIT_CARD", "INVESTMENT", "OTHER"]);

// Texto opcional: vazio vira null
const textoOpcional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

// Campos extras do formulário de conta (os mesmos na criação e na edição)
const camposExtras = {
  accountNumber: textoOpcional(40, "Use no máximo 40 caracteres."),
  notes: textoOpcional(500, "Use no máximo 500 caracteres."),
  isDefault: z.boolean().optional(),
  showOnSummary: z.boolean().optional(),
  ignoreInTotals: z.boolean().optional(),
};
const dia = z.number().int().min(1).max(31);

const filtro = z.object({
  type: tipoConta.optional(),
});

const SO_CONTA_BANCARIA = "Cheque especial só para conta bancária.";

// Campos que só fazem sentido para cartão de crédito
const camposCartao = ["creditLimit", "closingDay", "dueDay"] as const;

const novaConta = z
  .object({
    name: z.string().trim().min(1).max(60),
    type: tipoConta,
    initialBalance: valorComSinal.optional(),
    creditLimit: valorNaoNegativo.nullable().optional(),
    closingDay: dia.nullable().optional(),
    dueDay: dia.nullable().optional(),
    overdraftLimit: valorNaoNegativo.nullable().optional(),
    bankLogo: logoBanco.nullable().optional(),
    ...camposExtras,
  })
  .superRefine((d, ctx) => {
    if (d.type !== "BANK" && d.overdraftLimit != null && !d.overdraftLimit.isZero()) {
      ctx.addIssue({ code: "custom", path: ["overdraftLimit"], message: SO_CONTA_BANCARIA });
    }
    if (d.type === "CREDIT_CARD") return;
    for (const campo of camposCartao) {
      if (d[campo] != null) ctx.addIssue({ code: "custom", path: [campo], message: "Só para cartão de crédito." });
    }
  });

const edicaoConta = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: tipoConta.optional(),
  initialBalance: valorComSinal.optional(),
  creditLimit: valorNaoNegativo.nullable().optional(),
  closingDay: dia.nullable().optional(),
  dueDay: dia.nullable().optional(),
  overdraftLimit: valorNaoNegativo.nullable().optional(),
  bankLogo: logoBanco.nullable().optional(),
  ...camposExtras,
});

// Ajuste de saldo: o saldo que aparece no banco hoje (pode ser negativo)
const ajusteSaldo = z.object({
  balance: valorComSinal,
});

// GET /api/accounts?type=WALLET → contas da família com o saldo atual
accountsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { type } = res.locals.query as z.infer<typeof filtro>;
  res.json(await contasComSaldo(scope(req).householdId, type));
});

// POST /api/accounts → cria carteira, conta bancária, investimento ou cartão
accountsRouter.post("/", validateBody(novaConta), async (req, res) => {
  const d = req.body as z.infer<typeof novaConta>;
  // Cartão não é conta padrão (a conta padrão é a que já vem escolhida em despesas/receitas)
  const padrao = d.type !== "CREDIT_CARD" && d.isDefault === true;
  const conta = await prisma.$transaction(async (tx) => {
    if (padrao) await tx.financialAccount.updateMany({ where: { ...scope(req), isDefault: true }, data: { isDefault: false } });
    return tx.financialAccount.create({
      data: {
        ...scope(req),
        ...d,
        isDefault: padrao,
        initialBalance: d.initialBalance ?? 0,
        overdraftLimit: d.type === "BANK" && d.overdraftLimit && !d.overdraftLimit.isZero() ? d.overdraftLimit : null,
      },
    });
  });
  res.status(201).json({ ...serializarConta(conta), ...saldoEDisponivel(conta, conta.initialBalance) });
});

// PATCH /api/accounts/:id → altera os dados da conta
accountsRouter.patch("/:id", validateBody(edicaoConta), async (req, res) => {
  const d = req.body as z.infer<typeof edicaoConta>;
  const atual = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Conta não encontrada." });

  const tipoFinal = d.type ?? atual.type;
  if (tipoFinal !== "CREDIT_CARD") {
    const invalidos = camposCartao.filter((c) => d[c] != null);
    if (invalidos.length) {
      return res.status(400).json({
        error: "Dados inválidos.",
        detalhes: Object.fromEntries(invalidos.map((c) => [c, ["Só para cartão de crédito."]])),
      });
    }
  }

  if (tipoFinal !== "BANK" && d.overdraftLimit != null && !d.overdraftLimit.isZero()) {
    return res.status(400).json({ error: "Dados inválidos.", detalhes: { overdraftLimit: [SO_CONTA_BANCARIA] } });
  }
  // Limite zero = sem cheque especial; deixou de ser conta bancária: tira o cheque especial
  const cheque =
    tipoFinal !== "BANK" ? { overdraftLimit: null } : d.overdraftLimit !== undefined ? { overdraftLimit: d.overdraftLimit?.isZero() ? null : d.overdraftLimit } : {};

  // Deixou de ser cartão: limpa os campos de cartão
  const limpaCartao =
    tipoFinal !== "CREDIT_CARD"
      ? { creditLimit: null, closingDay: null, dueDay: null, brand: null, color: null, paymentAccountId: null, archivedAt: null }
      : {};

  // Só uma conta padrão por espaço: marcar esta desmarca as outras (na mesma transação). Cartão não é padrão.
  const padrao = tipoFinal === "CREDIT_CARD" ? { isDefault: false } : {};
  await prisma.$transaction(async (tx) => {
    if (d.isDefault === true && tipoFinal !== "CREDIT_CARD") {
      await tx.financialAccount.updateMany({ where: { ...scope(req), isDefault: true, id: { not: atual.id } }, data: { isDefault: false } });
    }
    await tx.financialAccount.update({ where: { id: atual.id }, data: { ...d, ...limpaCartao, ...cheque, ...padrao } });
  });
  const [conta] = (await contasComSaldo(scope(req).householdId)).filter((c) => c.id === atual.id);
  res.json(conta);
});

// DELETE /api/accounts/:id → apaga a conta e os lançamentos dela (inclusive transferências de/para ela).
// A família precisa ficar com pelo menos uma conta que não seja cartão.
accountsRouter.delete("/:id", async (req, res) => {
  const conta = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!conta) return res.status(404).json({ error: "Conta não encontrada." });

  const total = await prisma.financialAccount.count({ where: { ...scope(req), type: { not: "CREDIT_CARD" } } });
  if (conta.type !== "CREDIT_CARD" && total <= 1) return res.status(409).json({ error: "Não é possível apagar a última conta da família." });

  await prisma.financialAccount.delete({ where: { id: conta.id } });
  res.status(204).end();
});

// POST /api/accounts/:id/adjust { balance } → acerta o saldo da conta com o do banco.
// Cria um lançamento confirmado, com a data de hoje, pela diferença (receita se faltava, despesa se sobrava),
// marcado como ajuste: mexe no saldo, mas não entra em receitas, despesas nem categorias do mês.
// Se o saldo já bate, não cria nada. Cartão de crédito não tem saldo para ajustar.
accountsRouter.post("/:id/adjust", validateBody(ajusteSaldo), async (req, res) => {
  const { balance } = req.body as z.infer<typeof ajusteSaldo>;
  const conta = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!conta) return res.status(404).json({ error: "Conta não encontrada." });
  if (conta.type === "CREDIT_CARD") {
    return res.status(400).json({ error: "Cartão de crédito não tem saldo para ajustar. Confira a fatura em Cartões de crédito." });
  }

  const [atual] = (await contasComSaldo(scope(req).householdId)).filter((c) => c.id === conta.id);
  const diferenca = balance.minus(atual.currentBalance);
  if (diferenca.isZero()) {
    return res.json({ adjustment: null, previousBalance: atual.currentBalance, account: atual });
  }

  const ajuste = await prisma.transaction.create({
    data: {
      ...scope(req),
      accountId: conta.id,
      createdById: req.user!.id,
      type: diferenca.gt(0) ? "INCOME" : "EXPENSE",
      amount: diferenca.abs(),
      description: "Ajuste de saldo",
      date: hojeComoData(),
      status: "CONFIRMED",
      isAdjustment: true,
    },
    include: incluir,
  });
  const [depois] = (await contasComSaldo(scope(req).householdId)).filter((c) => c.id === conta.id);
  res.status(201).json({ adjustment: serializar(ajuste), previousBalance: atual.currentBalance, account: depois });
});
