import express, { Router, type Request, type Response } from "express";
import type { ContentStatus, EduAuthor, EduCategory, EduContent, EduCourse, EduMaterial, Prisma, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { AnexoRecusado } from "../services/otimizarAnexo.js";
import { emailsAdmin, exigeAdmin, exigeEquipe, papelEfetivo, type Leitor } from "../services/educacao/papeis.js";
import { SLUGS_RESERVADOS, SLUG_VALIDO, gerarSlug, idDoYoutube, listaDeTags, podeEditar, podeVerNoPainel, tipoDoConteudo, urlCapa, miniaturaYoutube } from "../services/educacao/regras.js";
import { serializarAutor, serializarCategoria, serializarMaterial } from "../services/educacao/serializar.js";
import {
  LIMITE_IMAGEM_ENVIO,
  LIMITE_MATERIAL,
  MAX_MATERIAIS,
  apagarArquivos,
  corpoCru,
  gravarImagem,
  gravarMaterial,
  nomeDoEnvio,
} from "../services/educacao/arquivos.js";

// ─────────────────────────────────────────────
// Painel da Educação financeira (/api/admin/educacao). Nível PLATAFORMA, não de espaço.
// EDITOR: cria e edita o que é seu enquanto não está publicado e envia para revisão.
// ADMIN: tudo, inclusive publicar (agora ou agendado), arquivar, categorias e equipe.
// Montado ANTES do express.json() global: os uploads chegam com o corpo cru.
// ─────────────────────────────────────────────

export const adminEducacaoRouter = Router();
adminEducacaoRouter.use(requireAuth, exigeEquipe);
const json = express.json({ limit: "1mb" });

const leitorDe = (res: Response) => res.locals.leitor as Leitor;
const proibido = (res: Response, msg = "Você não pode alterar este item.") => res.status(403).json({ error: msg });
const invalido = (res: Response, detalhes: Record<string, string[]>) => res.status(400).json({ error: "Dados inválidos.", detalhes });

function validar<T extends z.ZodType>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    invalido(res, z.flattenError(r.error).fieldErrors as Record<string, string[]>);
    return null;
  }
  return r.data;
}

const MSG_IMAGEM_GRANDE = "Imagem grande demais. Envie até 15 MB.";
const MSG_MATERIAL_GRANDE = "Arquivo grande demais. O limite é 20 MB por material.";

// ── Campos comuns ─────────────────────────────

const textoOpcional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .nullish()
    .transform((v) => (v ? v : null));

const camposComuns = {
  title: z.string().trim().min(3, "Dê um título com pelo menos 3 letras.").max(160, "Título muito longo (até 160 caracteres)."),
  slug: z.string().trim().toLowerCase().max(80, "Endereço muito longo.").optional(),
  summary: z.string().trim().max(300, "Resumo muito longo (até 300 caracteres).").default(""),
  // VIP fica reservado: a API ainda não aceita
  visibility: z.enum(["PUBLIC", "REGISTERED"], { message: "Escolha Público ou Só para cadastrados." }).default("PUBLIC"),
  categoryId: z.string().nullish(),
  authorId: z.string().nullish(),
  tags: z.union([z.array(z.string().max(40)), z.string().max(600)]).optional(),
  seoTitle: textoOpcional(70, "Título para o Google: até 70 caracteres."),
  seoDescription: textoOpcional(170, "Descrição para o Google: até 170 caracteres."),
  featured: z.boolean().optional(),
};

const conteudoSchema = z.object({
  ...camposComuns,
  body: z.string().max(100_000, "Texto muito longo.").default(""),
  videoUrl: z.string().trim().max(300).nullish(),
  listed: z.boolean().optional(),
});

const cursoSchema = z.object({
  ...camposComuns,
  description: z.string().max(50_000, "Descrição muito longa.").default(""),
});

type Comuns = { slug?: string; categoryId?: string | null; authorId?: string | null; tags?: string[] | string; featured?: boolean };

