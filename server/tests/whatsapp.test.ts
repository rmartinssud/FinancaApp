import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/env.js";
import { aguardarProcessamento, limparWhatsApp } from "../src/services/whatsapp/bot.js";
import { definirProvedorIA, criarProvedorGemini, MODELO_GEMINI_PADRAO } from "../src/services/whatsapp/ia.js";
import { rodarAlertas } from "../src/services/alertas/motor.js";
import { canalWhatsApp, canaisAtivos, montarWhatsApp } from "../src/services/alertas/canais.js";
import { MODELOS } from "../src/services/whatsapp/modelos.js";
import { podeUsarWhatsApp } from "../src/services/whatsapp/plano.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

// ─────────────────────────────────────────────
// Bot do WhatsApp. O Meta (Graph API) e o Gemini são simulados com fetch mockado:
// nenhuma mensagem real é enviada e nenhuma API real é chamada.
// ─────────────────────────────────────────────

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;

const SEGREDO = env.WHATSAPP_APP_SECRET!;
const PHONE_ID = env.WHATSAPP_PHONE_NUMBER_ID!;

type Chamada = { url: string; corpo: Record<string, any> | null; headers: Record<string, string> };
let chamadas: Chamada[] = [];
// Respostas extras (mídia e Gemini) por pedaço de URL
let respostas: { trecho: string; resposta: (corpo: Record<string, any> | null) => Response }[] = [];

beforeEach(() => {
  chamadas = [];
  respostas = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada: any, init?: any) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
    let corpo: Record<string, any> | null = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = null;
    }
    chamadas.push({ url, corpo, headers });
    const extra = respostas.find((r) => url.includes(r.trecho));
    if (extra) return extra.resposta(corpo);
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

// Mensagens que o bot "mandou"
const enviadas = (para?: string) =>
  chamadas.filter((c) => c.url.endsWith(`/${PHONE_ID}/messages`) && (!para || c.corpo?.to === para)).map((c) => c.corpo!);
const ultima = (para: string) => enviadas(para).at(-1)!;
const textoDe = (m: Record<string, any>) => m.text?.body ?? m.interactive?.body?.text ?? "";

