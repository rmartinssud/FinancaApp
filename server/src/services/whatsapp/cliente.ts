import { whatsappConfig } from "../../env.js";

// ─────────────────────────────────────────────
// Cliente da Meta WhatsApp Cloud API (Graph API). Só fetch, sem SDK.
//
// - Mensagens de sessão (resposta a quem escreveu nas últimas 24h): texto, botões e lista.
// - Mensagens que o Famicash começa (alertas): só com MODELO (template) aprovado pelo Meta.
// - Mídia (áudio/foto): pega a URL pelo id e baixa com o token.
// ─────────────────────────────────────────────

export class ErroWhatsApp extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo?: number,
  ) {
    super(message);
    this.name = "ErroWhatsApp";
  }
}

const TEMPO_LIMITE = 15_000;
// Limites do WhatsApp
export const MAX_TEXTO = 4096;
export const MAX_TITULO_BOTAO = 20;
export const MAX_TITULO_LINHA = 24;
export const MAX_DESCRICAO_LINHA = 72;
export const MAX_MIDIA = 10 * 1024 * 1024; // 10 MB (o que aceitamos baixar)

function config() {
  const c = whatsappConfig();
  if (!c) throw new ErroWhatsApp("WhatsApp não configurado.", 0);
  return c;
}

const urlGraph = (caminho: string) => `https://graph.facebook.com/${config().graphVersion}/${caminho}`;

async function lerErro(r: Response) {
  const corpo = (await r.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
  return new ErroWhatsApp(corpo?.error?.message ?? `Graph API respondeu ${r.status}`, r.status, corpo?.error?.code);
}

async function enviar(para: string, mensagem: Record<string, unknown>) {
  const c = config();
  const r = await fetch(urlGraph(`${c.phoneNumberId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, ...mensagem }),
    signal: AbortSignal.timeout(TEMPO_LIMITE),
  });
  if (!r.ok) throw await lerErro(r);
  const corpo = (await r.json().catch(() => ({}))) as { messages?: { id: string }[] };
  return corpo.messages?.[0]?.id ?? null;
}

const cortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function enviarTexto(para: string, texto: string) {
  return enviar(para, { type: "text", text: { body: cortar(texto, MAX_TEXTO), preview_url: false } });
}

export type Botao = { id: string; titulo: string };

// Até 3 botões de resposta (Confirmar / Editar categoria / Cancelar)
export function enviarBotoes(para: string, texto: string, botoes: Botao[]) {
  return enviar(para, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: cortar(texto, 1024) },
      action: { buttons: botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cortar(b.titulo, MAX_TITULO_BOTAO) } })) },
    },
  });
}

export type LinhaLista = { id: string; titulo: string; descricao?: string };

// Lista (até 10 linhas) — usada para escolher a categoria
export function enviarLista(para: string, texto: string, textoBotao: string, linhas: LinhaLista[], tituloSecao = "Categorias") {
  return enviar(para, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: cortar(texto, 1024) },
      action: {
        button: cortar(textoBotao, MAX_TITULO_BOTAO),
        sections: [
          {
            title: cortar(tituloSecao, MAX_TITULO_LINHA),
            rows: linhas.slice(0, 10).map((l) => ({
              id: l.id,
              title: cortar(l.titulo, MAX_TITULO_LINHA),
              ...(l.descricao ? { description: cortar(l.descricao, MAX_DESCRICAO_LINHA) } : {}),
            })),
          },
        ],
      },
    },
  });
}

// Parâmetro de modelo: sem quebra de linha, tab nem mais de 4 espaços seguidos (regra do Meta)
export function limparParametro(s: string) {
  return s.replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300) || "-";
}

export type EnvioModelo = {
  nome: string;
  idioma: string;
  corpo: string[]; // {{1}}, {{2}}... do texto
  botaoUrl?: string; // sufixo do botão de link dinâmico (https://famicash.com/{{1}})
};

export function enviarModelo(para: string, m: EnvioModelo) {
  const componentes: Record<string, unknown>[] = [
    { type: "body", parameters: m.corpo.map((t) => ({ type: "text", text: limparParametro(t) })) },
  ];
  if (m.botaoUrl !== undefined) {
    componentes.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: m.botaoUrl }] });
  }
  return enviar(para, { type: "template", template: { name: m.nome, language: { code: m.idioma }, components: componentes } });
}

// Baixa um áudio ou foto recebido (id da mídia que veio no webhook)
export async function baixarMidia(mediaId: string): Promise<{ dados: Buffer; mime: string }> {
  const c = config();
  const auth = { Authorization: `Bearer ${c.token}` };
  const r = await fetch(urlGraph(encodeURIComponent(mediaId)), { headers: auth, signal: AbortSignal.timeout(TEMPO_LIMITE) });
  if (!r.ok) throw await lerErro(r);
  const info = (await r.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new ErroWhatsApp("Mídia sem URL.", 502);
  if (info.file_size && info.file_size > MAX_MIDIA) throw new ErroWhatsApp("Arquivo grande demais.", 413);
  const arq = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (!arq.ok) throw await lerErro(arq);
  const dados = Buffer.from(await arq.arrayBuffer());
  if (dados.length > MAX_MIDIA) throw new ErroWhatsApp("Arquivo grande demais.", 413);
  return { dados, mime: (info.mime_type ?? arq.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim() };
}
