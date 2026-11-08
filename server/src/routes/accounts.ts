import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { valorComSinal, valorNaoNegativo } from "../lib/money.js";
import { contasComSaldo, serializarConta } from "../services/saldos.js";

export const accountsRouter = Router();

// Todas as rotas daqui exigem login e família. VIEWER só lê.
accountsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const tipoConta = z.enum(["WALLET", "BANK", "CREDIT_CARD"]);
const dia = z.number().int().min(1).max(31);

const filtro = z.object({
  type: tipoConta.optional(),
});

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
  })
  .superRefine((d, ctx) => {
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
});

// GET /api/accounts?type=WALLET → contas da família com o saldo atual
accountsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { type } = res.locals.query as z.infer<typeof filtro>;
  res.json(await contasComSaldo(scope(req).householdId, type));
});

// POST /api/accounts → cria carteira, conta bancária ou cartão
accountsRouter.post("/", validateBody(novaConta), async (req, res) => {
  const d = req.body as z.infer<typeof novaConta>;
  const conta = await prisma.financialAccount.create({
    data: { ...scope(req), ...d, initialBalance: d.initialBalance ?? 0 },
  });
  res.status(201).json({ ...serializarConta(conta), currentBalance: conta.initialBalance.toFixed(2) });
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

  // Deixou de ser cartão: limpa os campos de cartão
  const limpaCartao = tipoFinal !== "CREDIT_CARD" ? { creditLimit: null, closingDay: null, dueDay: null } : {};

  await prisma.financialAccount.update({ where: { id: atual.id }, data: { ...d, ...limpaCartao } });
  const [conta] = (await contasComSaldo(scope(req).householdId)).filter((c) => c.id === atual.id);
  res.json(conta);
});

// DELETE /api/accounts/:id → apaga a conta e os lançamentos dela.
// A família precisa ficar com pelo menos uma conta.
accountsRouter.delete("/:id", async (req, res) => {
  const conta = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!conta) return res.status(404).json({ error: "Conta não encontrada." });

  const total = await prisma.financialAccount.count({ where: scope(req) });
  if (total <= 1) return res.status(409).json({ error: "Não é possível apagar a última conta da família." });

  await prisma.financialAccount.delete({ where: { id: conta.id } });
  res.status(204).end();
});
