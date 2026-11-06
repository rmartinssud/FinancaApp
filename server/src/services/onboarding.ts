import { prisma } from "../lib/prisma.js";

// Categorias padrão criadas para toda família nova
export const CATEGORIAS_PADRAO = [
  { name: "Mercado", type: "EXPENSE", color: "#22c55e", icon: "cart" },
  { name: "Moradia", type: "EXPENSE", color: "#464fa3", icon: "home" },
  { name: "Transporte", type: "EXPENSE", color: "#f59e0b", icon: "car" },
  { name: "Saúde", type: "EXPENSE", color: "#ef4444", icon: "heart" },
  { name: "Lazer", type: "EXPENSE", color: "#ec4899", icon: "smile" },
  { name: "Educação", type: "EXPENSE", color: "#8b5cf6", icon: "book" },
  { name: "Contas", type: "EXPENSE", color: "#64748b", icon: "receipt" },
  { name: "Salário", type: "INCOME", color: "#2ca9bc", icon: "briefcase" },
  { name: "Freelance", type: "INCOME", color: "#0891b2", icon: "laptop" },
  { name: "Outros", type: "INCOME", color: "#737dd9", icon: "plus" },
] as const;

// Chamado logo após o cadastro: cria a família (dono = usuário),
// a conta "Carteira" e as categorias padrão, tudo de uma vez.
export async function criarFamiliaInicial(user: { id: string; name: string }) {
  const primeiroNome = user.name.trim().split(" ")[0] || "Minha";

  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: `Família ${primeiroNome}` },
    });

    await tx.householdMember.create({
      data: { householdId: household.id, userId: user.id, role: "OWNER" },
    });

    await tx.financialAccount.create({
      data: { householdId: household.id, name: "Carteira", type: "WALLET", initialBalance: 0 },
    });

    await tx.category.createMany({
      data: CATEGORIAS_PADRAO.map((c) => ({ ...c, householdId: household.id })),
    });

    return household;
  });
}
