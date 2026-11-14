import express, { type Request, type Response, type NextFunction } from "express";
import { armazenamento, apagarArquivos } from "../armazenamento.js";
import { tipoDoArquivo, limparNomeArquivo } from "../anexos.js";
import { AnexoRecusado, comprimirImagem } from "../otimizarAnexo.js";

// ─────────────────────────────────────────────
// Arquivos da Educação financeira, no mesmo armazenamento dos anexos (UPLOADS_DIR).
// - Materiais (PDF, planilhas, documentos...): até 20 MB, gravados SEM compressão
//   (planilha comprimida/convertida perderia fórmulas). Download sempre como "attachment".
// - Capas e fotos de autor: foto reduzida para JPEG (reaproveita comprimirImagem dos anexos).
// ─────────────────────────────────────────────

export const LIMITE_MATERIAL = 20 * 1024 * 1024;
export const LIMITE_IMAGEM_ENVIO = 15 * 1024 * 1024;
export const LIMITE_CAPA = 700 * 1024; // gravado
export const MAX_MATERIAIS = 20;

// Extensões aceitas e o tipo enviado no download
const MIME_POR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  odt: "application/vnd.oasis.opendocument.text",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain",
  zip: "application/zip",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const ZIPADOS = ["xlsx", "xlsm", "ods", "docx", "odt", "pptx", "zip"];
const OLE = ["xls", "doc", "ppt"];
const TEXTO = ["csv", "txt"];

export const MSG_MATERIAL_TIPO = "Tipo de arquivo não aceito. Envie PDF, planilha (XLSX, XLS, ODS, CSV), documento (DOCX, DOC, ODT, TXT), apresentação (PPTX, PPT), ZIP ou imagem.";

function extensao(nome: string) {
  const m = nome.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return m?.[1] ?? "";
}

// Parece texto? (sem bytes nulos nem de controle nos primeiros 8 KB)
function pareceTexto(b: Buffer) {
  const amostra = b.subarray(0, 8192);
  for (const byte of amostra) if (byte === 0 || (byte < 9 && byte !== 0)) return false;
  return true;
}

// Confere o conteúdo (primeiros bytes) contra a extensão do nome. Nunca confia só no nome.
export function tipoDoMaterial(dados: Buffer, nome: string): { mime: string; ext: string } | null {
  const ext = extensao(nome);
  const img = tipoDoArquivo(dados);
  if (img) {
    if (img.mime === "image/heic") return null;
    return img; // PDF e imagens: o conteúdo manda
  }
  const zip = dados.length >= 4 && dados[0] === 0x50 && dados[1] === 0x4b && dados[2] === 0x03 && dados[3] === 0x04;
  if (zip) return ZIPADOS.includes(ext) ? { mime: MIME_POR_EXT[ext], ext } : { mime: MIME_POR_EXT.zip, ext: "zip" };
  const ole = dados.length >= 8 && dados.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ole) return OLE.includes(ext) ? { mime: MIME_POR_EXT[ext], ext } : null;
  if (TEXTO.includes(ext) && pareceTexto(dados)) return { mime: MIME_POR_EXT[ext], ext };
  return null;
}

export async function gravarMaterial(dados: Buffer, nomeOriginal: string) {
  if (!dados.length) throw new AnexoRecusado("Envie um arquivo.", 400);
  if (dados.length > LIMITE_MATERIAL) throw new AnexoRecusado("Arquivo grande demais. O limite é 20 MB por material.", 413);
  const tipo = tipoDoMaterial(dados, nomeOriginal);
  if (!tipo) throw new AnexoRecusado(MSG_MATERIAL_TIPO, 400);
  let nome = limparNomeArquivo(nomeOriginal, tipo.ext);
  if (extensao(nome) !== tipo.ext) nome = `${nome.replace(/\.[a-z0-9]{1,5}$/i, "")}.${tipo.ext}`;
  const chave = await armazenamento().salvar(dados, tipo.ext);
  return { chave, nome, mime: tipo.mime, size: dados.length };
}

// Capa / foto: JPG, PNG, WEBP ou HEIC → JPEG reduzido (até 700 KB)
export async function gravarImagem(dados: Buffer) {
  if (!dados.length) throw new AnexoRecusado("Envie uma imagem.", 400);
  const tipo = tipoDoArquivo(dados);
  if (!tipo || tipo.mime === "application/pdf") throw new AnexoRecusado("Envie uma imagem JPG, PNG, WEBP ou HEIC.", 400);
  const jpeg = await comprimirImagem(dados, tipo.mime === "image/heic", LIMITE_CAPA);
  return armazenamento().salvar(jpeg, "jpg");
}

export { apagarArquivos };

// Nome mandado pelo app (X-File-Name, encodeURIComponent)
export function nomeDoEnvio(req: Request) {
  let nome = req.header("x-file-name") ?? "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    // mal codificado: fica como veio
  }
  return nome;
}

// Corpo cru com limite e mensagem clara (413)
export function corpoCru(limite: number, mensagem: string) {
  const ler = express.raw({ type: () => true, limit: limite });
  return (req: Request, res: Response, next: NextFunction) => {
    if (Number(req.header("content-length") ?? 0) > limite) return res.status(413).json({ error: mensagem });
    ler(req, res, (err?: unknown) => {
      if (err) {
        if ((err as { status?: number }).status === 413) return res.status(413).json({ error: mensagem });
        return res.status(400).json({ error: "Não foi possível ler o arquivo enviado." });
      }
      next();
    });
  };
}
