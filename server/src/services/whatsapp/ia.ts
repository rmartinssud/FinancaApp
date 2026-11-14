import { env } from "../../env.js";

// ─────────────────────────────────────────────
// IA do WhatsApp (assistente, áudio e foto), atrás de uma interface.
//
// O bot só conhece ProvedorIA. Hoje existe um adaptador (Google Gemini), escolhido por
// AI_PROVIDER (padrão "gemini") e ligado só com GEMINI_API_KEY. Para outro provedor
// (ex.: OpenAI): um objeto ProvedorIA novo e um "case" em provedorIA(). Nada no bot muda.
// Sem chave: provedorIA() devolve null; o bot usa o parser de comandos e avisa que áudio e foto chegam em breve.
// sintetizarFala(): voz do assistente (nota de voz). Sem ela (ou se falhar), a resposta vai só em texto.
// conversar(): o assistente (agente.ts) usa function calling. Sem ela (ou se falhar), o bot cai no parser.
// ─────────────────────────────────────────────

// O que a IA tirou do comprovante / nota / foto
export type DadosComprovante = {
  valor: string | null; // "45.90"
  data: string | null; // "AAAA-MM-DD"
  estabelecimento: string | null; // "Supermercado Guanabara"
  categoriaSugerida: string | null; // "Mercado"
  tipo: "INCOME" | "EXPENSE" | null; // comprovante de Pix recebido = receita
};

// ── Conversa com ferramentas (assistente do WhatsApp) ──
// Formato neutro (não é o do Gemini): cada adaptador traduz para a API dele.

export type ParteConversa =
  | { tipo: "texto"; texto: string; assinatura?: string }
  // assinatura: "thought signature" do Gemini; precisa voltar igual na próxima chamada
  | { tipo: "chamada"; nome: string; args: Record<string, unknown>; assinatura?: string }
  | { tipo: "resultado"; nome: string; conteudo: Record<string, unknown> };

export type MensagemConversa = { papel: "usuario" | "modelo"; partes: ParteConversa[] };

// parametros: esquema no formato OpenAPI (type: "OBJECT", "STRING", ...). Sem parâmetros: deixe de fora.
export type FerramentaIA = { nome: string; descricao: string; parametros?: Record<string, unknown> };

export type PedidoConversa = {
  sistema: string;
  mensagens: MensagemConversa[];
  ferramentas: FerramentaIA[];
  // true = responda só com texto (última volta do loop)
  semFerramentas?: boolean;
  maxTokens?: number;
  sinal?: AbortSignal;
};

export type UsoTokens = { entrada: number; saida: number; total: number };
export type RespostaConversa = { partes: ParteConversa[]; uso: UsoTokens | null; motivo?: string };

// Voz sintetizada (TTS). audio: WAV ou PCM cru (16-bit, mono); o bot converte para OGG/Opus com o ffmpeg.
export type FalaSintetizada = {
  audio: Buffer;
  mime: string; // "audio/wav" ou "audio/L16;codec=pcm;rate=24000"
  modelo: string;
  tokens?: UsoTokens | null;
};

export interface ProvedorIA {
  nome: string;
  // Assistente: conversa com chamadas de ferramenta (function calling). Opcional: sem ela, o bot usa o parser.
  conversar?(pedido: PedidoConversa): Promise<RespostaConversa>;
  // Áudio → texto (pt-BR), para passar pelo mesmo parser do texto
  transcrever(audio: Buffer, mime: string): Promise<string>;
  // Foto de cupom, nota ou comprovante → dados estruturados
  lerComprovante(imagem: Buffer, mime: string, contexto: { hoje: string; categorias: string[]; legenda?: string }): Promise<DadosComprovante>;
  // Texto → fala em pt-BR (nota de voz). Opcional: sem ela, o assistente responde só em texto.
  sintetizarFala?(texto: string, opcoes?: { sinal?: AbortSignal }): Promise<FalaSintetizada>;
}

export class ErroIA extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ErroIA";
  }
}

// ── Google Gemini ─────────────────────────────

// Alias do Flash mais recente (o Google atualiza sozinho). Para fixar uma versão: GEMINI_MODEL.
export const MODELO_GEMINI_PADRAO = "gemini-flash-latest";
const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
// Voz: Gemini 3.8 Flash TTS (ai.google.dev/gemini-api/docs/speech-generation). Mais barato: gemini-3.8-flash-lite-tts.
export const MODELO_TTS_PADRAO = "gemini-3.8-flash-tts";
// Voz pré-pronta (o idioma é detectado pelo texto). "Sulafat" = calorosa. Lista na documentação do Gemini.
export const VOZ_TTS_PADRAO = "Sulafat";

