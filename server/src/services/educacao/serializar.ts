import type { EduAuthor, EduCategory, EduContent, EduCourse, EduMaterial } from "@prisma/client";
import { minutosDeLeitura, miniaturaYoutube, tipoDoConteudo, urlCapa } from "./regras.js";

// ─────────────────────────────────────────────
// Formato das respostas da Educação financeira (páginas públicas e painel)
// ─────────────────────────────────────────────

export const incluirCartao = { category: true, author: true } as const;

type ComCartao<T> = T & { category: EduCategory | null; author: EduAuthor | null };

export const serializarCategoria = (c: EduCategory | null) => (c ? { id: c.id, name: c.name, slug: c.slug } : null);

export const serializarAutor = (a: EduAuthor | null, comBio = false) =>
  a ? { id: a.id, name: a.name, photoUrl: urlCapa(a.photoKey), ...(comBio ? { bio: a.bio ?? "" } : {}) } : null;

export const serializarMaterial = (m: EduMaterial) => ({
  id: m.id,
  title: m.title || m.originalName,
  originalName: m.originalName,
  mime: m.mime,
  size: m.size,
  url: `/api/educacao/materiais/${m.id}`,
});

// Cartão do conteúdo (lista): nunca leva o corpo, o vídeo nem os materiais
export function cartaoConteudo(c: ComCartao<EduContent>, extra: { locked: boolean; completed?: boolean }) {
  return {
    id: c.id,
    type: "content" as const,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    kind: tipoDoConteudo(c),
    visibility: c.visibility,
    coverUrl: urlCapa(c.coverKey) ?? (c.videoId ? miniaturaYoutube(c.videoId) : null),
    category: serializarCategoria(c.category),
    tags: c.tags,
    author: serializarAutor(c.author),
    publishedAt: c.publishedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    readingMinutes: minutosDeLeitura(c.body),
    featured: c.featured,
    locked: extra.locked,
    ...(extra.completed !== undefined ? { completed: extra.completed } : {}),
  };
}

// Conteúdo completo. Bloqueado: só o cartão (título, resumo, capa) para mostrar o convite de cadastro.
export function conteudoCompleto(c: ComCartao<EduContent> & { materials: EduMaterial[] }, extra: { locked: boolean; completed?: boolean }) {
  const base = { ...cartaoConteudo(c, extra), author: serializarAutor(c.author, true), seoTitle: c.seoTitle, seoDescription: c.seoDescription };
  if (extra.locked) return { ...base, body: null, video: null, materials: [], materialsCount: c.materials.length };
  return {
    ...base,
    body: c.body,
    video: c.videoId ? { id: c.videoId, url: c.videoUrl } : null,
    materials: [...c.materials].sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()).map(serializarMaterial),
    materialsCount: c.materials.length,
  };
}

export function cartaoCurso(c: ComCartao<EduCourse>, extra: { locked: boolean; lessonsCount: number; completedCount?: number }) {
  return {
    id: c.id,
    type: "course" as const,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    visibility: c.visibility,
    coverUrl: urlCapa(c.coverKey),
    category: serializarCategoria(c.category),
    tags: c.tags,
    author: serializarAutor(c.author),
    publishedAt: c.publishedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    featured: c.featured,
    locked: extra.locked,
    lessonsCount: extra.lessonsCount,
    ...(extra.completedCount !== undefined ? { completedCount: extra.completedCount } : {}),
  };
}
