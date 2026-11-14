import express, { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { whatsappConfig } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { processarEmSegundoPlano, type PayloadWebhook } from "../services/whatsapp/bot.js";
import { formatarTelefone, normalizarTelefone } from "../services/whatsapp/telefone.js";
import { ESPERA_NOVO_CODIGO_SEG, VALIDADE_CODIGO_MIN, gerarCodigo, numeroDeOutraPessoa } from "../services/whatsapp/vinculo.js";
import { podeUsarWhatsApp } from "../services/whatsapp/plano.js";
import { espacosDoUsuario } from "./familia.js";

// ─────────────────────────────────────────────
// Webhook do Meta (/api/whatsapp/webhook) — corpo CRU, antes do express.json(),
// para conferir a assinatura X-Hub-Signature-256 sobre os bytes exatos.
// ─────────────────────────────────────────────

export const whatsappWebhookRouter = Router();

// GET: verificação do Meta ao cadastrar o webhook (hub.mode=subscribe & hub.verify_token & hub.challenge)
whatsappWebhookRouter.get("/", (req, res) => {
  const cfg = whatsappConfig();
  if (!cfg) return res.status(404).json({ error: "WhatsApp desligado." });
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const desafio = req.query["hub.challenge"];
  if (modo === "subscribe" && typeof token === "string" && iguais(token, cfg.verifyToken) && typeof desafio === "string") {
    return res.status(200).type("text/plain").send(desafio);
  }
  res.sendStatus(403);
});

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// "sha256=<hex>" = HMAC-SHA256(app secret, corpo cru)
export function assinaturaValida(corpo: Buffer, cabecalho: string | undefined, segredo: string) {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest("hex");
  const recebido = cabecalho.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(recebido)) return false;
  return timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(recebido, "hex"));
}

// POST: mensagens recebidas. Responde 200 na hora e processa em segundo plano (o Meta reenvia se demorar).
whatsappWebhookRouter.post("/", express.raw({ type: () => true, limit: "1mb" }), (req, res) => {
  const cfg = whatsappConfig();
  if (!cfg) return res.status(404).json({ error: "WhatsApp desligado." });
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!assinaturaValida(corpo, req.header("x-hub-signature-256"), cfg.appSecret)) return res.sendStatus(401);
  let payload: PayloadWebhook;
  try {
    payload = JSON.parse(corpo.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }
  res.sendStatus(200);
  processarEmSegundoPlano(payload);
});

// ─────────────────────────────────────────────
// Ligar o número no app (/api/whatsapp/link)
// ─────────────────────────────────────────────

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth, withHousehold);

const soDigitos = (s: string) => s.replace(/\D/g, "");

async function situacao(userId: string, householdAtivo: string) {
  const cfg = whatsappConfig();
  const [link, codigo, espacos] = await Promise.all([
    prisma.whatsAppLink.findUnique({ where: { userId }, include: { household: { select: { id: true, name: true } } } }),
    prisma.whatsAppLinkCode.findUnique({ where: { userId } }),
    espacosDoUsuario(userId, householdAtivo),
  ]);
  const enabled = Boolean(cfg) && (await podeUsarWhatsApp({ userId, householdId: householdAtivo }));
  const botNumber = cfg?.botNumber ?? null;
  // O espaço padrão ainda vale? (a pessoa pode ter saído dele)
  const espacoValido = link?.householdId && espacos.some((e) => e.id === link.householdId) ? link.household : null;
  return {
    enabled,
    botNumber,
    botLink: botNumber ? `https://wa.me/${soDigitos(botNumber)}` : null,
    link: link
      ? { phone: formatarTelefone(link.phone), household: espacoValido, linkedAt: link.linkedAt.toISOString() }
      : null,
    pending: codigo && codigo.expiresAt > new Date() ? { phone: formatarTelefone(codigo.phone), expiresAt: codigo.expiresAt.toISOString() } : null,
    households: espacos.map((e) => ({ id: e.id, name: e.name, role: e.role, active: e.active })),
  };
}

// GET /api/whatsapp/link → situação (ligado? código pendente? espaços para escolher)
whatsappRouter.get("/link", async (req, res) => {
  res.json(await situacao(req.user!.id, req.household!.id));
});

const inicio = z.object({
  phone: z.string().trim().min(8, "Digite o número com DDD.").max(25, "Número grande demais."),
  householdId: z.string().min(1).optional(),
});

// POST /api/whatsapp/link { phone, householdId? } → gera o código de 6 dígitos (aparece só agora)
whatsappRouter.post("/link", validateBody(inicio), async (req, res) => {
  const d = req.body as z.infer<typeof inicio>;
  const userId = req.user!.id;
  if (!whatsappConfig()) return res.status(503).json({ error: "O WhatsApp ainda não está disponível." });
  const householdId = d.householdId ?? req.household!.id;
  if (!(await podeUsarWhatsApp({ userId, householdId }))) return res.status(403).json({ error: "O WhatsApp não está disponível no seu plano." });

  const telefone = normalizarTelefone(d.phone);
  if (!telefone) return res.status(400).json({ error: "Dados inválidos.", detalhes: { phone: ["Número inválido. Use DDD + número, ex.: (21) 99999-8888."] } });

  const membro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
  if (!membro) return res.status(403).json({ error: "Você não faz parte deste espaço." });

  if (await numeroDeOutraPessoa(telefone, userId)) {
    return res.status(409).json({ error: "Este número já está ligado a outra conta do Famicash." });
  }
  const anterior = await prisma.whatsAppLinkCode.findUnique({ where: { userId } });
  if (anterior && Date.now() - anterior.createdAt.getTime() < ESPERA_NOVO_CODIGO_SEG * 1000) {
    return res.status(429).json({ error: "Aguarde alguns segundos para gerar outro código." });
  }

  const { codigo, expiresAt } = await gerarCodigo(userId, telefone, householdId);
  const botNumber = whatsappConfig()!.botNumber;
  res.status(201).json({
    code: codigo,
    expiresAt: expiresAt.toISOString(),
    validMinutes: VALIDADE_CODIGO_MIN,
    phone: formatarTelefone(telefone),
    botNumber,
    // Abre a conversa com o bot já com o código escrito
    waLink: `https://wa.me/${soDigitos(botNumber)}?text=${encodeURIComponent(`Famicash ${codigo}`)}`,
  });
});

const ajuste = z.object({ householdId: z.string().min(1) });

// PUT /api/whatsapp/link { householdId } → muda o espaço padrão do bot
whatsappRouter.put("/link", validateBody(ajuste), async (req, res) => {
  const { householdId } = req.body as z.infer<typeof ajuste>;
  const userId = req.user!.id;
  const link = await prisma.whatsAppLink.findUnique({ where: { userId } });
  if (!link) return res.status(404).json({ error: "Seu WhatsApp não está ligado." });
  const membro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
  if (!membro) return res.status(403).json({ error: "Você não faz parte deste espaço." });
  await prisma.whatsAppLink.update({ where: { userId }, data: { householdId } });
  res.json(await situacao(userId, req.household!.id));
});

// DELETE /api/whatsapp/link → desliga o WhatsApp (o bot passa a tratar o número como desconhecido)
whatsappRouter.delete("/link", async (req, res) => {
  const userId = req.user!.id;
  await prisma.$transaction([
    prisma.whatsAppDraft.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELED" } }),
    prisma.whatsAppLinkCode.deleteMany({ where: { userId } }),
    prisma.whatsAppLink.deleteMany({ where: { userId } }),
  ]);
  res.status(204).end();
});
