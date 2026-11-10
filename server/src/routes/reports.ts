import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";
import { ZERO, mesSchema, mesAtual, diasNoMes, partesLocais } from "../lib/money.js";
import { mesesDoIntervalo } from "../services/orcamentos.js";
import { incluir, serializar, type LancamentoCompleto } from "../services/lancamentos.js";
import { comSubcategorias, mapaDePais } from "../services/porcoes.js";
import { datasDaFatura } from "../services/cartoes.js";

// ─────────────────────────────────────────────
// Relatórios: receitas e despesas de um período (mês ou intervalo de datas) com filtros,
// totais, agrupamento (categoria, subcategoria, conta, tag, pessoa ou mês) e a lista.
// Regras: transferências (e pagamentos de fatura) e ajustes de saldo nunca entram.
// Compras no cartão entram pela data de vencimento da fatura (padrão) ou pela data da compra.
// Com "Ignorar nos totais" ligado (padrão), lançamentos com "Ignorar nos totais" e contas com
// "Ignorar nos totais" ficam de fora (a conta volta se for escolhida no filtro de contas).
// ─────────────────────────────────────────────

export const reportsRouter = Router();
reportsRouter.use(requireAuth, withHousehold);

const MAX_DIAS = 731; // 2 anos

const lista = z
  .string()
  .optional()
  .transform((v) => (v ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))] : []));

const simNao = (padrao: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? padrao : v === "true" || v === "1"));

const diaSchema = z.iso.date({ error: "Use uma data AAAA-MM-DD (ex.: 2026-11-07)." });

export const AGRUPAMENTOS = ["category", "subcategory", "account", "tag", "person", "month"] as const;

export const filtroRelatorio = z
  .object({
    // Mês inteiro (atalho) ou intervalo de datas (from/to, dias em Brasília)
    month: mesSchema.optional(),
    from: diaSchema.optional(),
    to: diaSchema.optional(),
    type: z.enum(["ALL", "INCOME", "EXPENSE"], { error: "Use ALL, INCOME ou EXPENSE." }).default("ALL"),
    status: z.enum(["ALL", "CONFIRMED", "PENDING"], { error: "Use ALL, CONFIRMED ou PENDING." }).default("ALL"),
    accountIds: lista,
    // Ids das categorias (as subcategorias delas entram junto) e/ou "none" = sem categoria
    categoryIds: lista,
    tagIds: lista,
    createdById: z.string().min(1).optional(),
    groupBy: z.enum(AGRUPAMENTOS, { error: "Agrupe por category, subcategory, account, tag, person ou month." }).default("category"),
    // Compras no cartão: pelo vencimento da fatura (INVOICE) ou pela data da compra (PURCHASE)
    cardDate: z.enum(["INVOICE", "PURCHASE"], { error: "Use INVOICE ou PURCHASE." }).default("INVOICE"),
    excludeIgnored: simNao(true),
  })
  .transform((f) => {
    if (f.from || f.to) {
      const from = f.from ?? f.to!;
      return { ...f, from, to: f.to ?? from };
    }
    const mes = f.month ?? mesAtual();
    return { ...f, from: `${mes}-01`, to: `${mes}-${String(diasNoMes(mes)).padStart(2, "0")}` };
  })
  .refine((f) => f.from <= f.to, { message: "A data inicial precisa vir antes da final.", path: ["from"] })
  .refine((f) => (Date.parse(f.to) - Date.parse(f.from)) / 86400000 < MAX_DIAS, { message: "Escolha um período de até 2 anos.", path: ["from"] });

export type FiltroRelatorio = z.infer<typeof filtroRelatorio>;

// Início do dia em Brasília (UTC-3 fixo)
const inicioDoDia = (dia: string) => new Date(`${dia}T03:00:00.000Z`);
const diaSeguinte = (dia: string) => new Date(inicioDoDia(dia).getTime() + 86400000);
// "AAAA-MM-DD" de uma data, em Brasília
export const diaEmBrasilia = (d: Date) => {
  const { mes, dia } = partesLocais(d);
  return `${mes}-${String(dia).padStart(2, "0")}`;
};

