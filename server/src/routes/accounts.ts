import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope } from "../middleware/household.js";
import { validateQuery } from "../middleware/validate.js";

export const accountsRouter = Router();

// Todas as rotas daqui exigem login e família
accountsRouter.use(requireAuth, withHousehold);

const filtro = z.object({
  type: z.enum(["WALLET", "BANK", "CREDIT_CARD"]).optional(),
});

// GET /api/accounts?type=WALLET → contas da família do usuário
accountsRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { type } = res.locals.query as z.infer<typeof filtro>;

  const contas = await prisma.financialAccount.findMany({
    where: { ...scope(req), ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });

  // Decimal vira texto ("0.00") para não perder centavos no JSON
  res.json(
    contas.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      initialBalance: c.initialBalance.toFixed(2),
      creditLimit: c.creditLimit?.toFixed(2) ?? null,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
    })),
  );
});
