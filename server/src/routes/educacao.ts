import { Router, type Request, type Response } from "express";
import type { ContentVisibility, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { armazenamento } from "../services/armazenamento.js";
import { sessaoOpcional, type Leitor } from "../services/educacao/papeis.js";
import { maisRestrita, noAr, podeAbrir, podeVerNoPainel, textoPuro, visiveisNaLista, ehChaveValida } from "../services/educacao/regras.js";
import { cartaoConteudo, cartaoCurso, conteudoCompleto, incluirCartao, serializarCategoria } from "../services/educacao/serializar.js";

// ─────────────────────────────────────────────
// Educação financeira: páginas públicas (/educacao) e dentro do app (/app/educacao).
// Sem login: vê o que é PUBLIC por inteiro e, do que é REGISTERED, só título, resumo e capa (locked = true).
// Com login (qualquer plano, inclusive o grátis): vê PUBLIC e REGISTERED e marca aulas como concluídas.
// VIP é reservado para o futuro: não aparece em listas e só o ADMIN abre.
// ─────────────────────────────────────────────

export const educacaoRouter = Router();

const leitorDe = (res: Response) => (res.locals.leitor ?? null) as Leitor | null;

// Minúsculas e sem acentos, para a busca achar "divida" em "Dívida"
const normalizar = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

async function concluidos(leitor: Leitor | null, ids: string[]) {
  if (!leitor || !ids.length) return new Set<string>();
  const feitos = await prisma.eduProgress.findMany({ where: { userId: leitor.id, contentId: { in: ids } }, select: { contentId: true } });
  return new Set(feitos.map((f) => f.contentId));
}

// Aulas no ar de cada curso (para contar)
async function aulasNoAr(courseIds: string[]) {
  if (!courseIds.length) return new Map<string, string[]>();
  const aulas = await prisma.eduCourseLesson.findMany({
    where: { courseId: { in: courseIds }, content: { ...noAr(), visibility: visiveisNaLista } },
    select: { courseId: true, contentId: true },
    orderBy: { position: "asc" },
  });
  const mapa = new Map<string, string[]>();
  for (const a of aulas) mapa.set(a.courseId, [...(mapa.get(a.courseId) ?? []), a.contentId]);
  return mapa;
}

const consultaHome = z.object({
  q: z.string().max(100).optional(),
  categoria: z.string().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(60).default(24),
});

// GET /api/educacao?q=&categoria= → destaques, últimos conteúdos, cursos e categorias
educacaoRouter.get("/", sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res);
  const { q, categoria, limite } = consultaHome.safeParse(req.query).data ?? { limite: 24 };
  const filtrando = Boolean(q?.trim() || categoria);
  const cat = categoria ? await prisma.eduCategory.findUnique({ where: { slug: categoria } }) : null;
  const filtroCategoria = categoria ? { categoryId: cat?.id ?? "__nenhuma__" } : {};

  const [conteudos, cursos, categorias] = await Promise.all([
    prisma.eduContent.findMany({
      where: { ...noAr(), visibility: visiveisNaLista, listed: true, ...filtroCategoria },
      include: incluirCartao,
      orderBy: { publishedAt: "desc" },
      take: q ? 500 : limite + 6,
    }),
    prisma.eduCourse.findMany({
      where: { ...noAr(), visibility: visiveisNaLista, ...filtroCategoria },
      include: incluirCartao,
      orderBy: { publishedAt: "desc" },
      take: q ? 200 : 60,
    }),
    prisma.eduCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);

  // Busca: todas as palavras precisam aparecer (título, resumo, tags, texto)
  const termos = normalizar(q ?? "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const casa = (texto: string) => {
    const n = normalizar(texto);
    return termos.every((t) => n.includes(t));
  };
  const achadosConteudo = termos.length ? conteudos.filter((c) => casa(`${c.title} ${c.summary} ${c.tags.join(" ")} ${c.category?.name ?? ""} ${textoPuro(c.body)}`)) : conteudos;
  const achadosCursos = termos.length ? cursos.filter((c) => casa(`${c.title} ${c.summary} ${c.tags.join(" ")} ${c.category?.name ?? ""} ${textoPuro(c.description)}`)) : cursos;

  const aulas = await aulasNoAr(achadosCursos.map((c) => c.id));
  const feitos = await concluidos(leitor, [...achadosConteudo.map((c) => c.id), ...[...aulas.values()].flat()]);
  const cartaoC = (c: (typeof conteudos)[number]) => cartaoConteudo(c, { locked: !podeAbrir(c.visibility, leitor), completed: leitor ? feitos.has(c.id) : undefined });
  const cartaoK = (c: (typeof cursos)[number]) => {
    const ids = aulas.get(c.id) ?? [];
    return cartaoCurso(c, { locked: !podeAbrir(c.visibility, leitor), lessonsCount: ids.length, completedCount: leitor ? ids.filter((i) => feitos.has(i)).length : undefined });
  };

  const destaques = filtrando
    ? []
    : [...cursos.filter((c) => c.featured).map(cartaoK), ...conteudos.filter((c) => c.featured).map(cartaoC)].slice(0, 6);

  // Só categorias com algo publicado (para o filtro não mostrar opção vazia)
  const usadas = new Set(
    (
      await prisma.eduContent.findMany({ where: { ...noAr(), visibility: visiveisNaLista, listed: true, categoryId: { not: null } }, select: { categoryId: true }, distinct: ["categoryId"] })
    ).map((c) => c.categoryId),
  );
  for (const c of await prisma.eduCourse.findMany({ where: { ...noAr(), visibility: visiveisNaLista, categoryId: { not: null } }, select: { categoryId: true }, distinct: ["categoryId"] }))
    usadas.add(c.categoryId);

  res.json({
    loggedIn: Boolean(leitor),
    featured: destaques,
    contents: achadosConteudo.slice(0, limite).map(cartaoC),
    courses: achadosCursos.map(cartaoK),
    total: { contents: achadosConteudo.length, courses: achadosCursos.length },
    categories: categorias.filter((c) => usadas.has(c.id)).map(serializarCategoria),
    category: serializarCategoria(cat),
  });
});