// Porções por categoria (como services/porcoes.ts, mas a partir do lançamento completo)
const partes = (t: LancamentoCompleto) =>
  t.splits.length ? t.splits.map((x) => ({ categoryId: x.category?.id ?? null, amount: x.amount })) : [{ categoryId: t.categoryId, amount: t.amount }];

type Linha = { t: LancamentoCompleto; valor: Prisma.Decimal; dia: string; mes: string };

const texto = (v: Prisma.Decimal) => v.toFixed(2);

export async function gerarRelatorio(req: Request, f: FiltroRelatorio) {
  const householdId = scope(req).householdId;
  const intervalo = { gte: inicioDoDia(f.from), lt: diaSeguinte(f.to) };
  const mesesDoPeriodo = mesesDoIntervalo(f.from.slice(0, 7), f.to.slice(0, 7));

  // Categorias escolhidas (com subcategorias) e "sem categoria"
  const semCategoria = f.categoryIds.includes("none");
  const idsCategorias = await comSubcategorias(householdId, f.categoryIds.filter((c) => c !== "none"));
  const filtrandoCategoria = semCategoria || idsCategorias.length > 0;
  const dentro = new Set(idsCategorias);
  const parteConta = (categoryId: string | null) => (categoryId === null ? semCategoria : dentro.has(categoryId));

  const and: Prisma.TransactionWhereInput[] = [
    {
      OR: [
        { invoiceMonth: null, date: intervalo },
        f.cardDate === "INVOICE" ? { invoiceMonth: { in: mesesDoPeriodo } } : { invoiceMonth: { not: null }, date: intervalo },
      ],
    },
  ];
  if (filtrandoCategoria) {
    and.push({
      OR: [
        ...(idsCategorias.length ? [{ categoryId: { in: idsCategorias } }, { splits: { some: { categoryId: { in: idsCategorias } } } }] : []),
        ...(semCategoria ? [{ categoryId: null, splits: { none: {} } }, { splits: { some: { categoryId: null } } }] : []),
      ],
    });
  }

  const lancamentos = await prisma.transaction.findMany({
    where: {
      ...scope(req),
      type: f.type === "ALL" ? { in: ["INCOME", "EXPENSE"] } : f.type,
      isAdjustment: false,
      ...(f.status === "ALL" ? {} : { status: f.status }),
      ...(f.accountIds.length ? { accountId: { in: f.accountIds } } : {}),
      ...(f.tagIds.length ? { tags: { some: { tagId: { in: f.tagIds } } } } : {}),
      ...(f.createdById ? { createdById: f.createdById } : {}),
      ...(f.excludeIgnored ? { ignoreInTotals: false, ...(f.accountIds.length ? {} : { account: { ignoreInTotals: false } }) } : {}),
      AND: and,
    },
    include: incluir,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  // Vencimento da fatura de cada compra no cartão (dia em que ela "acontece" no relatório)
  const cartoes = await prisma.financialAccount.findMany({
    where: { householdId, type: "CREDIT_CARD" },
    select: { id: true, closingDay: true, dueDay: true },
  });
  const diasCartao = new Map(cartoes.map((c) => [c.id, c]));
  const vencimento = (t: LancamentoCompleto) => {
    const c = diasCartao.get(t.accountId);
    if (c?.closingDay && c.dueDay) return diaEmBrasilia(datasDaFatura(t.invoiceMonth!, { closingDay: c.closingDay, dueDay: c.dueDay }).dueDate);
    return `${t.invoiceMonth}-01`;
  };

  const linhas: Linha[] = [];
  for (const t of lancamentos) {
    const dia = t.invoiceMonth && f.cardDate === "INVOICE" ? vencimento(t) : diaEmBrasilia(t.date);
    if (dia < f.from || dia > f.to) continue;
    const valor = filtrandoCategoria ? partes(t).reduce((s, p) => (parteConta(p.categoryId) ? s.plus(p.amount) : s), ZERO) : t.amount;
    linhas.push({ t, valor, dia, mes: t.invoiceMonth && f.cardDate === "INVOICE" ? t.invoiceMonth : dia.slice(0, 7) });
  }
  linhas.sort((a, b) => (a.dia === b.dia ? b.t.createdAt.getTime() - a.t.createdAt.getTime() : a.dia < b.dia ? 1 : -1));

  const soma = (tipo: "INCOME" | "EXPENSE") => linhas.filter((l) => l.t.type === tipo).reduce((s, l) => s.plus(l.valor), ZERO);
  const income = soma("INCOME");
  const expense = soma("EXPENSE");

  // ─── Agrupamento ───
  const [pais, categorias] = await Promise.all([
    mapaDePais(householdId),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, color: true, icon: true, parentId: true } }),
  ]);
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const CINZA = "#94a3b8";

  type Grupo = { key: string | null; name: string; color: string; icon: string | null; total: Prisma.Decimal; count: number };
  function agrupar(tipo: "INCOME" | "EXPENSE") {
    const grupos = new Map<string, Grupo>();
    const somar = (key: string | null, info: Omit<Grupo, "key" | "total" | "count">, valor: Prisma.Decimal) => {
      const k = key ?? "__none";
      const g = grupos.get(k) ?? { key, ...info, total: ZERO, count: 0 };
      g.total = g.total.plus(valor);
      g.count += 1;
      grupos.set(k, g);
    };
    const infoCategoria = (id: string | null, folha: boolean) => {
      const c = id ? cat.get(id) : undefined;
      if (!c) return { name: "Sem categoria", color: CINZA, icon: null };
      if (!folha) return { name: c.name, color: c.color, icon: c.icon };
      const pai = c.parentId ? cat.get(c.parentId) : undefined;
      return { name: pai ? `${pai.name} › ${c.name}` : c.name, color: c.color, icon: c.icon };
    };

    for (const l of linhas.filter((x) => x.t.type === tipo)) {
      const t = l.t;
      if (f.groupBy === "category" || f.groupBy === "subcategory") {
        for (const p of partes(t)) {
          if (filtrandoCategoria && !parteConta(p.categoryId)) continue;
          const id = f.groupBy === "category" && p.categoryId ? (pais.get(p.categoryId) ?? p.categoryId) : p.categoryId;
          somar(id, infoCategoria(id, f.groupBy === "subcategory"), p.amount);
        }
      } else if (f.groupBy === "account") {
        somar(t.accountId, { name: t.account.name, color: CINZA, icon: null }, l.valor);
      } else if (f.groupBy === "tag") {
        // Um lançamento com 2 tags conta nas duas
        if (!t.tags.length) somar(null, { name: "Sem tag", color: CINZA, icon: null }, l.valor);
        for (const { tag } of t.tags) somar(tag.id, { name: tag.name, color: tag.color ?? CINZA, icon: null }, l.valor);
      } else if (f.groupBy === "person") {
        somar(t.createdById, { name: t.createdBy?.name ?? "Sem autor", color: CINZA, icon: null }, l.valor);
      } else {
        somar(l.mes, { name: l.mes, color: CINZA, icon: null }, l.valor);
      }
    }

    const total = tipo === "INCOME" ? income : expense;
    const resultado = [...grupos.values()];
    if (f.groupBy === "month") resultado.sort((a, b) => (a.key! < b.key! ? -1 : 1));
    else resultado.sort((a, b) => b.total.comparedTo(a.total));
    return resultado.map((g) => ({
      key: g.key,
      name: g.name,
      color: g.color,
      icon: g.icon,
      total: texto(g.total),
      count: g.count,
      percent: total.gt(0) ? Number(g.total.dividedBy(total).times(100).toFixed(1)) : 0,
    }));
  }

  return {
    from: f.from,
    to: f.to,
    filters: {
      type: f.type,
      status: f.status,
      accountIds: f.accountIds,
      categoryIds: f.categoryIds,
      tagIds: f.tagIds,
      createdById: f.createdById ?? null,
      groupBy: f.groupBy,
      cardDate: f.cardDate,
      excludeIgnored: f.excludeIgnored,
    },
    totals: {
      income: texto(income),
      expense: texto(expense),
      balance: texto(income.minus(expense)),
      count: linhas.length,
      pending: linhas.filter((l) => l.t.status === "PENDING").length,
    },
    groups: {
      income: f.type === "EXPENSE" ? [] : agrupar("INCOME"),
      expense: f.type === "INCOME" ? [] : agrupar("EXPENSE"),
    },
    // reportAmount: o valor que conta no relatório (com filtro de categoria, só a parte dessas categorias)
    // reportDate: o dia em que o lançamento entra no relatório (compra no cartão: vencimento da fatura)
    items: linhas.map((l) => ({ ...serializar(l.t), reportAmount: texto(l.valor), reportDate: l.dia })),
  };
}