// Confere slug (formato, reservado, repetido), categoria e autor. Devolve os dados prontos ou os erros por campo.
async function prepararComuns(dados: Comuns & { title: string }, tipo: "content" | "course", id: string | null, leitor: Leitor) {
  const erros: Record<string, string[]> = {};
  const desejado = dados.slug?.trim() ? dados.slug.trim() : null;
  let slug = desejado ?? gerarSlug(dados.title);
  if (!SLUG_VALIDO.test(slug)) erros.slug = ["Use só letras minúsculas, números e hífens (ex.: como-sair-das-dividas)."];
  else if (tipo === "content" && SLUGS_RESERVADOS.includes(slug)) erros.slug = ["Este endereço é reservado. Escolha outro."];
  else {
    const existe = (s: string) =>
      tipo === "content"
        ? prisma.eduContent.findFirst({ where: { slug: s, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })
        : prisma.eduCourse.findFirst({ where: { slug: s, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (await existe(slug)) {
      if (desejado) erros.slug = ["Já existe outro item com este endereço."];
      else {
        // Gerado do título: acrescenta -2, -3...
        let n = 2;
        while (await existe(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
    }
  }
  if (dados.categoryId && !(await prisma.eduCategory.findUnique({ where: { id: dados.categoryId } }))) erros.categoryId = ["Categoria não encontrada."];
  if (dados.authorId && !(await prisma.eduAuthor.findUnique({ where: { id: dados.authorId } }))) erros.authorId = ["Autor não encontrado."];
  const extra: { featured?: boolean } = {};
  if (leitor.papel === "ADMIN" && dados.featured !== undefined) extra.featured = dados.featured; // destaque: só ADMIN
  return {
    erros,
    dados: {
      slug,
      categoryId: dados.categoryId || null,
      authorId: dados.authorId || null,
      ...(dados.tags !== undefined ? { tags: listaDeTags(dados.tags) } : {}),
      ...extra,
    },
  };
}

// Autor padrão do EDITOR: o perfil de autor ligado à conta dele
async function autorPadrao(leitor: Leitor) {
  return (await prisma.eduAuthor.findUnique({ where: { userId: leitor.id }, select: { id: true } }))?.id ?? null;
}

// ── Serialização (painel) ─────────────────────

type ConteudoPainel = EduContent & {
  category: EduCategory | null;
  author: EduAuthor | null;
  createdBy: Pick<User, "id" | "name" | "email"> | null;
  materials?: EduMaterial[];
  lessons?: { course: { id: string; title: string; slug: string } }[];
};
const incluirPainel = {
  category: true,
  author: true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

function permissoes(item: { createdById: string | null; status: ContentStatus }, leitor: Leitor) {
  const admin = leitor.papel === "ADMIN";
  const meu = item.createdById === leitor.id;
  return {
    canEdit: podeEditar(item, leitor),
    canPublish: admin,
    canDelete: admin || (meu && item.status === "DRAFT"),
    canSubmit: !admin && meu && item.status === "DRAFT",
  };
}

const situacao = (i: { status: ContentStatus; publishedAt: Date | null }) => ({
  status: i.status,
  scheduled: i.status === "PUBLISHED" && Boolean(i.publishedAt && i.publishedAt > new Date()),
  publishedAt: i.publishedAt?.toISOString() ?? null,
});

function painelConteudo(c: ConteudoPainel, leitor: Leitor, completo = false) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    kind: tipoDoConteudo(c),
    visibility: c.visibility,
    ...situacao(c),
    submittedAt: c.submittedAt?.toISOString() ?? null,
    featured: c.featured,
    listed: c.listed,
    coverUrl: urlCapa(c.coverKey),
    thumbUrl: urlCapa(c.coverKey) ?? (c.videoId ? miniaturaYoutube(c.videoId) : null),
    category: serializarCategoria(c.category),
    author: serializarAutor(c.author),
    createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
    tags: c.tags,
    updatedAt: c.updatedAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    courses: (c.lessons ?? []).map((l) => l.course),
    ...permissoes(c, leitor),
    ...(completo
      ? {
          body: c.body,
          videoUrl: c.videoUrl,
          videoId: c.videoId,
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
          categoryId: c.categoryId,
          authorId: c.authorId,
          materials: [...(c.materials ?? [])].sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()).map(serializarMaterial),
        }
      : {}),
  };
}

// ── Conteúdos ─────────────────────────────────

const filtroLista = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "SUBMITTED", "SCHEDULED"]).optional(),
  q: z.string().max(100).optional(),
  meus: z.enum(["1", "0"]).optional(),
});

// Onde o EDITOR pode ver: o que criou e o que está publicado
const ondeEquipe = (leitor: Leitor) => (leitor.papel === "ADMIN" ? {} : { OR: [{ createdById: leitor.id }, { status: "PUBLISHED" as ContentStatus }] });

function filtroStatus(status?: string) {
  if (status === "SUBMITTED") return { status: "DRAFT" as ContentStatus, submittedAt: { not: null } };
  if (status === "SCHEDULED") return { status: "PUBLISHED" as ContentStatus, publishedAt: { gt: new Date() } };
  if (status) return { status: status as ContentStatus };
  return {};
}

adminEducacaoRouter.get("/conteudos", async (req, res) => {
  const leitor = leitorDe(res);
  const f = filtroLista.safeParse(req.query).data ?? {};
  const where: Prisma.EduContentWhereInput = {
    AND: [
      ondeEquipe(leitor),
      filtroStatus(f.status),
      f.meus === "1" ? { createdById: leitor.id } : {},
      f.q?.trim() ? { OR: [{ title: { contains: f.q.trim(), mode: "insensitive" } }, { slug: { contains: f.q.trim(), mode: "insensitive" } }] } : {},
    ],
  };
  const itens = await prisma.eduContent.findMany({
    where,
    include: { ...incluirPainel, lessons: { select: { course: { select: { id: true, title: true, slug: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  res.json(itens.map((c) => painelConteudo(c, leitor)));
});

async function conteudoDoPainel(id: string) {
  return prisma.eduContent.findUnique({
    where: { id },
    include: { ...incluirPainel, materials: true, lessons: { select: { course: { select: { id: true, title: true, slug: true } } } } },
  });
}

adminEducacaoRouter.get("/conteudos/:id", async (req, res) => {
  const leitor = leitorDe(res);
  const c = await conteudoDoPainel(String(req.params.id));
  if (!c || !podeVerNoPainel(c, leitor)) return res.status(404).json({ error: "Conteúdo não encontrado." });
  res.json(painelConteudo(c, leitor, true));
});

function dadosDoVideo(videoUrl: string | null | undefined) {
  if (!videoUrl?.trim()) return { ok: true as const, videoUrl: null, videoId: null };
  const id = idDoYoutube(videoUrl);
  if (!id) return { ok: false as const };
  return { ok: true as const, videoUrl: videoUrl.trim(), videoId: id };
}

adminEducacaoRouter.post("/conteudos", json, async (req, res) => {
  const leitor = leitorDe(res);
  const d = validar(conteudoSchema, req, res);
  if (!d) return;
  const { erros, dados } = await prepararComuns(d, "content", null, leitor);
  const video = dadosDoVideo(d.videoUrl);
  if (!video.ok) erros.videoUrl = ["Link do YouTube inválido. Cole o endereço do vídeo (ex.: https://youtu.be/...)."];
  if (Object.keys(erros).length) return invalido(res, erros);
  const c = await prisma.eduContent.create({
    data: {
      ...dados,
      authorId: dados.authorId ?? (await autorPadrao(leitor)),
      title: d.title,
      summary: d.summary,
      body: d.body,
      videoUrl: video.videoUrl,
      videoId: video.videoId,
      visibility: d.visibility,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      listed: d.listed ?? true,
      createdById: leitor.id,
    },
  });
  const completo = await conteudoDoPainel(c.id);
  res.status(201).json(painelConteudo(completo!, leitor, true));
});

adminEducacaoRouter.put("/conteudos/:id", json, async (req, res) => {
  const leitor = leitorDe(res);
  const atual = await prisma.eduContent.findUnique({ where: { id: String(req.params.id) } });
  if (!atual || !podeVerNoPainel(atual, leitor)) return res.status(404).json({ error: "Conteúdo não encontrado." });
  if (!podeEditar(atual, leitor)) return proibido(res, "Conteúdo publicado: só um administrador pode alterar.");
  const d = validar(conteudoSchema, req, res);
  if (!d) return;
  const { erros, dados } = await prepararComuns(d, "content", atual.id, leitor);
  const video = dadosDoVideo(d.videoUrl);
  if (!video.ok) erros.videoUrl = ["Link do YouTube inválido. Cole o endereço do vídeo (ex.: https://youtu.be/...)."];
  if (Object.keys(erros).length) return invalido(res, erros);
  await prisma.eduContent.update({
    where: { id: atual.id },
    data: {
      ...dados,
      title: d.title,
      summary: d.summary,
      body: d.body,
      videoUrl: video.videoUrl,
      videoId: video.videoId,
      visibility: d.visibility,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      ...(d.listed !== undefined ? { listed: d.listed } : {}),
    },
  });
  res.json(painelConteudo((await conteudoDoPainel(atual.id))!, leitor, true));
});

adminEducacaoRouter.delete("/conteudos/:id", async (req, res) => {
  const leitor = leitorDe(res);
  const atual = await prisma.eduContent.findUnique({ where: { id: String(req.params.id) }, include: { materials: true } });
  if (!atual || !podeVerNoPainel(atual, leitor)) return res.status(404).json({ error: "Conteúdo não encontrado." });
  if (!permissoes(atual, leitor).canDelete) return proibido(res, "Só um administrador pode apagar este conteúdo.");
  await prisma.eduContent.delete({ where: { id: atual.id } });
  await apagarArquivos([...(atual.coverKey ? [atual.coverKey] : []), ...atual.materials.map((m) => m.storageKey)]);
  res.status(204).end();
});

// ── Mudanças de situação (conteúdo e curso) ───

const publicarSchema = z.object({ publishedAt: z.string().datetime({ offset: true, message: "Data inválida." }).nullish() });

type Modelo = "content" | "course";
async function buscarItem(modelo: Modelo, id: string) {
  return modelo === "content" ? prisma.eduContent.findUnique({ where: { id } }) : prisma.eduCourse.findUnique({ where: { id } });
}
async function atualizarItem(modelo: Modelo, id: string, data: Prisma.EduContentUpdateInput & Prisma.EduCourseUpdateInput) {
  return modelo === "content" ? prisma.eduContent.update({ where: { id }, data }) : prisma.eduCourse.update({ where: { id }, data });
}

function rotasDeSituacao(caminho: string, modelo: Modelo, responder: (id: string, leitor: Leitor, res: Response) => Promise<unknown>) {
  const nome = modelo === "content" ? "Conteúdo" : "Curso";

  // EDITOR envia para revisão
  adminEducacaoRouter.post(`/${caminho}/:id/enviar`, async (req, res) => {
    const leitor = leitorDe(res);
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item || !podeVerNoPainel(item, leitor)) return res.status(404).json({ error: `${nome} não encontrado.` });
    if (item.status !== "DRAFT" || !podeEditar(item, leitor)) return proibido(res, "Só dá para enviar um rascunho seu.");
    await atualizarItem(modelo, item.id, { submittedAt: new Date() });
    await responder(item.id, leitor, res);
  });

  // ADMIN publica (agora ou numa data: no futuro fica agendado)
  adminEducacaoRouter.post(`/${caminho}/:id/publicar`, json, exigeAdmin, async (req, res) => {
    const leitor = leitorDe(res);
    const d = validar(publicarSchema, req, res);
    if (!d) return;
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item) return res.status(404).json({ error: `${nome} não encontrado.` });
    if (modelo === "content") {
      const c = item as EduContent;
      if (!c.body.trim() && !c.videoId) return invalido(res, { body: ["Escreva o texto ou coloque um vídeo antes de publicar."] });
    }
    const quando = d.publishedAt ? new Date(d.publishedAt) : (item.status === "PUBLISHED" && item.publishedAt) || new Date();
    await atualizarItem(modelo, item.id, { status: "PUBLISHED", publishedAt: quando, submittedAt: null });
    await responder(item.id, leitor, res);
  });

  adminEducacaoRouter.post(`/${caminho}/:id/arquivar`, exigeAdmin, async (req, res) => {
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item) return res.status(404).json({ error: `${nome} não encontrado.` });
    await atualizarItem(modelo, item.id, { status: "ARCHIVED", submittedAt: null });
    await responder(item.id, leitorDe(res), res);
  });

  // ADMIN tira do ar / devolve ao autor (volta a rascunho)
  adminEducacaoRouter.post(`/${caminho}/:id/rascunho`, exigeAdmin, async (req, res) => {
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item) return res.status(404).json({ error: `${nome} não encontrado.` });
    await atualizarItem(modelo, item.id, { status: "DRAFT", submittedAt: null });
    await responder(item.id, leitorDe(res), res);
  });

  // Capa (foto) do item
  adminEducacaoRouter.post(`/${caminho}/:id/capa`, corpoCru(LIMITE_IMAGEM_ENVIO, MSG_IMAGEM_GRANDE), async (req, res) => {
    const leitor = leitorDe(res);
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item || !podeVerNoPainel(item, leitor)) return res.status(404).json({ error: `${nome} não encontrado.` });
    if (!podeEditar(item, leitor)) return proibido(res);
    const dados = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let chave: string;
    try {
      chave = await gravarImagem(dados);
    } catch (e) {
      if (e instanceof AnexoRecusado) return res.status(e.status).json({ error: e.message });
      throw e;
    }
    await atualizarItem(modelo, item.id, { coverKey: chave });
    if (item.coverKey) await apagarArquivos([item.coverKey]);
    await responder(item.id, leitor, res);
  });

  adminEducacaoRouter.delete(`/${caminho}/:id/capa`, async (req, res) => {
    const leitor = leitorDe(res);
    const item = await buscarItem(modelo, String(req.params.id));
    if (!item || !podeVerNoPainel(item, leitor)) return res.status(404).json({ error: `${nome} não encontrado.` });
    if (!podeEditar(item, leitor)) return proibido(res);
    await atualizarItem(modelo, item.id, { coverKey: null });
    if (item.coverKey) await apagarArquivos([item.coverKey]);
    await responder(item.id, leitor, res);
  });
}

rotasDeSituacao("conteudos", "content", async (id, leitor, res) => res.json(painelConteudo((await conteudoDoPainel(id))!, leitor, true)));

// ── Materiais ─────────────────────────────────

adminEducacaoRouter.post("/conteudos/:id/materiais", corpoCru(LIMITE_MATERIAL, MSG_MATERIAL_GRANDE), async (req, res) => {
  const leitor = leitorDe(res);
  const c = await prisma.eduContent.findUnique({ where: { id: String(req.params.id) } });
  if (!c || !podeVerNoPainel(c, leitor)) return res.status(404).json({ error: "Conteúdo não encontrado." });
  if (!podeEditar(c, leitor)) return proibido(res);
  const quantos = await prisma.eduMaterial.count({ where: { contentId: c.id } });
  if (quantos >= MAX_MATERIAIS) return res.status(400).json({ error: `Cada conteúdo aceita até ${MAX_MATERIAIS} materiais.` });
  const dados = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let gravado: Awaited<ReturnType<typeof gravarMaterial>>;
  try {
    gravado = await gravarMaterial(dados, nomeDoEnvio(req));
  } catch (e) {
    if (e instanceof AnexoRecusado) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  let titulo = req.header("x-title") ?? "";
  try {
    titulo = decodeURIComponent(titulo).trim().slice(0, 120);
  } catch {
    titulo = "";
  }
  try {
    const m = await prisma.eduMaterial.create({
      data: { contentId: c.id, title: titulo || null, originalName: gravado.nome, mime: gravado.mime, size: gravado.size, storageKey: gravado.chave, position: quantos },
    });
    res.status(201).json(serializarMaterial(m));
  } catch (e) {
    await apagarArquivos([gravado.chave]);
    throw e;
  }
});

async function materialEditavel(req: Request, res: Response) {
  const leitor = leitorDe(res);
  const m = await prisma.eduMaterial.findUnique({ where: { id: String(req.params.id) }, include: { content: true } });
  if (!m || !podeVerNoPainel(m.content, leitor)) {
    res.status(404).json({ error: "Material não encontrado." });
    return null;
  }
  if (!podeEditar(m.content, leitor)) {
    proibido(res);
    return null;
  }
  return m;
}

const materialSchema = z.object({ title: textoOpcional(120, "Título até 120 caracteres."), position: z.number().int().min(0).max(1000).optional() });
adminEducacaoRouter.put("/materiais/:id", json, async (req, res) => {
  const m = await materialEditavel(req, res);
  if (!m) return;
  const d = validar(materialSchema, req, res);
  if (!d) return;
  const novo = await prisma.eduMaterial.update({ where: { id: m.id }, data: { title: d.title, ...(d.position !== undefined ? { position: d.position } : {}) } });
  res.json(serializarMaterial(novo));
});

adminEducacaoRouter.delete("/materiais/:id", async (req, res) => {
  const m = await materialEditavel(req, res);
  if (!m) return;
  await prisma.eduMaterial.delete({ where: { id: m.id } });
  await apagarArquivos([m.storageKey]);
  res.status(204).end();
});

// ── Cursos ────────────────────────────────────

const incluirCursoPainel = {
  ...incluirPainel,
  lessons: { orderBy: { position: "asc" as const }, include: { content: { include: incluirPainel } } },
} as const;

type CursoPainel = EduCourse & {
  category: EduCategory | null;
  author: EduAuthor | null;
  createdBy: Pick<User, "id" | "name" | "email"> | null;
  lessons: { content: ConteudoPainel }[];
};

function painelCurso(k: CursoPainel, leitor: Leitor, completo = false) {
  return {
    id: k.id,
    slug: k.slug,
    title: k.title,
    summary: k.summary,
    visibility: k.visibility,
    ...situacao(k),
    submittedAt: k.submittedAt?.toISOString() ?? null,
    featured: k.featured,
    coverUrl: urlCapa(k.coverKey),
    thumbUrl: urlCapa(k.coverKey),
    category: serializarCategoria(k.category),
    author: serializarAutor(k.author),
    createdBy: k.createdBy ? { id: k.createdBy.id, name: k.createdBy.name } : null,
    tags: k.tags,
    updatedAt: k.updatedAt.toISOString(),
    createdAt: k.createdAt.toISOString(),
    lessonsCount: k.lessons.length,
    ...permissoes(k, leitor),
    ...(completo
      ? {
          description: k.description,
          seoTitle: k.seoTitle,
          seoDescription: k.seoDescription,
          categoryId: k.categoryId,
          authorId: k.authorId,
          lessons: k.lessons.map((l) => painelConteudo(l.content, leitor)),
        }
      : {}),
  };
}

const cursoDoPainel = (id: string) => prisma.eduCourse.findUnique({ where: { id }, include: incluirCursoPainel });

adminEducacaoRouter.get("/cursos", async (req, res) => {
  const leitor = leitorDe(res);
  const f = filtroLista.safeParse(req.query).data ?? {};
  const itens = await prisma.eduCourse.findMany({
    where: {
      AND: [
        ondeEquipe(leitor),
        filtroStatus(f.status),
        f.meus === "1" ? { createdById: leitor.id } : {},
        f.q?.trim() ? { title: { contains: f.q.trim(), mode: "insensitive" } } : {},
      ],
    },
    include: incluirCursoPainel,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  res.json(itens.map((k) => painelCurso(k, leitor)));
});

adminEducacaoRouter.get("/cursos/:id", async (req, res) => {
  const leitor = leitorDe(res);
  const k = await cursoDoPainel(String(req.params.id));
  if (!k || !podeVerNoPainel(k, leitor)) return res.status(404).json({ error: "Curso não encontrado." });
  res.json(painelCurso(k, leitor, true));
});

adminEducacaoRouter.post("/cursos", json, async (req, res) => {
  const leitor = leitorDe(res);
  const d = validar(cursoSchema, req, res);
  if (!d) return;
  const { erros, dados } = await prepararComuns(d, "course", null, leitor);
  if (Object.keys(erros).length) return invalido(res, erros);
  const k = await prisma.eduCourse.create({
    data: {
      ...dados,
      authorId: dados.authorId ?? (await autorPadrao(leitor)),
      title: d.title,
      summary: d.summary,
      description: d.description,
      visibility: d.visibility,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      createdById: leitor.id,
    },
  });
  res.status(201).json(painelCurso((await cursoDoPainel(k.id))!, leitor, true));
});

adminEducacaoRouter.put("/cursos/:id", json, async (req, res) => {
  const leitor = leitorDe(res);
  const atual = await prisma.eduCourse.findUnique({ where: { id: String(req.params.id) } });
  if (!atual || !podeVerNoPainel(atual, leitor)) return res.status(404).json({ error: "Curso não encontrado." });
  if (!podeEditar(atual, leitor)) return proibido(res, "Curso publicado: só um administrador pode alterar.");
  const d = validar(cursoSchema, req, res);
  if (!d) return;
  const { erros, dados } = await prepararComuns(d, "course", atual.id, leitor);
  if (Object.keys(erros).length) return invalido(res, erros);
  await prisma.eduCourse.update({
    where: { id: atual.id },
    data: { ...dados, title: d.title, summary: d.summary, description: d.description, visibility: d.visibility, seoTitle: d.seoTitle, seoDescription: d.seoDescription },
  });
  res.json(painelCurso((await cursoDoPainel(atual.id))!, leitor, true));
});

adminEducacaoRouter.delete("/cursos/:id", async (req, res) => {
  const leitor = leitorDe(res);
  const atual = await prisma.eduCourse.findUnique({ where: { id: String(req.params.id) } });
  if (!atual || !podeVerNoPainel(atual, leitor)) return res.status(404).json({ error: "Curso não encontrado." });
  if (!permissoes(atual, leitor).canDelete) return proibido(res, "Só um administrador pode apagar este curso.");
  // As aulas (conteúdos) continuam existindo; só a ligação com o curso some
  await prisma.eduCourse.delete({ where: { id: atual.id } });
  if (atual.coverKey) await apagarArquivos([atual.coverKey]);
  res.status(204).end();
});

// PUT /cursos/:id/aulas { contentIds: [...] } → as aulas, na ordem
const aulasSchema = z.object({ contentIds: z.array(z.string()).max(200, "Até 200 aulas por curso.") });
adminEducacaoRouter.put("/cursos/:id/aulas", json, async (req, res) => {
  const leitor = leitorDe(res);
  const curso = await prisma.eduCourse.findUnique({ where: { id: String(req.params.id) } });
  if (!curso || !podeVerNoPainel(curso, leitor)) return res.status(404).json({ error: "Curso não encontrado." });
  if (!podeEditar(curso, leitor)) return proibido(res, "Curso publicado: só um administrador pode alterar.");
  const d = validar(aulasSchema, req, res);
  if (!d) return;
  const ids = [...new Set(d.contentIds)];
  const conteudos = await prisma.eduContent.findMany({ where: { id: { in: ids } } });
  // EDITOR só usa conteúdos que pode ver (os seus e os publicados)
  if (conteudos.length !== ids.length || conteudos.some((c) => !podeVerNoPainel(c, leitor))) return invalido(res, { contentIds: ["Alguma aula não foi encontrada."] });
  await prisma.$transaction([
    prisma.eduCourseLesson.deleteMany({ where: { courseId: curso.id } }),
    prisma.eduCourseLesson.createMany({ data: ids.map((contentId, i) => ({ courseId: curso.id, contentId, position: i })) }),
    prisma.eduCourse.update({ where: { id: curso.id }, data: { updatedAt: new Date() } }),
  ]);
  res.json(painelCurso((await cursoDoPainel(curso.id))!, leitor, true));
});

rotasDeSituacao("cursos", "course", async (id, leitor, res) => res.json(painelCurso((await cursoDoPainel(id))!, leitor, true)));

// ── Categorias (editar: só ADMIN) ─────────────

adminEducacaoRouter.get("/categorias", async (_req, res) => {
  const cats = await prisma.eduCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { contents: true, courses: true } } } });
  res.json(cats.map((c) => ({ ...serializarCategoria(c), position: c.position, count: c._count.contents + c._count.courses })));
});

const categoriaSchema = z.object({
  name: z.string().trim().min(2, "Nome com pelo menos 2 letras.").max(60, "Nome até 60 caracteres."),
  position: z.number().int().min(0).max(1000).optional(),
});

adminEducacaoRouter.post("/categorias", json, exigeAdmin, async (req, res) => {
  const d = validar(categoriaSchema, req, res);
  if (!d) return;
  const slug = gerarSlug(d.name);
  if (await prisma.eduCategory.findFirst({ where: { OR: [{ slug }, { name: { equals: d.name, mode: "insensitive" } }] } })) return invalido(res, { name: ["Já existe uma categoria com este nome."] });
  const c = await prisma.eduCategory.create({ data: { name: d.name, slug, position: d.position ?? 0 } });
  res.status(201).json({ ...serializarCategoria(c), position: c.position, count: 0 });
});

adminEducacaoRouter.put("/categorias/:id", json, exigeAdmin, async (req, res) => {
  const d = validar(categoriaSchema, req, res);
  if (!d) return;
  const atual = await prisma.eduCategory.findUnique({ where: { id: String(req.params.id) } });
  if (!atual) return res.status(404).json({ error: "Categoria não encontrada." });
  const slug = gerarSlug(d.name);
  if (await prisma.eduCategory.findFirst({ where: { id: { not: atual.id }, OR: [{ slug }, { name: { equals: d.name, mode: "insensitive" } }] } }))
    return invalido(res, { name: ["Já existe uma categoria com este nome."] });
  const c = await prisma.eduCategory.update({ where: { id: atual.id }, data: { name: d.name, slug, ...(d.position !== undefined ? { position: d.position } : {}) } });
  res.json({ ...serializarCategoria(c), position: c.position });
});

adminEducacaoRouter.delete("/categorias/:id", exigeAdmin, async (req, res) => {
  const atual = await prisma.eduCategory.findUnique({ where: { id: String(req.params.id) } });
  if (!atual) return res.status(404).json({ error: "Categoria não encontrada." });
  await prisma.eduCategory.delete({ where: { id: atual.id } }); // conteúdos ficam sem categoria
  res.status(204).end();
});

// ── Autores (quem assina; pode ser parceiro sem conta) ──

const autorPainel = (a: EduAuthor & { _count?: { contents: number; courses: number } }) => ({
  ...serializarAutor(a, true)!,
  userId: a.userId,
  count: a._count ? a._count.contents + a._count.courses : undefined,
});

adminEducacaoRouter.get("/autores", async (_req, res) => {
  const autores = await prisma.eduAuthor.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { contents: true, courses: true } } } });
  res.json(autores.map(autorPainel));
});

