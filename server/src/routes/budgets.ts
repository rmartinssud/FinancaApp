import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";
import { Decimal, ZERO, valorPositivo, mesSchema, mesAtual, somarMeses } from "../lib/money.js";
import {
  Calculadora,
  ativoNoMes,
  incluirOrcamento,
  metaFixaDoMes,
  serializarOrcamento,
  serializarProgresso,
  mesesDoIntervalo,
  type Orcamento,
} from "../services/orcamentos.js";

export const budgetsRouter = Router();

// Orçamentos do espaço ativo. VIEWER só lê.
budgetsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");
const dia = z.iso.date({ error: "Use uma data AAAA-MM-DD." });
const ids = z.array(z.string().min(1)).max(100).default([]);

// Percentual da meta: 0,01 a 100, até 2 casas
const percentual = z
  .union([z.string().trim(), z.number()])
  .transform((v) => String(v).replace(",", "."))
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100, "Use um percentual de 0,01 a 100.")
  .transform((v) => new Decimal(v));

const orcamentoSchema = z
  .object({
    kind: z.enum(["EXPENSE", "INCOME"], { error: "Use EXPENSE ou INCOME." }),
    isGroup: z.boolean().default(false),
    name: z.string().trim().min(1, "Dê um nome para o orçamento.").max(60),
    color: cor,
    icon: z.string().trim().min(1).max(30),
    period: z.enum(["MONTHLY", "CUSTOM"]).default("MONTHLY"),
    startMonth: mesSchema.nullable().optional(),
    startDate: dia.nullable().optional(),
    endDate: dia.nullable().optional(),
    goalType: z.enum(["FIXED", "PERCENT_INCOME", "PERCENT_BUDGET"]).default("FIXED"),
    amount: valorPositivo.nullable().optional(),
    percent: percentual.nullable().optional(),
    percentOfBudgetId: z.string().min(1).nullable().optional(),
    categoryIds: ids,
    accountIds: ids,
    componentIds: ids,
    includeIgnored: z.boolean().default(false),
    includePending: z.boolean().default(true),
    cardDateRef: z.enum(["PURCHASE", "INVOICE"]).default("PURCHASE"),
    alertPercent: z.number().int().min(1, "Alerta de 1% a 100%.").max(100, "Alerta de 1% a 100%.").nullable().default(80),
    showOnHome: z.boolean().default(false),
    // Edição: mudar a meta fixa no formulário vale deste mês em diante (padrão: mês atual)
    goalFromMonth: mesSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const erro = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (d.isGroup) {
      if (d.kind !== "EXPENSE") erro("kind", "Agrupado é só de despesas.");
      if (d.period !== "MONTHLY") erro("period", "Agrupado é sempre mensal.");
      if (!d.startMonth) erro("startMonth", "Escolha o mês de vigência.");
      if (d.componentIds.length === 0) erro("componentIds", "Escolha pelo menos um orçamento para agrupar.");
      return;
    }
    if (d.period === "MONTHLY" && !d.startMonth) erro("startMonth", "Escolha o mês de vigência.");
    if (d.period === "CUSTOM") {
      if (!d.startDate) erro("startDate", "Escolha a data de início.");
      if (!d.endDate) erro("endDate", "Escolha a data de fim.");
      if (d.startDate && d.endDate && d.endDate < d.startDate) erro("endDate", "O fim precisa ser depois do início.");
    }
    if (d.goalType === "FIXED" && !d.amount) erro("amount", "Informe o valor da meta.");
    if (d.goalType !== "FIXED") {
      if (d.kind !== "EXPENSE" || d.period !== "MONTHLY") erro("goalType", "Meta em % só vale para orçamento mensal de despesa.");
      if (!d.percent) erro("percent", "Informe o percentual.");
      if (d.goalType === "PERCENT_BUDGET" && !d.percentOfBudgetId) erro("percentOfBudgetId", "Escolha o orçamento de receita.");
    }
    if (d.kind === "INCOME" && d.accountIds.length) erro("accountIds", "Filtro por conta é só para despesas.");
  });

