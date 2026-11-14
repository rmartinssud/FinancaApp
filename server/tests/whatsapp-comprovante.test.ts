import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/env.js";
import { aguardarProcessamento, limparWhatsApp, PERGUNTA_ANEXO } from "../src/services/whatsapp/bot.js";
import { definirProvedorIA, type DadosComprovante, type PedidoConversa, type ProvedorIA, type RespostaConversa } from "../src/services/whatsapp/ia.js";
import { diaLocal } from "../src/services/alertas/regras.js";
import { familiaLogada } from "./helpers.js";

// ─────────────────────────────────────────────
// WhatsApp: comprovante (foto ou PDF) → rascunho → Confirmar → "Anexar comprovante?" → anexo do lançamento.
// Meta (download da mídia) com fetch mockado; IA falsa (definirProvedorIA). Os anexos vão para UPLOADS_DIR de teste.
// ─────────────────────────────────────────────

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
const SEGREDO = env.WHATSAPP_APP_SECRET!;
const PHONE_ID = env.WHATSAPP_PHONE_NUMBER_ID!;

type Chamada = { url: string; corpo: Record<string, any> | null };
let chamadas: Chamada[] = [];
// Mídias que o "Meta" tem para baixar: id → bytes e mime
let midias: Map<string, { dados: Buffer; mime: string }> = new Map();

// ── IA falsa ──────────────────────────────────
type Passo = (p: PedidoConversa) => RespostaConversa;
let fila: Passo[] = [];
let leituras: { mime: string; bytes: number }[] = [];
let lido: DadosComprovante;
const uso = { entrada: 100, saida: 20, total: 120 };
const chamar = (nome: string, args: Record<string, unknown>): RespostaConversa => ({ partes: [{ tipo: "chamada", nome, args }], uso });
const responder = (texto: string): RespostaConversa => ({ partes: [{ tipo: "texto", texto }], uso });

const falso: ProvedorIA = {
  nome: "falso",
  async transcrever() {
    return "";
  },
  async lerComprovante(dados, mime) {
    leituras.push({ mime, bytes: dados.length });
    return lido;
  },
  async conversar() {
    const passo = fila.shift();
    // Sem roteiro: o assistente "cai" e o bot usa o parser (caminho clássico)
    if (!passo) throw new Error("Gemini fora do ar");
    return passo({} as PedidoConversa);
  },
};

beforeEach(() => {
  chamadas = [];
  midias = new Map();
  fila = [];
  leituras = [];
  lido = { valor: "87.35", data: diaLocal(new Date()), estabelecimento: "Supermercado Guanabara", categoriaSugerida: "Mercado", tipo: "EXPENSE" };
  definirProvedorIA(falso);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada: any, init?: any) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    let corpo: Record<string, any> | null = null;
    try {
      corpo = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      corpo = null;
    }
    chamadas.push({ url, corpo });
    const info = url.match(/graph\.facebook\.com\/v[\d.]+\/([^/?]+)$/);
    if (info && midias.has(decodeURIComponent(info[1]))) {
      const m = midias.get(decodeURIComponent(info[1]))!;
      return new Response(JSON.stringify({ url: `https://lookaside.fbsbx.com/media/${info[1]}`, mime_type: m.mime, file_size: m.dados.length }), { status: 200 });
    }
    const arq = url.match(/lookaside\.fbsbx\.com\/media\/(.+)$/);
    if (arq && midias.has(decodeURIComponent(arq[1]))) {
      const m = midias.get(decodeURIComponent(arq[1]))!;
      return new Response(new Uint8Array(m.dados), { status: 200, headers: { "Content-Type": m.mime } });
    }
    if (url.startsWith("https://graph.facebook.com/") && url.endsWith("/messages")) {
      return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.saida${chamadas.length}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: `URL inesperada no teste: ${url}` } }), { status: 500 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  definirProvedorIA(undefined);
});

const enviadas = (para: string) => chamadas.filter((c) => c.url.endsWith(`/${PHONE_ID}/messages`) && c.corpo?.to === para && c.corpo?.type).map((c) => c.corpo!);
const ultima = (para: string) => enviadas(para).at(-1)!;
const textoDe = (m: Record<string, any>) => m.text?.body ?? m.interactive?.body?.text ?? "";
const titulos = (m: Record<string, any>) => (m.interactive?.action?.buttons ?? []).map((b: any) => b.reply.title as string);
function idDoBotao(waId: string, titulo: string) {
  const m = [...enviadas(waId)].reverse().find((x) => x.type === "interactive" && x.interactive.type === "button");
  return m!.interactive.action.buttons.find((b: any) => b.reply.title === titulo).reply.id as string;
}

