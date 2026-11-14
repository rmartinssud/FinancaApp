import { spawn } from "node:child_process";
import { env } from "../../env.js";
import { provedorIA, type ProvedorIA } from "./ia.js";
import { enviarAudio, subirMidia } from "./cliente.js";

// ─────────────────────────────────────────────
// Resposta em áudio (nota de voz) do assistente do WhatsApp.
//
// 1. paraFala(): o texto do WhatsApp vira texto para ler em voz alta (sem *negrito*, sem emojis,
//    "R$ 45,90" → "quarenta e cinco reais e noventa centavos", datas e porcentagens por extenso) e cabe em ~60 s.
// 2. ProvedorIA.sintetizarFala() (hoje Gemini TTS) devolve WAV ou PCM 16-bit mono.
// 3. ffmpeg converte para OGG/Opus mono (o WhatsApp só aceita nota de voz assim).
// 4. Sobe a mídia (POST /{phone_number_id}/media) e manda {type:"audio", audio:{id, voice:true}}.
// Qualquer falha (sem voz, TTS fora do ar, sem ffmpeg, upload recusado): devolve false e a resposta vai só em texto.
// WHATSAPP_AUDIO_RESPOSTA=off desliga tudo.
// ─────────────────────────────────────────────

export type ModoResposta = "AUTO" | "TEXT" | "AUDIO";

// ~150 palavras por minuto em pt-BR: 150 palavras ≈ 60 s de fala
export const MAX_PALAVRAS_FALA = 150;
const TEMPO_TTS_MS = 25_000;
const TEMPO_FFMPEG_MS = 15_000;
const AVISO_CORTE = "Os detalhes estão na mensagem escrita.";

// IA com voz e áudio ligado?
export function provedorComVoz(): ProvedorIA | null {
  if (env.WHATSAPP_AUDIO_RESPOSTA === "off") return null;
  const ia = provedorIA();
  return ia?.sintetizarFala ? ia : null;
}

// Responder em áudio? AUTO = só quando a pessoa mandou áudio
export function querResponderEmAudio(modo: ModoResposta, entradaEmAudio: boolean) {
  if (!provedorComVoz()) return false;
  if (modo === "TEXT") return false;
  if (modo === "AUDIO") return true;
  return entradaEmAudio;
}

