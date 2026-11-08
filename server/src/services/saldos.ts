import type { FinancialAccount } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Conta financeira no formato do JSON (Decimal vira texto "0.00")
export function serializarConta(c: FinancialAccount) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    initialBalance: c.initialBalance.toFixed(2),
    creditLimit: c.creditLimit?.toFixed(2) ?? null,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
  };
}

// Contas da família com o saldo atual:
// saldo inicial + receitas confirmadas − despesas confirmadas
export async function contasComSaldo(householdId: string, type?: FinancialAccount["type"]) {
  const contas = await prisma.financialAccount.findMany({
    where: { householdId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });

  const somas = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: { householdId, status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] } },
    _sum: { amount: true },
  });

  return contas.map((c) => {
    let saldo = c.initialBalance;
    for (const s of somas) {
      if (s.accountId !== c.id || !s._sum.amount) continue;
      saldo = s.type === "INCOME" ? saldo.plus(s._sum.amount) : saldo.minus(s._sum.amount);
    }
    return { ...serializarConta(c), currentBalance: saldo.toFixed(2) };
  });
}
