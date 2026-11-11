import { Router, type Request } from "express";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import type { MemberRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { apagarArquivos, chavesDosLancamentos } from "../services/armazenamento.js";
import { env } from "../env.js";
import { sendEmail, emailComLink } from "../lib/email.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, requireRole } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { criarEspaco } from "../services/onboarding.js";

// ─────────────────────────────────────────────
// Espaços (um login, vários espaços), Família (membros e papéis) e Convites
// ─────────────────────────────────────────────

const DIAS_CONVITE = 7;
const papel = z.enum(["OWNER", "MEMBER", "VIEWER"], { error: "Use OWNER, MEMBER ou VIEWER." });
const nomeEspaco = z.object({ name: z.string().trim().min(1, "Dê um nome ao espaço.").max(60) });

export const NOME_PAPEL: Record<MemberRole, string> = {
  OWNER: "Dono",
  ADMIN: "Membro", // não usado: tratado como Membro
  MEMBER: "Membro",
  VIEWER: "Somente leitura",
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const linkConvite = (token: string) => `${env.FRONTEND_URL}/convite/${token}`;

// Novo token aleatório (vai só no link) e a data de validade
function novoToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + DIAS_CONVITE * 24 * 60 * 60 * 1000) };
}

// Emails de aviso nunca devem derrubar a requisição
function avisar(para: string[], assunto: string, titulo: string, mensagem: string, url: string, botao: string) {
  for (const to of para) {
    const { text, html } = emailComLink(titulo, mensagem, botao, url);
    sendEmail({ to, subject: `${assunto} - Finanças Pessoais`, text, html }).catch((e) => console.error("Falha ao enviar aviso:", e));
  }
}

async function emailsDosDonos(householdId: string, exceto?: string) {
  const donos = await prisma.householdMember.findMany({
    where: { householdId, role: "OWNER", ...(exceto ? { userId: { not: exceto } } : {}) },
    select: { user: { select: { email: true } } },
  });
  return donos.map((d) => d.user.email);
}

const contarDonos = (householdId: string) => prisma.householdMember.count({ where: { householdId, role: "OWNER" } });

async function enviarConvitePorEmail(email: string, espaco: string, quem: string, token: string) {
  const { text, html } = emailComLink(
    `Convite para "${espaco}"`,
    `${quem} convidou você para compartilhar as finanças no espaço "${espaco}" do Finanças Pessoais. O convite vale por ${DIAS_CONVITE} dias.`,
    "Entrar no espaço",
    linkConvite(token),
  );
  await sendEmail({ to: email, subject: `Convite para ${espaco} - Finanças Pessoais`, text, html });
}

// Lista de espaços do usuário (para o seletor no menu)
export async function espacosDoUsuario(userId: string, ativoId?: string) {
  const membros = await prisma.householdMember.findMany({
    where: { userId },
    include: { household: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return membros.map((m) => ({
    id: m.household.id,
    name: m.household.name,
    role: m.role,
    isPersonal: m.household.isPersonal,
    memberCount: m.household._count.members,
    active: m.household.id === ativoId,
  }));
}

// ── /api/households: meus espaços ─────────────
export const householdsRouter = Router();
householdsRouter.use(requireAuth);

// GET /api/households → espaços de que faço parte (o ativo vem com active = true)
householdsRouter.get("/", withHousehold, async (req, res) => {
  res.json(await espacosDoUsuario(req.user!.id, req.household!.id));
});

// POST /api/households { name } → cria um espaço (ex.: "Família Martins") e já deixa ativo
householdsRouter.post("/", validateBody(nomeEspaco), async (req, res) => {
  const { name } = req.body as z.infer<typeof nomeEspaco>;
  const espaco = await criarEspaco(req.user!, name);
  await prisma.user.update({ where: { id: req.user!.id }, data: { lastHouseholdId: espaco.id } });
  res.status(201).json({ id: espaco.id, name: espaco.name, role: "OWNER", isPersonal: false, memberCount: 1, active: true });
});

// POST /api/households/:id/activate → troca o espaço ativo (só se for membro)
householdsRouter.post("/:id/activate", async (req, res) => {
  const id = String(req.params.id);
  const membro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: id, userId: req.user!.id } } });
  if (!membro) return res.status(403).json({ error: "Você não faz parte deste espaço." });
  await prisma.user.update({ where: { id: req.user!.id }, data: { lastHouseholdId: id } });
  res.json({ ok: true, householdId: id });
});

// ── /api/family: o espaço ativo, membros e convites ──
export const familyRouter = Router();
familyRouter.use(requireAuth, withHousehold);
const soDono = requireRole("OWNER");