// GET /api/reports?month=2026-11 | from=2026-11-01&to=2026-11-15 &type=&status=&accountIds=a,b&categoryIds=&tagIds=&createdById=&groupBy=&cardDate=&excludeIgnored=
reportsRouter.get("/", validateQuery(filtroRelatorio), async (req, res) => {
  res.json(await gerarRelatorio(req, res.locals.query as FiltroRelatorio));
});

// ─── CSV (Excel em português) ───
// UTF-8 com BOM, separador ";" e decimal com vírgula. Despesas saem com sinal negativo.
const campoCsv = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const decimalBr = (v: string) => v.replace(".", ",");
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

type Item = Awaited<ReturnType<typeof gerarRelatorio>>["items"][number];

export function relatorioEmCsv(itens: Item[]) {
  const cabecalho = ["Data", "Descrição", "Tipo", "Categoria", "Subcategoria", "Conta", "Tags", "Pessoa", "Situação", "Valor", "Fatura", "Parcela", "Observações"];
  const linhas = itens.map((i) => {
    let categoria = "";
    let subcategoria = "";
    if (i.splits.length) {
      categoria = `Multicategorias (${i.splits.map((s) => `${s.category ? (s.category.parent ? `${s.category.parent.name} › ${s.category.name}` : s.category.name) : "Sem categoria"} ${decimalBr(s.amount)}`).join("; ")})`;
    } else if (i.category) {
      categoria = i.category.parent ? i.category.parent.name : i.category.name;
      subcategoria = i.category.parent ? i.category.name : "";
    } else categoria = "Sem categoria";
    const valor = i.type === "EXPENSE" ? `-${i.reportAmount}` : i.reportAmount;
    return [
      dataBr(i.reportDate),
      i.description,
      i.type === "INCOME" ? "Receita" : i.isCardExpense ? "Despesa cartão" : "Despesa",
      categoria,
      subcategoria,
      i.account.name,
      i.tags.map((t) => t.name).join(", "),
      i.createdBy?.name ?? "",
      i.status === "CONFIRMED" ? "Efetivado" : "Pendente",
      decimalBr(valor),
      i.invoiceMonth ? `${i.invoiceMonth.slice(5, 7)}/${i.invoiceMonth.slice(0, 4)}` : "",
      i.installmentTotal ? `${i.installmentNumber}/${i.installmentTotal}` : "",
      i.notes ?? "",
    ]
      .map((c) => campoCsv(String(c)))
      .join(";");
  });
  return "\uFEFF" + [cabecalho.join(";"), ...linhas].join("\r\n") + "\r\n";
}

// GET /api/reports/csv?... (mesmos filtros) → arquivo para abrir no Excel
reportsRouter.get("/csv", validateQuery(filtroRelatorio), async (req, res) => {
  const f = res.locals.query as FiltroRelatorio;
  const r = await gerarRelatorio(req, f);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="relatorio-${f.from}-a-${f.to}.csv"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(relatorioEmCsv(r.items));
});