type DadosOrcamento = z.infer<typeof orcamentoSchema>;
type Erro = { status: number; error: string; detalhes?: Record<string, string[]> };
const invalido = (campo: string, msg: string): Erro => ({ status: 400, error: "Dados inválidos.", detalhes: { [campo]: [msg] } });
const responderErro = (res: Response, e: Erro) => res.status(e.status).json({ error: e.error, ...(e.detalhes ? { detalhes: e.detalhes } : {}) });

// Confere categorias, contas, componentes e orçamento-base: tudo do mesmo espaço e compatível
async function conferirReferencias(req: Request, d: DadosOrcamento, idAtual?: string): Promise<Erro | null> {
  const { householdId } = scope(req);
  if (d.isGroup) {
    const comps = await prisma.budget.findMany({ where: { householdId, id: { in: d.componentIds } } });
    if (comps.length !== new Set(d.componentIds).size) return invalido("componentIds", "Orçamento não encontrado.");
    const ruim = comps.find((c) => c.id === idAtual || c.isGroup || c.kind !== "EXPENSE" || c.period !== "MONTHLY");
    if (ruim) return invalido("componentIds", `“${ruim.name}” não pode entrar no agrupado: use orçamentos mensais de despesa.`);
    return null;
  }
  if (d.categoryIds.length) {
    const cats = await prisma.category.findMany({ where: { householdId, id: { in: d.categoryIds } } });
    if (cats.length !== new Set(d.categoryIds).size) return invalido("categoryIds", "Categoria não encontrada.");
    if (cats.some((c) => c.type !== d.kind)) return invalido("categoryIds", d.kind === "EXPENSE" ? "Use categorias de despesa." : "Use categorias de receita.");
  }
  if (d.accountIds.length) {
    const contas = await prisma.financialAccount.count({ where: { householdId, id: { in: d.accountIds } } });
    if (contas !== new Set(d.accountIds).size) return invalido("accountIds", "Conta ou cartão não encontrado.");
  }
  if (d.goalType === "PERCENT_BUDGET") {
    const base = await prisma.budget.findFirst({ where: { householdId, id: d.percentOfBudgetId! } });
    if (!base || base.kind !== "INCOME" || base.period !== "MONTHLY" || base.isGroup) {
      return invalido("percentOfBudgetId", "Escolha um orçamento mensal de receita.");
    }
  }
  return null;
}

// Campos gravados no orçamento (sem as listas)
function camposDoOrcamento(d: DadosOrcamento) {
  const grupo = d.isGroup;
  const mensal = d.period === "MONTHLY";
  const despesa = d.kind === "EXPENSE";
  return {
    kind: d.kind,
    isGroup: grupo,
    name: d.name,
    color: d.color,
    icon: d.icon,
    period: d.period,
    startMonth: mensal ? d.startMonth! : null,
    startDate: mensal ? null : d.startDate!,
    endDate: mensal ? null : d.endDate!,
    goalType: grupo ? ("FIXED" as const) : d.goalType,
    amount: !grupo && !mensal ? d.amount! : null,
    percent: !grupo && d.goalType !== "FIXED" ? d.percent! : null,
    percentOfBudgetId: !grupo && d.goalType === "PERCENT_BUDGET" ? d.percentOfBudgetId! : null,
    includeIgnored: grupo ? false : d.includeIgnored,
    includePending: grupo ? true : d.includePending,
    cardDateRef: despesa && !grupo ? d.cardDateRef : ("PURCHASE" as const),
    alertPercent: despesa ? d.alertPercent : null,
    showOnHome: d.showOnHome,
  };
}

function listasDoOrcamento(d: DadosOrcamento) {
  return {
    categories: d.isGroup ? [] : [...new Set(d.categoryIds)],
    accounts: d.isGroup || d.kind !== "EXPENSE" ? [] : [...new Set(d.accountIds)],
    components: d.isGroup ? [...new Set(d.componentIds)] : [],
  };
}

async function buscarOrcamento(req: Request, id = String(req.params.id)) {
  return prisma.budget.findFirst({ where: { id, ...scope(req) }, include: incluirOrcamento });
}

