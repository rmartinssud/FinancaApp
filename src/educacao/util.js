// Utilidades da Educação financeira (páginas públicas, app e painel)

export const classeFoco = "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

export const NOMES_TIPO = { TEXTO: "Artigo", VIDEO: "Vídeo", MISTO: "Artigo + vídeo" };
export const NOMES_VISIBILIDADE = { PUBLIC: "Público", REGISTERED: "Só para cadastrados" };
export const NOMES_SITUACAO = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };

// Situação para mostrar no painel (agendado e enviado para revisão contam)
export function situacaoDoItem(item) {
  if (item.status === "PUBLISHED" && item.scheduled) return { texto: "Agendado", classe: "bg-amber-100 text-amber-800" };
  if (item.status === "PUBLISHED") return { texto: "Publicado", classe: "bg-emerald-100 text-emerald-800" };
  if (item.status === "ARCHIVED") return { texto: "Arquivado", classe: "bg-slate-200 text-slate-700" };
  if (item.submittedAt) return { texto: "Aguardando revisão", classe: "bg-sky-100 text-sky-800" };
  return { texto: "Rascunho", classe: "bg-slate-100 text-slate-700" };
}

export const dataLonga = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }) : "";

export const dataHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : "";

// ID do YouTube (mesma regra do servidor) para a prévia no editor
export function idDoYoutube(entrada) {
  const t = String(entrada ?? "").trim();
  if (!t) return null;
  if (/^[\w-]{11}$/.test(t)) return t;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (["youtube.com", "youtube-nocookie.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

// Endereço de volta depois do cadastro/login (só caminhos do próprio site)
export function voltarSeguro(caminho) {
  return typeof caminho === "string" && caminho.startsWith("/") && !caminho.startsWith("//") ? caminho : null;
}

export const linkCadastro = (voltar) => `/cadastro?voltar=${encodeURIComponent(voltar)}`;
export const linkEntrar = (voltar) => `/entrar?voltar=${encodeURIComponent(voltar)}`;

// Envia um arquivo cru (capa, foto ou material) para o painel
export async function enviarArquivo(caminho, arquivo, extras = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": arquivo.type || "application/octet-stream", "X-File-Name": encodeURIComponent(arquivo.name), ...extras },
    body: arquivo,
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(dados?.error ?? (resposta.status === 413 ? "Arquivo grande demais." : "Não foi possível enviar o arquivo."));
  return dados;
}