const novoConvite = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido.").nullable().optional(),
  role: papel.default("MEMBER"),
});
const mudarPapel = z.object({ role: papel });

function serializarConvite(c: { id: string; email: string | null; role: MemberRole; expiresAt: Date; createdAt: Date }) {
  return { id: c.id, email: c.email, role: c.role, expiresAt: c.expiresAt.toISOString(), createdAt: c.createdAt.toISOString() };
}

// GET /api/family → espaço ativo, membros e (para o dono) convites pendentes
familyRouter.get("/", async (req, res) => {
  const h = req.household!;
  const membros = await prisma.householdMember.findMany({
    where: { householdId: h.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const convites =
    h.role === "OWNER"
      ? await prisma.householdInvite.findMany({
          where: { householdId: h.id, acceptedAt: null, canceledAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : [];
  res.json({
    household: h,
    members: membros.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      isMe: m.user.id === req.user!.id,
    })),
    invites: convites.map(serializarConvite),
  });
});

// PATCH /api/family { name } → renomeia o espaço (dono)
familyRouter.patch("/", soDono, validateBody(nomeEspaco), async (req, res) => {
  const { name } = req.body as z.infer<typeof nomeEspaco>;
  const h = await prisma.household.update({ where: { id: req.household!.id }, data: { name } });
  res.json({ ...req.household, name: h.name });
});

// DELETE /api/family → apaga o espaço e TODOS os dados dele (dono; o espaço pessoal não pode)
familyRouter.delete("/", soDono, async (req, res) => {
  if (req.household!.isPersonal) return res.status(409).json({ error: "O seu espaço pessoal não pode ser apagado." });
  // Anexos de todos os lançamentos do espaço: buscar antes do delete em cascata
  const chaves = await chavesDosLancamentos({ householdId: req.household!.id });
  await prisma.household.delete({ where: { id: req.household!.id } });
  await apagarArquivos(chaves);
  res.status(204).end();
});

// POST /api/family/invites { email?, role } → cria convite. Com email, envia o link por email.
// Sem email, é um convite por link (para mandar no WhatsApp). O link volta só nesta resposta.
familyRouter.post("/invites", soDono, validateBody(novoConvite), async (req, res) => {
  const d = req.body as z.infer<typeof novoConvite>;
  const h = req.household!;
  if (d.email) {
    const jaMembro = await prisma.householdMember.findFirst({ where: { householdId: h.id, user: { email: d.email } } });
    if (jaMembro) return res.status(409).json({ error: "Essa pessoa já faz parte do espaço." });
  }
  const { token, tokenHash, expiresAt } = novoToken();
  const convite = await prisma.householdInvite.create({
    data: { householdId: h.id, email: d.email ?? null, role: d.role, tokenHash, expiresAt, invitedById: req.user!.id },
  });
  if (d.email) await enviarConvitePorEmail(d.email, h.name, req.user!.name, token);
  res.status(201).json({ invite: serializarConvite(convite), url: linkConvite(token) });
});

// POST /api/family/invites/:id/resend → gera um link novo (o antigo deixa de valer), +7 dias, reenvia o email
familyRouter.post("/invites/:id/resend", soDono, async (req, res) => {
  const h = req.household!;
  const atual = await prisma.householdInvite.findFirst({
    where: { id: String(req.params.id), householdId: h.id, acceptedAt: null, canceledAt: null },
  });
  if (!atual) return res.status(404).json({ error: "Convite não encontrado." });
  const { token, tokenHash, expiresAt } = novoToken();
  const convite = await prisma.householdInvite.update({ where: { id: atual.id }, data: { tokenHash, expiresAt } });
  if (convite.email) await enviarConvitePorEmail(convite.email, h.name, req.user!.name, token);
  res.json({ invite: serializarConvite(convite), url: linkConvite(token) });
});

// DELETE /api/family/invites/:id → cancela o convite
familyRouter.delete("/invites/:id", soDono, async (req, res) => {
  const r = await prisma.householdInvite.updateMany({
    where: { id: String(req.params.id), householdId: req.household!.id, acceptedAt: null, canceledAt: null },
    data: { canceledAt: new Date() },
  });
  if (r.count === 0) return res.status(404).json({ error: "Convite não encontrado." });
  res.status(204).end();
});

async function buscarMembro(req: Request) {
  return prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: req.household!.id, userId: String(req.params.userId) } },
    include: { user: { select: { name: true, email: true } } },
  });
}

