import { Router } from "express";
import { z } from "zod";
import { Prisma, type Tag } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";

export const tagsRouter = Router();

// Tags do espaço ativo. VIEWER só lê.
tagsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const novaTag = z.object({
  name: z.string().trim().min(1, "Escreva o nome da tag.").max(30, "Até 30 caracteres."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.").nullable().optional(),
});
const edicaoTag = novaTag.partial();

const serializar = (t: Tag & { _count?: { transactions: number } }) => ({
  id: t.id,
  name: t.name,
  color: t.color,
  ...(t._count ? { usage: t._count.transactions } : {}),
});

const repetida = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const ERRO_REPETIDA = { error: "Já existe uma tag com esse nome.", detalhes: { name: ["Já existe uma tag com esse nome."] } };

// GET /api/tags → tags do espaço (A–Z), com quantos lançamentos usam cada uma
tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.findMany({
    where: scope(req),
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });
  res.json(tags.map(serializar));
});

// POST /api/tags → cria uma tag
tagsRouter.post("/", validateBody(novaTag), async (req, res) => {
  try {
    const tag = await prisma.tag.create({ data: { ...scope(req), ...req.body } });
    res.status(201).json(serializar(tag));
  } catch (e) {
    if (repetida(e)) return res.status(409).json(ERRO_REPETIDA);
    throw e;
  }
});

// PATCH /api/tags/:id → renomeia ou troca a cor
tagsRouter.patch("/:id", validateBody(edicaoTag), async (req, res) => {
  const atual = await prisma.tag.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Tag não encontrada." });
  try {
    const tag = await prisma.tag.update({ where: { id: atual.id }, data: req.body });
    res.json(serializar(tag));
  } catch (e) {
    if (repetida(e)) return res.status(409).json(ERRO_REPETIDA);
    throw e;
  }
});

// DELETE /api/tags/:id → apaga a tag (os lançamentos continuam, só sem ela)
tagsRouter.delete("/:id", async (req, res) => {
  const atual = await prisma.tag.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Tag não encontrada." });
  await prisma.tag.delete({ where: { id: atual.id } });
  res.status(204).end();
});