const autorSchema = z.object({
  name: z.string().trim().min(2, "Nome com pelo menos 2 letras.").max(80, "Nome até 80 caracteres."),
  bio: textoOpcional(600, "Mini bio até 600 caracteres."),
});

adminEducacaoRouter.post("/autores", json, async (req, res) => {
  const d = validar(autorSchema, req, res);
  if (!d) return;
  const a = await prisma.eduAuthor.create({ data: { name: d.name, bio: d.bio } });
  res.status(201).json(autorPainel(a));
});

// EDITOR altera o próprio perfil de autor e os que não estão ligados a uma conta; ADMIN altera todos
async function autorEditavel(req: Request, res: Response) {
  const leitor = leitorDe(res);
  const a = await prisma.eduAuthor.findUnique({ where: { id: String(req.params.id) } });
  if (!a) {
    res.status(404).json({ error: "Autor não encontrado." });
    return null;
  }
  if (leitor.papel !== "ADMIN" && a.userId && a.userId !== leitor.id) {
    proibido(res, "Este perfil é de outra pessoa da equipe.");
    return null;
  }
  return a;
}

adminEducacaoRouter.put("/autores/:id", json, async (req, res) => {
  const a = await autorEditavel(req, res);
  if (!a) return;
  const d = validar(autorSchema, req, res);
  if (!d) return;
  res.json(autorPainel(await prisma.eduAuthor.update({ where: { id: a.id }, data: { name: d.name, bio: d.bio } })));
});

