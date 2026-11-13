import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { Decimal, ZERO, valorPositivo, valorNaoNegativo, dataSchema } from "../lib/money.js";
import { apagarArquivos } from "../services/armazenamento.js";
import { diaLocal } from "../services/objetivos.js";
import { calcularSaldo, comSaldo, montarPlano, pagoPorDivida, type DividaPlano } from "../services/dividas.js";

export const debtsRouter = Router();

// Dívidas do espaço ativo. VIEWER só lê.
debtsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

// Taxa em % ao mês: 0 a 100, até 4 casas ("2,5" chega como "2.5")
const taxaSchema = z
  .union([z.string().trim(), z.number()])
  .transform((v) => String(v).replace(",", "."))
  .refine((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v), { message: "Use a taxa em % ao mês, ex.: 2.5", abort: true })
  .refine((v) => Number(v) <= 100, "A taxa ao mês não pode passar de 100%.")
  .transform((v) => new Decimal(v));

const dividaSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para a dívida.").max(60),
  creditor: z.string().trim().max(60).nullable().default(null),
  type: z.enum(["CARTAO", "EMPRESTIMO", "FINANCIAMENTO", "CHEQUE_ESPECIAL", "PESSOAL", "OUTRA"], { error: "Escolha o tipo da dívida." }).default("OUTRA"),
  currentBalance: valorPositivo,
  interestRateMonthly: taxaSchema.default(new Decimal(0)),
  minimumPayment: valorNaoNegativo.default(new Decimal(0)),
  dueDay: z.number().int().min(1, "Use um dia de 1 a 31.").max(31, "Use um dia de 1 a 31.").nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
  accountId: z.string().min(1).nullable().default(null),
});
type DadosDivida = z.infer<typeof dividaSchema>;

const invalido = (res: Response, campo: string, msg: string) => res.status(400).json({ error: "Dados inválidos.", detalhes: { [campo]: [msg] } });
const naoEncontrada = (res: Response) => res.status(404).json({ error: "Dívida não encontrada." });
const incluir = { account: true } as const;

async function buscar(req: Request, id = String(req.params.id)) {
  return prisma.debt.findFirst({ where: { id, ...scope(req) }, include: incluir });
}

async function umComSaldo(id: string) {
  const d = await prisma.debt.findUniqueOrThrow({ where: { id }, include: incluir });
  return (await comSaldo([d]))[0];
}

// Conta vinculada (só referência): qualquer conta ou cartão do espaço
async function conferirConta(req: Request, res: Response, accountId: string | null) {
  if (!accountId) return true;
  const conta = await prisma.financialAccount.findFirst({ where: { id: accountId, ...scope(req) } });
  if (!conta) {
    invalido(res, "accountId", "Conta não encontrada.");
    return false;
  }
  return true;
}

const campos = (d: DadosDivida) => ({
  name: d.name,
  creditor: d.creditor || null,
  type: d.type,
  interestRateMonthly: d.interestRateMonthly,
  minimumPayment: d.minimumPayment,
  dueDay: d.dueDay,
  notes: d.notes || null,
  accountId: d.accountId,
});

const filtroLista = z.object({ status: z.enum(["ACTIVE", "PAID", "ARCHIVED"]).optional() });

// GET /api/debts?status=ACTIVE → dívidas com saldo atual, totais e quantas há em cada situação
debtsRouter.get("/", validateQuery(filtroLista), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroLista>;
  const { householdId } = scope(req);
  // Acerta as situações de todas antes de contar (um lançamento apagado pode ter reaberto uma quitada)
  const todas = await prisma.debt.findMany({ where: { householdId }, include: incluir, orderBy: { createdAt: "asc" } });
  const lista = await comSaldo(todas);
  const counts = { ACTIVE: 0, PAID: 0, ARCHIVED: 0 };
  for (const d of lista) counts[d.status] += 1;
  const debts = f.status ? lista.filter((d) => d.status === f.status) : lista;
  const ativas = lista.filter((d) => d.status === "ACTIVE");
  res.json({
    counts,
    totals: {
      currentBalance: ativas.reduce((s, d) => s.plus(d.currentBalance), ZERO).toFixed(2),
      minimumPayments: ativas.reduce((s, d) => s.plus(Decimal.min(d.minimumPayment, d.currentBalance)), ZERO).toFixed(2),
      paidAmount: ativas.reduce((s, d) => s.plus(d.paidAmount), ZERO).toFixed(2),
    },
    debts,
  });
});

const planoSchema = z.object({
  method: z.enum(["AVALANCHE", "SNOWBALL"], { error: "Use AVALANCHE ou SNOWBALL." }).default("AVALANCHE"),
  monthlyBudget: valorPositivo.optional(),
});

