import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { Decimal, valorPositivo, valorNaoNegativo, dataSchema } from "../lib/money.js";
import { apagarArquivos } from "../services/armazenamento.js";
import { calcularProgresso, comProgresso, dadosProgresso, diaLocal, evolucao, serializarObjetivo, somasPorObjetivo } from "../services/objetivos.js";

export const goalsRouter = Router();

// Objetivos do espaço ativo. VIEWER só lê.
goalsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");
const dia = z.iso.date({ error: "Use uma data AAAA-MM-DD." });

const objetivoSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para o objetivo.").max(60),
  color: cor,
  icon: z.string().trim().min(1).max(30),
  targetAmount: valorPositivo,
  initialAmount: valorNaoNegativo.default(new Decimal(0)),
  targetDate: dia.nullable().default(null),
  description: z.string().trim().max(500).nullable().default(null),
  accountId: z.string().min(1).nullable().default(null),
  showOnHome: z.boolean().default(true),
});

type DadosObjetivo = z.infer<typeof objetivoSchema>;
const invalido = (res: Response, campo: string, msg: string) => res.status(400).json({ error: "Dados inválidos.", detalhes: { [campo]: [msg] } });

const incluir = { account: true } as const;

async function buscar(req: Request, id = String(req.params.id)) {
  return prisma.goal.findFirst({ where: { id, ...scope(req) }, include: incluir });
}

// Conta do espaço que pode guardar dinheiro (não é cartão de crédito)
async function contaValida(req: Request, id: string) {
  const conta = await prisma.financialAccount.findFirst({ where: { id, ...scope(req) } });
  if (!conta) return { erro: "Conta não encontrada." };
  if (conta.type === "CREDIT_CARD") return { erro: "Use uma conta ou carteira (cartão de crédito não guarda dinheiro)." };
  return { conta };
}

async function umComProgresso(id: string) {
  const g = await prisma.goal.findUniqueOrThrow({ where: { id }, include: incluir });
  return (await comProgresso([g]))[0];
}

const filtroLista = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  // home=true: só os ativos marcados "Exibir no Início", até 3
  home: z.enum(["true", "false"]).optional(),
});

// GET /api/goals?status=ACTIVE → objetivos com progresso + quantos há em cada situação
goalsRouter.get("/", validateQuery(filtroLista), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroLista>;
  const { householdId } = scope(req);
  const contagem = await prisma.goal.groupBy({ by: ["status"], where: { householdId }, _count: { _all: true } });
  const counts = { ACTIVE: 0, COMPLETED: 0, ARCHIVED: 0 };
  for (const c of contagem) counts[c.status] = c._count._all;

  if (f.home === "true") {
    const lista = await prisma.goal.findMany({ where: { householdId, status: "ACTIVE", showOnHome: true }, include: incluir, orderBy: { createdAt: "asc" } });
    return res.json({ total: lista.length, counts, goals: await comProgresso(lista.slice(0, 3)) });
  }

  const lista = await prisma.goal.findMany({
    where: { householdId, ...(f.status ? { status: f.status } : {}) },
    include: incluir,
    orderBy: f.status === "COMPLETED" ? { completedAt: "desc" } : { createdAt: "asc" },
  });
  res.json({ counts, goals: await comProgresso(lista) });
});

