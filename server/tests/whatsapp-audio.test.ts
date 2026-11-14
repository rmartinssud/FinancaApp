import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/env.js";
import { RITMO_DIGITANDO, aguardarProcessamento } from "../src/services/whatsapp/bot.js";
import { criarProvedorGemini, definirProvedorIA, type FalaSintetizada, type PedidoConversa, type ProvedorIA, type RespostaConversa } from "../src/services/whatsapp/ia.js";
import { converterComFfmpeg, definirConversorAudio, duracaoSegundos, paraFala, porExtenso, reaisPorExtenso } from "../src/services/whatsapp/voz.js";
import { familiaLogada } from "./helpers.js";

// ─────────────────────────────────────────────
// WhatsApp: lida + "digitando...", resposta em áudio (nota de voz) e preferência texto/áudio.
// IA falsa (definirProvedorIA), TTS falso, conversão ffmpeg trocada (definirConversorAudio) e Meta com fetch mockado.
// ─────────────────────────────────────────────

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
const SEGREDO = env.WHATSAPP_APP_SECRET!;
const PHONE_ID = env.WHATSAPP_PHONE_NUMBER_ID!;

type Chamada = { url: string; corpo: Record<string, any> | null; bruto: unknown };
let chamadas: Chamada[] = [];
let falharLida: "erro" | "rede" | null = null;
let falharUpload = false;

// ── IA falsa ──────────────────────────────────
type Passo = (p: PedidoConversa) => RespostaConversa | Promise<RespostaConversa>;
let fila: Passo[] = [];
let pedidos: PedidoConversa[] = [];
let falas: string[] = [];
let transcricao = "como estão minhas finanças?";
let ttsFalha = false;
const uso = { entrada: 100, saida: 20, total: 120 };
const chamar = (nome: string, args: Record<string, unknown>): RespostaConversa => ({ partes: [{ tipo: "chamada", nome, args }], uso });
const responder = (texto: string): RespostaConversa => ({ partes: [{ tipo: "texto", texto }], uso });

// WAV falso: 44 bytes de cabeçalho + 2 s de silêncio a 24 kHz
const wavFalso = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.alloc(96_000)]);
const OGG_FALSO = Buffer.from("OggS-falso-opus");

const comVoz: ProvedorIA = {
  nome: "falso",
  async transcrever() {
    return transcricao;
  },
  async lerComprovante() {
    return { valor: null, data: null, estabelecimento: null, categoriaSugerida: null, tipo: null };
  },
  async conversar(p) {
    pedidos.push({ ...p, sinal: undefined });
    const passo = fila.shift();
    if (!passo) throw new Error("roteiro acabou");
    return passo(p);
  },
  async sintetizarFala(texto): Promise<FalaSintetizada> {
    falas.push(texto);
    if (ttsFalha) throw new Error("TTS fora do ar");
    return { audio: wavFalso(), mime: "audio/wav", modelo: "tts-falso", tokens: { entrada: 30, saida: 50, total: 80 } };
  },
};
// Mesma IA, sem voz (provedor que não implementa sintetizarFala)
const { sintetizarFala: _semVoz, ...resto } = comVoz;
const semVoz: ProvedorIA = resto;

let conversoes: { bytes: number; mime: string }[] = [];
let conversorFalha = false;

beforeEach(() => {
  chamadas = [];
  fila = [];
  pedidos = [];
  falas = [];
  conversoes = [];
  transcricao = "como estão minhas finanças?";
  ttsFalha = false;
  conversorFalha = false;
  falharLida = null;
  falharUpload = false;
  definirProvedorIA(comVoz);
  definirConversorAudio(async (audio, mime) => {
    conversoes.push({ bytes: audio.length, mime });
    if (conversorFalha) throw new Error("ffmpeg não encontrado");
    return OGG_FALSO;
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada: any, init?: any) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    let corpo: Record<string, any> | null = null;
    try {
      corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      corpo = null;
    }
    chamadas.push({ url, corpo, bruto: init?.body });
    if (url.includes("/v21.0/aud")) {
      const id = url.split("/").pop();
      return new Response(JSON.stringify({ url: `https://lookaside.fbsbx.com/m/${id}`, mime_type: "audio/ogg" }), { status: 200 });
    }
    if (url.startsWith("https://lookaside.fbsbx.com/")) return new Response(Buffer.from("audio-da-pessoa"), { status: 200 });
    if (url.endsWith(`/${PHONE_ID}/media`)) {
      if (falharUpload) return new Response(JSON.stringify({ error: { message: "Param file must be a file with one of the following types", code: 100 } }), { status: 400 });
      return new Response(JSON.stringify({ id: `midia${chamadas.length}` }), { status: 200 });
    }
    if (url.endsWith(`/${PHONE_ID}/messages`)) {
      if (corpo?.status === "read") {
        if (falharLida === "rede") throw new TypeError("fetch failed");
        if (falharLida === "erro") return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100 } }), { status: 400 });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.saida${chamadas.length}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: `URL inesperada: ${url}` } }), { status: 500 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  definirProvedorIA(undefined);
  definirConversorAudio(undefined);
  env.WHATSAPP_ASSISTENTE = undefined;
  env.WHATSAPP_AUDIO_RESPOSTA = undefined;
  RITMO_DIGITANDO.ms = 20_000;
});

