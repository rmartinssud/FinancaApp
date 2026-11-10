import { Prisma, type FinancialAccount } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Conta financeira no formato do JSON (Decimal vira texto "0.00")
export function serializarConta(c: FinancialAccount) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    initialBalance: c.initialBalance.toFixed(2),
    creditLimit: c.creditLimit?.toFixed(2) ?? null,
    overdraftLimit: c.overdraftLimit?.toFixed(2) ?? null,
    bankLogo: c.bankLogo,
    accountNumber: c.accountNumber,
    notes: c.notes,
    isDefault: c.isDefault,
    showOnSummary: c.showOnSummary,
    ignoreInTotals: c.ignoreInTotals,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
    brand: c.brand,
    color: c.color,
    paymentAccountId: c.paymentAccountId,
    archivedAt: c.archivedAt?.toISOString() ?? null,
  };
}

// Saldo atual e quanto dá para gastar: saldo + limite do cheque especial (se tiver)
export function saldoEDisponivel(c: FinancialAccount, saldo: Prisma.Decimal) {
  const limite = c.overdraftLimit ?? new Prisma.Decimal(0);
  return { currentBalance: saldo.toFixed(2), availableBalance: saldo.plus(limite).toFixed(2) };
}

// Contas da família com o saldo atual:
// saldo inicial + receitas − despesas + transferências recebidas − transferências enviadas
// (só lançamentos confirmados; ajustes de saldo entram aqui como receita/despesa da conta). Compras no cartão (com invoiceMonth) não mexem em saldo de conta:
// o dinheiro só sai da conta quando a fatura é paga (uma transferência para o cartão).
export async function contasComSaldo(householdId: string, type?: FinancialAccount["type"]) {
  const contas = await prisma.financialAccount.findMany({
    where: { householdId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });

  const confirmados = { householdId, status: "CONFIRMED" as const };
  const [somas, enviadas, recebidas] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { ...confirmados, type: { in: ["INCOME", "EXPENSE"] }, invoiceMonth: null },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { ...confirmados, type: "TRANSFER" },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["toAccountId"],
      where: { ...confirmados, type: "TRANSFER", toAccountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  return contas.map((c) => {
    let saldo = c.initialBalance;
    for (const s of somas) {
      if (s.accountId !== c.id || !s._sum.amount) continue;
      saldo = s.type === "INCOME" ? saldo.plus(s._sum.amount) : saldo.minus(s._sum.amount);
    }
    const saiu = enviadas.find((s) => s.accountId === c.id)?._sum.amount;
    const entrou = recebidas.find((s) => s.toAccountId === c.id)?._sum.amount;
    if (saiu) saldo = saldo.minus(saiu);
    if (entrou) saldo = saldo.plus(entrou);
    return { ...serializarConta(c), ...saldoEDisponivel(c, saldo) };
  });
}
