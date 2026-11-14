import { Router } from "express";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";
import { maisRestrita, miniaturaYoutube, noAr, resumir, urlCapa, visiveisNaLista } from "../services/educacao/regras.js";

// ─────────────────────────────────────────────
// SEO das páginas públicas.
// - GET /api/seo/head?path=/educacao/... → as tags do <head> (título, descrição, Open Graph, JSON-LD).
//   O Nginx inclui esta resposta no index.html via SSI (ver nginx.conf e scripts/gerar-html-seo.mjs),
//   então o Google e a prévia do WhatsApp veem as tags sem rodar JavaScript.
// - GET /api/seo/sitemap.xml e /api/seo/robots.txt (o Nginx serve em /sitemap.xml e /robots.txt).
// ─────────────────────────────────────────────

export const seoRouter = Router();

export const urlDoSite = () => (process.env.SITE_URL || env.FRONTEND_URL).replace(/\/+$/, "");

const PADRAO = {
  titulo: "Educação financeira · Famicash",
  descricao: "Artigos, vídeos e cursos grátis de educação financeira: organize o orçamento, saia das dívidas e comece a investir. Feito pelo Famicash.",
};

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// JSON dentro de <script>: sem "</script>" nem comentários HTML
const jsonSeguro = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

type Pagina = {
  titulo: string;
  descricao: string;
  caminho: string;
  imagem?: string | null;
  tipo?: "website" | "article";
  indexar?: boolean;
  publicado?: Date | null;
  atualizado?: Date | null;
  jsonLd?: unknown;
};

const absoluta = (url: string | null | undefined) => (!url ? null : /^https?:\/\//.test(url) ? url : `${urlDoSite()}${url}`);

export function tagsDoHead(p: Pagina) {
  const site = urlDoSite();
  const url = `${site}${p.caminho}`;
  const imagem = absoluta(p.imagem) ?? `${site}/icon-512.png`;
  const linhas = [
    `<title>${escapar(p.titulo)}</title>`,
    `<meta name="description" content="${escapar(p.descricao)}" />`,
    `<link rel="canonical" href="${escapar(url)}" />`,
    `<meta name="robots" content="${p.indexar === false ? "noindex, follow" : "index, follow"}" />`,
    `<meta property="og:site_name" content="Famicash" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:type" content="${p.tipo ?? "website"}" />`,
    `<meta property="og:title" content="${escapar(p.titulo)}" />`,
    `<meta property="og:description" content="${escapar(p.descricao)}" />`,
    `<meta property="og:url" content="${escapar(url)}" />`,
    `<meta property="og:image" content="${escapar(imagem)}" />`,
    `<meta name="twitter:card" content="${p.imagem ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapar(p.titulo)}" />`,
    `<meta name="twitter:description" content="${escapar(p.descricao)}" />`,
    `<meta name="twitter:image" content="${escapar(imagem)}" />`,
  ];
  if (p.publicado) linhas.push(`<meta property="article:published_time" content="${p.publicado.toISOString()}" />`);
  if (p.atualizado) linhas.push(`<meta property="article:modified_time" content="${p.atualizado.toISOString()}" />`);
  if (p.jsonLd) linhas.push(`<script type="application/ld+json">${jsonSeguro(p.jsonLd)}</script>`);
  return linhas.join("\n    ");
}

const editora = () => ({ "@type": "Organization", name: "Famicash", url: urlDoSite(), logo: { "@type": "ImageObject", url: `${urlDoSite()}/icon-512.png` } });

// Monta a página a partir do caminho pedido (só o que está publicado; o resto recebe as tags padrão)
export async function paginaDoCaminho(caminhoBruto: string): Promise<Pagina> {
  let caminho = String(caminhoBruto || "/educacao").split(/[?#]/)[0];
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    // fica como veio
  }
  caminho = caminho.replace(/\/+$/, "") || "/";
  const partes = caminho.split("/").filter(Boolean);
  const geral: Pagina = { ...PADRAO, caminho: "/educacao" };
  if (partes[0] !== "educacao" || partes.length === 1) return geral;

  // /educacao/cursos/:curso[/:aula]
  if (partes[1] === "cursos" && partes[2]) {
    const curso = await prisma.eduCourse.findFirst({
      where: { slug: partes[2], ...noAr(), visibility: visiveisNaLista },
      include: { author: true, lessons: { orderBy: { position: "asc" }, include: { content: { include: { author: true } } } } },
    });
    if (!curso) return { ...geral, indexar: false };
    const base = `/educacao/cursos/${curso.slug}`;
    const aulasNoAr = curso.lessons.filter((l) => l.content.status === "PUBLISHED" && l.content.publishedAt && l.content.publishedAt <= new Date() && l.content.visibility !== "VIP");
    if (partes[3]) {
      const l = aulasNoAr.find((a) => a.content.slug === partes[3]);
      if (!l) return { ...geral, indexar: false };
      const c = l.content;
      const vis = maisRestrita(curso.visibility, c.visibility);
      const descricao = c.seoDescription || c.summary || resumir(c.body) || curso.summary;
      return {
        titulo: `${c.seoTitle || c.title} · ${curso.title} · Famicash`,
        descricao,
        caminho: `${base}/${c.slug}`,
        imagem: urlCapa(c.coverKey) ?? (c.videoId ? miniaturaYoutube(c.videoId) : urlCapa(curso.coverKey)),
        tipo: "article",
        indexar: vis === "PUBLIC",
        publicado: c.publishedAt,
        atualizado: c.updatedAt,
        jsonLd: jsonLdArtigo(c, descricao, `${base}/${c.slug}`),
      };
    }
    const descricao = curso.seoDescription || curso.summary || resumir(curso.description) || PADRAO.descricao;
    return {
      titulo: `${curso.seoTitle || curso.title} · Curso grátis · Famicash`,
      descricao,
      caminho: base,
      imagem: urlCapa(curso.coverKey),
      indexar: curso.visibility === "PUBLIC",
      atualizado: curso.updatedAt,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Course",
        name: curso.title,
        description: descricao,
        url: `${urlDoSite()}${base}`,
        inLanguage: "pt-BR",
        isAccessibleForFree: true,
        ...(curso.coverKey ? { image: absoluta(urlCapa(curso.coverKey)) } : {}),
        provider: editora(),
        ...(curso.author ? { author: { "@type": "Person", name: curso.author.name } } : {}),
        hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: `PT${Math.max(1, aulasNoAr.length) * 10}M` },
        offers: { "@type": "Offer", price: 0, priceCurrency: "BRL", category: "Free" },
      },
    };
  }

  // /educacao/:slug
  if (partes.length === 2) {
    const c = await prisma.eduContent.findFirst({ where: { slug: partes[1], ...noAr(), visibility: visiveisNaLista }, include: { author: true } });
    if (!c) return { ...geral, indexar: false };
    const descricao = c.seoDescription || c.summary || resumir(c.body) || PADRAO.descricao;
    return {
      titulo: `${c.seoTitle || c.title} · Famicash`,
      descricao,
      caminho: `/educacao/${c.slug}`,
      imagem: urlCapa(c.coverKey) ?? (c.videoId ? miniaturaYoutube(c.videoId) : null),
      tipo: "article",
      indexar: c.visibility === "PUBLIC",
      publicado: c.publishedAt,
      atualizado: c.updatedAt,
      jsonLd: jsonLdArtigo(c, descricao, `/educacao/${c.slug}`),
    };
  }
  return { ...geral, indexar: false };
}

