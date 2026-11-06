import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";

export const meRouter = Router();

// GET /api/me → dados do usuário logado e da família dele
meRouter.get("/", requireAuth, withHousehold, (req, res) => {
  const u = req.user!;
  res.json({
    user: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, twoFactorEnabled: Boolean(u.twoFactorEnabled) },
    household: req.household,
  });
});
