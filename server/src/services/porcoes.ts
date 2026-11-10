import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ZERO, partesLocais } from "../lib/money.js";

// ─────────────────────────────────────────────
// Porções de um lançamento por categoria.
// Sem multicategorias: uma porção (categoria do lançamento, valor efetivo).
// Com multicategorias: uma porção por linha da divisão (a soma bate com o valor efetivo).
// Subcategorias: "agregar" troca a filha pela categoria-pai.
// ─────────────────────────────────────────────

export type LancamentoParaPorcoes = {
  amount: Prisma.Decimal;
  categoryId: string | null;
  splits: { categoryId: string | null; amount: Prisma.Decimal }[];
};

export const selecionarPorcoes = {
  amount: true,
  categoryId: true,
  splits: { select: { categoryId: true, amount: true } },
} satisfies Prisma.TransactionSelect;

export function porcoes(t: LancamentoParaPorcoes) {
  if (t.splits.length) return t.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount }));
  return [{ categoryId: t.categoryId, amount: t.amount }];
}

// Mapa categoria → categoria-pai (só das que têm pai) do espaço
export async function mapaDePais(householdId: string) {
  const filhas = await prisma.category.findMany({ where: { householdId, parentId: { not: null } }, select: { id: true, parentId: true } });
  return new Map(filhas.map((c) => [c.id, c.parentId!]));
}

// Categoria escolhida + as subcategorias dela
export async function comSubcategorias(householdId: string, ids: string[]) {
  if (!ids.length) return [];
  const filhas = await prisma.category.findMany({ where: { householdId, parentId: { in: ids } }, select: { id: true } });
  return [...new Set([...ids, ...filhas.map((f) => f.id)])];
}

// Soma por categoria (agregando subcategorias na pai quando "pais" é passado).
// chave null = sem categoria
export function somarPorCategoria(lista: LancamentoParaPorcoes[], pais?: Map<string, string>) {
  const somas = new Map<string | null, Prisma.Decimal>();
  for (const t of lista) {
    for (const p of porcoes(t)) {
      const chave = p.categoryId && pais ? (pais.get(p.categoryId) ?? p.categoryId) : p.categoryId;
      somas.set(chave, (somas.get(chave) ?? ZERO).plus(p.amount));
    }
  }
  return somas;
}

// Quanto do lançamento cai nas categorias pedidas (multicategorias: só as partes dessas categorias)
export function valorNasCategorias(t: LancamentoParaPorcoes, categorias: Set<string>) {
  return porcoes(t).reduce((s, p) => (p.categoryId && categorias.has(p.categoryId) ? s.plus(p.amount) : s), ZERO);
}

// Filtro do Prisma: lançamentos com a categoria OU com alguma parte da divisão nessas categorias
export function filtroCategorias(ids: string[]): Prisma.TransactionWhereInput {
  return { OR: [{ categoryId: { in: ids } }, { splits: { some: { categoryId: { in: ids } } } }] };
}

// Mês de competência: compras no cartão pelo mês da fatura, o resto pela data
export const mesDoLancamento = (t: { invoiceMonth: string | null; date: Date }) => t.invoiceMonth ?? partesLocais(t.date).mes;