let contador = 0;
const idMsg = () => `wamid.teste.${Date.now()}.${++contador}`;
// Celular único por teste: 55 21 9 + 8 dígitos começando de 6 a 9 (como os celulares antigos,
// que o WhatsApp às vezes manda sem o 9)
const celularNovo = () => `55219${6 + Math.floor(Math.random() * 4)}${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const semNove = (n: string) => n.slice(0, 4) + n.slice(5); // como o WhatsApp manda de contas antigas

function assinar(corpo: string, segredo = SEGREDO) {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

function payload(waId: string, msg: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "983339767704618",
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
  const res = await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", assinar(corpo)).send(corpo);
  expect(res.status).toBe(200);
  await aguardarProcessamento();
  return res;
}

const texto = (waId: string, body: string) => postarWebhook(payload(waId, { type: "text", text: { body } }));
const botao = (waId: string, id: string) => postarWebhook(payload(waId, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: "x" } } }));
const itemLista = (waId: string, id: string) => postarWebhook(payload(waId, { type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: "x" } } }));

// Liga o número de "f" pelo fluxo real (app gera o código → manda pelo WhatsApp)
async function ligar(f: Familia, opcoes: { waId?: string; householdId?: string } = {}) {
  const phone = celularNovo();
  const r = await f.agent.post("/api/whatsapp/link").send({ phone: `+${phone}`, ...(opcoes.householdId ? { householdId: opcoes.householdId } : {}) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const waId = opcoes.waId ?? phone;
  await texto(waId, `Famicash ${r.body.code}`);
  expect(textoDe(ultima(waId))).toContain("Seu WhatsApp está ligado");
  return { phone, waId };
}

// Botão do último rascunho mandado para waId
function idDoBotao(waId: string, titulo: string) {
  const m = [...enviadas(waId)].reverse().find((x) => x.type === "interactive" && x.interactive.type === "button");
  return m!.interactive.action.buttons.find((b: any) => b.reply.title === titulo).reply.id as string;
}

// ─────────────────────────────────────────────
describe("whatsapp: webhook", () => {
  it("GET: verificação do Meta com o verify token", async () => {
    const ok = await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN, "hub.challenge": "1158201444" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("1158201444");
    const errado = await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "outro", "hub.challenge": "1" });
    expect(errado.status).toBe(403);
    const semModo = await request(app).get("/api/whatsapp/webhook").query({ "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN, "hub.challenge": "1" });
    expect(semModo.status).toBe(403);
  });

  it("POST: confere a assinatura sobre o corpo cru", async () => {
    const corpo = JSON.stringify(payload(celularNovo(), { type: "text", text: { body: "oi" } }));
    const post = (assinatura?: string) => {
      const r = request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json");
      return (assinatura ? r.set("X-Hub-Signature-256", assinatura) : r).send(corpo);
    };
    expect((await post()).status).toBe(401);
    expect((await post("sha256=abc")).status).toBe(401);
    expect((await post(assinar(corpo, "segredo-errado"))).status).toBe(401);
    // Corpo mexido depois de assinado
    const r = await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", assinar(corpo)).send(corpo.replace("oi", "ola"));
    expect(r.status).toBe(401);
    expect((await post(assinar(corpo))).status).toBe(200);
    await aguardarProcessamento();
  });

  it("número desconhecido recebe como ligar em famicash.com", async () => {
    const waId = celularNovo();
    await texto(waId, "gastei 50 mercado");
    expect(enviadas(waId)).toHaveLength(1);
    expect(textoDe(ultima(waId))).toContain("famicash.com");
    expect(textoDe(ultima(waId))).toContain("Segurança › WhatsApp");
    // A resposta vai para a Graph API certa, com o token no cabeçalho
    const chamada = chamadas.find((c) => c.corpo?.to === waId)!;
    expect(chamada.url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`);
    expect(chamada.headers.authorization).toBe(`Bearer ${env.WHATSAPP_TOKEN}`);
  });

  it("idempotente: o mesmo id de mensagem é processado uma vez só", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    const dados = payload(waId, { type: "text", text: { body: "gastei 10 padaria" } });
    const antes = enviadas(waId).length;
    await postarWebhook(dados);
    await postarWebhook(dados);
    await postarWebhook(dados);
    expect(enviadas(waId).length - antes).toBe(1);
    expect(await prisma.whatsAppDraft.count({ where: { waId } })).toBe(1);
  });

  it("ignora status de entrega e mensagens de outro número do Meta", async () => {
    const waId = celularNovo();
    await postarWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{ id: "x", status: "read" }] } }] }] });
    const outro = payload(waId, { type: "text", text: { body: "oi" } });
    outro.entry[0].changes[0].value.metadata.phone_number_id = "999";
    await postarWebhook(outro);
    expect(enviadas()).toHaveLength(0);
  });

  it("sem as variáveis do WhatsApp, tudo fica desligado", async () => {
    const f = await familiaLogada(app);
    const token = env.WHATSAPP_TOKEN;
    env.WHATSAPP_TOKEN = undefined;
    try {
      expect((await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN, "hub.challenge": "1" })).status).toBe(404);
      expect((await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").send("{}")).status).toBe(404);
      expect((await f.agent.get("/api/whatsapp/link")).body.enabled).toBe(false);
      expect((await f.agent.post("/api/whatsapp/link").send({ phone: "21999998888" })).status).toBe(503);
      expect(canaisAtivos().map((c) => c.id)).toEqual(["EMAIL"]);
      expect((await f.agent.get("/api/me/alerts?channel=WHATSAPP")).body.eligible).toBe(false);
    } finally {
      env.WHATSAPP_TOKEN = token;
    }
    expect(canaisAtivos().map((c) => c.id)).toEqual(["EMAIL", "WHATSAPP"]);
  });
});

