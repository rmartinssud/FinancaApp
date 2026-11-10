// Artigos da Central de Ajuda.
// Cada artigo é um arquivo .md em ./artigos/ com um cabeçalho simples (front matter):
//
// ---
// titulo: Contas
// categoria: Contas e saldos
// ordem: 2
// resumo: Uma frase que aparece na lista e na busca.
// palavras: banco, carteira, saldo inicial
// relacionados: ajustar-saldo, transferencias
// ---
//
// O nome do arquivo (sem .md) é o endereço do artigo: /app/ajuda/contas.
// Links entre artigos no texto: [texto](artigo:outro-slug).

const arquivos = import.meta.glob("./artigos/*.md", { query: "?raw", import: "default", eager: true });

// Ordem das seções na lista. Uma categoria nova que não estiver aqui vai para o fim.
export const ORDEM_CATEGORIAS = [
  "Começando",
  "Contas e saldos",
  "Lançamentos",
  "Cartões de crédito",
  "Planejamento",
  "Análises",
  "Família e espaços",
  "Dúvidas frequentes",
];

// Minúsculas e sem acentos: "Cartão" e "cartao" viram a mesma coisa na busca
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lerCabecalho(bruto) {
  const texto = bruto.replace(/\r\n/g, "\n");
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { dados: {}, corpo: texto };
  const dados = {};
  for (const linha of m[1].split("\n")) {
    const i = linha.indexOf(":");
    if (i < 1) continue;
    dados[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return { dados, corpo: texto.slice(m[0].length) };
}

const lista = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Texto puro (sem marcações) para a busca
function textoPuro(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ");
}

export const ARTIGOS = Object.entries(arquivos)
  .map(([caminho, bruto]) => {
    const slug = caminho.split("/").pop().replace(/\.md$/, "");
    const { dados, corpo } = lerCabecalho(bruto);
    const palavras = lista(dados.palavras);
    return {
      slug,
      titulo: dados.titulo || slug,
      categoria: dados.categoria || "Outros",
      ordem: Number(dados.ordem) || 999,
      resumo: dados.resumo || "",
      palavras,
      relacionados: lista(dados.relacionados),
      corpo,
      _titulo: normalizar(dados.titulo || slug),
      _palavras: normalizar(palavras.join(" ") + " " + (dados.resumo || "")),
      _texto: normalizar(textoPuro(corpo)),
    };
  })
  .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"));

export function acharArtigo(slug) {
  return ARTIGOS.find((a) => a.slug === slug) ?? null;
}

// Artigos agrupados por seção, na ordem de ORDEM_CATEGORIAS
export function secoes() {
  const mapa = new Map();
  for (const a of ARTIGOS) {
    if (!mapa.has(a.categoria)) mapa.set(a.categoria, []);
    mapa.get(a.categoria).push(a);
  }
  const posicao = (c) => {
    const i = ORDEM_CATEGORIAS.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...mapa.entries()].sort((a, b) => posicao(a[0]) - posicao(b[0])).map(([titulo, artigos]) => ({ titulo, artigos }));
}

// Busca: todas as palavras digitadas precisam aparecer no título, nas palavras-chave ou no texto.
// Título pesa mais que palavras-chave, que pesam mais que o texto.
export function buscar(consulta) {
  const termos = normalizar(consulta).split(/\s+/).filter((t) => t.length > 1);
  if (!termos.length) return [];
  const achados = [];
  for (const a of ARTIGOS) {
    let pontos = 0;
    let todos = true;
    for (const t of termos) {
      const p = (a._titulo.includes(t) ? 5 : 0) + (a._palavras.includes(t) ? 3 : 0) + (a._texto.includes(t) ? 1 : 0);
      if (!p) {
        todos = false;
        break;
      }
      pontos += p;
    }
    if (todos) achados.push({ artigo: a, pontos, trecho: trecho(a, termos[0]) });
  }
  return achados.sort((x, y) => y.pontos - x.pontos || x.artigo.ordem - y.artigo.ordem);
}

// Pedacinho do texto em volta da palavra encontrada (para mostrar na busca)
function trecho(a, termo) {
  const puro = textoPuro(a.corpo).trim();
  const i = normalizar(puro).indexOf(termo);
  if (i < 0) return a.resumo;
  const ini = Math.max(0, i - 60);
  const fim = Math.min(puro.length, i + 100);
  return (ini > 0 ? "…" : "") + puro.slice(ini, fim).trim() + (fim < puro.length ? "…" : "");
}

// Relacionados: os do cabeçalho; se faltar, completa com a mesma seção (máximo 4)
export function relacionados(artigo) {
  const escolhidos = artigo.relacionados.map(acharArtigo).filter(Boolean);
  for (const a of ARTIGOS) {
    if (escolhidos.length >= 4) break;
    if (a.slug !== artigo.slug && a.categoria === artigo.categoria && !escolhidos.includes(a)) escolhidos.push(a);
  }
  return escolhidos.slice(0, 4);
}