// Orçamento + progresso no mês (agrupado: com os componentes)
async function comProgresso(calc: Calculadora, b: Orcamento, mes: string): Promise<Record<string, unknown>> {
  const base = {
    ...serializarOrcamento(b),
    // Meta fixa do mês sem as transferências (o formulário de edição mostra este valor)
    fixedGoal: !b.isGroup && b.period === "MONTHLY" && b.goalType === "FIXED" ? metaFixaDoMes(b, mes).toFixed(2) : null,
    progress: serializarProgresso(b, await calc.progresso(b, mes)),
  };
  if (!b.isGroup) return base;
  const componentes = await Promise.all(calc.componentes(b, mes).map((c) => comProgresso(calc, c, mes)));
  return { ...base, components: componentes };
}

// ─────────────────────────────────────────────
// Rotas
// ─────────────────────────────────────────────

const filtroLista = z.object({
  month: mesSchema.optional(),
  kind: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  // home=true: só os marcados "Exibir no Início" (despesas e receitas), até 4
  home: z.enum(["true", "false"]).optional(),
});

// GET /api/budgets?month=2026-11&kind=EXPENSE → orçamentos do mês com meta, usado e saldo
budgetsRouter.get("/", validateQuery(filtroLista), async (req, res) => {
  const f = res.locals.query as z.infer<typeof filtroLista>;
  const mes = f.month ?? mesAtual();
  const calc = await Calculadora.carregar(scope(req).householdId);
  const doMes = calc.lista.filter((b) => ativoNoMes(b, mes));

  if (f.home === "true") {
    const noInicio = doMes.filter((b) => b.showOnHome);
    const budgets = await Promise.all(noInicio.slice(0, 4).map((b) => comProgresso(calc, b, mes)));
    return res.json({ month: mes, total: noInicio.length, budgets });
  }

  const daVez = doMes.filter((b) => b.kind === f.kind);
  const budgets = await Promise.all(daVez.map((b) => comProgresso(calc, b, mes)));

  // Resumo só com os orçamentos comuns (os agrupados repetiriam os valores)
  let goal = ZERO;
  let used = ZERO;
  for (const b of daVez.filter((x) => !x.isGroup)) {
    const p = await calc.progresso(b, mes);
    goal = goal.plus(p.goal);
    used = used.plus(p.used);
  }
  res.json({
    month: mes,
    kind: f.kind,
    // Quantos orçamentos deste tipo estão arquivados (link "Arquivados" na tela)
    archivedCount: calc.lista.filter((b) => b.kind === f.kind && b.archivedFromMonth).length,
    summary: { goal: goal.toFixed(2), used: used.toFixed(2), balance: goal.minus(used).toFixed(2) },
    budgets,
  });
});

// GET /api/budgets/archived → orçamentos arquivados (despesas e receitas), do arquivado mais recente ao mais antigo.
// lastMonth = último mês em que o orçamento valeu (para abrir os detalhes nele).
budgetsRouter.get("/archived", async (req, res) => {
  const calc = await Calculadora.carregar(scope(req).householdId);
  const arquivados = calc.lista
    .filter((b) => b.archivedFromMonth)
    .sort((a, c) => (a.archivedFromMonth! < c.archivedFromMonth! ? 1 : a.archivedFromMonth! > c.archivedFromMonth! ? -1 : 0));
  const budgets = await Promise.all(
    arquivados.map(async (b) => {
      let ultimo = somarMeses(b.archivedFromMonth!, -1);
      while (ultimo >= b.startMonth! && !ativoNoMes(b, ultimo)) ultimo = somarMeses(ultimo, -1);
      const lastMonth = ultimo >= b.startMonth! ? ultimo : b.startMonth!;
      return { ...(await comProgresso(calc, b, lastMonth)), lastMonth, usedBy: calc.lista.filter((x) => x.percentOfBudgetId === b.id).map((x) => x.name) };
    }),
  );
  res.json({ budgets });
});

const filtroMes = z.object({ month: mesSchema.optional() });