let contador = 0;
const idMsg = () => `wamid.comprovante.${Date.now()}.${++contador}`;
const celularNovo = () => `55219${6 + Math.floor(Math.random() * 4)}${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

function payload(waId: string, msg: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "552139552279", phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: "Teste" }, wa_id: waId }],
              messages: [{ from: waId, id: idMsg(), timestamp: String(Math.floor(Date.now() / 1000)), ...msg }],
            },
          },
        ],
      },
    ],
  };
}

async function postarWebhook(dados: unknown) {
  const corpo = JSON.stringify(dados);
  const assinatura = `sha256=${createHmac("sha256", SEGREDO).update(corpo).digest("hex")}`;
  const res = await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", assinatura).send(corpo);
  expect(res.status).toBe(200);
  await aguardarProcessamento();
}

const texto = (waId: string, body: string) => postarWebhook(payload(waId, { type: "text", text: { body } }));
const botao = (waId: string, id: string) => postarWebhook(payload(waId, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: "x" } } }));
function foto(waId: string, dados: Buffer, extra: Record<string, unknown> = {}) {
  const id = `img-${randomBytes(4).toString("hex")}`;
  midias.set(id, { dados, mime: "image/jpeg" });
  return postarWebhook(payload(waId, { type: "image", image: { id, mime_type: "image/jpeg", ...extra } }));
}
function documento(waId: string, dados: Buffer, mime: string, filename?: string, extra: Record<string, unknown> = {}) {
  const id = `doc-${randomBytes(4).toString("hex")}`;
  midias.set(id, { dados, mime });
  return postarWebhook(payload(waId, { type: "document", document: { id, mime_type: mime, ...(filename ? { filename } : {}), ...extra } }));
}

async function ligar(f: Familia) {
  const phone = celularNovo();
  const r = await f.agent.post("/api/whatsapp/link").send({ phone: `+${phone}` });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await texto(phone, `Famicash ${r.body.code}`);
  expect(textoDe(ultima(phone))).toContain("Seu WhatsApp está ligado");
  return phone;
}

const jpegPequeno = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffcc00" } }).jpeg().toBuffer();
const pdfPequeno = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const anexosDo = (householdId: string) => prisma.transactionAttachment.findMany({ where: { transaction: { householdId } } });

// ─────────────────────────────────────────────
describe("whatsapp: anexar comprovante", () => {
  it("foto → Confirmar pergunta se anexa → Anexar comprovante grava o anexo no lançamento", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    const jpeg = await jpegPequeno();
    await foto(waId, jpeg);
    expect(leituras).toEqual([{ mime: "image/jpeg", bytes: jpeg.length }]);
    const rascunho = textoDe(ultima(waId));
    expect(rascunho).toContain("📷 Li o comprovante:");
    expect(rascunho).toContain("R$ 87,35");
    // O comprovante ficou guardado, ligado ao rascunho
    const draft = await prisma.whatsAppDraft.findFirstOrThrow({ where: { waId, status: "PENDING" } });
    expect(await prisma.whatsAppReceipt.count({ where: { draftId: draft.id } })).toBe(1);

    await botao(waId, idDoBotao(waId, "Confirmar"));
    const pergunta = ultima(waId);
    expect(pergunta.type).toBe("interactive");
    expect(textoDe(pergunta)).toContain("✅ Lançado! Despesa de R$ 87,35");
    expect(textoDe(pergunta)).toContain(PERGUNTA_ANEXO);
    expect(titulos(pergunta)).toEqual(["Anexar comprovante", "Não anexar"]);

    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toBe("📎 Comprovante anexado ao lançamento! Veja em Lançamentos no app.");
    const anexos = await anexosDo(f.householdId);
    expect(anexos).toHaveLength(1);
    const t = await prisma.transaction.findFirstOrThrow({ where: { householdId: f.householdId } });
    expect(anexos[0]).toMatchObject({ transactionId: t.id, mime: "image/jpeg", size: jpeg.length });
    expect(anexos[0].originalName).toMatch(/^comprovante-whatsapp-\d{4}-\d{2}-\d{2}\.jpg$/);
    expect(fs.readFileSync(path.join(process.env.UPLOADS_DIR!, anexos[0].storageKey)).equals(jpeg)).toBe(true);
    // Aparece no app como qualquer anexo
    const baixado = await f.agent.get(`/api/attachments/${anexos[0].id}`);
    expect(baixado.status).toBe(200);
    // O arquivo temporário sumiu; tocar de novo não anexa duas vezes
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toContain("já foi resolvido");
    expect(await anexosDo(f.householdId)).toHaveLength(1);
  });

  it("documento PDF (assistente) → 'sim' confirma → 'não' descarta sem anexar", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    fila.push(
      () => chamar("preparar_lancamento", { tipo: "DESPESA", valor: "120,00", descricao: "Conta de luz", categoria: "Contas" }),
      () => responder("Li o comprovante da conta de luz de R$ 120,00."),
    );
    await documento(waId, pdfPequeno(), "application/pdf", "Light-novembro.pdf");
    expect(leituras[0].mime).toBe("application/pdf");
    expect(textoDe(ultima(waId))).toContain("📄 Li o comprovante:");
    expect(textoDe(ultima(waId))).toContain("R$ 120,00");
    const draft = await prisma.whatsAppDraft.findFirstOrThrow({ where: { waId, status: "PENDING" } });
    expect((await prisma.whatsAppReceipt.findFirstOrThrow({ where: { draftId: draft.id } })).fileName).toBe("Light-novembro.pdf");

    await texto(waId, "sim");
    expect(titulos(ultima(waId))).toEqual(["Anexar comprovante", "Não anexar"]);
    await texto(waId, "não");
    expect(textoDe(ultima(waId))).toBe("Tudo bem, não anexei. O lançamento continua salvo.");
    expect(await anexosDo(f.householdId)).toHaveLength(0);
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(1);
  });

  it("'anexa' por texto anexa o PDF; 'sim' genérico também, se não há outro lançamento esperando", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await documento(waId, pdfPequeno(), "application/pdf", "pix.pdf");
    await texto(waId, "sim"); // confirma o rascunho
    await texto(waId, "Anexa!");
    expect(textoDe(ultima(waId))).toContain("📎 Comprovante anexado");
    const [a] = await anexosDo(f.householdId);
    expect(a).toMatchObject({ mime: "application/pdf", originalName: "pix.pdf" });

    // Segundo comprovante: "sim" confirma; o próximo "sim" (sem rascunho pendente) responde a pergunta
    await foto(waId, await jpegPequeno());
    await texto(waId, "sim");
    expect(titulos(ultima(waId))).toEqual(["Anexar comprovante", "Não anexar"]);
    await texto(waId, "sim");
    expect(textoDe(ultima(waId))).toContain("📎 Comprovante anexado");
    expect(await anexosDo(f.householdId)).toHaveLength(2);
  });

  it("com outro lançamento esperando, 'sim' confirma ele (e 'anexa' continua anexando o anterior)", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await foto(waId, await jpegPequeno());
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await texto(waId, "gastei 10 padaria");
    await texto(waId, "sim");
    expect(textoDe(ultima(waId))).toContain("✅ Lançado! Despesa de R$ 10,00");
    expect(ultima(waId).type).toBe("text"); // lançamento por texto: sem pergunta de anexo
    await texto(waId, "anexar");
    expect(textoDe(ultima(waId))).toContain("📎 Comprovante anexado");
    const t = await prisma.transaction.findFirstOrThrow({ where: { householdId: f.householdId, amount: "87.35" } });
    expect(await prisma.transactionAttachment.count({ where: { transactionId: t.id } })).toBe(1);
  });

  it("compra parcelada no cartão: anexa na 1ª parcela", async () => {
    const f = await familiaLogada(app);
    const card = await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
    expect(card.status, JSON.stringify(card.body)).toBe(201);
    const waId = await ligar(f);
    // Legenda com valor: lança pela legenda e guarda a foto
    await foto(waId, await jpegPequeno(), { caption: "300 no cartão Nubank em 3x tv" });
    expect(leituras).toHaveLength(0); // não precisou ler a foto
    expect(textoDe(ultima(waId))).toContain("em 3x");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toBe("📎 Comprovante anexado à compra (na 1ª parcela)! Veja em Lançamentos no app.");
    const [a] = await anexosDo(f.householdId);
    const parcela = await prisma.transaction.findUniqueOrThrow({ where: { id: a.transactionId } });
    expect(parcela.installmentNumber).toBe(1);
  });

  it("virou Visualizador antes de anexar: não anexa, lançamento continua", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await foto(waId, await jpegPequeno());
    await botao(waId, idDoBotao(waId, "Confirmar"));
    const link = await prisma.whatsAppLink.findUniqueOrThrow({ where: { waId } });
    await prisma.householdMember.update({ where: { householdId_userId: { householdId: f.householdId, userId: link.userId } }, data: { role: "VIEWER" } });
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toContain("somente leitura, então não dá para anexar");
    expect(textoDe(ultima(waId))).toContain("O lançamento continua salvo, sem o anexo");
    expect(await anexosDo(f.householdId)).toHaveLength(0);
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(1);
    // E o Visualizador não consegue mandar comprovante novo
    await foto(waId, await jpegPequeno());
    expect(textoDe(ultima(waId))).toContain("somente leitura");
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
  });

  it("limite de 10 anexos e PDF grande demais: mensagem amigável, lançamento salvo sem anexo", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await foto(waId, await jpegPequeno());
    await botao(waId, idDoBotao(waId, "Confirmar"));
    const t = await prisma.transaction.findFirstOrThrow({ where: { householdId: f.householdId } });
    await prisma.transactionAttachment.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ transactionId: t.id, originalName: `a${i}.jpg`, mime: "image/jpeg", size: 1, storageKey: `zz/${randomBytes(16).toString("hex")}.jpg` })),
    });
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toBe(
      "Não consegui anexar o comprovante: Cada lançamento aceita até 10 anexos. O lançamento continua salvo, sem o anexo. Se quiser, anexe pelo app, em Lançamentos.",
    );

    // PDF de 3,5 MB que não é um PDF de verdade: o Ghostscript não comprime → recusado
    const grande = Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(3.5 * 1024 * 1024)]);
    await documento(waId, grande, "application/pdf", "extrato.pdf");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toContain("Não consegui anexar o comprovante: Este PDF passa de 3 MB");
    expect(textoDe(ultima(waId))).toContain("O lançamento continua salvo");
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(2);
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
  }, 60_000);

  it("documento de outro tipo, foto sem valor e Cancelar: nada fica guardado", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await documento(waId, Buffer.from("PK zip"), "application/zip", "coisas.zip");
    expect(textoDe(ultima(waId))).toContain("PDF");
    expect(chamadas.some((c) => c.url.includes("lookaside"))).toBe(false);

    lido = { valor: null, data: null, estabelecimento: null, categoriaSugerida: null, tipo: null };
    await foto(waId, await jpegPequeno());
    expect(textoDe(ultima(waId))).toContain("Não achei o valor nessa foto");
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);

    lido = { valor: "15.00", data: null, estabelecimento: "Padaria", categoriaSugerida: null, tipo: "EXPENSE" };
    await documento(waId, pdfPequeno(), "application/pdf");
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(1);
    await botao(waId, idDoBotao(waId, "Cancelar"));
    expect(textoDe(ultima(waId))).toBe("Cancelado. Nada foi lançado.");
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
  });

  it("limpeza: rascunho vencido/cancelado e mais de 1 dia apagam o comprovante guardado", async () => {
    const f = await familiaLogada(app);
    const waId = await ligar(f);
    await foto(waId, await jpegPequeno());
    // Rascunho venceu sem Confirmar
    await prisma.whatsAppDraft.updateMany({ where: { waId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await limparWhatsApp();
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);

    // Confirmado e perguntado, sem resposta: fica até 1 dia; depois some
    await foto(waId, await jpegPequeno());
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await limparWhatsApp();
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(1);
    await limparWhatsApp(new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect(await prisma.whatsAppReceipt.count({ where: { waId } })).toBe(0);
    await botao(waId, idDoBotao(waId, "Anexar comprovante"));
    expect(textoDe(ultima(waId))).toContain("já foi resolvido ou expirou");
  });
});
