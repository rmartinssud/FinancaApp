// Anexos de lançamento: foto (JPG, PNG, WEBP, HEIC) ou PDF, até 3 MB cada (o servidor confere de novo)

export const LIMITE_ANEXO = 3 * 1024 * 1024;
export const ACEITOS = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

// Mensagem de erro do arquivo (ou "" se estiver ok)
export function problemaDoArquivo(arquivo) {
  const heic = /\.(heic|heif)$/i.test(arquivo.name);
  if (!TIPOS.includes(arquivo.type) && !heic) return `“${arquivo.name}”: envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF.`;
  if (arquivo.size > LIMITE_ANEXO) return `“${arquivo.name}” passa de 3 MB.`;
  if (arquivo.size === 0) return `“${arquivo.name}” está vazio.`;
  return "";
}

// "1,2 MB" / "350 KB"
export function tamanhoEmTexto(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Envia um arquivo para o lançamento (corpo cru; o nome vai no cabeçalho)
export async function enviarAnexo(lancamentoId, arquivo) {
  const resposta = await fetch(`/api/transactions/${lancamentoId}/attachments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": arquivo.type || "application/octet-stream", "X-File-Name": encodeURIComponent(arquivo.name) },
    body: arquivo,
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(dados?.error ?? "Não foi possível enviar o anexo.");
  return dados;
}

export const urlDoAnexo = (id) => `/api/attachments/${id}`;
