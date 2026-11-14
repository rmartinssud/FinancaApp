import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizar } from "./parser.js";

// ─────────────────────────────────────────────
// Conhecimento do Famicash para o assistente: os artigos da Central de Ajuda.
//
// A fonte é src/ajuda/artigos/*.md (a mesma que o app mostra). Assim, cada atualização da Ajuda
// já muda o que o assistente sabe, sem treinar nada.
// - No desenvolvimento lemos direto de ../src/ajuda/artigos.
// - No Docker (só a pasta server/ vai para a imagem) lemos a cópia em server/ajuda/artigos,
//   que o "npm run ajuda:sync" atualiza (um teste falha se a cópia ficar diferente da Ajuda).
// - AJUDA_DIR troca a pasta, se precisar.
// Os artigos são lidos uma vez (na primeira pergunta) e ficam em memória.
// ─────────────────────────────────────────────

export type Artigo = { slug: string; titulo: string; categoria: string; resumo: string; palavras: string[]; corpo: string };

// server/ (tanto em src/services/whatsapp quanto em dist/services/whatsapp)
const RAIZ_SERVER = fileURLToPath(new URL("../../../", import.meta.url));

export function pastasDaAjuda() {
  return [process.env.AJUDA_DIR, path.join(RAIZ_SERVER, "../src/ajuda/artigos"), path.join(RAIZ_SERVER, "ajuda/artigos")].filter((p): p is string => Boolean(p));
}

// Cabeçalho simples (front matter) como o do app: "chave: valor" entre linhas "---"
export function lerArtigo(slug: string, texto: string): Artigo {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const cab: Record<string, string> = {};
  for (const linha of (m?.[1] ?? "").split(/\r?\n/)) {
    const i = linha.indexOf(":");
    if (i > 0) cab[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  const corpo = (m?.[2] ?? texto)
    // Links entre artigos: [texto](artigo:slug) → texto
    .replace(/\[([^\]]+)\]\(artigo:[^)]+\)/g, "$1")
    .trim();
  return {
    slug,
    titulo: cab.titulo || slug,
    categoria: cab.categoria || "",
    resumo: cab.resumo || "",
    palavras: (cab.palavras || "").split(",").map((p) => p.trim()).filter(Boolean),
    corpo,
  };
}

let cache: Artigo[] | null = null;

export function artigosDaAjuda(): Artigo[] {
  if (cache) return cache;
  const pasta = pastasDaAjuda().find((p) => existsSync(p));
  if (!pasta) {
    console.warn("WhatsApp: artigos da Ajuda não encontrados; o assistente responde sem a Central de Ajuda.");
    return (cache = []);
  }
  cache = readdirSync(pasta)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => lerArtigo(f.replace(/\.md$/, ""), readFileSync(path.join(pasta, f), "utf8")));
  return cache;
}

// Testes: força outra lista (ou null = ler de novo do disco)
export function definirArtigos(lista: Artigo[] | null) {
  cache = lista;
}

const VAZIAS = new Set(
  "a o e de da do das dos em no na nos nas um uma uns umas para pra por com sem que como qual quais quando onde eu meu minha meus minhas voce se ja mais muito pelo pela ao aos isso esse essa este esta tem ter famicash app".split(" "),
);

const termos = (s: string) =>
  normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));

// Artigos mais relevantes para a pergunta (busca simples por palavras, sem IA)
export function buscarNaAjuda(pergunta: string, quantos = 2, artigos = artigosDaAjuda()) {
  const q = [...new Set(termos(pergunta))];
  if (!q.length) return [];
  const pontuados = artigos.map((a) => {
    const titulo = normalizar(a.titulo);
    const palavras = a.palavras.map(normalizar).join(" | ");
    const resumo = normalizar(a.resumo);
    const corpo = normalizar(a.corpo);
    let pontos = 0;
    for (const t of q) {
      if (titulo.includes(t)) pontos += 4;
      if (palavras.includes(t)) pontos += 3;
      if (resumo.includes(t)) pontos += 1.5;
      pontos += Math.min(corpo.split(t).length - 1, 4) * 0.5;
    }
    return { a, pontos };
  });
  return pontuados
    .filter((p) => p.pontos >= 2)
    .sort((x, y) => y.pontos - x.pontos)
    .slice(0, quantos)
    .map((p) => p.a);
}

// Índice curto para o prompt: título e resumo de cada artigo
export function indiceDaAjuda(artigos = artigosDaAjuda()) {
  return artigos.map((a) => `- ${a.titulo}: ${a.resumo}`).join("\n");
}
