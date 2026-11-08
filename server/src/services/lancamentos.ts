import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Junta categoria, conta (e conta de destino, na transferência) em todo lançamento devolvido
export const incluir = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  account: { select: { id: true, name: true, type: true } },
  toAccount: { select: { id: true, name: true, type: true } },
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
    category: t.category,
    account: t.account,
    toAccount: t.toAccount,
    invoiceMonth: t.invoiceMonth,
    purchaseId: t.purchaseId,
    // Atalhos para o app: compra no cartão ou pagamento de fatura
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
