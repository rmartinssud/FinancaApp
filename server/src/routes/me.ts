import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { prisma } from "../lib/prisma.js";
import { espacosDoUsuario } from "./familia.js";
import { DIAS_FATURA_MAX, podeReceber, preferenciasEfetivas } from "../services/alertas/preferencias.js";

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

// ─────────────────────────────────────────────
// Alertas por e-mail do usuário no espaço ativo
// ─────────────────────────────────────────────

async function preferenciasDoEspaco(userId: string, householdId: string, role: Parameters<typeof preferenciasEfetivas>[0]) {
  const salvo = await prisma.alertPreference.findUnique({ where: { userId_householdId_channel: { userId, householdId, channel: "EMAIL" } } });
  return preferenciasEfetivas(role, salvo);
}

// GET /api/me/alerts → { eligible, preferences: { budget, invoice, bills, invoiceDaysBefore } }
// eligible = false para quem só visualiza o espaço (não recebe alertas)
meRouter.get("/alerts", requireAuth, withHousehold, async (req, res) => {
  const h = req.household!;
  res.json({
    channel: "EMAIL",
    email: req.user!.email,
    household: { id: h.id, name: h.name, role: h.role },
    eligible: podeReceber(h.role),
    maxInvoiceDaysBefore: DIAS_FATURA_MAX,
    preferences: await preferenciasDoEspaco(req.user!.id, h.id, h.role),
  });
});

const prefsSchema = z.object({
  budget: z.boolean().optional(),
  invoice: z.boolean().optional(),
  bills: z.boolean().optional(),
  invoiceDaysBefore: z.number().int().min(1, "Escolha de 1 a 10 dias.").max(DIAS_FATURA_MAX, "Escolha de 1 a 10 dias.").optional(),
});

// PUT /api/me/alerts → muda só o que vier no corpo (o resto continua como está)
meRouter.put("/alerts", requireAuth, withHousehold, validateBody(prefsSchema), async (req, res) => {
  const h = req.household!;
  if (!podeReceber(h.role)) return res.status(403).json({ error: "Quem só visualiza o espaço não recebe alertas." });
  const atual = await preferenciasDoEspaco(req.user!.id, h.id, h.role);
  const novo = { ...atual, ...(req.body as z.infer<typeof prefsSchema>) };
  await prisma.alertPreference.upsert({
    where: { userId_householdId_channel: { userId: req.user!.id, householdId: h.id, channel: "EMAIL" } },
    create: { userId: req.user!.id, householdId: h.id, channel: "EMAIL", ...novo },
    update: novo,
  });
  res.json({ eligible: true, preferences: novo });
});
