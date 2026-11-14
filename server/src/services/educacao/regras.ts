import type { ContentStatus, ContentVisibility, Prisma } from "@prisma/client";
import type { Leitor } from "./papeis.js";

// ─────────────────────────────────────────────
// Regras da Educação financeira: quem vê o quê, slugs, vídeo do YouTube e tipo do conteúdo.
// ─────────────────────────────────────────────

// Endereços que não podem virar slug de artigo (/educacao/cursos é a página dos cursos)
export const SLUGS_RESERVADOS = ["cursos", "categoria", "categorias", "busca", "admin", "novo"];

// "Como sair das dívidas!" → "como-sair-das-dividas"
export function gerarSlug(texto: string) {
  return (
    String(texto ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "conteudo"
  );
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ID do YouTube a partir do link (watch, youtu.be, shorts, embed, live) ou do próprio ID
export function idDoYoutube(entrada: string | null | undefined): string | null {
  const t = String(entrada ?? "").trim();
  if (!t) return null;
  if (/^[\w-]{11}$/.test(t)) return t;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (["youtube.com", "youtube-nocookie.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export const miniaturaYoutube = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export type Tipo = "TEXTO" | "VIDEO" | "MISTO";
export function tipoDoConteudo(c: { body: string; videoId: string | null }): Tipo {
  const temTexto = c.body.trim().length > 0;
  if (c.videoId && temTexto) return "MISTO";
  if (c.videoId) return "VIDEO";
  return "TEXTO";
}

// Minutos de leitura (200 palavras por minuto), mínimo 1
export function minutosDeLeitura(md: string) {
  const palavras = md.split(/\s+/).filter(Boolean).length;
  return palavras ? Math.max(1, Math.round(palavras / 200)) : 0;
}

// Publicado e já no ar (publishedAt no passado). Para listas e páginas públicas.
export function noAr(agora = new Date()) {
  return { status: "PUBLISHED" as ContentStatus, publishedAt: { lte: agora } };
}

// Visibilidade que o leitor consegue abrir.
// PUBLIC: todos. REGISTERED: quem tem conta. VIP: reservado (hoje só ADMIN).
export function podeAbrir(visibilidade: ContentVisibility, leitor: Leitor | null) {
  if (visibilidade === "PUBLIC") return true;
  if (visibilidade === "REGISTERED") return Boolean(leitor);
  return leitor?.papel === "ADMIN";
}

// O mais restrito dos dois (aula de um curso só para cadastrados fica só para cadastrados)
export function maisRestrita(a: ContentVisibility, b: ContentVisibility): ContentVisibility {
  const ordem: ContentVisibility[] = ["PUBLIC", "REGISTERED", "VIP"];
  return ordem[Math.max(ordem.indexOf(a), ordem.indexOf(b))];
}

// Listas públicas não mostram VIP (ainda não existe na interface)
export const visiveisNaLista: Prisma.EnumContentVisibilityFilter = { in: ["PUBLIC", "REGISTERED"] };

// Equipe pode editar? ADMIN: tudo. EDITOR: só o que criou e enquanto não estiver publicado.
export function podeEditar(item: { createdById: string | null; status: ContentStatus }, leitor: Leitor) {
  if (leitor.papel === "ADMIN") return true;
  return leitor.papel === "EDITOR" && item.createdById === leitor.id && item.status !== "PUBLISHED";
}

// Equipe pode ver no painel? ADMIN: tudo. EDITOR: o que criou e o que já está publicado.
export function podeVerNoPainel(item: { createdById: string | null; status: ContentStatus }, leitor: Leitor) {
  if (leitor.papel === "ADMIN") return true;
  return leitor.papel === "EDITOR" && (item.createdById === leitor.id || item.status === "PUBLISHED");
}

export const urlCapa = (chave: string | null | undefined) => (chave ? `/api/educacao/capas/${chave}` : null);

// Texto puro (sem marcações) para descrição e busca
export function textoPuro(md: string) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resumir(texto: string, max = 160) {
  const t = textoPuro(texto);
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export const listaDeTags = (tags: unknown): string[] =>
  [...new Set((Array.isArray(tags) ? tags : String(tags ?? "").split(",")).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 15);

// Mesmo formato das chaves do armazenamento ("ab/<32 hex>.<ext>")
export const ehChaveValida = (chave: string) => /^[0-9a-f]{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/.test(chave);
