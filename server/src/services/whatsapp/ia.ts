import { env } from "../../env.js";

// ─────────────────────────────────────────────
// IA para áudio e foto do WhatsApp, atrás de uma interface.
//
// O bot só conhece ProvedorIA. Hoje existe um adaptador (Google Gemini), escolhido por
// AI_PROVIDER (padrão "gemini") e ligado só com GEMINI_API_KEY. Para outro provedor
// (ex.: OpenAI): um objeto ProvedorIA novo e um "case" em provedorIA(). Nada no bot muda.
// Sem chave: provedorIA() devolve null e o bot responde que áudio e foto chegam em breve.
// ─────────────────────────────────────────────

// O que a IA tirou do comprovante / nota / foto
export type DadosComprovante = {
  valor: string | null; // "45.90"
  data: string | null; // "AAAA-MM-DD"
  estabelecimento: string | null; // "Supermercado Guanabara"
  categoriaSugerida: string | null; // "Mercado"
  tipo: "INCOME" | "EXPENSE" | null; // comprovante de Pix recebido = receita
};

export interface ProvedorIA {
  nome: string;
  // Áudio → texto (pt-BR), para passar pelo mesmo parser do texto
  transcrever(audio: Buffer, mime: string): Promise<string>;
  // Foto de cupom, nota ou comprovante → dados estruturados
  lerComprovante(imagem: Buffer, mime: string, contexto: { hoje: string; categorias: string[]; legenda?: string }): Promise<DadosComprovante>;
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

type RespostaGemini = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

export function criarProvedorGemini(chave: string, modelo = MODELO_GEMINI_PADRAO): ProvedorIA {
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
      return env.GEMINI_API_KEY ? criarProvedorGemini(env.GEMINI_API_KEY, env.GEMINI_MODEL || MODELO_GEMINI_PADRAO) : null;
    default:
      return null;
  }
}
