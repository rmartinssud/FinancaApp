import { describe, it, expect } from "vitest";
// Lógica de compressão do FRONT (src/lib/otimizarImagem.js): a parte pura roda sem navegador,
// com um "codificador" falso no lugar do canvas.
import {
  LIMITE_ANEXO,
  OTIMIZAR_ACIMA,
  deveOtimizar,
  dimensoesAlvo,
  escolherResultado,
  nomeJpg,
  otimizarComCodificador,
  planejarTentativas,
} from "../../src/lib/otimizarImagem.js";
import { problemaDoArquivo } from "../../src/lib/anexos.js";

const MB = 1024 * 1024;
const arq = (name: string, type: string, size: number) => ({ name, type, size });

describe("front: otimizar imagem antes do upload", () => {
  it("só tenta reduzir fotos acima de 1,5 MB (PDF nunca)", () => {
    expect(deveOtimizar(arq("a.jpg", "image/jpeg", 5 * MB))).toBe(true);
    expect(deveOtimizar(arq("a.png", "image/png", OTIMIZAR_ACIMA + 1))).toBe(true);
    expect(deveOtimizar(arq("IMG.HEIC", "", 4 * MB))).toBe(true); // Android às vezes manda sem tipo
    expect(deveOtimizar(arq("a.jpg", "image/jpeg", 1 * MB))).toBe(false);
    expect(deveOtimizar(arq("a.pdf", "application/pdf", 8 * MB))).toBe(false);
  });

  it("redimensiona pelo lado maior sem aumentar fotos pequenas", () => {
    expect(dimensoesAlvo(4032, 3024, 2400)).toEqual({ largura: 2400, altura: 1800 });
    expect(dimensoesAlvo(3024, 4032, 2400)).toEqual({ largura: 1800, altura: 2400 });
    expect(dimensoesAlvo(1200, 900, 2400)).toEqual({ largura: 1200, altura: 900 });
  });

  it("tenta 2400 → 2000 → 1600 px com qualidade 0,85 → 0,6, nunca abaixo de 1600 px", () => {
    const t = planejarTentativas(4032, 3024);
    expect(t[0]).toEqual({ largura: 2400, altura: 1800, qualidade: 0.85 });
    expect(t.map((x) => x.qualidade).slice(0, 4)).toEqual([0.85, 0.75, 0.65, 0.6]);
    expect(Math.min(...t.map((x) => Math.max(x.largura, x.altura)))).toBe(1600);
    // Foto já pequena: uma única dimensão (não repete as tentativas)
    expect(planejarTentativas(1000, 800)).toHaveLength(4);
  });

  it("para na primeira tentativa que cabe em 3 MB", async () => {
    const chamadas: string[] = [];
    // Tamanho falso proporcional à área e à qualidade
    const codificar = async (w: number, h: number, q: number) => {
      chamadas.push(`${Math.max(w, h)}@${q}`);
      return { size: Math.round(w * h * q * 0.5) } as Blob;
    };
    const r = await otimizarComCodificador({ largura: 4032, altura: 3024 }, codificar);
    expect(r).not.toBeNull();
    expect(r!.blob.size).toBeLessThanOrEqual(LIMITE_ANEXO);
    expect(chamadas[0]).toBe("2400@0.85");
    expect(chamadas.length).toBe(1);
  });

  it("baixa a qualidade quando a primeira não cabe", async () => {
    const chamadas: string[] = [];
    const codificar = async (w: number, h: number, q: number) => {
      chamadas.push(`${Math.max(w, h)}@${q}`);
      return { size: Math.round(w * h * q * 0.9) } as Blob; // 2400@0,85 ≈ 3,3 MB; 2400@0,75 ≈ 2,9 MB
    };
    const r = await otimizarComCodificador({ largura: 4032, altura: 3024 }, codificar);
    expect(chamadas).toEqual(["2400@0.85", "2400@0.75"]);
    expect(r!.qualidade).toBe(0.75);
  });

  it("devolve null quando nem 1600 px / 0,6 cabe", async () => {
    const r = await otimizarComCodificador({ largura: 4032, altura: 3024 }, async () => ({ size: 4 * MB }) as Blob);
    expect(r).toBeNull();
  });

  it("fica com o original se o otimizado não ficou menor", () => {
    const original = { size: 2 * MB } as File;
    expect(escolherResultado(original, { size: 2.5 * MB } as File)).toEqual({ arquivo: original, otimizado: false });
    const menor = { size: 700 * 1024 } as File;
    expect(escolherResultado(original, menor)).toEqual({ arquivo: menor, otimizado: true });
    expect(escolherResultado(original, null)).toEqual({ arquivo: original, otimizado: false });
  });

  it("nome vira .jpg e o limite de escolha passa a ser 15 MB", () => {
    expect(nomeJpg("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(nomeJpg("cupom.png")).toBe("cupom.jpg");
    expect(problemaDoArquivo(arq("a.jpg", "image/jpeg", 8 * MB) as File)).toBe("");
    expect(problemaDoArquivo(arq("a.pdf", "application/pdf", 16 * MB) as File)).toMatch(/15 MB/);
    expect(problemaDoArquivo(arq("a.exe", "application/x-msdownload", 1 * MB) as File)).toMatch(/envie uma foto/);
  });
});