// GET /api/budgets/:id?month=2026-11 → detalhes: progresso, lançamentos que contaram, 6 meses e meta recomendada
budgetsRouter.get("/:id", validateQuery(filtroMes), async (req, res) => {
  const { month } = res.locals.query as z.infer<typeof filtroMes>;
  const mes = month ?? mesAtual();
  const calc = await Calculadora.carregar(scope(req).householdId);
  const b = calc.orcamentos.get(String(req.params.id));
  if (!b) return res.status(404).json({ error: "Orçamento não encontrado." });

  let history = null;
  if (b.period === "MONTHLY") {
    history = [];
    for (let i = 5; i >= 0; i--) {
      const m = somarMeses(mes, -i);
      const ativo = ativoNoMes(b, m);
      const p = ativo ? await calc.progresso(b, m) : null;
      history.push({ month: m, active: ativo, goal: p?.goal.toFixed(2) ?? null, used: p?.used.toFixed(2) ?? null });
    }
  }

  res.json({
    month: mes,
    budget: await comProgresso(calc, b, mes),
    transactions: await calc.lancamentos(b, mes),
    history,
    recommended: b.goalType === "FIXED" ? await calc.recomendada(b) : null,
  });
});

// GET /api/budgets/:id/recommended → meta recomendada (média dos 3 últimos meses completos)
budgetsRouter.get("/:id/recommended", async (req, res) => {
  const calc = await Calculadora.carregar(scope(req).householdId);
  const b = calc.orcamentos.get(String(req.params.id));
  if (!b) return res.status(404).json({ error: "Orçamento não encontrado." });
  res.json({ recommended: await calc.recomendada(b) });
});

async function devolver(req: Request, res: Response, id: string, status = 200) {
  const calc = await Calculadora.carregar(scope(req).householdId);
  const b = calc.orcamentos.get(id)!;
  const mes = b.period === "MONTHLY" && b.startMonth! > mesAtual() ? b.startMonth! : mesAtual();
  res.status(status).json(await comProgresso(calc, b, mes));
}

// POST /api/budgets → cria um orçamento (ou agrupado)
budgetsRouter.post("/", validateBody(orcamentoSchema), async (req, res) => {
  const d = req.body as DadosOrcamento;
  const erro = await conferirReferencias(req, d);
  if (erro) return responderErro(res, erro);

  const listas = listasDoOrcamento(d);
  const campos = camposDoOrcamento(d);
  const criado = await prisma.budget.create({
    data: {
      ...scope(req),
      ...campos,
      categories: { create: listas.categories.map((categoryId) => ({ categoryId })) },
      accounts: { create: listas.accounts.map((accountId) => ({ accountId })) },
      components: { create: listas.components.map((budgetId) => ({ budgetId })) },
      // Mensal com meta fixa: a meta vai para o histórico, valendo da vigência em diante
      goals: !d.isGroup && d.period === "MONTHLY" && d.goalType === "FIXED" ? { create: [{ fromMonth: d.startMonth!, amount: d.amount! }] } : undefined,
    },
  });
  await devolver(req, res, criado.id, 201);
});

// PUT /api/budgets/:id → altera o orçamento (o tipo e "agrupado" não mudam)
budgetsRouter.put("/:id", validateBody(orcamentoSchema), async (req, res) => {
  const d = req.body as DadosOrcamento;
  const atual = await buscarOrcamento(req);
  if (!atual) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (atual.kind !== d.kind || atual.isGroup !== d.isGroup) {
    return responderErro(res, invalido("kind", "O tipo do orçamento não pode ser alterado. Crie outro (ou use Copiar)."));
  }
  const erro = await conferirReferencias(req, d, atual.id);
  if (erro) return responderErro(res, erro);

  // É base de meta em % de outro orçamento: precisa continuar mensal
  if (d.period !== "MONTHLY" && (await prisma.budget.count({ where: { percentOfBudgetId: atual.id } }))) {
    return responderErro(res, invalido("period", "Outro orçamento usa a meta deste como base. Ele precisa continuar mensal."));
  }

  const listas = listasDoOrcamento(d);
  const campos = camposDoOrcamento(d);
  const operacoes: Prisma.PrismaPromise<unknown>[] = [
    prisma.budgetCategory.deleteMany({ where: { budgetId: atual.id } }),
    prisma.budgetAccount.deleteMany({ where: { budgetId: atual.id } }),
    prisma.budgetGroupItem.deleteMany({ where: { groupId: atual.id } }),
    prisma.budget.update({
      where: { id: atual.id },
      data: {
        ...campos,
        categories: { create: listas.categories.map((categoryId) => ({ categoryId })) },
        accounts: { create: listas.accounts.map((accountId) => ({ accountId })) },
        components: { create: listas.components.map((budgetId) => ({ budgetId })) },
      },
    }),
  ];
  // Deixou de ser mensal: sai dos agrupados
  if (d.period !== "MONTHLY") operacoes.push(prisma.budgetGroupItem.deleteMany({ where: { budgetId: atual.id } }));

  // Meta fixa mensal: valor novo vale "deste mês em diante" (histórico dos meses anteriores fica)
  if (!d.isGroup && d.period === "MONTHLY" && d.goalType === "FIXED") {
    const temHistorico = atual.period === "MONTHLY" && atual.goals.some((g) => !g.isTransfer);
    if (!temHistorico) {
      operacoes.push(prisma.budgetGoal.create({ data: { budgetId: atual.id, fromMonth: d.startMonth!, amount: d.amount! } }));
    } else {
      let desde = d.goalFromMonth ?? mesAtual();
      if (desde < d.startMonth!) desde = d.startMonth!;
      if (!metaFixaDoMes(atual, desde).equals(d.amount!)) operacoes.push(...mudarMetaEmDiante(atual.id, desde, d.amount!));
    }
  }
  await prisma.$transaction(operacoes);
  await devolver(req, res, atual.id);
});

