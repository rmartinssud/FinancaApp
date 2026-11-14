import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { armazenamento } from "../src/services/armazenamento.js";
import {
  LIMITE_ANEXO,
  LIMITE_ENVIO,
  MSG_IMAGEM_GRANDE,
  MSG_PDF_GRANDE,
  comprimirImagem,
  otimizarAnexo,
  trocarExtensao,
} from "../src/services/otimizarAnexo.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();
type Agent = Awaited<ReturnType<typeof familiaLogada>>["agent"];

// "Foto de cupom" de celular: 4032×3024, fundo com textura (papel/sensor) e linhas de texto.
// O ruído faz o arquivo ficar grande como uma foto real (bem acima de 3 MB).
async function fotoDeCupom(formato: "jpeg" | "png", orientacao?: number, amplitude = 70) {
  const W = 4032;
  const H = 3024;
  const fundo = Buffer.alloc(W * H * 3);
  let x = 2463534242; // xorshift32: ruído determinístico
  for (let i = 0; i < fundo.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    fundo[i] = 170 + ((x >>> 0) % amplitude);
  }
  const linhas = Array.from(
    { length: 28 },
    (_, i) => `<rect x="200" y="${150 + i * 100}" width="${1800 + (i % 5) * 300}" height="40" fill="#111"/>`,
  ).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${linhas}</svg>`);
  let img = sharp(fundo, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: svg }]);
  img = formato === "jpeg" ? img.jpeg({ quality: 98 }) : img.png();
  if (orientacao) img = img.withMetadata({ orientation: orientacao });
  return img.toBuffer();
}

// PDF com uma "digitalização" em JPEG de alta resolução (como scanner de celular): o /ebook reduz bem
function pdfComImagem(jpeg: Buffer, largura: number, altura: number) {
  const partes: Buffer[] = [];
  const offsets: number[] = [];
  let tamanho = 0;
  const add = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    partes.push(buf);
    tamanho += buf.length;
  };
  const obj = (n: number, corpo: (string | Buffer)[]) => {
    offsets[n] = tamanho;
    add(`${n} 0 obj\n`);
    corpo.forEach(add);
    add("\nendobj\n");
  };
  const conteudo = "q 595 0 0 842 0 0 cm /Im0 Do Q";
  add("%PDF-1.4\n");
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  obj(3, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"]);
  obj(4, [
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  obj(5, [`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`]);
  const xref = tamanho;
  add(`xref\n0 6\n0000000000 65535 f \n`);
  for (let n = 1; n <= 5; n++) add(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(partes);
}

const temGhostscript = (() => {
  try {
    execFileSync("gs", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

async function lancar(agent: Agent, contaId: string) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Mercado", amount: "45.9", accountId: contaId, date: "2026-07-10", status: "CONFIRMED" });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const enviar = (agent: Agent, id: string, dados: Buffer, tipo: string, nome: string) =>
  agent.post(`/api/transactions/${id}/attachments`).set("Content-Type", tipo).set("X-File-Name", encodeURIComponent(nome)).send(dados);

let jpegGrande: Buffer;
let pngGrande: Buffer;
beforeAll(async () => {
  jpegGrande = await fotoDeCupom("jpeg", 6); // EXIF: girada 90° (celular em pé)
  pngGrande = await fotoDeCupom("png", undefined, 4); // print/scan "limpo": PNG entre 3 e 15 MB
}, 60_000);

describe("anexos: compressão antes de gravar", () => {
  it("foto JPEG grande (com EXIF girado) é gravada ≤ 3 MB, em pé, com lado maior entre 1600 e 2400 px", async () => {
    expect(jpegGrande.length).toBeGreaterThan(LIMITE_ANEXO);
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);

    const up = await enviar(f.agent, id, jpegGrande, "image/jpeg", "IMG_0001.jpg");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.mime).toBe("image/jpeg");
    expect(up.body.size).toBeLessThanOrEqual(LIMITE_ANEXO);
    expect(up.body.size).toBeLessThan(jpegGrande.length);

    const salvo = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
    const dados = await armazenamento().ler(salvo.storageKey);
    expect(dados.length).toBe(salvo.size);
    const meta = await sharp(dados).metadata();
    // Original 4032×3024 com orientação 6 → em pé: altura > largura
    expect(meta.height!).toBeGreaterThan(meta.width!);
    const maior = Math.max(meta.width!, meta.height!);
    expect(maior).toBeGreaterThanOrEqual(1600);
    expect(maior).toBeLessThanOrEqual(2400);
    expect(meta.orientation ?? 1).toBe(1); // sem EXIF de rotação sobrando
  });

  it("PNG grande vira JPEG ≤ 3 MB e o nome troca a extensão", async () => {
    expect(pngGrande.length).toBeGreaterThan(LIMITE_ANEXO);
    expect(pngGrande.length).toBeLessThan(LIMITE_ENVIO);
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const up = await enviar(f.agent, id, pngGrande, "image/png", "Cupom mercado.png");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({ mime: "image/jpeg", originalName: "Cupom mercado.jpg" });
    expect(up.body.size).toBeLessThanOrEqual(LIMITE_ANEXO);
  });

  it("foto pequena (≤ 3 MB) é gravada como veio, byte a byte", async () => {
    const pequena = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ddd" } }).jpeg().toBuffer();
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const up = await enviar(f.agent, id, pequena, "image/jpeg", "a.jpg");
    expect(up.status).toBe(201);
    expect(up.body.size).toBe(pequena.length);
  });

  it("não reduz abaixo de 1600 px: se nem assim couber, recusa com mensagem clara", async () => {
    await expect(comprimirImagem(jpegGrande, false, 20_000)).rejects.toThrow(MSG_IMAGEM_GRANDE);
  });

  it("imagem corrompida (assinatura JPEG mas conteúdo inválido) acima de 3 MB → 400 em pt-BR", async () => {
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const falsa = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(LIMITE_ANEXO + 10, 7)]);
    const r = await enviar(f.agent, id, falsa, "image/jpeg", "x.jpg");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Não foi possível ler esta imagem/);
    expect(await prisma.transactionAttachment.count({ where: { transactionId: id } })).toBe(0);
  });

  it("tipo inválido grande continua recusado (antes de tentar comprimir)", async () => {
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(5 * 1024 * 1024, 1)]);
    const r = await enviar(f.agent, id, exe, "image/png", "foto.png");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Tipo de arquivo não aceito/);
  });

  it("acima do limite bruto de 15 MB → 413 sem ler o corpo todo", async () => {
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const enorme = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(LIMITE_ENVIO, 1)]);
    const r = await enviar(f.agent, id, enorme, "image/jpeg", "enorme.jpg");
    expect(r.status).toBe(413);
    expect(r.body.error).toMatch(/15 MB/);
  });

  it.skipIf(!temGhostscript)("PDF grande (digitalização) é comprimido com Ghostscript e gravado ≤ 3 MB", async () => {
    const scan = await sharp(await fotoDeCupom("jpeg")).jpeg({ quality: 98 }).toBuffer();
    const pdf = pdfComImagem(scan, 4032, 3024);
    expect(pdf.length).toBeGreaterThan(LIMITE_ANEXO);
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const up = await enviar(f.agent, id, pdf, "application/pdf", "boleto.pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({ mime: "application/pdf", originalName: "boleto.pdf" });
    expect(up.body.size).toBeLessThanOrEqual(LIMITE_ANEXO);
    const salvo = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
    expect((await armazenamento().ler(salvo.storageKey)).toString("latin1", 0, 5)).toBe("%PDF-");
  }, 60_000);

  it("PDF que não cabe em 3 MB nem comprimido (ou inválido) é recusado sugerindo foto", async () => {
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const invalido = Buffer.concat([Buffer.from("%PDF-1.4\n%quebrado\n"), Buffer.alloc(LIMITE_ANEXO + 100, 0x20)]);
    const r = await enviar(f.agent, id, invalido, "application/pdf", "grande.pdf");
    expect(r.status).toBe(413);
    expect(r.body.error).toBe(MSG_PDF_GRANDE);
    expect(await prisma.transactionAttachment.count({ where: { transactionId: id } })).toBe(0);
    if (temGhostscript) {
      // PDF válido, mas com limite minúsculo: comprime e mesmo assim não cabe
      const pdf = pdfComImagem(await sharp({ create: { width: 2000, height: 2000, channels: 3, background: "#888" } }).jpeg({ quality: 100 }).toBuffer(), 2000, 2000);
      await expect(otimizarAnexo(pdf, { mime: "application/pdf", ext: "pdf" }, 500)).rejects.toThrow(MSG_PDF_GRANDE);
    }
  }, 60_000);

  // HEIC real (HEVC) não dá para gerar aqui; use uma amostra se houver (ex.: example.heic da libheif)
  const AMOSTRA_HEIC = process.env.HEIC_AMOSTRA || "/tmp/fx/ex.heic";
  it.skipIf(!existsSync(AMOSTRA_HEIC))("HEIC acima do limite é convertido para JPEG (libheif) e fica ≤ limite", async () => {
    const heic = readFileSync(AMOSTRA_HEIC);
    const limite = Math.floor(heic.length / 2);
    const r = await otimizarAnexo(heic, { mime: "image/heic", ext: "heic" }, limite);
    expect(r.tipo).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(r.dados.length).toBeLessThanOrEqual(limite);
    const meta = await sharp(r.dados).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(0);
  }, 60_000);

  it("HEIC pequeno continua gravado como HEIC (download existente segue igual)", async () => {
    const heicFalso = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(200, 1)]);
    const f = await familiaLogada(app);
    const id = await lancar(f.agent, f.carteiraId);
    const up = await enviar(f.agent, id, heicFalso, "image/heic", "IMG_1.HEIC");
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ mime: "image/heic", originalName: "IMG_1.HEIC" });
    const baixa = await f.agent.get(`/api/attachments/${up.body.id}`);
    expect(baixa.status).toBe(200);
    expect(baixa.headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("trocarExtensao", () => {
    expect(trocarExtensao("IMG_1234.HEIC", "jpg")).toBe("IMG_1234.jpg");
    expect(trocarExtensao("cupom", "jpg")).toBe("cupom.jpg");
    expect(trocarExtensao(".png", "jpg")).toBe("anexo.jpg");
  });
});