// Busca o conteúdo pelo slug. No ar para todos; rascunho só para a equipe (prévia).
async function acharConteudo(where: Prisma.EduContentWhereUniqueInput, leitor: Leitor | null) {
  const c = await prisma.eduContent.findUnique({ where, include: { ...incluirCartao, materials: true } });
  if (!c) return null;
  const publicado = c.status === "PUBLISHED" && c.publishedAt && c.publishedAt <= new Date();
  if (publicado && (c.visibility !== "VIP" || leitor?.papel === "ADMIN")) return { c, preview: false };
  if (leitor && (leitor.papel === "ADMIN" || leitor.papel === "EDITOR") && podeVerNoPainel(c, leitor)) return { c, preview: true };
  return null;
}

async function acharCurso(slug: string, leitor: Leitor | null) {
  const k = await prisma.eduCourse.findUnique({
    where: { slug },
    include: { ...incluirCartao, lessons: { orderBy: { position: "asc" }, include: { content: { include: incluirCartao } } } },
  });
  if (!k) return null;
  const publicado = k.status === "PUBLISHED" && k.publishedAt && k.publishedAt <= new Date();
  const equipe = Boolean(leitor && (leitor.papel === "ADMIN" || leitor.papel === "EDITOR") && podeVerNoPainel(k, leitor));
  if (!(publicado && (k.visibility !== "VIP" || leitor?.papel === "ADMIN")) && !equipe) return null;
  const agora = new Date();
  // Prévia da equipe mostra todas as aulas; o público só as que estão no ar
  const aulas = k.lessons.filter(
    (l) => (equipe && !publicado) || (l.content.status === "PUBLISHED" && l.content.publishedAt && l.content.publishedAt <= agora && l.content.visibility !== "VIP"),
  );
  return { k, aulas, preview: !publicado };
}

