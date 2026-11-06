import type { Request, Response, NextFunction } from "express";
import type { MemberRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Descobre a família (household) do usuário logado e coloca em req.household.
// TODA rota de dados deve usar este middleware depois do requireAuth.
// No futuro, o usuário poderá escolher a família pelo header "X-Household-Id".
export async function withHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Você precisa entrar na sua conta." });

    const escolhida = req.header("x-household-id");
    const membro = await prisma.householdMember.findFirst({
      where: { userId: req.user.id, ...(escolhida ? { householdId: escolhida } : {}) },
      include: { household: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membro) return res.status(403).json({ error: "Você não faz parte desta família." });

    req.household = { id: membro.household.id, name: membro.household.name, role: membro.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Filtro pronto para usar no "where" do Prisma: só dados da família do usuário.
// Exemplo: prisma.transaction.findMany({ where: { ...scope(req), status: "PENDING" } })
export function scope(req: Request) {
  if (!req.household) throw new Error("withHousehold não foi usado nesta rota");
  return { householdId: req.household.id };
}

// Permite a rota só para alguns papéis. Ex.: requireRole("OWNER", "ADMIN")
export function requireRole(...roles: MemberRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.household || !roles.includes(req.household.role)) {
      return res.status(403).json({ error: "Você não tem permissão para isso." });
    }
    next();
  };
}