// DELETE /api/budgets/:id → apaga o orçamento e o histórico dele
budgetsRouter.delete("/:id", async (req, res) => {
  const atual = await buscarOrcamento(req);
  if (!atual) return res.status(404).json({ error: "Orçamento não encontrado." });
  const dependentes = await prisma.budget.findMany({ where: { percentOfBudgetId: atual.id }, select: { name: true } });
  if (dependentes.length) {
    const nomes = dependentes.map((x) => `“${x.name}”`).join(", ");
    return res.status(409).json({ error: `A meta de ${nomes} é um percentual deste orçamento. Altere ${dependentes.length > 1 ? "eles" : "ele"} antes de excluir.` });
  }
  await prisma.budget.delete({ where: { id: atual.id } });
  res.status(204).end();
});

// "Deste mês em diante": tira as metas do mês em diante (menos as transferências) e grava a nova
function mudarMetaEmDiante(budgetId: string, mes: string, valor: Prisma.Decimal) {
  return [
    prisma.budgetGoal.deleteMany({ where: { budgetId, isTransfer: false, fromMonth: { gte: mes } } }),
    prisma.budgetGoal.create({ data: { budgetId, fromMonth: mes, amount: valor, onlyMonth: false } }),
  ];
}

const metaSchema = z.object({
  amount: valorPositivo,
  month: mesSchema,
  scope: z.enum(["month", "forward"], { error: "Use month (só neste mês) ou forward (deste mês em diante)." }),
});

// POST /api/budgets/:id/goal → Alterar meta (mensal com meta fixa): só neste mês ou deste mês em diante
budgetsRouter.post("/:id/goal", validateBody(metaSchema), async (req, res) => {
  const d = req.body as z.infer<typeof metaSchema>;
  const atual = await buscarOrcamento(req);
  if (!atual) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (atual.isGroup || atual.period !== "MONTHLY" || atual.goalType !== "FIXED") {
    return res.status(400).json({ error: "Só dá para alterar a meta de orçamento mensal com valor fixo." });
  }
  if (!ativoNoMes(atual, d.month)) return responderErro(res, invalido("month", "O orçamento não vale neste mês."));

  if (d.scope === "month") {
    await prisma.$transaction([
      prisma.budgetGoal.deleteMany({ where: { budgetId: atual.id, isTransfer: false, onlyMonth: true, fromMonth: d.month } }),
      prisma.budgetGoal.create({ data: { budgetId: atual.id, fromMonth: d.month, amount: d.amount, onlyMonth: true } }),
    ]);
  } else {
    await prisma.$transaction(mudarMetaEmDiante(atual.id, d.month, d.amount));
  }
  const calc = await Calculadora.carregar(scope(req).householdId);
  res.json(await comProgresso(calc, calc.orcamentos.get(atual.id)!, d.month));
});

const transferenciaSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  month: mesSchema,
  amount: valorPositivo,
});

