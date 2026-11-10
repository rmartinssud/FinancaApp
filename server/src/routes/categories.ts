import { Router, type Request } from "express";
import { z } from "zod";
import type { Category } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateQuery, validateBody } from "../middleware/validate.js";

export const categoriesRouter = Router();

// Todas as rotas daqui exigem login e família. VIEWER só lê.
categoriesRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const tipoCategoria = z.enum(["INCOME", "EXPENSE"]);
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.");

const filtro = z.object({
  type: tipoCategoria.optional(),
});

const novaCategoria = z.object({
  name: z.string().trim().min(1).max(40),
  type: tipoCategoria,
  color: cor,
  icon: z.string().trim().min(1).max(30),
  // Subcategoria: id da categoria-pai (um nível só). Vazio = categoria principal.
  parentId: z.string().min(1).nullable().optional(),
});

// O tipo não muda depois de criada (os lançamentos dependem dele)
const edicaoCategoria = novaCategoria.omit({ type: true }).partial();

function serializar(c: Category) {
  return { id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon, parentId: c.parentId };
}

// Confere a categoria-pai: do espaço, do mesmo tipo e principal (não pode ser subcategoria)
async function conferirPai(req: Request, parentId: string, type: string, propriaId?: string) {
  if (parentId === propriaId) return "Uma categoria não pode ser subcategoria dela mesma.";
  const pai = await prisma.category.findFirst({ where: { id: parentId, ...scope(req) } });
  if (!pai) return "Categoria principal não encontrada.";
  if (pai.parentId) return "Subcategoria não pode ter subcategorias (só um nível).";
  if (pai.type !== type) return "A subcategoria precisa ser do mesmo tipo da categoria principal.";
  if (propriaId && (await prisma.category.count({ where: { parentId: propriaId } }))) {
    return "Esta categoria tem subcategorias: ela não pode virar subcategoria.";
  }
  return null;
}

// GET /api/categories?type=EXPENSE → categorias da família, em ordem alfabética
categoriesRouter.get("/", validateQuery(filtro), async (req, res) => {
  const { type } = res.locals.query as z.infer<typeof filtro>;
  const categorias = await prisma.category.findMany({
    where: { ...scope(req), ...(type ? { type } : {}) },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  res.json(categorias.map(serializar));
});

// POST /api/categories → cria uma categoria
categoriesRouter.post("/", validateBody(novaCategoria), async (req, res) => {
  const d = req.body as z.infer<typeof novaCategoria>;
  if (d.parentId) {
    const erro = await conferirPai(req, d.parentId, d.type);
    if (erro) return res.status(400).json({ error: erro, detalhes: { parentId: [erro] } });
  }
  const categoria = await prisma.category.create({ data: { ...scope(req), ...req.body } });
  res.status(201).json(serializar(categoria));
});

// PATCH /api/categories/:id → altera nome, cor ou ícone
categoriesRouter.patch("/:id", validateBody(edicaoCategoria), async (req, res) => {
  const atual = await prisma.category.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Categoria não encontrada." });
  const d = req.body as z.infer<typeof edicaoCategoria>;
  if (d.parentId) {
    const erro = await conferirPai(req, d.parentId, atual.type, atual.id);
    if (erro) return res.status(400).json({ error: erro, detalhes: { parentId: [erro] } });
  }

  const categoria = await prisma.category.update({ where: { id: atual.id }, data: req.body });
  res.json(serializar(categoria));
});

// DELETE /api/categories/:id → apaga a categoria (e as subcategorias dela); os lançamentos ficam "sem categoria"
categoriesRouter.delete("/:id", async (req, res) => {
  const atual = await prisma.category.findFirst({ where: { id: String(req.params.id), ...scope(req) } });
  if (!atual) return res.status(404).json({ error: "Categoria não encontrada." });

  await prisma.category.delete({ where: { id: atual.id } });
  res.status(204).end();
});