// GET /api/educacao/conteudos/:slug
educacaoRouter.get("/conteudos/:slug", sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res);
  const achado = await acharConteudo({ slug: String(req.params.slug) }, leitor);
  if (!achado) return res.status(404).json({ error: "Conteúdo não encontrado." });
  const { c, preview } = achado;
  const visibility = await visibilidadeEfetiva(c);
  const locked = !preview && !podeAbrir(visibility, leitor);
  const feitos = await concluidos(leitor, [c.id]);
  // Cursos (no ar) de que este conteúdo faz parte
  const cursos = await prisma.eduCourse.findMany({ where: { ...noAr(), visibility: visiveisNaLista, lessons: { some: { contentId: c.id } } }, select: { slug: true, title: true } });
  res.json({ ...conteudoCompleto(c, { locked, completed: leitor ? feitos.has(c.id) : undefined }), visibility, preview, loggedIn: Boolean(leitor), courses: cursos });
});

function montarCurso(achado: NonNullable<Awaited<ReturnType<typeof acharCurso>>>, leitor: Leitor | null, feitos: Set<string>) {
  const { k, aulas } = achado;
  const locked = !podeAbrir(k.visibility, leitor);
  const lessons = aulas.map((l, i) => {
    const efetiva: ContentVisibility = maisRestrita(k.visibility, l.content.visibility);
    return { ...cartaoConteudo(l.content, { locked: !podeAbrir(efetiva, leitor), completed: leitor ? feitos.has(l.content.id) : undefined }), visibility: efetiva, position: i + 1 };
  });
  return {
    ...cartaoCurso(k, { locked, lessonsCount: lessons.length, completedCount: leitor ? lessons.filter((l) => l.completed).length : undefined }),
    author: k.author ? { id: k.author.id, name: k.author.name, bio: k.author.bio ?? "", photoUrl: k.author.photoKey ? `/api/educacao/capas/${k.author.photoKey}` : null } : null,
    description: k.description,
    seoTitle: k.seoTitle,
    seoDescription: k.seoDescription,
    lessons,
    preview: achado.preview,
    loggedIn: Boolean(leitor),
  };
}

// GET /api/educacao/cursos/:slug → curso com a lista de aulas (e o progresso, se logado)
educacaoRouter.get("/cursos/:slug", sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res);
  const achado = await acharCurso(String(req.params.slug), leitor);
  if (!achado) return res.status(404).json({ error: "Curso não encontrado." });
  const feitos = await concluidos(leitor, achado.aulas.map((a) => a.content.id));
  res.json(montarCurso(achado, leitor, feitos));
});

// GET /api/educacao/cursos/:slug/aulas/:aula → a aula, com anterior e próxima
educacaoRouter.get("/cursos/:slug/aulas/:aula", sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res);
  const achado = await acharCurso(String(req.params.slug), leitor);
  if (!achado) return res.status(404).json({ error: "Curso não encontrado." });
  const i = achado.aulas.findIndex((a) => a.content.slug === String(req.params.aula));
  if (i < 0) return res.status(404).json({ error: "Aula não encontrada." });
  const feitos = await concluidos(leitor, achado.aulas.map((a) => a.content.id));
  const curso = montarCurso(achado, leitor, feitos);
  const aula = await prisma.eduContent.findUnique({ where: { id: achado.aulas[i].content.id }, include: { ...incluirCartao, materials: true } });
  const efetiva = curso.lessons[i].visibility;
  const locked = !podeAbrir(efetiva, leitor);
  res.json({
    course: curso,
    lesson: { ...conteudoCompleto(aula!, { locked, completed: leitor ? feitos.has(aula!.id) : undefined }), visibility: efetiva, position: i + 1 },
    previous: i > 0 ? curso.lessons[i - 1] : null,
    next: i < curso.lessons.length - 1 ? curso.lessons[i + 1] : null,
    loggedIn: Boolean(leitor),
  });
});

// GET /api/educacao/categorias
educacaoRouter.get("/categorias", async (_req, res) => {
  const cats = await prisma.eduCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  res.json(cats.map(serializarCategoria));
});

// Visibilidade que vale para o conteúdo aberto sozinho (/educacao/:slug, materiais, progresso).
// Aula que não aparece na lista de artigos e só está em cursos restritos herda a restrição do curso.
async function visibilidadeEfetiva(c: { id: string; listed: boolean; visibility: ContentVisibility }) {
  if (c.listed || c.visibility !== "PUBLIC") return c.visibility;
  const cursos = await prisma.eduCourseLesson.findMany({ where: { contentId: c.id, course: noAr() }, select: { course: { select: { visibility: true } } } });
  if (cursos.length && cursos.every((k) => k.course.visibility !== "PUBLIC")) return maisRestrita(c.visibility, "REGISTERED");
  return c.visibility;
}