// POST /api/budgets/transfer → Transferir saldo entre dois orçamentos mensais de despesa, só no mês escolhido
budgetsRouter.post("/transfer", validateBody(transferenciaSchema), async (req, res) => {
  const d = req.body as z.infer<typeof transferenciaSchema>;
  if (d.fromId === d.toId) return responderErro(res, invalido("toId", "Escolha outro orçamento de destino."));
  const calc = await Calculadora.carregar(scope(req).householdId);
  const de = calc.orcamentos.get(d.fromId);
  const para = calc.orcamentos.get(d.toId);
  if (!de || !para) return res.status(404).json({ error: "Orçamento não encontrado." });
  const compativel = (b: Orcamento) => !b.isGroup && b.kind === "EXPENSE" && b.period === "MONTHLY" && ativoNoMes(b, d.month);
  if (!compativel(de) || !compativel(para)) {
    return res.status(400).json({ error: "Transferência só entre orçamentos mensais de despesa que valem neste mês." });
  }
  const saldo = (await calc.progresso(de, d.month)).balance;
  if (d.amount.gt(Decimal.max(saldo, ZERO))) {
    return responderErro(res, invalido("amount", `O saldo de “${de.name}” neste mês é ${Decimal.max(saldo, ZERO).toFixed(2).replace(".", ",")}.`));
  }
  await prisma.budgetGoal.createMany({
    data: [
      { budgetId: de.id, fromMonth: d.month, amount: d.amount.negated(), onlyMonth: true, isTransfer: true },
      { budgetId: para.id, fromMonth: d.month, amount: d.amount, onlyMonth: true, isTransfer: true },
    ],
  });
  const nova = await Calculadora.carregar(scope(req).householdId);
  res.json({
    from: await comProgresso(nova, nova.orcamentos.get(de.id)!, d.month),
    to: await comProgresso(nova, nova.orcamentos.get(para.id)!, d.month),
  });
});

const arquivoSchema = z.object({ fromMonth: mesSchema.nullable() });

// POST /api/budgets/:id/archive {fromMonth} → arquiva a partir do mês (os meses anteriores continuam).
// fromMonth = null desarquiva.
budgetsRouter.post("/:id/archive", validateBody(arquivoSchema), async (req, res) => {
  const { fromMonth } = req.body as z.infer<typeof arquivoSchema>;
  const atual = await buscarOrcamento(req);
  if (!atual) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (atual.period !== "MONTHLY") return res.status(400).json({ error: "Só orçamentos mensais podem ser arquivados. Este tem data de fim." });
  if (fromMonth && fromMonth <= atual.startMonth!) {
    return responderErro(res, invalido("fromMonth", "Escolha um mês depois do início. Para apagar tudo, use Excluir."));
  }
  await prisma.budget.update({ where: { id: atual.id }, data: { archivedFromMonth: fromMonth } });
  const calc = await Calculadora.carregar(scope(req).householdId);
  res.json(serializarOrcamento(calc.orcamentos.get(atual.id)!));
});

const desarquivarSchema = z.object({ fromMonth: mesSchema });

// POST /api/budgets/:id/unarchive {fromMonth} → volta a valer a partir do mês escolhido (o mês em que foi
// arquivado ou depois). Os meses entre o arquivamento e a volta ficam pausados (fora da lista, sem meta).
budgetsRouter.post("/:id/unarchive", validateBody(desarquivarSchema), async (req, res) => {
  const { fromMonth } = req.body as z.infer<typeof desarquivarSchema>;
  const atual = await buscarOrcamento(req);
  if (!atual) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (!atual.archivedFromMonth) return res.status(400).json({ error: "Este orçamento não está arquivado." });
  if (fromMonth < atual.archivedFromMonth) {
    return responderErro(res, invalido("fromMonth", "Escolha o mês em que ele foi arquivado ou um mês depois."));
  }
  const pausa = fromMonth > atual.archivedFromMonth ? mesesDoIntervalo(atual.archivedFromMonth, somarMeses(fromMonth, -1)) : [];
  const pausados = [...new Set([...atual.pausedMonths, ...pausa])].sort();
  await prisma.budget.update({ where: { id: atual.id }, data: { archivedFromMonth: null, pausedMonths: pausados } });
  const calc = await Calculadora.carregar(scope(req).householdId);
  res.json(await comProgresso(calc, calc.orcamentos.get(atual.id)!, fromMonth));
});