type ParteGemini = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type RespostaGemini = {
  candidates?: { content?: { parts?: ParteGemini[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  error?: { message?: string };
};

// Formato neutro → partes do Gemini
function paraGemini(p: ParteConversa): ParteGemini {
  if (p.tipo === "texto") return { text: p.texto, ...(p.assinatura ? { thoughtSignature: p.assinatura } : {}) };
  if (p.tipo === "chamada") return { functionCall: { name: p.nome, args: p.args }, ...(p.assinatura ? { thoughtSignature: p.assinatura } : {}) };
  return { functionResponse: { name: p.nome, response: p.conteudo } };
}

// Partes do Gemini → formato neutro (pensamentos internos ficam de fora)
function doGemini(partes: ParteGemini[]): ParteConversa[] {
  const saida: ParteConversa[] = [];
  for (const p of partes) {
    if (p.functionCall?.name) {
      saida.push({ tipo: "chamada", nome: p.functionCall.name, args: p.functionCall.args ?? {}, ...(p.thoughtSignature ? { assinatura: p.thoughtSignature } : {}) });
    } else if (typeof p.text === "string" && !p.thought) {
      saida.push({ tipo: "texto", texto: p.text, ...(p.thoughtSignature ? { assinatura: p.thoughtSignature } : {}) });
    }
  }
  return saida;
}

type OpcoesGemini = { modeloTts?: string; voz?: string };

export function criarProvedorGemini(chave: string, modelo = MODELO_GEMINI_PADRAO, { modeloTts = MODELO_TTS_PADRAO, voz = VOZ_TTS_PADRAO }: OpcoesGemini = {}): ProvedorIA {
  async function gerar(partes: Record<string, unknown>[], esquema?: Record<string, unknown>) {
    const r = await fetch(`${URL_GEMINI}/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        contents: [{ role: "user", parts: partes }],
        generationConfig: {
          temperature: 0,
          ...(esquema ? { responseMimeType: "application/json", responseSchema: esquema } : {}),
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const corpo = (await r.json().catch(() => ({}))) as RespostaGemini;
    if (!r.ok) throw new ErroIA(corpo.error?.message ?? `Gemini respondeu ${r.status}`, r.status);
    if (corpo.promptFeedback?.blockReason) throw new ErroIA(`Gemini bloqueou: ${corpo.promptFeedback.blockReason}`);
    const texto = (corpo.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!texto) throw new ErroIA("Gemini não devolveu texto.");
    return texto;
  }

  const arquivo = (dados: Buffer, mime: string) => ({ inline_data: { mime_type: mime, data: dados.toString("base64") } });

  return {
    nome: "gemini",
    async sintetizarFala(texto, { sinal } = {}) {
      // generateContent com saída em áudio. O texto vai como transcrição literal (sem instruções de estilo).
      const r = await fetch(`${URL_GEMINI}/${encodeURIComponent(modeloTts)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: texto }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
          },
        }),
        signal: sinal ?? AbortSignal.timeout(30_000),
      });
      const corpo = (await r.json().catch(() => ({}))) as RespostaGemini;
      if (!r.ok) throw new ErroIA(corpo.error?.message ?? `Gemini TTS respondeu ${r.status}`, r.status);
      const partes = (corpo.candidates?.[0]?.content?.parts ?? []) as (ParteGemini & {
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      })[];
      const p = partes.find((x) => x.inlineData?.data || x.inline_data?.data);
      const dados = p?.inlineData?.data ?? p?.inline_data?.data;
      if (!dados) throw new ErroIA("Gemini TTS não devolveu áudio.");
      const u = corpo.usageMetadata;
      return {
        audio: Buffer.from(dados, "base64"),
        mime: p?.inlineData?.mimeType ?? p?.inline_data?.mime_type ?? "audio/L16;codec=pcm;rate=24000",
        modelo: modeloTts,
        tokens: u ? { entrada: u.promptTokenCount ?? 0, saida: u.candidatesTokenCount ?? 0, total: u.totalTokenCount ?? 0 } : null,
      };
    },
    async conversar({ sistema, mensagens, ferramentas, semFerramentas, maxTokens = 2048, sinal }) {
      const r = await fetch(`${URL_GEMINI}/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: mensagens.map((m) => ({ role: m.papel === "usuario" ? "user" : "model", parts: m.partes.map(paraGemini) })),
          ...(ferramentas.length
            ? {
                tools: [{ functionDeclarations: ferramentas.map((f) => ({ name: f.nome, description: f.descricao, ...(f.parametros ? { parameters: f.parametros } : {}) })) }],
                toolConfig: { functionCallingConfig: { mode: semFerramentas ? "NONE" : "AUTO" } },
              }
            : {}),
          generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
        }),
        signal: sinal ?? AbortSignal.timeout(45_000),
      });
      const corpo = (await r.json().catch(() => ({}))) as RespostaGemini;
      if (!r.ok) throw new ErroIA(corpo.error?.message ?? `Gemini respondeu ${r.status}`, r.status);
      if (corpo.promptFeedback?.blockReason) throw new ErroIA(`Gemini bloqueou: ${corpo.promptFeedback.blockReason}`);
      const candidato = corpo.candidates?.[0];
      const u = corpo.usageMetadata;
      return {
        partes: doGemini(candidato?.content?.parts ?? []),
        uso: u ? { entrada: u.promptTokenCount ?? 0, saida: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), total: u.totalTokenCount ?? 0 } : null,
        motivo: candidato?.finishReason,
      };
    },
    async transcrever(audio, mime) {
      const texto = await gerar([
        {
          text:
            "Transcreva este áudio em português do Brasil, exatamente como foi falado, sem comentar nada. " +
            "Escreva valores em números com vírgula para centavos (ex.: 45,90) e datas como dd/mm. " +
            "Responda só com a transcrição.",
        },
        arquivo(audio, mime),
      ]);
      return texto.replace(/^["“]|["”]$/g, "").trim();
    },
    async lerComprovante(imagem, mime, { hoje, categorias, legenda }) {
      const esquema = {
        type: "OBJECT",
        properties: {
          valor: { type: "STRING", nullable: true, description: "Valor total pago, só números com ponto: 45.90" },
          data: { type: "STRING", nullable: true, description: "Data da compra/pagamento AAAA-MM-DD" },
          estabelecimento: { type: "STRING", nullable: true, description: "Nome da loja, empresa ou pessoa" },
          categoriaSugerida: { type: "STRING", nullable: true, description: "Uma das categorias da lista, ou null" },
          tipo: { type: "STRING", nullable: true, enum: ["INCOME", "EXPENSE"], description: "EXPENSE (gasto) ou INCOME (dinheiro recebido)" },
        },
        required: ["valor", "data", "estabelecimento", "categoriaSugerida", "tipo"],
      };
      const texto = await gerar(
        [
          {
            text:
              `Você lê cupons fiscais, notas, recibos e comprovantes (Pix, boleto, cartão) do Brasil. Hoje é ${hoje}. ` +
              "Extraia o VALOR TOTAL pago (não subtotais nem troco), a data, o estabelecimento e sugira uma categoria " +
              `desta lista (use o nome exato ou null): ${categorias.slice(0, 60).join(", ") || "(sem categorias)"}. ` +
              "Comprovante de Pix/transferência RECEBIDA é INCOME; o resto é EXPENSE. " +
              (legenda ? `Legenda enviada junto: "${legenda.slice(0, 200)}". ` : "") +
              "Se a imagem não for um comprovante ou não der para ler o valor, use null em valor.",
          },
          arquivo(imagem, mime),
        ],
        esquema,
      );
      let bruto: Partial<DadosComprovante>;
      try {
        bruto = JSON.parse(texto.replace(/^```(?:json)?|```$/g, "").trim());
      } catch {
        throw new ErroIA("Gemini devolveu um JSON inválido.");
      }
      const valor = typeof bruto.valor === "string" || typeof bruto.valor === "number" ? String(bruto.valor).replace(",", ".") : null;
      return {
        valor: valor && /^\d{1,10}(\.\d{1,2})?$/.test(valor) && Number(valor) > 0 ? Number(valor).toFixed(2) : null,
        data: typeof bruto.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bruto.data) ? bruto.data : null,
        estabelecimento: typeof bruto.estabelecimento === "string" && bruto.estabelecimento.trim() ? bruto.estabelecimento.trim().slice(0, 80) : null,
        categoriaSugerida: typeof bruto.categoriaSugerida === "string" && bruto.categoriaSugerida.trim() ? bruto.categoriaSugerida.trim() : null,
        tipo: bruto.tipo === "INCOME" || bruto.tipo === "EXPENSE" ? bruto.tipo : null,
      };
    },
  };
}

// ── Escolha do provedor ───────────────────────

let substituto: ProvedorIA | null | undefined;

// Testes: força um provedor (ou null = sem IA). undefined volta ao normal (env).
export function definirProvedorIA(p: ProvedorIA | null | undefined) {
  substituto = p;
}

export function provedorIA(): ProvedorIA | null {
  if (substituto !== undefined) return substituto;
  const qual = env.AI_PROVIDER || "gemini";
  switch (qual) {
    case "gemini":
      return env.GEMINI_API_KEY
        ? criarProvedorGemini(env.GEMINI_API_KEY, env.GEMINI_MODEL || MODELO_GEMINI_PADRAO, {
            modeloTts: env.GEMINI_TTS_MODEL || MODELO_TTS_PADRAO,
            voz: env.GEMINI_TTS_VOICE || VOZ_TTS_PADRAO,
          })
        : null;
    default:
      return null;
  }
}