adminEducacaoRouter.delete("/autores/:id", exigeAdmin, async (req, res) => {
  const a = await prisma.eduAuthor.findUnique({ where: { id: String(req.params.id) } });
  if (!a) return res.status(404).json({ error: "Autor não encontrado." });
  await prisma.eduAuthor.delete({ where: { id: a.id } });
  if (a.photoKey) await apagarArquivos([a.photoKey]);
  res.status(204).end();
});

adminEducacaoRouter.post("/autores/:id/foto", corpoCru(LIMITE_IMAGEM_ENVIO, MSG_IMAGEM_GRANDE), async (req, res) => {
  const a = await autorEditavel(req, res);
  if (!a) return;
  let chave: string;
  try {
    chave = await gravarImagem(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  } catch (e) {
    if (e instanceof AnexoRecusado) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  const novo = await prisma.eduAuthor.update({ where: { id: a.id }, data: { photoKey: chave } });
  if (a.photoKey) await apagarArquivos([a.photoKey]);
  res.json(autorPainel(novo));
});

adminEducacaoRouter.delete("/autores/:id/foto", async (req, res) => {
  const a = await autorEditavel(req, res);
  if (!a) return;
  const novo = await prisma.eduAuthor.update({ where: { id: a.id }, data: { photoKey: null } });
  if (a.photoKey) await apagarArquivos([a.photoKey]);
  res.json(autorPainel(novo));
});

// ── Equipe (só ADMIN): quem é EDITOR ──────────

adminEducacaoRouter.get("/equipe", exigeAdmin, async (_req, res) => {
  const envs = emailsAdmin();
  const pessoas = await prisma.user.findMany({
    where: { OR: [{ platformRole: { in: ["EDITOR", "ADMIN"] } }, ...(envs.length ? [{ email: { in: envs, mode: "insensitive" as const } }] : [])] },
    select: { id: true, name: true, email: true, emailVerified: true, platformRole: true },
    orderBy: { name: "asc" },
  });
  res.json(
    pessoas.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: papelEfetivo(p),
      // Admin pela variável ADMIN_EMAILS: não dá para mudar pela tela
      viaEnv: envs.includes(p.email.toLowerCase()),
    })),
  );
});

const equipeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido."),
  role: z.enum(["EDITOR", "USER"], { message: "Escolha Editor ou Remover da equipe." }),
});

// POST /equipe { email, role: EDITOR | USER } → dá ou tira o papel de EDITOR
adminEducacaoRouter.post("/equipe", json, exigeAdmin, async (req, res) => {
  const d = validar(equipeSchema, req, res);
  if (!d) return;
  const u = await prisma.user.findFirst({ where: { email: { equals: d.email, mode: "insensitive" } } });
  if (!u) return invalido(res, { email: ["Não achamos uma conta com este email. A pessoa precisa criar a conta no Famicash primeiro."] });
  if (emailsAdmin().includes(u.email.toLowerCase())) return invalido(res, { email: ["Esta pessoa é administradora pela variável ADMIN_EMAILS."] });
  if (u.id === leitorDe(res).id) return invalido(res, { email: ["Você não pode mudar o seu próprio papel."] });
  const novo = await prisma.user.update({ where: { id: u.id }, data: { platformRole: d.role } });
  // Editor novo ganha um perfil de autor com o nome dele (pode editar a bio e a foto depois)
  if (d.role === "EDITOR" && !(await prisma.eduAuthor.findUnique({ where: { userId: u.id } }))) {
    await prisma.eduAuthor.create({ data: { name: u.name, userId: u.id } });
  }
  res.json({ id: novo.id, name: novo.name, email: novo.email, role: papelEfetivo(novo), viaEnv: false });
});

// GET /papel → papel do usuário na Educação (a tela usa para mostrar ou esconder botões)
adminEducacaoRouter.get("/papel", async (_req, res) => {
  const leitor = leitorDe(res);
  res.json({ role: leitor.papel, authorId: await autorPadrao(leitor) });
});