// ── WhatsApp simulado ─────────────────────────
const enviadas = (para: string) => chamadas.filter((c) => c.url.endsWith(`/${PHONE_ID}/messages`) && c.corpo?.to === para).map((c) => c.corpo!);
const ultima = (para: string) => enviadas(para).at(-1)!;
const textoDe = (m: Record<string, any>) => m.text?.body ?? m.interactive?.body?.text ?? "";
const botoesDe = (m: Record<string, any>) => (m.interactive?.action?.buttons ?? []).map((b: any) => b.reply.title);
const lidas = (id: string) => chamadas.filter((c) => c.corpo?.status === "read" && c.corpo?.message_id === id);
const uploads = () => chamadas.filter((c) => c.url.endsWith(`/${PHONE_ID}/media`));
let contador = 0;
const celularNovo = () => `55219${6 + Math.floor(Math.random() * 4)}${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

function payload(waId: string, msg: Record<string, unknown>, id = `wamid.audio.${Date.now()}.${++contador}`) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: PHONE_ID }, messages: [{ from: waId, id, ...msg }] } }] }],
  };
}
async function postar(dados: unknown) {
  const corpo = JSON.stringify(dados);
  const assinatura = `sha256=${createHmac("sha256", SEGREDO).update(corpo).digest("hex")}`;
  const res = await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", assinatura).send(corpo);
  expect(res.status).toBe(200);
  await aguardarProcessamento();
}
const texto = (waId: string, body: string, id?: string) => postar(payload(waId, { type: "text", text: { body } }, id));
const audio = (waId: string, id?: string) => postar(payload(waId, { type: "audio", audio: { id: `aud${++contador}`, mime_type: "audio/ogg; codecs=opus" } }, id));

async function ligar(f: Familia) {
  const phone = celularNovo();
  const r = await f.agent.post("/api/whatsapp/link").send({ phone: `+${phone}` });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await texto(phone, `Famicash ${r.body.code}`);
  expect(textoDe(ultima(phone))).toContain("Seu WhatsApp está ligado");
  return phone;
}

// ─────────────────────────────────────────────
describe("WhatsApp: lida e digitando", () => {
  it("marca como lida com typing_indicator antes de responder e renova durante um processamento longo", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    RITMO_DIGITANDO.ms = 40;
    fila.push(async () => {
      await new Promise((r) => setTimeout(r, 150)); // IA demorando
      return responder("Tudo certo por aqui.");
    });
    const inicio = chamadas.length;
    await texto(waId, "como estão minhas finanças?", "wamid.lento1");

    const leituras = lidas("wamid.lento1");
    expect(leituras.length).toBeGreaterThanOrEqual(2); // a primeira + pelo menos uma renovação
    expect(leituras[0].corpo).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.lento1", typing_indicator: { type: "text" } });
    expect(leituras[0].corpo).not.toHaveProperty("to");
    // A leitura vem antes da resposta
    const posLida = chamadas.indexOf(leituras[0]);
    const posResposta = chamadas.findIndex((c, i) => i >= inicio && c.corpo?.to === waId);
    expect(posLida).toBeLessThan(posResposta);
    expect(textoDe(ultima(waId))).toBe("Tudo certo por aqui.");

    // Depois de responder, para de renovar
    const total = lidas("wamid.lento1").length;
    await new Promise((r) => setTimeout(r, 120));
    expect(lidas("wamid.lento1").length).toBe(total);
  });

  it("falha ao marcar lida/digitando (erro da API ou de rede) não bloqueia a resposta", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    falharLida = "erro";
    fila.push(() => responder("Resposta mesmo assim."));
    await texto(waId, "me conta como estou este mês", "wamid.falha1");
    expect(lidas("wamid.falha1")).toHaveLength(1);
    expect(textoDe(ultima(waId))).toBe("Resposta mesmo assim.");

    falharLida = "rede";
    await texto(waId, "saldo", "wamid.falha2"); // comando: sem IA
    expect(lidas("wamid.falha2")).toHaveLength(1);
    expect(textoDe(ultima(waId))).toContain("*Saldo · Pessoal*");
    expect(aviso.mock.calls.some((c) => String(c[0]).includes("falha ao marcar lida/digitando"))).toBe(true);
  });

  it("número desconhecido também recebe lida e a explicação de como ligar", async () => {
    const waId = celularNovo();
    await texto(waId, "oi", "wamid.desconhecido1");
    expect(lidas("wamid.desconhecido1")).toHaveLength(1);
    expect(textoDe(ultima(waId))).toContain("ligue seu número no app");
  });
});

// ─────────────────────────────────────────────
describe("WhatsApp: resposta em áudio", () => {
  it("áudio recebido → nota de voz (TTS + OGG/Opus + upload) e o mesmo texto; o prompt pede resposta curta", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    fila.push((p) => {
      expect(p.sistema).toContain("ESTA resposta também vai como nota de voz");
      expect(p.sistema).toContain("Preferência desta pessoa: automático");
      expect(p.ferramentas.map((x) => x.nome)).toContain("preferencia_de_resposta");
      return responder("Você gastou **R$ 45,90** no mercado em 14/11 e está com 12,5% do orçamento usado. 🛒\n• Dica: guarde R$ 1.200,00 por mês.");
    });
    const antes = enviadas(waId).length;
    await audio(waId);

    // TTS recebeu o texto limpo e falado
    expect(falas).toHaveLength(1);
    expect(falas[0]).toBe(
      "Você gastou quarenta e cinco reais e noventa centavos no mercado em quatorze de novembro e está com doze vírgula cinco por cento do orçamento usado. Dica: guarde mil e duzentos reais por mês.",
    );
    expect(conversoes).toEqual([{ bytes: wavFalso().length, mime: "audio/wav" }]);

    // Upload multipart da nota de voz
    expect(uploads()).toHaveLength(1);
    const form = uploads()[0].bruto as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("audio/ogg");
    const arquivo = form.get("file") as File;
    expect(arquivo.type).toBe("audio/ogg");
    expect(Buffer.from(await arquivo.arrayBuffer()).equals(OGG_FALSO)).toBe(true);

    // Primeiro o áudio (voice: true), depois o texto igual
    const novas = enviadas(waId).slice(antes);
    expect(novas).toHaveLength(2);
    expect(novas[0].type).toBe("audio");
    expect(novas[0].audio).toEqual({ id: expect.stringMatching(/^midia/), voice: true });
    expect(novas[1].type).toBe("text");
    expect(textoDe(novas[1])).toContain("🎤 Entendi: “como estão minhas finanças?”");
    expect(textoDe(novas[1])).toContain("Você gastou *R$ 45,90* no mercado");

    // Log de uso sem conteúdo nem telefone
    const log = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("WhatsApp TTS:"))!;
    expect(log).toContain("modelo=tts-falso");
    expect(log).toContain("segundos=2.0");
    expect(log).toMatch(/tts_ms=\d+/);
    expect(log).not.toContain(waId);
    expect(log).not.toContain("mercado");
  });

  it("texto recebido no modo automático → só texto (sem TTS)", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    fila.push((p) => {
      expect(p.sistema).toContain("Esta resposta vai em texto.");
      return responder("Tudo em dia.");
    });
    await texto(waId, "como estão minhas finanças?");
    expect(falas).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
    expect(enviadas(waId).some((m) => m.type === "audio")).toBe(false);
  });

  it("rascunho por áudio: resumo curto em áudio antes, e os botões Confirmar/Corrigir/Cancelar continuam em texto", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    transcricao = "gastei 45,90 no mercado";
    fila.push(
      () => chamar("preparar_lancamento", { tipo: "DESPESA", valor: "45,90", descricao: "Mercado", categoria: "Mercado" }),
      () => responder("Anotei R$ 45,90 no mercado, hoje."),
    );
    const antes = enviadas(waId).length;
    await audio(waId);
    const novas = enviadas(waId).slice(antes);
    expect(novas.map((m) => m.type)).toEqual(["audio", "interactive"]);
    expect(falas[0]).toBe("Anotei quarenta e cinco reais e noventa centavos no mercado, hoje. Confira na mensagem abaixo e toque em Confirmar, se estiver certo.");
    expect(botoesDe(novas[1])).toEqual(["Confirmar", "Corrigir", "Cancelar"]);
    expect(textoDe(novas[1])).toContain("R$ 45,90 · Mercado");
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(0);
  });

  it("sem o assistente (parser), áudio com lançamento: resumo falado + botões de sempre", async () => {
    env.WHATSAPP_ASSISTENTE = "off";
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    transcricao = "gastei 30 uber";
    const antes = enviadas(waId).length;
    await audio(waId);
    const novas = enviadas(waId).slice(antes);
    expect(novas.map((m) => m.type)).toEqual(["audio", "interactive"]);
    expect(falas[0]).toContain("Preparei uma despesa de trinta reais");
    expect(botoesDe(novas[1])).toEqual(["Confirmar", "Editar categoria", "Cancelar"]);
  });

  it("TTS, ffmpeg ou upload falhando: a resposta vai só em texto, sem erro para a pessoa", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    for (const falha of ["tts", "ffmpeg", "upload"] as const) {
      ttsFalha = falha === "tts";
      conversorFalha = falha === "ffmpeg";
      falharUpload = falha === "upload";
      fila.push(() => responder(`Resposta com falha no ${falha}.`));
      const antes = enviadas(waId).length;
      await audio(waId);
      const novas = enviadas(waId).slice(antes);
      expect(novas.map((m) => m.type), falha).toEqual(["text"]);
      expect(textoDe(novas[0])).toContain(`Resposta com falha no ${falha}.`);
      expect(textoDe(novas[0])).not.toContain("Ops");
      expect(aviso.mock.calls.some((c) => String(c[0]).includes(`falhou em ${falha === "upload" ? "envio" : falha}`)), falha).toBe(true);
    }
    // Provedor sem voz: texto, sem tentar
    definirProvedorIA(semVoz);
    fila.push(() => responder("Sem voz."));
    const antes = enviadas(waId).length;
    await audio(waId);
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["text"]);
  });

  it("kill switch WHATSAPP_AUDIO_RESPOSTA=off: nunca manda áudio e a tela esconde a opção", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    expect((await f.agent.get("/api/whatsapp/link")).body.audioReplies).toBe(true);

    env.WHATSAPP_AUDIO_RESPOSTA = "off";
    fila.push((p) => {
      expect(p.sistema).toContain("Esta resposta vai em texto.");
      return responder("Só texto.");
    });
    const antes = enviadas(waId).length;
    await audio(waId);
    expect(falas).toHaveLength(0);
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["text"]);
    expect((await f.agent.get("/api/whatsapp/link")).body.audioReplies).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe("WhatsApp: preferência texto/áudio", () => {
  it("muda falando com o bot (vale na hora) e pela tela do app", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    const modo = async () => (await prisma.whatsAppLink.findUnique({ where: { waId } }))!.replyMode;
    expect(await modo()).toBe("AUTO");

    // Por áudio: "prefiro respostas em texto" → esta resposta já vai em texto
    transcricao = "prefiro respostas em texto";
    fila.push(
      () => chamar("preferencia_de_resposta", { modo: "texto" }),
      (p) => {
        const r = [...p.mensagens].reverse().flatMap((m) => m.partes).find((x) => x.tipo === "resultado")!;
        expect(r.tipo === "resultado" && r.conteudo.ok).toBe(true);
        return responder("Combinado, daqui pra frente só texto.");
      },
    );
    let antes = enviadas(waId).length;
    await audio(waId);
    expect(await modo()).toBe("TEXT");
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["text"]);

    // Áudio de novo: continua texto
    fila.push((p) => {
      expect(p.sistema).toContain("Preferência desta pessoa: sempre texto");
      expect(p.sistema).toContain("Esta resposta vai em texto.");
      return responder("Seu saldo está positivo.");
    });
    antes = enviadas(waId).length;
    await audio(waId);
    expect(falas).toHaveLength(0);
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["text"]);

    // Por texto: "responda em áudio" → esta resposta já vem em áudio, e as seguintes também (mesmo escrevendo)
    fila.push(
      () => chamar("preferencia_de_resposta", { modo: "audio" }),
      () => responder("Pronto, vou responder em áudio."),
    );
    antes = enviadas(waId).length;
    await texto(waId, "responda em áudio");
    expect(await modo()).toBe("AUDIO");
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["audio", "text"]);
    antes = enviadas(waId).length;
    await texto(waId, "saldo"); // comando também vai em áudio no modo "sempre áudio"
    expect(enviadas(waId).slice(antes).map((m) => m.type)).toEqual(["audio", "text"]);
    expect(falas.at(-1)).toContain("Saldo, Pessoal.");
    expect(falas.at(-1)).not.toContain("*");

    // Pela tela (Segurança › WhatsApp)
    let r = await f.agent.get("/api/whatsapp/link");
    expect(r.body.link.replyMode).toBe("AUDIO");
    expect(r.body.audioReplies).toBe(true);
    r = await f.agent.put("/api/whatsapp/link").send({ replyMode: "AUTO" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.link.replyMode).toBe("AUTO");
    expect(r.body.link.household.id).toBe(f.householdId); // o espaço não muda
    expect(await modo()).toBe("AUTO");
    expect((await f.agent.put("/api/whatsapp/link").send({ replyMode: "VIDEO" })).status).toBe(400);
    expect((await f.agent.put("/api/whatsapp/link").send({})).status).toBe(400);
    // Trocar só o espaço continua funcionando
    expect((await f.agent.put("/api/whatsapp/link").send({ householdId: f.householdId })).status).toBe(200);
  });

  it("a ferramenta só mexe no número de quem está falando e recusa modo inválido", async () => {
    const a = await familiaLogada(app, "Ana");
    const b = await familiaLogada(app, "Bruno");
    const waA = await ligar(a);
    const waB = await ligar(b);
    fila.push(
      () => chamar("preferencia_de_resposta", { modo: "fax" }),
      (p) => {
        const r = [...p.mensagens].reverse().flatMap((m) => m.partes).find((x) => x.tipo === "resultado")!;
        expect(r.tipo === "resultado" && r.conteudo.erro).toContain("auto, texto ou audio");
        return chamar("preferencia_de_resposta", { modo: "texto", waId: waB });
      },
      () => responder("Feito."),
    );
    await texto(waA, "prefiro texto");
    expect((await prisma.whatsAppLink.findUnique({ where: { waId: waA } }))!.replyMode).toBe("TEXT");
    expect((await prisma.whatsAppLink.findUnique({ where: { waId: waB } }))!.replyMode).toBe("AUTO");
  });
});

// ─────────────────────────────────────────────
describe("WhatsApp: voz (peças puras)", () => {
  it("números e reais por extenso", () => {
    expect(porExtenso(0)).toBe("zero");
    expect(porExtenso(21)).toBe("vinte e um");
    expect(porExtenso(100)).toBe("cem");
    expect(porExtenso(101)).toBe("cento e um");
    expect(porExtenso(1000)).toBe("mil");
    expect(porExtenso(1100)).toBe("mil e cem");
    expect(porExtenso(1234)).toBe("mil duzentos e trinta e quatro");
    expect(porExtenso(2050)).toBe("dois mil e cinquenta");
    expect(porExtenso(1_000_000)).toBe("um milhão");
    expect(porExtenso(2_500_000)).toBe("dois milhões quinhentos mil");
    expect(reaisPorExtenso("45,90")).toBe("quarenta e cinco reais e noventa centavos");
    expect(reaisPorExtenso("1,00")).toBe("um real");
    expect(reaisPorExtenso("0,01")).toBe("um centavo");
    expect(reaisPorExtenso("1.234,56")).toBe("mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
    expect(reaisPorExtenso("1.000.000,00")).toBe("um milhão de reais");
    expect(reaisPorExtenso("300", true)).toBe("menos trezentos reais");
  });

  it("paraFala: tira formatação e emojis, lê valores/datas/parcelas e corta em ~60 s", () => {
    expect(paraFala("*Saldo · Pessoal* 💰\n• Carteira: R$ 1.234,56\n• Nubank: -R$ 300,00")).toBe(
      "Saldo, Pessoal. Carteira: mil duzentos e trinta e quatro reais e cinquenta e seis centavos. Nubank: menos trezentos reais.",
    );
    expect(paraFala("TV em 10x no cartão, 1ª parcela 05/12/2026 ✅")).toBe("TV em dez vezes no cartão, 1ª parcela cinco de dezembro de dois mil e vinte e seis.");
    expect(paraFala("Veja em famicash.com › Segurança › WhatsApp")).toBe("Veja em famicash.com, Segurança, WhatsApp.");
    expect(paraFala("🎉🎉")).toBe("");
    const longo = Array.from({ length: 40 }, (_, i) => `Esta é a frase número ${i + 1} da resposta.`).join(" ");
    const falado = paraFala(longo);
    expect(falado.split(/\s+/).length).toBeLessThanOrEqual(150);
    expect(falado).toMatch(/da resposta\. Os detalhes estão na mensagem escrita\.$/);
  });

  it("duração: WAV (cabeçalho de 44 bytes) e PCM cru 24 kHz", () => {
    expect(duracaoSegundos(wavFalso(), "audio/wav")).toBe(2);
    expect(duracaoSegundos(Buffer.alloc(48_000), "audio/L16;codec=pcm;rate=24000")).toBe(1);
  });

  it("adaptador Gemini TTS: generateContent com responseModalities AUDIO, voz e modelo configuráveis", async () => {
    const pcm = Buffer.alloc(4800);
    let pedido: { url: string; corpo: any; chave: string } | null = null;
    vi.mocked(globalThis.fetch).mockImplementation(async (entrada: any, init?: any) => {
      pedido = { url: String(entrada), corpo: JSON.parse(init.body), chave: init.headers["x-goog-api-key"] };
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 25, totalTokenCount: 37 },
        }),
        { status: 200 },
      );
    });
    const g = criarProvedorGemini("chave-teste", "gemini-flash-latest", { modeloTts: "gemini-3.8-flash-lite-tts", voz: "Achird" });
    const r = await g.sintetizarFala!("Olá, tudo bem?");
    expect(pedido!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent");
    expect(pedido!.chave).toBe("chave-teste");
    expect(pedido!.corpo).toEqual({
      contents: [{ role: "user", parts: [{ text: "Olá, tudo bem?" }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Achird" } } } },
    });
    expect(r.audio.equals(pcm)).toBe(true);
    expect(r.mime).toBe("audio/L16;codec=pcm;rate=24000");
    expect(r.modelo).toBe("gemini-3.8-flash-lite-tts");
    expect(r.tokens).toEqual({ entrada: 12, saida: 25, total: 37 });

    // Padrões e erro
    vi.mocked(globalThis.fetch).mockImplementation(async (entrada: any, init?: any) => {
      pedido = { url: String(entrada), corpo: JSON.parse(init.body), chave: "" };
      return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
    });
    await expect(criarProvedorGemini("k").sintetizarFala!("oi")).rejects.toThrow("quota");
    expect(pedido!.url).toContain("/models/gemini-3.8-flash-tts:generateContent");
    expect(pedido!.corpo.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Sulafat");
  });

  const temFfmpeg = (() => {
    try {
      return execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).includes("libopus");
    } catch {
      return false;
    }
  })();

  it.skipIf(!temFfmpeg)("ffmpeg de verdade: PCM 24 kHz e WAV viram OGG/Opus mono", async () => {
    // 1 s de um tom de 440 Hz, PCM 16-bit mono 24 kHz
    const pcm = Buffer.alloc(48_000);
    for (let i = 0; i < 24_000; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24_000) * 8000), i * 2);
    const ogg = await converterComFfmpeg(pcm, "audio/L16;codec=pcm;rate=24000");
    expect(ogg.subarray(0, 4).toString("ascii")).toBe("OggS");
    expect(ogg.includes(Buffer.from("OpusHead"))).toBe(true);
    expect(ogg.length).toBeLessThan(512 * 1024);

    const cabecalho = Buffer.alloc(44);
    cabecalho.write("RIFF", 0, "ascii");
    cabecalho.writeUInt32LE(36 + pcm.length, 4);
    cabecalho.write("WAVEfmt ", 8, "ascii");
    cabecalho.writeUInt32LE(16, 16);
    cabecalho.writeUInt16LE(1, 20);
    cabecalho.writeUInt16LE(1, 22);
    cabecalho.writeUInt32LE(24_000, 24);
    cabecalho.writeUInt32LE(48_000, 28);
    cabecalho.writeUInt16LE(2, 32);
    cabecalho.writeUInt16LE(16, 34);
    cabecalho.write("data", 36, "ascii");
    cabecalho.writeUInt32LE(pcm.length, 40);
    const ogg2 = await converterComFfmpeg(Buffer.concat([cabecalho, pcm]), "audio/wav");
    expect(ogg2.includes(Buffer.from("OpusHead"))).toBe(true);

    await expect(converterComFfmpeg(Buffer.from("isto não é áudio"), "audio/wav")).rejects.toThrow(/ffmpeg/);
  });
});