// ─────────────────────────────────────────────
describe("whatsapp: ligar o número", () => {
  it("código do app + mensagem do mesmo número (mesmo sem o 9) liga ao espaço", async () => {
    const f = await familiaLogada(app, "Robson Martins");
    const antes = await f.agent.get("/api/whatsapp/link");
    expect(antes.body).toMatchObject({ enabled: true, link: null, pending: null, botNumber: "+55 21 3955-2279", botLink: "https://wa.me/552139552279" });

    const phone = celularNovo();
    const r = await f.agent.post("/api/whatsapp/link").send({ phone: `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}` });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^\d{6}$/);
    expect(r.body.waLink).toBe(`https://wa.me/552139552279?text=Famicash%20${r.body.code}`);
    expect((await f.agent.get("/api/whatsapp/link")).body.pending).toMatchObject({ phone: expect.stringContaining("+55") });
    // O código não fica guardado em texto
    const salvo = await prisma.whatsAppLinkCode.findUnique({ where: { userId: (await prisma.user.findUnique({ where: { email: f.email } }))!.id } });
    expect(salvo!.codeHash).not.toContain(r.body.code);

    // Outro número mandando o código certo: não liga
    const intruso = celularNovo();
    await texto(intruso, r.body.code);
    expect(textoDe(ultima(intruso))).toContain("famicash.com");

    // Código errado do número certo
    const waId = semNove(phone);
    await texto(waId, r.body.code === "000000" ? "111111" : "000000");
    expect(textoDe(ultima(waId))).toContain("Código incorreto");

    await texto(waId, `Famicash ${r.body.code}`);
    expect(textoDe(ultima(waId))).toContain("Pronto, Robson!");
    expect(textoDe(ultima(waId))).toContain("espaço *Pessoal*");

    const depois = (await f.agent.get("/api/whatsapp/link")).body;
    expect(depois.link).toMatchObject({ household: { id: f.householdId, name: "Pessoal" } });
    expect(depois.pending).toBeNull();
    const link = await prisma.whatsAppLink.findFirst({ where: { phone } });
    expect(link).toMatchObject({ phone, waId });

    // Já ligado: "ajuda" responde com exemplos
    await texto(waId, "ajuda");
    expect(textoDe(ultima(waId))).toContain("gastei 45,90 mercado");
  });

  it("5 códigos errados invalidam o código", async () => {
    const f = await familiaLogada(app);
    const phone = celularNovo();
    const r = await f.agent.post("/api/whatsapp/link").send({ phone });
    const errado = r.body.code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await texto(phone, errado);
    await texto(phone, r.body.code);
    expect(textoDe(ultima(phone))).not.toContain("Pronto");
    expect((await f.agent.get("/api/whatsapp/link")).body.link).toBeNull();
  });

  it("um número = uma pessoa; número inválido; espera entre códigos", async () => {
    const a = await familiaLogada(app);
    const b = await familiaLogada(app);
    const { phone } = await ligar(a);
    const r = await b.agent.post("/api/whatsapp/link").send({ phone: semNove(phone) });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("outra conta");

    const invalido = await b.agent.post("/api/whatsapp/link").send({ phone: "12345678" });
    expect(invalido.status).toBe(400);
    expect(invalido.body.detalhes.phone[0]).toContain("Número inválido");

    expect((await b.agent.post("/api/whatsapp/link").send({ phone: celularNovo() })).status).toBe(201);
    expect((await b.agent.post("/api/whatsapp/link").send({ phone: celularNovo() })).status).toBe(429);
  });

  it("escolher o espaço padrão, desligar e espaço de que não faz parte", async () => {
    const f = await familiaLogada(app);
    const familia = await f.agent.post("/api/households").send({ name: "Família Martins" });
    expect(familia.status).toBe(201);
    // Espaço ativo agora é a Família; liga escolhendo o Pessoal
    const { waId } = await ligar(f, { householdId: f.householdId });
    expect((await f.agent.get("/api/whatsapp/link")).body.link.household.name).toBe("Pessoal");

    const troca = await f.agent.put("/api/whatsapp/link").send({ householdId: familia.body.id });
    expect(troca.status).toBe(200);
    expect(troca.body.link.household.name).toBe("Família Martins");
    await texto(waId, "ajuda");
    expect(textoDe(ultima(waId))).toContain("Espaço: Família Martins");

    const outro = await familiaLogada(app);
    expect((await f.agent.put("/api/whatsapp/link").send({ householdId: outro.householdId })).status).toBe(403);
    expect((await f.agent.post("/api/whatsapp/link").send({ phone: celularNovo(), householdId: outro.householdId })).status).toBe(403);

    expect((await f.agent.delete("/api/whatsapp/link")).status).toBe(204);
    expect((await f.agent.get("/api/whatsapp/link")).body.link).toBeNull();
    await texto(waId, "saldo");
    expect(textoDe(ultima(waId))).toContain("ligue seu número no app");
  });

  it("gancho de plano: podeUsarWhatsApp libera todo mundo por enquanto", async () => {
    expect(await podeUsarWhatsApp({ userId: "qualquer", householdId: "x" })).toBe(true);
  });
});

