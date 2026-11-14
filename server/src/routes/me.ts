import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { prisma } from "../lib/prisma.js";
import { espacosDoUsuario } from "./familia.js";
import { DIAS_FATURA_MAX, podeReceber, preferenciasEfetivas } from "../services/alertas/preferencias.js";
import { whatsappConfig } from "../env.js";
import { formatarTelefone } from "../services/whatsapp/telefone.js";
import { podeUsarWhatsApp } from "../services/whatsapp/plano.js";
import type { AlertChannel } from "@prisma/client";

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
// Alertas do usuário no espaço ativo, por canal (?channel=EMAIL padrão, ou WHATSAPP)
// ─────────────────────────────────────────────

const canalQuery = z.object({ channel: z.enum(["EMAIL", "WHATSAPP"]).default("EMAIL") });
const lerCanal = (q: unknown): AlertChannel => canalQuery.safeParse(q).data?.channel ?? "EMAIL";

async function preferenciasDoEspaco(userId: string, householdId: string, role: Parameters<typeof preferenciasEfetivas>[0], channel: AlertChannel) {
  const salvo = await prisma.alertPreference.findUnique({ where: { userId_householdId_channel: { userId, householdId, channel } } });
  return preferenciasEfetivas(role, salvo, channel);
}

// WhatsApp: ligado no servidor, número ligado e plano permite
async function situacaoWhatsApp(userId: string, householdId: string) {
  const link = await prisma.whatsAppLink.findUnique({ where: { userId } });
  const enabled = Boolean(whatsappConfig()) && (await podeUsarWhatsApp({ userId, householdId }));
  return { enabled, linked: Boolean(link), phone: link ? formatarTelefone(link.phone) : null };
}

// GET /api/me/alerts → { eligible, preferences: { budget, invoice, bills, invoiceDaysBefore } }
// eligible = false para quem só visualiza o espaço (não recebe alertas) e, no WhatsApp, sem número ligado
meRouter.get("/alerts", requireAuth, withHousehold, async (req, res) => {
  const h = req.household!;
  const channel = lerCanal(req.query);
  const whatsapp = channel === "WHATSAPP" ? await situacaoWhatsApp(req.user!.id, h.id) : null;
  res.json({
    channel,
    email: req.user!.email,
    ...(whatsapp ? { whatsapp } : {}),
    household: { id: h.id, name: h.name, role: h.role },
    eligible: podeReceber(h.role) && (!whatsapp || (whatsapp.enabled && whatsapp.linked)),
    canReceive: podeReceber(h.role),
    maxInvoiceDaysBefore: DIAS_FATURA_MAX,
    preferences: await preferenciasDoEspaco(req.user!.id, h.id, h.role, channel),
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
  const channel = lerCanal(req.query);
  if (!podeReceber(h.role)) return res.status(403).json({ error: "Quem só visualiza o espaço não recebe alertas." });
  if (channel === "WHATSAPP") {
    const w = await situacaoWhatsApp(req.user!.id, h.id);
    if (!w.enabled) return res.status(403).json({ error: "O WhatsApp não está disponível." });
    if (!w.linked) return res.status(400).json({ error: "Ligue seu WhatsApp antes de escolher os alertas." });
  }
  const atual = await preferenciasDoEspaco(req.user!.id, h.id, h.role, channel);
  const novo = { ...atual, ...(req.body as z.infer<typeof prefsSchema>) };
  await prisma.alertPreference.upsert({
    where: { userId_householdId_channel: { userId: req.user!.id, householdId: h.id, channel } },
    create: { userId: req.user!.id, householdId: h.id, channel, ...novo },
    update: novo,
  });
  res.json({ eligible: true, preferences: novo });
});