// PATCH /api/family/members/:userId { role } → muda o papel (dono). O último dono não pode deixar de ser dono.
familyRouter.patch("/members/:userId", soDono, validateBody(mudarPapel), async (req, res) => {
  const { role } = req.body as z.infer<typeof mudarPapel>;
  const membro = await buscarMembro(req);
  if (!membro) return res.status(404).json({ error: "Membro não encontrado." });
  if (membro.role === "OWNER" && role !== "OWNER" && (await contarDonos(membro.householdId)) <= 1) {
    return res.status(409).json({ error: "O espaço precisa de pelo menos um dono." });
  }
  await prisma.householdMember.update({ where: { id: membro.id }, data: { role } });
  res.json({ userId: membro.userId, role });
});

// DELETE /api/family/members/:userId → remove alguém do espaço (dono). Não remove o último dono.
familyRouter.delete("/members/:userId", soDono, async (req, res) => {
  const membro = await buscarMembro(req);
  if (!membro) return res.status(404).json({ error: "Membro não encontrado." });
  if (membro.role === "OWNER" && (await contarDonos(membro.householdId)) <= 1) {
    return res.status(409).json({ error: "O espaço precisa de pelo menos um dono." });
  }
  await prisma.householdMember.delete({ where: { id: membro.id } });
  if (membro.userId !== req.user!.id) {
    avisar(
      [membro.user.email],
      `Você saiu de ${req.household!.name}`,
      `Você não faz mais parte de "${req.household!.name}"`,
      `${req.user!.name} removeu você do espaço "${req.household!.name}". Seus outros espaços continuam iguais.`,
      `${env.FRONTEND_URL}/app`,
      "Abrir o app",
    );
  }
  res.status(204).end();
});

// POST /api/family/leave → sair do espaço ativo. O último dono não pode sair (passe o papel antes).
familyRouter.post("/leave", async (req, res) => {
  const h = req.household!;
  if (h.role === "OWNER" && (await contarDonos(h.id)) <= 1) {
    return res.status(409).json({ error: "Você é o único dono. Passe o papel de dono para outra pessoa antes de sair." });
  }
  await prisma.householdMember.delete({ where: { householdId_userId: { householdId: h.id, userId: req.user!.id } } });
  avisar(
    await emailsDosDonos(h.id),
    `${req.user!.name} saiu de ${h.name}`,
    `${req.user!.name} saiu do espaço`,
    `${req.user!.name} (${req.user!.email}) saiu do espaço "${h.name}". Os lançamentos feitos por essa pessoa continuam no espaço.`,
    `${env.FRONTEND_URL}/app/familia`,
    "Ver a família",
  );
  res.status(204).end();
});

// ── /api/invites/:token: abrir e aceitar convite ──
export const invitesRouter = Router();

async function conviteValido(token: string) {
  const convite = await prisma.householdInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { household: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } },
  });
  if (!convite || convite.canceledAt || convite.acceptedAt) return { erro: "Este convite não vale mais. Peça um novo link." };
  if (convite.expiresAt <= new Date()) return { erro: "Este convite expirou. Peça um novo link." };
  return { convite };
}

// GET /api/invites/:token → dados públicos do convite (nome do espaço, quem convidou, papel)
invitesRouter.get("/:token", async (req, res) => {
  const { convite, erro } = await conviteValido(String(req.params.token));
  if (!convite) return res.status(404).json({ error: erro });
  res.json({
    householdName: convite.household.name,
    invitedBy: convite.invitedBy.name,
    role: convite.role,
    email: convite.email,
    expiresAt: convite.expiresAt.toISOString(),
  });
});

// POST /api/invites/:token/accept → entra no espaço com o papel do convite e deixa ele ativo
invitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const { convite, erro } = await conviteValido(String(req.params.token));
  if (!convite) return res.status(404).json({ error: erro });
  const user = req.user!;
  const householdId = convite.householdId;

  const jaMembro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId: user.id } } });
  if (!jaMembro) {
    await prisma.$transaction([
      prisma.householdMember.create({ data: { householdId, userId: user.id, role: convite.role } }),
      prisma.householdInvite.update({ where: { id: convite.id }, data: { acceptedAt: new Date(), acceptedBy: user.id } }),
    ]);
    avisar(
      await emailsDosDonos(householdId, user.id),
      `${user.name} entrou em ${convite.household.name}`,
      `${user.name} entrou no espaço`,
      `${user.name} (${user.email}) aceitou o convite e agora faz parte de "${convite.household.name}" como ${NOME_PAPEL[convite.role]}.`,
      `${env.FRONTEND_URL}/app/familia`,
      "Ver a família",
    );
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastHouseholdId: householdId } });
  res.json({ householdId, householdName: convite.household.name, role: jaMembro?.role ?? convite.role, alreadyMember: Boolean(jaMembro) });
});