// GET /api/goals/:id → objetivo, progresso, histórico de depósitos/retiradas e evolução por mês
goalsRouter.get("/:id", async (req, res) => {
  const g = await buscar(req);
  if (!g) return res.status(404).json({ error: "Objetivo não encontrado." });
  const entradas = await prisma.goalEntry.findMany({
    where: { goalId: g.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { transaction: { include: { account: true, toAccount: true } } },
  });
  const somas = (await somasPorObjetivo([g.id])).get(g.id)!;
  const hoje = diaLocal();
  res.json({
    goal: serializarObjetivo(g, calcularProgresso(dadosProgresso(g), somas.dep, somas.ret, hoje)),
    entries: entradas.map((e) => ({
      id: e.id,
      kind: e.kind,
      amount: e.amount.toFixed(2),
      date: diaLocal(e.date),
      notes: e.notes,
      transfer: e.transaction
        ? {
            id: e.transaction.id,
            status: e.transaction.status,
            from: { id: e.transaction.account.id, name: e.transaction.account.name },
            to: e.transaction.toAccount ? { id: e.transaction.toAccount.id, name: e.transaction.toAccount.name } : null,
          }
        : null,
    })),
    history: evolucao({ initialAmount: g.initialAmount, inicio: diaLocal(g.createdAt) }, entradas, hoje),
  });
});

async function conferirConta(req: Request, res: Response, d: DadosObjetivo) {
  if (!d.accountId) return true;
  const r = await contaValida(req, d.accountId);
  if (r.erro) {
    invalido(res, "accountId", r.erro);
    return false;
  }
  return true;
}

const campos = (d: DadosObjetivo) => ({
  name: d.name,
  color: d.color,
  icon: d.icon,
  targetAmount: d.targetAmount,
  initialAmount: d.initialAmount,
  targetDate: d.targetDate,
  description: d.description || null,
  accountId: d.accountId,
  showOnHome: d.showOnHome,
});

// POST /api/goals → cria um objetivo (ativo)
goalsRouter.post("/", validateBody(objetivoSchema), async (req, res) => {
  const d = req.body as DadosObjetivo;
  if (!(await conferirConta(req, res, d))) return;
  const criado = await prisma.goal.create({ data: { ...scope(req), ...campos(d) } });
  res.status(201).json(await umComProgresso(criado.id));
});

// PUT /api/goals/:id → altera o objetivo (a situação muda em /status)
goalsRouter.put("/:id", validateBody(objetivoSchema), async (req, res) => {
  const d = req.body as DadosObjetivo;
  const atual = await buscar(req);
  if (!atual) return res.status(404).json({ error: "Objetivo não encontrado." });
  if (!(await conferirConta(req, res, d))) return;
  await prisma.goal.update({ where: { id: atual.id }, data: campos(d) });
  res.json(await umComProgresso(atual.id));
});

const situacaoSchema = z.object({ status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"], { error: "Use ACTIVE, COMPLETED ou ARCHIVED." }) });

// POST /api/goals/:id/status {status} → concluir, arquivar ou reativar
goalsRouter.post("/:id/status", validateBody(situacaoSchema), async (req, res) => {
  const { status } = req.body as z.infer<typeof situacaoSchema>;
  const atual = await buscar(req);
  if (!atual) return res.status(404).json({ error: "Objetivo não encontrado." });
  await prisma.goal.update({
    where: { id: atual.id },
    data: { status, completedAt: status === "COMPLETED" ? (atual.completedAt ?? new Date()) : status === "ACTIVE" ? null : atual.completedAt },
  });
  res.json(await umComProgresso(atual.id));
});

// DELETE /api/goals/:id → apaga o objetivo e o histórico (as transferências reais continuam em Lançamentos)
goalsRouter.delete("/:id", async (req, res) => {
  const atual = await buscar(req);
  if (!atual) return res.status(404).json({ error: "Objetivo não encontrado." });
  await prisma.goal.delete({ where: { id: atual.id } });
  res.status(204).end();
});

const entradaSchema = z.object({
  kind: z.enum(["DEPOSIT", "WITHDRAWAL"], { error: "Use DEPOSIT ou WITHDRAWAL." }),
  amount: valorPositivo,
  date: dataSchema.optional(),
  notes: z.string().trim().max(200).nullable().optional(),
  // Também registrar como transferência real entre contas (só com conta vinculada).
  // Depósito: accountId (origem) → conta do objetivo. Retirada: conta do objetivo → accountId (destino).
  transfer: z.boolean().default(false),
  accountId: z.string().min(1).nullable().optional(),
});

// POST /api/goals/:id/entries → depositar ou retirar
goalsRouter.post("/:id/entries", validateBody(entradaSchema), async (req, res) => {
  const d = req.body as z.infer<typeof entradaSchema>;
  const g = await buscar(req);
  if (!g) return res.status(404).json({ error: "Objetivo não encontrado." });
  if (g.status !== "ACTIVE") return res.status(400).json({ error: "Este objetivo não está ativo. Reative para depositar ou retirar." });

  const hoje = diaLocal();
  const data = d.date ?? new Date(`${hoje}T12:00:00.000Z`);
  const somas = (await somasPorObjetivo([g.id])).get(g.id)!;
  const antes = calcularProgresso(dadosProgresso(g), somas.dep, somas.ret, hoje);
  if (d.kind === "WITHDRAWAL" && d.amount.gt(antes.saved)) {
    return invalido(res, "amount", `O guardado neste objetivo é ${antes.saved.toFixed(2).replace(".", ",")}.`);
  }

  let transferencia: Prisma.TransactionUncheckedCreateInput | null = null;
  if (d.transfer) {
    if (!g.accountId) return invalido(res, "transfer", "Vincule uma conta ao objetivo para registrar a transferência.");
    if (!d.accountId) return invalido(res, "accountId", d.kind === "DEPOSIT" ? "Escolha a conta de origem." : "Escolha a conta de destino.");
    if (d.accountId === g.accountId) return invalido(res, "accountId", "Escolha uma conta diferente da conta do objetivo.");
    const r = await contaValida(req, d.accountId);
    if (r.erro) return invalido(res, "accountId", r.erro);
    const deposito = d.kind === "DEPOSIT";
    transferencia = {
      ...scope(req),
      createdById: req.user!.id,
      type: "TRANSFER",
      accountId: deposito ? d.accountId : g.accountId,
      toAccountId: deposito ? g.accountId : d.accountId,
      amount: d.amount,
      description: `Objetivo: ${g.name}`.slice(0, 120),
      notes: d.notes || null,
      date: data,
      // Data futura fica pendente (efetiva sozinha no dia, como os outros lançamentos)
      status: diaLocal(data) > hoje ? "PENDING" : "CONFIRMED",
    };
  }

  const entrada = await prisma.$transaction(async (tx) => {
    const t = transferencia ? await tx.transaction.create({ data: transferencia }) : null;
    return tx.goalEntry.create({
      data: { goalId: g.id, kind: d.kind, amount: d.amount, date: data, notes: d.notes || null, transactionId: t?.id ?? null, createdById: req.user!.id },
    });
  });

  const goal = await umComProgresso(g.id);
  res.status(201).json({
    entry: { id: entrada.id, kind: entrada.kind, amount: entrada.amount.toFixed(2), date: diaLocal(entrada.date), notes: entrada.notes, transactionId: entrada.transactionId },
    goal,
    // Chegou à meta: a tela sugere concluir (não concluímos sozinhos)
    suggestComplete: goal.progress.reached && !antes.reached,
  });
});

const apagarEntradaSchema = z.object({ keepTransfer: z.enum(["true", "false"]).optional() });

// DELETE /api/goals/:id/entries/:entryId?keepTransfer=true → apaga o depósito/retirada.
// Por padrão apaga junto a transferência criada com ele; keepTransfer=true mantém em Lançamentos.
goalsRouter.delete("/:id/entries/:entryId", validateQuery(apagarEntradaSchema), async (req, res) => {
  const { keepTransfer } = res.locals.query as z.infer<typeof apagarEntradaSchema>;
  const g = await buscar(req);
  if (!g) return res.status(404).json({ error: "Objetivo não encontrado." });
  const entrada = await prisma.goalEntry.findFirst({ where: { id: String(req.params.entryId), goalId: g.id } });
  if (!entrada) return res.status(404).json({ error: "Movimentação não encontrada." });

  if (entrada.kind === "DEPOSIT") {
    const somas = (await somasPorObjetivo([g.id])).get(g.id)!;
    const depois = calcularProgresso(dadosProgresso(g), somas.dep.minus(entrada.amount), somas.ret, diaLocal());
    if (depois.saved.lt(0)) return res.status(409).json({ error: "Sem este depósito o guardado ficaria negativo. Apague antes as retiradas." });
  }

  let chaves: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.goalEntry.delete({ where: { id: entrada.id } });
    if (entrada.transactionId && keepTransfer !== "true") {
      const anexos = await tx.transactionAttachment.findMany({ where: { transactionId: entrada.transactionId }, select: { storageKey: true } });
      chaves = anexos.map((a) => a.storageKey);
      await tx.transaction.deleteMany({ where: { id: entrada.transactionId, ...scope(req) } });
    }
  });
  await apagarArquivos(chaves);
  res.json(await umComProgresso(g.id));
});
