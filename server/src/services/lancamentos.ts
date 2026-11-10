import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Junta categoria, conta (e conta de destino, na transferência) em todo lançamento devolvido
const resumoCategoria = {
  id: true,
  name: true,
  color: true,
  icon: true,
  parentId: true,
  parent: { select: { id: true, name: true, color: true, icon: true } },
} satisfies Prisma.CategorySelect;

export const incluir = {
  category: { select: resumoCategoria },
  splits: { select: { id: true, amount: true, category: { select: resumoCategoria } }, orderBy: { amount: "desc" } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  attachments: { select: { id: true, originalName: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  account: { select: { id: true, name: true, type: true, bankLogo: true } },
  toAccount: { select: { id: true, name: true, type: true, bankLogo: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

export type LancamentoCompleto = Prisma.TransactionGetPayload<{ include: typeof incluir }>;

export function serializar(t: LancamentoCompleto) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount.toFixed(2),
    description: t.description,
    date: t.date.toISOString(),
    status: t.status,
    installmentNumber: t.installmentNumber,
    installmentTotal: t.installmentTotal,
    source: t.source,
    createdById: t.createdById,
    // Quem lançou (útil no espaço da família / cartão adicional)
    createdBy: t.createdBy,
    category: t.category,
    account: t.account,
    toAccount: t.toAccount,
    invoiceMonth: t.invoiceMonth,
    purchaseId: t.purchaseId,
    // Ajuste de saldo: mexe no saldo da conta, mas não é receita nem despesa do mês
    isAdjustment: t.isAdjustment,
    notes: t.notes,
    // Repetição: lançamentos do mesmo grupo (parcelar, repetir ou fixa mensal)
    groupId: t.groupId,
    recurrence: t.recurrence,
    // Atalhos para o app: compra no cartão ou pagamento de fatura
    // Campos extras do formulário (Nova despesa / Nova receita)
    launchDate: t.launchDate?.toISOString() ?? null,
    fees: t.fees?.toFixed(2) ?? null,
    discount: t.discount?.toFixed(2) ?? null,
    // Valor digitado antes de encargos e desconto ("amount" é o efetivo: o que conta em tudo)
    baseAmount: t.amount.minus(t.fees ?? 0).plus(t.discount ?? 0).toFixed(2),
    noAutoConfirm: t.noAutoConfirm,
    ignoreInStatistics: t.ignoreInStatistics,
    ignoreInBudgets: t.ignoreInBudgets,
    ignoreInMonthlySavings: t.ignoreInMonthlySavings,
    ignoreInTotals: t.ignoreInTotals,
    // Multicategorias: vazio = categoria única
    splits: t.splits.map((s) => ({ id: s.id, amount: s.amount.toFixed(2), category: s.category })),
    tags: t.tags.map((x) => x.tag),
    attachments: t.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    isCardExpense: t.type === "EXPENSE" && t.invoiceMonth !== null,
    isInvoicePayment: t.type === "TRANSFER" && t.invoiceMonth !== null,
  };
}

// Meses de fatura (de um cartão) que já têm algum pagamento confirmado.
// Compras nessas faturas ficam travadas para não desencontrar o valor pago.
export async function faturasComPagamento(householdId: string, cartaoId: string, meses: string[]) {
  if (meses.length === 0) return [];
  const pagos = await prisma.transaction.findMany({
    where: { householdId, toAccountId: cartaoId, type: "TRANSFER", invoiceMonth: { in: meses } },
    select: { invoiceMonth: true },
    distinct: ["invoiceMonth"],
  });
  return pagos.map((p) => p.invoiceMonth!);
}