// ─────────────────────────────────────────────
describe("whatsapp: lançar por texto", () => {
  it("gastei 45,90 mercado → rascunho com botões → Confirmar cria a despesa uma vez", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "gastei 45,90 mercado");
    const m = ultima(waId);
    expect(m.type).toBe("interactive");
    expect(m.interactive.type).toBe("button");
    expect(m.interactive.action.buttons.map((b: any) => b.reply.title)).toEqual(["Confirmar", "Editar categoria", "Cancelar"]);
    const corpo = textoDe(m);
    expect(corpo).toContain("Confirma esta despesa?");
    expect(corpo).toContain("R$ 45,90 · Mercado");
    expect(corpo).toContain("🏷️ Mercado");
    expect(corpo).toContain("🏦 Carteira");
    expect(corpo).toContain("📅 hoje");
    // Ainda não lançou
    expect(await prisma.transaction.count({ where: { householdId: f.householdId, source: "WHATSAPP" } })).toBe(0);

    const ok = idDoBotao(waId, "Confirmar");
    await botao(waId, ok);
    expect(textoDe(ultima(waId))).toContain("✅ Lançado! Despesa de R$ 45,90 em Carteira.");
    // Dois toques no Confirmar: não duplica
    await botao(waId, ok);
    expect(textoDe(ultima(waId))).toContain("expirou ou já foi resolvido");

    const lista = await prisma.transaction.findMany({ where: { householdId: f.householdId, source: "WHATSAPP" } });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ type: "EXPENSE", description: "Mercado", accountId: f.carteiraId, categoryId: f.categoria("Mercado"), status: "CONFIRMED", invoiceMonth: null });
    expect(lista[0].amount.toFixed(2)).toBe("45.90");
    // Aparece no app como um lançamento normal
    const saldo = await f.agent.get("/api/summary");
    expect(saldo.body.accountsTotals.total).toBe("-45.90");
  });

  it("Cancelar não lança; 'cancelar' por texto também", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "50 uber");
    await botao(waId, idDoBotao(waId, "Cancelar"));
    expect(textoDe(ultima(waId))).toContain("Cancelado");
    await texto(waId, "paguei 120 luz ontem");
    await texto(waId, "cancelar");
    expect(textoDe(ultima(waId))).toContain("Cancelado");
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(0);
  });

  it("Editar categoria: lista do WhatsApp ou nome escrito", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "gastei 80 presente");
    expect(textoDe(ultima(waId))).toContain("sem categoria");
    await botao(waId, idDoBotao(waId, "Editar categoria"));
    const lista = ultima(waId);
    expect(lista.interactive.type).toBe("list");
    const linhas = lista.interactive.action.sections[0].rows;
    expect(linhas.map((l: any) => l.title)).toContain("Lazer");
    expect(linhas.map((l: any) => l.title)).not.toContain("Salário"); // só categorias de despesa
    expect(linhas.at(-1).title).toBe("Sem categoria");
    await itemLista(waId, linhas.find((l: any) => l.title === "Lazer").id);
    expect(textoDe(ultima(waId))).toContain("🏷️ Lazer");

    // Agora escrevendo o nome
    await botao(waId, idDoBotao(waId, "Editar categoria"));
    await texto(waId, "educacao");
    expect(textoDe(ultima(waId))).toContain("🏷️ Educação");
    await texto(waId, "não existe");
    // texto sem valor e sem categoria: pede de novo (rascunho continua)
    await botao(waId, idDoBotao(waId, "Editar categoria"));
    await texto(waId, "xpto qualquer");
    expect(textoDe(ultima(waId))).toContain("Não achei essa categoria");

    await botao(waId, idDoBotao(waId, "Confirmar"));
    const t = await prisma.transaction.findFirst({ where: { householdId: f.householdId, source: "WHATSAPP" } });
    expect(t).toMatchObject({ categoryId: f.categoria("Educação"), description: "Presente" });
  });

  it("recebi 1200 salário → receita; '1500 salário' sem verbo também", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "recebi 1200 salário");
    expect(textoDe(ultima(waId))).toContain("Confirma esta receita?");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    expect(textoDe(ultima(waId))).toContain("Receita de R$ 1.200,00");
    await texto(waId, "1500 salário");
    expect(textoDe(ultima(waId))).toContain("Confirma esta receita?");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    const receitas = await prisma.transaction.findMany({ where: { householdId: f.householdId, type: "INCOME" } });
    expect(receitas).toHaveLength(2);
    expect(receitas.every((r) => r.categoryId === f.categoria("Salário"))).toBe(true);
  });

  it("data futura fica pendente; conta pelo nome", async () => {
    const f = await familiaLogada(app);
    const itau = await f.agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "1000" });
    expect(itau.status, JSON.stringify(itau.body)).toBe(201);
    const { waId } = await ligar(f);
    await texto(waId, "paguei 120 luz no itaú ontem");
    expect(textoDe(ultima(waId))).toContain("🏦 Itaú");
    expect(textoDe(ultima(waId))).toContain("📅 ontem");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    const luz = await prisma.transaction.findFirst({ where: { householdId: f.householdId, description: "Luz" } });
    expect(luz).toMatchObject({ accountId: itau.body.id, categoryId: f.categoria("Contas"), status: "CONFIRMED" });

    const ano = new Date().getFullYear() + 1;
    await texto(waId, `200 aluguel 05/01/${ano}`);
    await botao(waId, idDoBotao(waId, "Confirmar"));
    expect(textoDe(ultima(waId))).toContain("Ficou como pendente");
    const aluguel = await prisma.transaction.findFirst({ where: { householdId: f.householdId, description: "Aluguel" } });
    expect(aluguel).toMatchObject({ status: "PENDING", categoryId: f.categoria("Moradia") });
  });

  it("cartão: segue a regra da fatura (no dia do fechamento ou depois → fatura seguinte) e parcelas", async () => {
    const f = await familiaLogada(app);
    const card = await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
    expect(card.status).toBe(201);
    await f.agent.post("/api/cards").send({ name: "Inter", brand: "MASTERCARD", creditLimit: "1000", closingDay: 20, dueDay: 28, color: "#ff7a00" });
    const { waId } = await ligar(f);

    await texto(waId, "30 no cartão nubank ifood 02/11/2026");
    expect(textoDe(ultima(waId))).toContain("💳 Cartão Nubank · fatura de nov/2026");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await texto(waId, "40 no cartão nubank ifood 03/11/2026");
    expect(textoDe(ultima(waId))).toContain("fatura de dez/2026");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    expect(textoDe(ultima(waId))).toContain("no cartão Nubank (fatura de dez/2026)");

    await texto(waId, "300 no cartão nubank em 3x tv 05/11/2026");
    expect(textoDe(ultima(waId))).toContain("R$ 300,00 em 3x de R$ 100,00 · Tv");
    await botao(waId, idDoBotao(waId, "Confirmar"));

    const compras = await prisma.transaction.findMany({ where: { accountId: card.body.id }, orderBy: [{ invoiceMonth: "asc" }, { amount: "asc" }] });
    expect(compras.map((c) => `${c.invoiceMonth}:${c.amount.toFixed(2)}:${c.installmentNumber ?? "-"}`)).toEqual([
      "2026-11:30.00:-",
      "2026-12:40.00:-",
      "2026-12:100.00:1",
      "2027-01:100.00:2",
      "2027-02:100.00:3",
    ]);
    expect(compras.every((c) => c.source === "WHATSAPP" && c.type === "EXPENSE")).toBe(true);
    expect(new Set(compras.filter((c) => c.installmentTotal === 3).map((c) => c.purchaseId)).size).toBe(1);

    // Dois cartões e nenhum nome: pergunta qual
    await texto(waId, "50 no cartão mercado");
    expect(textoDe(ultima(waId))).toContain("Qual cartão?");
    expect(textoDe(ultima(waId))).toContain("Nubank, Inter");
    // Parcelado fora do cartão
    await texto(waId, "300 em 3x tv");
    expect(textoDe(ultima(waId))).toContain("parcelado só no cartão");
  });

  it("Visualizador não lança (nem confirma), mas vê saldo e resumo", async () => {
    const dono = await familiaLogada(app);
    const visualizador = await familiaLogada(app);
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect((await visualizador.agent.post(`/api/invites/${conv.body.url.split("/convite/")[1]}/accept`)).status).toBe(200);
    const { waId } = await ligar(visualizador, { householdId: dono.householdId });

    await texto(waId, "gastei 45,90 mercado");
    expect(textoDe(ultima(waId))).toContain("somente leitura");
    expect(await prisma.whatsAppDraft.count({ where: { waId } })).toBe(0);
    await texto(waId, "saldo");
    expect(textoDe(ultima(waId))).toContain("*Saldo ·");

    // Rascunho criado quando era Membro e o papel virou Visualizador antes do Confirmar
    const membro = await familiaLogada(app);
    const conv2 = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "MEMBER" });
    expect((await membro.agent.post(`/api/invites/${conv2.body.url.split("/convite/")[1]}/accept`)).status).toBe(200);
    const m = await ligar(membro, { householdId: dono.householdId });
    await texto(m.waId, "gastei 10 padaria");
    const ok = idDoBotao(m.waId, "Confirmar");
    const u = await prisma.user.findUnique({ where: { email: membro.email } });
    await prisma.householdMember.update({ where: { householdId_userId: { householdId: dono.householdId, userId: u!.id } }, data: { role: "VIEWER" } });
    await botao(m.waId, ok);
    expect(textoDe(ultima(m.waId))).toContain("somente leitura");
    expect(await prisma.transaction.count({ where: { householdId: dono.householdId } })).toBe(0);
  });

  it("saldo (respeita Ignorar nos totais) e resumo do mês", async () => {
    const f = await familiaLogada(app);
    await f.agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "1000" });
    await f.agent.post("/api/accounts").send({ name: "Reserva", type: "INVESTMENT", initialBalance: "5000", ignoreInTotals: true });
    const { waId } = await ligar(f);
    await texto(waId, "recebi 3000 salário no itaú");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await texto(waId, "gastei 250 mercado no itaú");
    await botao(waId, idDoBotao(waId, "Confirmar"));
    await texto(waId, "gastei 50 uber no itaú");
    await botao(waId, idDoBotao(waId, "Confirmar"));

    await texto(waId, "saldo");
    const s = textoDe(ultima(waId));
    expect(s).toContain("• Itaú: R$ 3.700,00");
    expect(s).toContain("• Reserva: R$ 5.000,00 (fora do total)");
    expect(s).toContain("*Total: R$ 3.700,00*");

    await texto(waId, "resumo");
    const r = textoDe(ultima(waId));
    expect(r).toContain("Receitas: R$ 3.000,00");
    expect(r).toContain("Despesas: R$ 300,00");
    expect(r).toContain("Saldo do mês: R$ 2.700,00");
    expect(r).toContain("1. Mercado: R$ 250,00");
    expect(r).toContain("2. Transporte: R$ 50,00");
  });

  it("mensagem sem valor e tipo não suportado", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "comprei pão");
    expect(textoDe(ultima(waId))).toContain("Não entendi");
    await postarWebhook(payload(waId, { type: "sticker", sticker: { id: "1" } }));
    expect(textoDe(ultima(waId))).toContain("texto, áudio e foto");
  });

  it("rascunho vence em 30 minutos; limpeza cancela os vencidos", async () => {
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await texto(waId, "gastei 10 padaria");
    const ok = idDoBotao(waId, "Confirmar");
    await prisma.whatsAppDraft.updateMany({ where: { waId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await botao(waId, ok);
    expect(textoDe(ultima(waId))).toContain("expirou");
    await limparWhatsApp();
    expect((await prisma.whatsAppDraft.findFirst({ where: { waId } }))!.status).toBe("CANCELED");
    expect(await prisma.transaction.count({ where: { householdId: f.householdId } })).toBe(0);
  });
});

// ─────────────────────────────────────────────
describe("whatsapp: áudio e foto", () => {
  const midia = (id: string, mime: string) => {
    respostas.push({ trecho: `/v21.0/${id}`, resposta: () => new Response(JSON.stringify({ url: `https://lookaside.fbsbx.com/media/${id}`, mime_type: mime, file_size: 1000 }), { status: 200 }) });
    respostas.push({ trecho: `lookaside.fbsbx.com/media/${id}`, resposta: () => new Response(Buffer.from("bytes-falsos"), { status: 200, headers: { "Content-Type": mime } }) });
  };
  // Transcrição/leitura respondem "texto". O assistente (pedido com ferramentas) falha de propósito:
  // assim estes testes cobrem o caminho clássico (parser) que o bot usa quando a IA de conversa cai.
  const gemini = (texto: string) =>
    respostas.push({
      trecho: "generativelanguage.googleapis.com",
      resposta: (corpo) =>
        corpo?.tools
          ? new Response(JSON.stringify({ error: { message: "indisponível" } }), { status: 503 })
          : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 }),
    });

  it("sem IA configurada: avisa que chega em breve (áudio e foto sem legenda)", async () => {
    definirProvedorIA(null);
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await postarWebhook(payload(waId, { type: "audio", audio: { id: "a1", mime_type: "audio/ogg; codecs=opus" } }));
    expect(textoDe(ultima(waId))).toContain("chegam em breve");
    await postarWebhook(payload(waId, { type: "image", image: { id: "i1", mime_type: "image/jpeg" } }));
    expect(textoDe(ultima(waId))).toContain("chegam em breve");
    // Nada foi baixado
    expect(chamadas.some((c) => c.url.includes("a1") || c.url.includes("i1"))).toBe(false);
  });

  it("foto com legenda com valor funciona sem IA", async () => {
    definirProvedorIA(null);
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    await postarWebhook(payload(waId, { type: "image", image: { id: "i2", mime_type: "image/jpeg", caption: "45,90 mercado" } }));
    expect(textoDe(ultima(waId))).toContain("R$ 45,90 · Mercado");
  });

  it("Gemini: áudio vira texto e segue o mesmo fluxo", async () => {
    definirProvedorIA(criarProvedorGemini("chave-teste"));
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    midia("aud1", "audio/ogg");
    gemini("Gastei 32,50 na farmácia");
    await postarWebhook(payload(waId, { type: "audio", audio: { id: "aud1", mime_type: "audio/ogg; codecs=opus" } }));
    const m = ultima(waId);
    expect(textoDe(m)).toContain("🎤 Entendi: “Gastei 32,50 na farmácia”");
    expect(textoDe(m)).toContain("R$ 32,50 · Farmácia");
    expect(textoDe(m)).toContain("🏷️ Saúde");
    const chamada = chamadas.find((c) => c.url.includes("generativelanguage"))!;
    expect(chamada.url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI_PADRAO}:generateContent`);
    // Depois da transcrição, tentou o assistente (falhou) e caiu no parser
    expect(chamadas.filter((c) => c.url.includes("generativelanguage") && c.corpo?.tools)).toHaveLength(1);
    expect(MODELO_GEMINI_PADRAO).toBe("gemini-flash-latest");
    expect(chamada.headers["x-goog-api-key"]).toBe("chave-teste");
    const partes = chamada.corpo!.contents[0].parts;
    expect(partes[1].inline_data).toEqual({ mime_type: "audio/ogg", data: Buffer.from("bytes-falsos").toString("base64") });
    // Baixou a mídia com o token do WhatsApp
    expect(chamadas.find((c) => c.url.includes("lookaside"))!.headers.authorization).toBe(`Bearer ${env.WHATSAPP_TOKEN}`);
  });

  it("Gemini: foto do cupom vira JSON (valor, data, estabelecimento, categoria)", async () => {
    definirProvedorIA(criarProvedorGemini("chave-teste", "gemini-teste"));
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    midia("img1", "image/jpeg");
    gemini(JSON.stringify({ valor: "87.35", data: "2026-11-12", estabelecimento: "Supermercado Guanabara", categoriaSugerida: "Mercado", tipo: "EXPENSE" }));
    await postarWebhook(payload(waId, { type: "image", image: { id: "img1", mime_type: "image/jpeg" } }));
    const corpo = textoDe(ultima(waId));
    expect(corpo).toContain("📷 Li o comprovante:");
    expect(corpo).toContain("R$ 87,35 · Supermercado Guanabara Mercado");
    expect(corpo).toContain("🏷️ Mercado");
    expect(corpo).toContain("12/11");
    const chamada = chamadas.find((c) => c.url.includes("generativelanguage"))!;
    expect(chamada.url).toContain("/models/gemini-teste:generateContent");
    expect(chamada.corpo!.generationConfig.responseMimeType).toBe("application/json");
    expect(chamada.corpo!.contents[0].parts[0].text).toContain("Mercado"); // manda as categorias do espaço
  });

  it("Gemini sem valor na foto ou com erro: resposta educada", async () => {
    definirProvedorIA(criarProvedorGemini("chave-teste"));
    const f = await familiaLogada(app);
    const { waId } = await ligar(f);
    midia("img2", "image/jpeg");
    gemini(JSON.stringify({ valor: null, data: null, estabelecimento: null, categoriaSugerida: null, tipo: null }));
    await postarWebhook(payload(waId, { type: "image", image: { id: "img2", mime_type: "image/jpeg" } }));
    expect(textoDe(ultima(waId))).toContain("Não achei o valor");

    midia("aud2", "audio/ogg");
    respostas.unshift({ trecho: "generativelanguage", resposta: () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }) });
    await postarWebhook(payload(waId, { type: "audio", audio: { id: "aud2" } }));
    expect(textoDe(ultima(waId))).toContain("Não consegui ouvir");
  });
});

// ─────────────────────────────────────────────
describe("whatsapp: canal de alertas (modelos)", () => {
  // "Agora" em Brasília: 10:00 do dia
  const agoraEm = (dia: string) => new Date(`${dia}T13:00:00.000Z`);

  it("só para quem ligou o número e ligou o tipo; envia o modelo com os parâmetros", async () => {
    const f = await familiaLogada(app, "Robson Martins");
    const mercado = f.categoria("Mercado");
    const b = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Mercado", color: "#ef4444", icon: "cart", startMonth: "2026-12", amount: "500.00", categoryIds: [mercado] });
    expect(b.status).toBe(201);
    await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "Compra", status: "CONFIRMED", amount: "600", accountId: f.carteiraId, categoryId: mercado, date: "2026-12-02" });

    // Sem número ligado: não elegível e não envia
    const antes = await f.agent.get("/api/me/alerts?channel=WHATSAPP");
    expect(antes.body).toMatchObject({ channel: "WHATSAPP", eligible: false, whatsapp: { enabled: true, linked: false } });
    expect((await f.agent.put("/api/me/alerts?channel=WHATSAPP").send({ budget: true })).status).toBe(400);
    expect((await rodarAlertas({ agora: agoraEm("2026-12-05"), canais: [canalWhatsApp], householdIds: [f.householdId] })).enviados).toBe(0);

    const { waId } = await ligar(f);
    // Ligado, mas tudo desligado por padrão (opt-in), mesmo sendo Dono
    const ligado = await f.agent.get("/api/me/alerts?channel=WHATSAPP");
    expect(ligado.body).toMatchObject({ eligible: true, preferences: { budget: false, invoice: false, bills: false } });
    expect((await rodarAlertas({ agora: agoraEm("2026-12-05"), canais: [canalWhatsApp], householdIds: [f.householdId] })).enviados).toBe(0);
    // O e-mail continua com o padrão dele
    expect((await f.agent.get("/api/me/alerts")).body.preferences.budget).toBe(true);

    const put = await f.agent.put("/api/me/alerts?channel=WHATSAPP").send({ budget: true });
    expect(put.status).toBe(200);
    chamadas = [];
    const r = await rodarAlertas({ agora: agoraEm("2026-12-05"), canais: [canalWhatsApp], householdIds: [f.householdId] });
    expect(r.enviados).toBe(1);
    const m = ultima(waId);
    expect(m.type).toBe("template");
    expect(m.template.name).toBe("famicash_orcamento_estourou");
    expect(m.template.language.code).toBe("pt_BR");
    expect(m.template.components[0].parameters.map((p: any) => p.text)).toEqual(["Robson", "Mercado", "Pessoal", "120%", "R$ 500,00", "R$ 600,00"]);
    expect(m.template.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: `app/orcamentos/${b.body.id}?mes=2026-12` }] });
    // Não repete
    await rodarAlertas({ agora: agoraEm("2026-12-06"), canais: [canalWhatsApp], householdIds: [f.householdId] });
    expect(enviadas(waId).filter((x) => x.type === "template")).toHaveLength(1);
    const reg = await prisma.sentAlert.findMany({ where: { householdId: f.householdId, channel: "WHATSAPP" } });
    expect(reg.map((x) => x.type)).toEqual(expect.arrayContaining(["BUDGET_OVER", "BUDGET_WARNING"]));

    // Desligou o WhatsApp: não recebe mais
    await f.agent.delete("/api/whatsapp/link");
    await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "Compra", status: "CONFIRMED", amount: "450", accountId: f.carteiraId, categoryId: mercado, date: "2027-01-03" });
    expect((await rodarAlertas({ agora: agoraEm("2027-01-04"), canais: [canalWhatsApp], householdIds: [f.householdId] })).enviados).toBe(0);
  });

  it("fatura e contas a pagar usam os modelos certos; falha no Meta libera para tentar de novo", async () => {
    const f = await familiaLogada(app, "Ana Lima");
    const { waId } = await ligar(f);
    await f.agent.put("/api/me/alerts?channel=WHATSAPP").send({ invoice: true, bills: true, invoiceDaysBefore: 3 });
    const card = await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
    await f.agent.post("/api/card-expenses").send({ cardId: card.body.id, amount: "1234.56", description: "Mercado", date: "2026-11-05" });
    await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "Luz", status: "PENDING", amount: "150", accountId: f.carteiraId, date: "2026-12-07" });

    // Meta fora do ar: nada fica marcado como enviado
    respostas.push({ trecho: `/${PHONE_ID}/messages`, resposta: () => new Response(JSON.stringify({ error: { message: "fora", code: 131000 } }), { status: 500 }) });
    const falha = await rodarAlertas({ agora: agoraEm("2026-12-07"), canais: [canalWhatsApp], householdIds: [f.householdId] });
    expect(falha.erros).toBe(2);
    expect(await prisma.sentAlert.count({ where: { householdId: f.householdId, channel: "WHATSAPP" } })).toBe(0);

    respostas = [];
    chamadas = [];
    const ok = await rodarAlertas({ agora: agoraEm("2026-12-07"), canais: [canalWhatsApp], householdIds: [f.householdId] });
    expect(ok.enviados).toBe(2);
    const modelos = enviadas(waId).map((m) => m.template);
    const fatura = modelos.find((t) => t.name === "famicash_fatura_vencendo")!;
    expect(fatura.components[0].parameters.map((p: any) => p.text)).toEqual(["Ana", "Nubank", "Pessoal", "10/12/2026 (em 3 dias)", "R$ 1.234,56"]);
    const contas = modelos.find((t) => t.name === "famicash_contas_a_pagar")!;
    expect(contas.components[0].parameters.map((p: any) => p.text)).toEqual(["Ana", "Pessoal", "1 conta", "1 hoje", "R$ 150,00"]);
  });

  it("modelos: cada um tem o número certo de variáveis e o canal monta {{1}} = primeiro nome", () => {
    for (const m of Object.values(MODELOS)) {
      const n = new Set(m.texto.match(/\{\{\d+\}\}/g)).size;
      expect(n, m.nome).toBe(m.variaveis.length + 1);
      expect(m.texto.startsWith("{{")).toBe(false); // regra do Meta: não começa nem termina com variável
      expect(m.texto.trim().endsWith("}}")).toBe(false);
      expect(m.botao.url).toBe("https://famicash.com/{{1}}");
    }
    const envio = montarWhatsApp(
      { userId: "u", nome: "  Maria  Souza ", email: "m@x.com", whatsapp: "5521999998888" },
      { assunto: "", titulo: "", paragrafos: [], botao: { texto: "Ver", caminho: "/app/lancamentos?mes=2026-12" }, espaco: "Pessoal", whatsapp: { modelo: "contasDoDia", parametros: ["Pessoal", "2 contas", "1 hoje e 1 amanhã", "R$ 10,00"] } },
    );
    expect(envio).toEqual({ nome: "famicash_contas_a_pagar", idioma: "pt_BR", corpo: ["Maria", "Pessoal", "2 contas", "1 hoje e 1 amanhã", "R$ 10,00"], botaoUrl: "app/lancamentos?mes=2026-12" });
  });
});
