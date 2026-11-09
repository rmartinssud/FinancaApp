import type { Request, Response, NextFunction } from "express";
import type { MemberRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Descobre o espaço (household) ativo do usuário logado e coloca em req.household.
// TODA rota de dados deve usar este middleware depois do requireAuth.
// Ordem: header "X-Household-Id" (precisa ser membro, senão 403) → último espaço usado
// (User.lastHouseholdId) → espaço mais antigo. Sempre confere a participação no banco.
export async function withHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Você precisa entrar na sua conta." });

    const escolhida = req.header("x-household-id");
    let membro = null;
    if (escolhida) {
      membro = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: escolhida, userId: req.user.id } },
        include: { household: true },
      });
      if (!membro) return res.status(403).json({ error: "Você não faz parte deste espaço." });
    } else {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { lastHouseholdId: true } });
      if (u?.lastHouseholdId) {
        membro = await prisma.householdMember.findUnique({
          where: { householdId_userId: { householdId: u.lastHouseholdId, userId: req.user.id } },
          include: { household: true },
        });
      }
      membro ??= await prisma.householdMember.findFirst({
        where: { userId: req.user.id },
        include: { household: true },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!membro) return res.status(403).json({ error: "Você não faz parte deste espaço." });

    req.household = {
      id: membro.household.id,
      name: membro.household.name,
      role: membro.role,
      isPersonal: membro.household.isPersonal,
    };
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

// Leitura liberada para todos; criar, alterar e apagar não é permitido para VIEWER.
// Use em routers de dados depois do withHousehold.
export function bloqueiaSomenteLeitura(req: Request, res: Response, next: NextFunction) {
  const leitura = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (!leitura && req.household?.role === "VIEWER") {
    return res.status(403).json({ error: "Seu acesso é somente leitura." });
  }
  next();
}
