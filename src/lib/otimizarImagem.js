// Otimiza fotos de anexo NO NAVEGADOR antes do upload (sem biblioteca: createImageBitmap + canvas).
// - Só fotos acima de 1,5 MB (OTIMIZAR_ACIMA): celular gera 3–8 MB; um JPEG de 2400 px com qualidade 0,85
//   costuma ficar entre 0,5 e 1,5 MB e o texto do cupom continua nítido. Menos disco e upload mais rápido no 4G.
// - Lado maior: 2400 px; se ainda passar de 3 MB, desce para 2000 e 1600 px (nunca abaixo: o cupom precisa ser lido).
// - Qualidade do JPEG: 0,85 → 0,75 → 0,65 → 0,6 (para no primeiro resultado ≤ 3 MB).
// - Orientação do EXIF aplicada (foto "deitada" fica em pé); EXIF/GPS não vão junto.
// - Se o navegador não consegue abrir (HEIC no Chrome/Android) ou o resultado não ficou menor,
//   manda o original: o servidor reduz o que passar de 3 MB.
// A lógica de escolha (planejarTentativas / otimizarComCodificador) é pura e tem teste sem navegador.

export const LIMITE_ANEXO = 3 * 1024 * 1024; // máximo gravado no servidor
export const OTIMIZAR_ACIMA = 1.5 * 1024 * 1024;
export const LADOS = [2400, 2000, 1600];
export const QUALIDADES = [0.85, 0.75, 0.65, 0.6];

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ehFoto = (arquivo) => TIPOS_FOTO.includes(arquivo.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name ?? "");

// Vale a pena tentar reduzir no navegador?
export const deveOtimizar = (arquivo) => ehFoto(arquivo) && arquivo.size > OTIMIZAR_ACIMA;

// Largura × altura cabendo num quadrado de "lado" (sem aumentar a foto)
export function dimensoesAlvo(largura, altura, lado) {
  const escala = Math.min(1, lado / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

// Ordem das tentativas: maior lado primeiro e, dentro dele, qualidade decrescente.
// Lados repetidos (foto já pequena) são pulados.
export function planejarTentativas(largura, altura) {
  const tentativas = [];
  const vistos = new Set();
  for (const lado of LADOS) {
    const alvo = dimensoesAlvo(largura, altura, lado);
    const chave = `${alvo.largura}x${alvo.altura}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    for (const qualidade of QUALIDADES) tentativas.push({ ...alvo, qualidade });
  }
  return tentativas;
}

// Roda as tentativas com um "codificar(largura, altura, qualidade) → Blob" e devolve a primeira ≤ limite
// (ou null se nenhuma couber). No navegador o codificador é o canvas; nos testes, um falso.
export async function otimizarComCodificador({ largura, altura }, codificar, limite = LIMITE_ANEXO) {
  for (const t of planejarTentativas(largura, altura)) {
    const blob = await codificar(t.largura, t.altura, t.qualidade);
    if (blob && blob.size <= limite) return { blob, ...t };
  }
  return null;
}

// "IMG_1234.HEIC" → "IMG_1234.jpg"
export const nomeJpg = (nome) => `${(nome || "foto").replace(/\.[a-z0-9]{1,5}$/i, "") || "foto"}.jpg`;

// Escolhe o que enviar: o otimizado só se ficou menor (e coube no limite); senão o original
export function escolherResultado(original, otimizado, limite = LIMITE_ANEXO) {
  if (otimizado && otimizado.size <= limite && otimizado.size < original.size) return { arquivo: otimizado, otimizado: true };
  return { arquivo: original, otimizado: false };
}

// ── Parte que só roda no navegador ─────────────

async function abrirNoNavegador(arquivo) {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" = aplica a orientação do EXIF
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    } catch {
      // alguns navegadores não aceitam a opção: tenta pela tag <img> (que também respeita o EXIF)
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function codificadorCanvas(imagem) {
  return (largura, altura, qualidade) =>
    new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#ffffff"; // PNG transparente: fundo branco no JPEG
      ctx.fillRect(0, 0, largura, altura);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imagem, 0, 0, largura, altura);
      canvas.toBlob((blob) => {
        canvas.width = canvas.height = 0; // libera a memória (iOS é sensível a isso)
        resolve(blob);
      }, "image/jpeg", qualidade);
    });
}

// Devolve { arquivo, otimizado, tamanhoOriginal }. Nunca lança: em qualquer falha manda o original.
export async function otimizarImagem(arquivo) {
  const tamanhoOriginal = arquivo.size;
  if (!deveOtimizar(arquivo)) return { arquivo, otimizado: false, tamanhoOriginal };
  let imagem;
  try {
    imagem = await abrirNoNavegador(arquivo);
    const largura = imagem.width ?? imagem.naturalWidth;
    const altura = imagem.height ?? imagem.naturalHeight;
    if (!largura || !altura) return { arquivo, otimizado: false, tamanhoOriginal };
    const r = await otimizarComCodificador({ largura, altura }, codificadorCanvas(imagem));
    const novo = r ? new File([r.blob], nomeJpg(arquivo.name), { type: "image/jpeg", lastModified: Date.now() }) : null;
    return { ...escolherResultado(arquivo, novo), tamanhoOriginal };
  } catch {
    return { arquivo, otimizado: false, tamanhoOriginal };
  } finally {
    imagem?.close?.();
  }
}