function jsonLdArtigo(
  c: { title: string; coverKey: string | null; videoId: string | null; publishedAt: Date | null; updatedAt: Date; author: { name: string } | null; body: string },
  descricao: string,
  caminho: string,
) {
  const imagem = absoluta(urlCapa(c.coverKey) ?? (c.videoId ? miniaturaYoutube(c.videoId) : null));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: c.title.slice(0, 110),
    description: descricao,
    inLanguage: "pt-BR",
    mainEntityOfPage: `${urlDoSite()}${caminho}`,
    ...(imagem ? { image: [imagem] } : {}),
    datePublished: c.publishedAt?.toISOString(),
    dateModified: c.updatedAt.toISOString(),
    author: c.author ? { "@type": "Person", name: c.author.name } : editora(),
    publisher: editora(),
    ...(c.videoId
      ? {
          video: {
            "@type": "VideoObject",
            name: c.title,
            description: descricao,
            thumbnailUrl: miniaturaYoutube(c.videoId),
            embedUrl: `https://www.youtube-nocookie.com/embed/${c.videoId}`,
            contentUrl: `https://www.youtube.com/watch?v=${c.videoId}`,
            uploadDate: c.publishedAt?.toISOString(),
          },
        }
      : {}),
  };
}

seoRouter.get("/head", async (req, res) => {
  let pagina: Pagina;
  try {
    pagina = await paginaDoCaminho(String(req.query.path ?? ""));
  } catch (e) {
    console.error("SEO: falha ao montar o head", e);
    pagina = { ...PADRAO, caminho: "/educacao" };
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(tagsDoHead(pagina));
});

// Artigos da Central de Ajuda (cópia em server/ajuda/artigos)
function slugsDaAjuda() {
  const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../ajuda/artigos");
  try {
    return readdirSync(pasta)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function montarSitemap() {
  const site = urlDoSite();
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${site}/` },
    { loc: `${site}/educacao` },
    { loc: `${site}/ajuda` },
    ...slugsDaAjuda().map((s) => ({ loc: `${site}/ajuda/${s}` })),
    { loc: `${site}/privacidade` },
  ];
  // Só o que é PÚBLICO e está no ar (cadastrados e VIP não entram: não são indexáveis)
  const [conteudos, cursos] = await Promise.all([
    prisma.eduContent.findMany({ where: { ...noAr(), visibility: "PUBLIC" }, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" } }),
    prisma.eduCourse.findMany({
      where: { ...noAr(), visibility: "PUBLIC" },
      select: { slug: true, updatedAt: true, lessons: { orderBy: { position: "asc" }, select: { content: { select: { slug: true, updatedAt: true, status: true, publishedAt: true, visibility: true } } } } },
    }),
  ]);
  for (const c of conteudos) urls.push({ loc: `${site}/educacao/${c.slug}`, lastmod: dia(c.updatedAt) });
  const agora = new Date();
  for (const k of cursos) {
    urls.push({ loc: `${site}/educacao/cursos/${k.slug}`, lastmod: dia(k.updatedAt) });
    for (const { content: a } of k.lessons)
      if (a.status === "PUBLISHED" && a.publishedAt && a.publishedAt <= agora && a.visibility === "PUBLIC")
        urls.push({ loc: `${site}/educacao/cursos/${k.slug}/${a.slug}`, lastmod: dia(a.updatedAt) });
  }
  const corpo = urls.map((u) => `  <url><loc>${escapar(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${corpo}\n</urlset>\n`;
}

seoRouter.get("/sitemap.xml", async (_req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900");
  res.send(await montarSitemap());
});

seoRouter.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(
    [
      "User-agent: *",
      "Allow: /",
      "Allow: /api/educacao/capas/",
      "Disallow: /app/",
      "Disallow: /api/",
      "Disallow: /convite/",
      "Disallow: /redefinir-senha",
      "Disallow: /verificar-email",
      "",
      `Sitemap: ${urlDoSite()}/sitemap.xml`,
      "",
    ].join("\n"),
  );
});