// ── Números por extenso (pt-BR) ───────────────

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d];
  }
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[c]} e ${ate999(resto)}` : CENTENAS[c];
}

// Inteiro ≥ 0 por extenso: 1234 → "mil duzentos e trinta e quatro"
export function porExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 1000) return ate999(n);
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const nomes: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"], ["trilhão", "trilhões"]];
  const partes: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    if (i === 0) partes.push(ate999(g));
    else if (i === 1) partes.push(g === 1 ? "mil" : `${ate999(g)} mil`);
    else partes.push(`${ate999(g)} ${g === 1 ? nomes[i][0] : nomes[i][1]}`);
  }
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (mil e cem, dois mil e cinquenta)
  const ultimo = grupos[0];
  if (partes.length > 1 && ultimo && (ultimo < 100 || ultimo % 100 === 0)) {
    const fim = partes.pop()!;
    return `${partes.join(" ")} e ${fim}`;
  }
  return partes.join(" ");
}

// "1.234,56" (formato brasileiro) → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"
export function reaisPorExtenso(valor: string, negativo = false): string {
  const [inteiroBruto, centavosBruto = ""] = valor.replace(/\./g, "").split(",");
  const inteiro = Number(inteiroBruto || "0");
  const centavos = Number(centavosBruto.padEnd(2, "0").slice(0, 2) || "0");
  const partes: string[] = [];
  if (inteiro > 0 || centavos === 0) {
    const ext = porExtenso(inteiro);
    // "um milhão de reais", "dois mil reais"
    const de = inteiro >= 1_000_000 && inteiro % 1_000_000 === 0 ? " de" : "";
    partes.push(`${ext}${de} ${inteiro === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${porExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return `${negativo ? "menos " : ""}${partes.join(" e ")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function decimalPorExtenso(s: string) {
  const [i, d] = s.replace(/\./g, "").split(",");
  const inteiro = porExtenso(Number(i));
  if (!d || /^0+$/.test(d)) return inteiro;
  // "12,5" → "doze vírgula cinco"; "3,05" → "três vírgula zero cinco"
  const casas = d.startsWith("0") ? d.split("").map((x) => UNIDADES[Number(x)]).join(" ") : porExtenso(Number(d));
  return `${inteiro} vírgula ${casas}`;
}

// ── Texto do WhatsApp → texto para falar ──────

const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function paraFala(texto: string, maxPalavras = MAX_PALAVRAS_FALA): string {
  let s = texto
    .replace(/https?:\/\/\S+/g, "")
    .replace(EMOJI, "")
    .replace(/[*_~`]+/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s*[›·|]\s*/g, ", ")
    // Dinheiro: "R$ 1.234,56", "-R$ 45,00", "R$ -45,00"
    .replace(/(-\s?)?R\$\s?(-\s?)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (_m, neg1, neg2, inteiro, cent) =>
      reaisPorExtenso(cent ? `${inteiro},${cent}` : inteiro, Boolean(neg1 || neg2)),
    )
    // Porcentagem: "12,5%" → "doze vírgula cinco por cento"
    .replace(/(\d+(?:\.\d{3})*(?:,\d+)?)\s?%/g, (_m, n) => `${decimalPorExtenso(n)} por cento`)
    // Datas: "14/11" ou "14/11/2026" → "catorze de novembro (de 2026)"
    .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (m, d, mes, ano) => {
      const dia = Number(d);
      const mm = Number(mes);
      if (dia < 1 || dia > 31 || mm < 1 || mm > 12) return m;
      return `${dia === 1 ? "primeiro" : porExtenso(dia)} de ${MESES[mm - 1]}${ano ? ` de ${porExtenso(Number(ano))}` : ""}`;
    })
    // Parcelas: "10x" → "dez vezes"
    .replace(/\b(\d{1,3})\s?x\b/gi, (_m, n) => `${porExtenso(Number(n))} ${Number(n) === 1 ? "vez" : "vezes"}`)
    .replace(/^\s*[•\-]\s*/gm, "");

  // Cada linha vira uma frase (listas do WhatsApp)
  s = s
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`))
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.!?])\s*[.:]+/g, "$1")
    .replace(/,\s*\./g, ".")
    .trim();

  // Limite de ~60 s: corta em frase inteira e avisa que o resto está no texto
  const palavras = s.split(/\s+/).filter(Boolean);
  if (palavras.length <= maxPalavras) return s;
  const frases = s.match(/[^.!?]+[.!?]+/g) ?? [s];
  let saida = "";
  let total = 0;
  const limite = maxPalavras - AVISO_CORTE.split(" ").length;
  for (const f of frases) {
    const n = f.trim().split(/\s+/).length;
    if (total + n > limite) break;
    saida += `${f.trim()} `;
    total += n;
  }
  if (!saida) saida = `${palavras.slice(0, limite).join(" ")}... `;
  return `${saida}${AVISO_CORTE}`.trim();
}

// ── Conversão para OGG/Opus (ffmpeg) ──────────

export type ConversorAudio = (audio: Buffer, mime: string) => Promise<Buffer>;

const ehWav = (audio: Buffer, mime: string) => audio.subarray(0, 4).toString("ascii") === "RIFF" || /wav/i.test(mime);
const taxaDoMime = (mime: string) => Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000);

// Segundos de fala (para o log de custo)
export function duracaoSegundos(audio: Buffer, mime: string) {
  const bytes = ehWav(audio, mime) ? Math.max(0, audio.length - 44) : audio.length;
  return bytes / (taxaDoMime(mime) * 2);
}

export const converterComFfmpeg: ConversorAudio = (audio, mime) =>
  new Promise((resolve, reject) => {
    const entrada = ehWav(audio, mime) ? ["-i", "pipe:0"] : ["-f", "s16le", "-ar", String(taxaDoMime(mime)), "-ac", "1", "-i", "pipe:0"];
    const args = ["-hide_banner", "-loglevel", "error", ...entrada, "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", "pipe:1"];
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(env.FFMPEG_PATH || "ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      return reject(e);
    }
    const saida: Buffer[] = [];
    let erro = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), TEMPO_FFMPEG_MS);
    proc.stdout!.on("data", (d: Buffer) => saida.push(d));
    proc.stderr!.on("data", (d: Buffer) => (erro += d.toString().slice(0, 500)));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (codigo) => {
      clearTimeout(timer);
      const ogg = Buffer.concat(saida);
      if (codigo === 0 && ogg.length > 0) resolve(ogg);
      else reject(new Error(`ffmpeg saiu com ${codigo}: ${erro.trim() || "sem saída"}`));
    });
    proc.stdin!.on("error", () => undefined); // ffmpeg fechou antes de ler tudo: o "close" acima explica
    proc.stdin!.end(audio);
  });

let conversorSubstituto: ConversorAudio | undefined;
// Testes: troca a conversão (undefined volta ao ffmpeg)
export function definirConversorAudio(c: ConversorAudio | undefined) {
  conversorSubstituto = c;
}

// ── Mandar a nota de voz ──────────────────────

// true = a nota de voz foi enviada. Nunca lança: falhou, a resposta segue só em texto.
export async function enviarVoz(para: string, texto: string, meta: { userId: string }): Promise<boolean> {
  const ia = provedorComVoz();
  if (!ia?.sintetizarFala) return false;
  const fala = paraFala(texto);
  if (!fala) return false;
  const inicio = Date.now();
  let etapa = "tts";
  try {
    const voz = await ia.sintetizarFala(fala, { sinal: AbortSignal.timeout(TEMPO_TTS_MS) });
    const tts = Date.now() - inicio;
    etapa = "ffmpeg";
    const ogg = await (conversorSubstituto ?? converterComFfmpeg)(voz.audio, voz.mime);
    const conversao = Date.now() - inicio - tts;
    etapa = "envio";
    const id = await subirMidia(ogg, "audio/ogg", "resposta.ogg");
    await enviarAudio(para, id, true);
    // Custo: tamanho e tempo, sem o conteúdo nem o número
    console.info(
      `WhatsApp TTS: user=${meta.userId} provedor=${ia.nome} modelo=${voz.modelo} caracteres=${fala.length} segundos=${duracaoSegundos(voz.audio, voz.mime).toFixed(1)} ` +
        `tokens=${voz.tokens?.total ?? "-"} ogg_bytes=${ogg.length} tts_ms=${tts} ffmpeg_ms=${conversao} total_ms=${Date.now() - inicio}`,
    );
    return true;
  } catch (e) {
    console.warn(`WhatsApp TTS: falhou em ${etapa}, resposta só em texto (${e instanceof Error ? e.message.slice(0, 200) : e}) user=${meta.userId} ms=${Date.now() - inicio}`);
    return false;
  }
}
