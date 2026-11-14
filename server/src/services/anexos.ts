import { prisma } from "../lib/prisma.js";
import { armazenamento, apagarArquivos } from "./armazenamento.js";
import { AnexoRecusado, LIMITE_ANEXO, otimizarAnexo, trocarExtensao } from "./otimizarAnexo.js";

// ─────────────────────────────────────────────
// Gravar um anexo num lançamento: as mesmas regras para o app (routes/attachments.ts)
// e para o WhatsApp (comprovante enviado no chat).
// Tipo pelos primeiros bytes, até 10 anexos por lançamento, otimização acima de 3 MB
// (services/otimizarAnexo.ts) e nunca grava acima de 3 MB.
// Quem chama confere o espaço e o papel (Visualizador não anexa).
// ─────────────────────────────────────────────

export const MAX_ANEXOS = 10;

// Descobre o tipo pelos primeiros bytes (não confia só no Content-Type)
export function tipoDoArquivo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp") {
    const marca = b.toString("latin1", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(marca)) return { mime: "image/heic", ext: "heic" };
  }
  return null;
}

export const MSG_TIPO_RECUSADO = "Tipo de arquivo não aceito. Envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF.";
export const MSG_LIMITE_ANEXOS = `Cada lançamento aceita até ${MAX_ANEXOS} anexos.`;

// Limpa o nome vindo de fora (sem caracteres de controle, barras ou aspas; até 120 caracteres)
export function limparNomeArquivo(nome: string, ext: string) {
  // eslint-disable-next-line no-control-regex
  const limpo = nome.replace(/[\u0000-\u001f\\/"]/g, "").trim().slice(0, 120);
  return limpo || `anexo.${ext}`;
}

// Grava o arquivo como anexo do lançamento. Lança AnexoRecusado (com status HTTP) se não der.
export async function gravarAnexo(transactionId: string, dados: Buffer, nomeOriginal: string) {
  if (!dados.length) throw new AnexoRecusado("Envie um arquivo.", 400);
  const tipoRecebido = tipoDoArquivo(dados);
  if (!tipoRecebido) throw new AnexoRecusado(MSG_TIPO_RECUSADO, 400);

  const quantos = await prisma.transactionAttachment.count({ where: { transactionId } });
  if (quantos >= MAX_ANEXOS) throw new AnexoRecusado(MSG_LIMITE_ANEXOS, 400);

  // Acima de 3 MB: reduz (foto → JPEG; PDF → Ghostscript) ou recusa. Nunca grava acima de 3 MB.
  const pronto = await otimizarAnexo(dados, tipoRecebido);
  const { tipo } = pronto;
  if (pronto.dados.length > LIMITE_ANEXO) throw new AnexoRecusado("Arquivo grande demais. O limite é 3 MB por arquivo.", 413);
  let nome = limparNomeArquivo(nomeOriginal, tipo.ext);
  if (tipo.ext !== tipoRecebido.ext) nome = trocarExtensao(nome, tipo.ext);

  const chave = await armazenamento().salvar(pronto.dados, tipo.ext);
  try {
    const anexo = await prisma.transactionAttachment.create({
      data: { transactionId, originalName: nome, mime: tipo.mime, size: pronto.dados.length, storageKey: chave },
    });
    return { anexo, otimizado: pronto.otimizado };
  } catch (e) {
    await apagarArquivos([chave]);
    throw e;
  }
}