// GET /api/debts/plan?method=AVALANCHE|SNOWBALL&monthlyBudget=1500 → plano de quitação das dívidas ativas.
// Sem orçamento: usa a soma dos mínimos. Orçamento menor que os mínimos (ou dívidas que nunca acabam): 400 com a explicação.
debtsRouter.get("/plan", validateQuery(planoSchema), async (req, res) => {
  const q = res.locals.query as z.infer<typeof planoSchema>;
  const ativas = await prisma.debt.findMany({ where: { ...scope(req), status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  const pagos = await pagoPorDivida(ativas.map((d) => d.id));
  const dividas: DividaPlano[] = ativas
    .map((d) => ({ id: d.id, name: d.name, balance: calcularSaldo(d.startingBalance, pagos.get(d.id) ?? ZERO).currentBalance, rate: d.interestRateMonthly, minimum: d.minimumPayment }))
    .filter((d) => d.balance.gt(0));
  const minimos = dividas.reduce((s, d) => s.plus(Decimal.min(d.minimum, d.balance)), ZERO);

  if (!dividas.length) {
    return res.json({ ok: true, method: q.method, empty: true, monthlyBudget: (q.monthlyBudget ?? ZERO).toFixed(2), minimumsTotal: "0.00", months: 0, debts: [], schedule: [], comparison: null, warnings: [] });
  }
  const orcamento = q.monthlyBudget ?? (minimos.gt(0) ? minimos : null);
  if (!orcamento) return invalido(res, "monthlyBudget", "Informe quanto você pode pagar por mês nas dívidas.");

  const plano = montarPlano(dividas, orcamento, q.method);
  if (!plano.ok) return res.status(400).json({ error: plano.error, reason: plano.reason, minimumsTotal: plano.minimumsTotal, detalhes: { monthlyBudget: [plano.error] } });
  res.json(plano);
});

// GET /api/debts/:id → dívida com saldo e histórico de pagamentos
debtsRouter.get("/:id", async (req, res) => {
  const d = await buscar(req);
  if (!d) return naoEncontrada(res);
  const debt = (await comSaldo([d]))[0];
  const pagamentos = await prisma.debtPayment.findMany({
    where: { debtId: d.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { transaction: { include: { account: true } } },
  });
  res.json({
    debt,
    payments: pagamentos.map((p) => ({
      id: p.id,
      amount: p.transaction.amount.toFixed(2),
      date: diaLocal(p.transaction.date),
      notes: p.transaction.notes,
      transactionId: p.transactionId,
      account: { id: p.transaction.account.id, name: p.transaction.account.name },
    })),
  });
});

// POST /api/debts → cadastra uma dívida (ativa)
debtsRouter.post("/", validateBody(dividaSchema), async (req, res) => {
  const d = req.body as DadosDivida;
  if (!(await conferirConta(req, res, d.accountId))) return;
  const criada = await prisma.debt.create({ data: { ...scope(req), ...campos(d), startingBalance: d.currentBalance, createdById: req.user!.id } });
  res.status(201).json(await umComSaldo(criada.id));
});

// PUT /api/debts/:id → altera a dívida. currentBalance é o saldo devedor de HOJE (ex.: com os juros do mês);
// guardamos saldo + já pago, para os pagamentos registrados continuarem descontando.
debtsRouter.put("/:id", validateBody(dividaSchema), async (req, res) => {
  const d = req.body as DadosDivida;
  const atual = await buscar(req);
  if (!atual) return naoEncontrada(res);
  if (!(await conferirConta(req, res, d.accountId))) return;
  const pago = (await pagoPorDivida([atual.id])).get(atual.id) ?? ZERO;
  await prisma.debt.update({ where: { id: atual.id }, data: { ...campos(d), startingBalance: d.currentBalance.plus(pago) } });
  res.json(await umComSaldo(atual.id));
});

const situacaoSchema = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"], { error: "Use ACTIVE ou ARCHIVED." }) });

// POST /api/debts/:id/status {status} → arquivar ou reativar (quitada é automática: saldo zero)
debtsRouter.post("/:id/status", validateBody(situacaoSchema), async (req, res) => {
  const { status } = req.body as z.infer<typeof situacaoSchema>;
  const atual = await buscar(req);
  if (!atual) return naoEncontrada(res);
  await prisma.debt.update({ where: { id: atual.id }, data: { status } });
  // Reativar uma dívida com saldo zero a deixa como quitada
  res.json(await umComSaldo(atual.id));
});

const apagarSchema = z.object({ removeTransactions: z.enum(["true", "false"]).optional() });

// DELETE /api/debts/:id?removeTransactions=true → apaga a dívida e o histórico de pagamentos.
// Por padrão as despesas dos pagamentos continuam em Lançamentos; removeTransactions=true apaga junto.
debtsRouter.delete("/:id", validateQuery(apagarSchema), async (req, res) => {
  const { removeTransactions } = res.locals.query as z.infer<typeof apagarSchema>;
  const atual = await buscar(req);
  if (!atual) return naoEncontrada(res);
  let chaves: string[] = [];
  await prisma.$transaction(async (tx) => {
    const ids = (await tx.debtPayment.findMany({ where: { debtId: atual.id }, select: { transactionId: true } })).map((p) => p.transactionId);
    await tx.debt.delete({ where: { id: atual.id } });
    if (removeTransactions === "true" && ids.length) {
      chaves = (await tx.transactionAttachment.findMany({ where: { transactionId: { in: ids } }, select: { storageKey: true } })).map((a) => a.storageKey);
      await tx.transaction.deleteMany({ where: { id: { in: ids }, ...scope(req) } });
    }
  });
  await apagarArquivos(chaves);
  res.status(204).end();
});

const pagamentoSchema = z.object({
  amount: valorPositivo,
  date: dataSchema.optional(),
  accountId: z.string({ error: "Escolha de qual conta saiu o dinheiro." }).min(1, "Escolha de qual conta saiu o dinheiro."),
  categoryId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(200).nullable().optional(),
});

// Categoria "Dívidas" (despesa) do espaço: criada na primeira vez que alguém registra um pagamento
async function categoriaDividas(householdId: string) {
  const achada = await prisma.category.findFirst({ where: { householdId, type: "EXPENSE", parentId: null, name: "Dívidas" } });
  return achada ?? prisma.category.create({ data: { householdId, type: "EXPENSE", name: "Dívidas", color: "#ef4444", icon: "hand" } });
}

// POST /api/debts/:id/payments → registra um pagamento: cria uma DESPESA em Lançamentos e baixa o saldo devedor.
// Zerou o saldo: a dívida fica quitada.
debtsRouter.post("/:id/payments", validateBody(pagamentoSchema), async (req, res) => {
  const d = req.body as z.infer<typeof pagamentoSchema>;
  const divida = await buscar(req);
  if (!divida) return naoEncontrada(res);
  if (divida.status !== "ACTIVE") return res.status(400).json({ error: divida.status === "PAID" ? "Esta dívida já está quitada." : "Esta dívida está arquivada. Reative para registrar pagamentos." });

  const hoje = diaLocal();
  const data = d.date ?? new Date(`${hoje}T12:00:00.000Z`);
  if (diaLocal(data) > hoje) return invalido(res, "date", "Registre o pagamento no dia em que ele foi feito (sem data futura).");

  const conta = await prisma.financialAccount.findFirst({ where: { id: d.accountId, ...scope(req) } });
  if (!conta) return invalido(res, "accountId", "Conta não encontrada.");
  if (conta.type === "CREDIT_CARD") return invalido(res, "accountId", "Escolha uma conta ou carteira (pagar dívida com o cartão é uma compra no cartão).");
  if (conta.archivedAt) return invalido(res, "accountId", "Esta conta está arquivada.");

  let categoriaId: string;
  if (d.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: d.categoryId, ...scope(req), type: "EXPENSE" } });
    if (!cat) return invalido(res, "categoryId", "Categoria de despesa não encontrada.");
    categoriaId = cat.id;
  } else {
    categoriaId = (await categoriaDividas(scope(req).householdId)).id;
  }

  const pago = (await pagoPorDivida([divida.id])).get(divida.id) ?? ZERO;
  const saldo = calcularSaldo(divida.startingBalance, pago).currentBalance;
  if (d.amount.gt(saldo)) return invalido(res, "amount", `O saldo devedor é ${saldo.toFixed(2).replace(".", ",")}. Se os juros aumentaram a dívida, corrija o saldo em Editar.`);

  const pagamento = await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        ...scope(req),
        createdById: req.user!.id,
        type: "EXPENSE",
        accountId: conta.id,
        categoryId: categoriaId,
        amount: d.amount,
        description: `Pagamento: ${divida.name}`.slice(0, 120),
        notes: d.notes || null,
        date: data,
        status: "CONFIRMED",
      },
    });
    return tx.debtPayment.create({ data: { debtId: divida.id, transactionId: t.id, amount: d.amount, date: data, createdById: req.user!.id } });
  });

  const debt = await umComSaldo(divida.id);
  res.status(201).json({ payment: { id: pagamento.id, amount: pagamento.amount.toFixed(2), date: diaLocal(pagamento.date), transactionId: pagamento.transactionId }, debt, paidOff: debt.status === "PAID" });
});

// DELETE /api/debts/:id/payments/:paymentId → desfaz o pagamento: apaga a despesa em Lançamentos e o saldo devedor volta.
// (Apagar a despesa direto em Lançamentos tem o mesmo efeito.)
debtsRouter.delete("/:id/payments/:paymentId", async (req, res) => {
  const divida = await buscar(req);
  if (!divida) return naoEncontrada(res);
  const p = await prisma.debtPayment.findFirst({ where: { id: String(req.params.paymentId), debtId: divida.id } });
  if (!p) return res.status(404).json({ error: "Pagamento não encontrado." });
  const chaves = (await prisma.transactionAttachment.findMany({ where: { transactionId: p.transactionId }, select: { storageKey: true } })).map((a) => a.storageKey);
  await prisma.transaction.deleteMany({ where: { id: p.transactionId, ...scope(req) } });
  await prisma.debtPayment.deleteMany({ where: { id: p.id } });
  await apagarArquivos(chaves);
  res.json(await umComSaldo(divida.id));
});