// Pode abrir este conteúdo agora? (publicado e visível; ou equipe em prévia)
async function conteudoAcessivel(contentId: string, leitor: Leitor | null) {
  const achado = await acharConteudo({ id: contentId }, leitor);
  if (!achado) return { status: 404 as const };
  if (!achado.preview && !podeAbrir(await visibilidadeEfetiva(achado.c), leitor)) return { status: leitor ? (403 as const) : (401 as const) };
  return { status: 200 as const, conteudo: achado.c };
}

// POST /api/educacao/progresso/:contentId { completed: true | false }
const progressoSchema = z.object({ completed: z.boolean().default(true) });
educacaoRouter.post("/progresso/:contentId", requireAuth, sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res)!;
  const corpo = progressoSchema.safeParse(req.body ?? {});
  if (!corpo.success) return res.status(400).json({ error: "Dados inválidos." });
  const acesso = await conteudoAcessivel(String(req.params.contentId), leitor);
  if (acesso.status !== 200) return res.status(acesso.status === 404 ? 404 : 403).json({ error: acesso.status === 404 ? "Conteúdo não encontrado." : "Você não tem acesso a este conteúdo." });
  const contentId = acesso.conteudo.id;
  if (corpo.data.completed) {
    await prisma.eduProgress.upsert({ where: { userId_contentId: { userId: leitor.id, contentId } }, create: { userId: leitor.id, contentId }, update: {} });
  } else {
    await prisma.eduProgress.deleteMany({ where: { userId: leitor.id, contentId } });
  }
  res.json({ contentId, completed: corpo.data.completed });
});

// GET /api/educacao/materiais/:id → baixar o material (mesma regra de acesso do conteúdo)
educacaoRouter.get("/materiais/:id", sessaoOpcional, async (req, res) => {
  const leitor = leitorDe(res);
  const m = await prisma.eduMaterial.findUnique({ where: { id: String(req.params.id) } });
  if (!m) return res.status(404).json({ error: "Material não encontrado." });
  const acesso = await conteudoAcessivel(m.contentId, leitor);
  if (acesso.status === 404) return res.status(404).json({ error: "Material não encontrado." });
  if (acesso.status === 401) return res.status(401).json({ error: "Crie sua conta grátis (ou entre) para baixar este material." });
  if (acesso.status === 403) return res.status(403).json({ error: "Você não tem acesso a este material." });
  let dados: Buffer;
  try {
    dados = await armazenamento().ler(m.storageKey);
  } catch {
    return res.status(404).json({ error: "O arquivo deste material não foi encontrado no servidor." });
  }
  res.setHeader("Content-Type", m.mime);
  res.setHeader("Content-Length", String(dados.length));
  res.setHeader("Cache-Control", acesso.conteudo?.visibility === "PUBLIC" && acesso.conteudo.status === "PUBLISHED" ? "public, max-age=3600" : "private, no-store");
  // Sempre download (nunca abre HTML/SVG na mesma origem)
  res.setHeader("Content-Disposition", `attachment; filename="material"; filename*=UTF-8''${encodeURIComponent(m.originalName)}`);
  res.end(dados);
});

// GET /api/educacao/capas/:a/:b → capa de conteúdo/curso ou foto de autor (só chaves que estão no banco)
async function enviarCapa(req: Request, res: Response) {
  const chave = `${req.params.a}/${req.params.b}`;
  if (!ehChaveValida(chave) || !chave.endsWith(".jpg")) return res.status(404).end();
  const [c, k, a] = await Promise.all([
    prisma.eduContent.count({ where: { coverKey: chave } }),
    prisma.eduCourse.count({ where: { coverKey: chave } }),
    prisma.eduAuthor.count({ where: { photoKey: chave } }),
  ]);
  if (!c && !k && !a) return res.status(404).end();
  let dados: Buffer;
  try {
    dados = await armazenamento().ler(chave);
  } catch {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(dados.length));
  // A chave muda a cada troca de imagem: pode guardar por muito tempo
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.end(dados);
}
educacaoRouter.get("/capas/:a/:b", enviarCapa);
