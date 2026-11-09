import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";
import { espacosDoUsuario } from "./familia.js";

export const meRouter = Router();

// GET /api/me → dados do usuário logado, o espaço ativo e a lista de espaços dele
meRouter.get("/", requireAuth, withHousehold, async (req, res) => {
  const u = req.user!;
  res.json({
    user: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, twoFactorEnabled: Boolean(u.twoFactorEnabled) },
    household: req.household,
    households: await espacosDoUsuario(u.id, req.household!.id),
  });
});
