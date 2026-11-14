import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import decodificarHeic from "heic-decode";

// ─────────────────────────────────────────────
// Otimização de anexos ANTES de gravar (rede de segurança do servidor).
// O navegador já reduz as fotos comuns; aqui tratamos o que chegar grande demais:
// - Foto (JPG, PNG, WEBP, HEIC) acima de 3 MB → JPEG com lado maior de 2400 px (desce até 1600 px)
//   e qualidade de 85 a 60, orientação corrigida pelo EXIF, sem metadados (GPS etc.).
// - PDF acima de 3 MB → Ghostscript /ebook (imagens a ~150 dpi, texto continua vetorial).
// Nunca grava acima de 3 MB: se não der, recusa com uma mensagem clara.
// ─────────────────────────────────────────────

export const LIMITE_ANEXO = 3 * 1024 * 1024; // tamanho máximo GRAVADO
export const LIMITE_ENVIO = 15 * 1024 * 1024; // tamanho máximo RECEBIDO (antes de otimizar)

// Lado maior da foto: começa em 2400 px e nunca desce de 1600 px (texto de cupom continua legível)
export const LADOS = [2400, 2000, 1600];
export const QUALIDADES = [85, 75, 65, 60];
// Foto HEIC é decodificada inteira na memória (4 bytes por pixel): acima disso recusamos
const MAX_PIXELS_HEIC = 50_000_000;

export type TipoArquivo = { mime: string; ext: string };

export class AnexoRecusado extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const MSG_IMAGEM_ILEGIVEL = "Não foi possível ler esta imagem. Envie outra foto (JPG, PNG, WEBP ou HEIC).";
export const MSG_IMAGEM_GRANDE = "Não foi possível reduzir esta foto para 3 MB sem perder a leitura. Tente tirar a foto mais de perto ou com menos resolução.";
export const MSG_PDF_GRANDE = "Este PDF passa de 3 MB mesmo depois de comprimido. Envie uma foto do comprovante ou um PDF menor.";

const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

sharp.cache(false); // a API roda numa VPS pequena: não guardar imagens decodificadas na memória

export type Otimizado = { dados: Buffer; tipo: TipoArquivo; otimizado: boolean };

// Devolve o arquivo pronto para gravar (≤ limite) ou lança AnexoRecusado
export async function otimizarAnexo(dados: Buffer, tipo: TipoArquivo, limite = LIMITE_ANEXO): Promise<Otimizado> {
  if (dados.length <= limite) return { dados, tipo, otimizado: false };
  if (IMAGENS.includes(tipo.mime)) {
    const jpeg = await comprimirImagem(dados, tipo.mime === "image/heic", limite);
    return { dados: jpeg, tipo: { mime: "image/jpeg", ext: "jpg" }, otimizado: true };
  }
  if (tipo.mime === "application/pdf") {
    const pdf = await comprimirPdf(dados);
    if (!pdf || pdf.length > limite) throw new AnexoRecusado(MSG_PDF_GRANDE, 413);
    return { dados: pdf, tipo, otimizado: true };
  }
  throw new AnexoRecusado("Arquivo grande demais. O limite é 3 MB por arquivo.", 413);
}

// ── Fotos ─────────────────────────────────────

async function abrirImagem(dados: Buffer, heic: boolean): Promise<sharp.Sharp> {
  if (!heic) {
    // rotate() sem ângulo = aplica a orientação do EXIF (foto de celular "deitada")
    return sharp(dados, { failOn: "error" }).rotate();
  }
  // O sharp pré-compilado não lê HEIC (HEVC, patente): decodificamos com libheif (WebAssembly).
  // A libheif já aplica a rotação/espelhamento gravados no próprio HEIC.
  const imagens = await decodificarHeic.all({ buffer: dados });
  const principal = imagens[0];
  if (!principal) throw new Error("HEIC sem imagem");
  if (principal.width * principal.height > MAX_PIXELS_HEIC) throw new AnexoRecusado(MSG_IMAGEM_GRANDE, 413);
  const { width, height, data } = await principal.decode();
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
}

export async function comprimirImagem(dados: Buffer, heic: boolean, limite = LIMITE_ANEXO): Promise<Buffer> {
  let base: sharp.Sharp;
  try {
    base = await abrirImagem(dados, heic);
    if (!heic) await base.metadata(); // confere se dá para ler antes de tentar
  } catch (e) {
    if (e instanceof AnexoRecusado) throw e;
    throw new AnexoRecusado(MSG_IMAGEM_ILEGIVEL, 400);
  }
  for (const lado of LADOS) {
    for (const quality of QUALIDADES) {
      let saida: Buffer;
      try {
        saida = await base
          .clone()
          .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" }) // PNG transparente: fundo branco no JPEG
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } catch {
        throw new AnexoRecusado(MSG_IMAGEM_ILEGIVEL, 400);
      }
      if (saida.length <= limite) return saida;
    }
  }
  throw new AnexoRecusado(MSG_IMAGEM_GRANDE, 413);
}

// ── PDF ───────────────────────────────────────

const executar = promisify(execFile);

// Ghostscript /ebook. Devolve null se o gs não existir ou falhar (o chamador recusa com mensagem clara).
export async function comprimirPdf(dados: Buffer): Promise<Buffer | null> {
  const pasta = await mkdtemp(path.join(tmpdir(), "anexo-pdf-"));
  try {
    const entrada = path.join(pasta, "entrada.pdf");
    const saida = path.join(pasta, "saida.pdf");
    await writeFile(entrada, dados);
    await executar(
      "gs",
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        // PDF quebrado: falha em vez de "consertar" e gravar uma página em branco no lugar do comprovante
        "-dPDFSTOPONERROR",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.5",
        "-dPDFSETTINGS=/ebook",
        "-dDetectDuplicateImages=true",
        `-sOutputFile=${saida}`,
        entrada,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const resultado = await readFile(saida);
    if (resultado.length < 5 || resultado.toString("latin1", 0, 5) !== "%PDF-") return null;
    // Se o "comprimido" ficou maior, fica com o original (o chamador confere o limite)
    return resultado.length < dados.length ? resultado : dados;
  } catch (e) {
    console.error("Anexo: falha ao comprimir PDF", (e as Error).message);
    return null;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

// "IMG_1234.HEIC" → "IMG_1234.jpg" quando a foto virou JPEG
export function trocarExtensao(nome: string, ext: string) {
  const base = nome.replace(/\.[a-z0-9]{1,5}$/i, "");
  return `${base || "anexo"}.${ext}`;
}
