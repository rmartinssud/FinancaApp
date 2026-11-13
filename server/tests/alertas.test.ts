import { describe, it, expect, vi, afterEach } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Decimal } from "../src/lib/money.js";
import * as email from "../src/lib/email.js";
import { rodarAlertas } from "../src/services/alertas/motor.js";
import { canalEmail, montarEmail, type CanalAlerta, type Destinatario, type MensagemAlerta } from "../src/services/alertas/canais.js";
import { preferenciasEfetivas } from "../src/services/alertas/preferencias.js";
import { agruparContas, dentroDoHorario, diaLocal, diasEntre, faturaNoPrazo, nivelDoOrcamento, quandoVence } from "../src/services/alertas/regras.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

// Transporte de e-mail simulado: o sendEmail original continua (guarda no outbox, sem SMTP), mas vira um vi.fn
vi.mock("../src/lib/email.js", async (original) => {
  const m = await original<typeof import("../src/lib/email.js")>();
  return { ...m, sendEmail: vi.fn(m.sendEmail) };
});

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

// "Agora" em Brasília (UTC-3 fixo): agoraEm("2026-12-07", 10) = 07/12 às 10:00 em Brasília
const agoraEm = (dia: string, hora = 10) => new Date(`${dia}T${String(hora + 3).padStart(2, "0")}:00:00.000Z`);

// Canal falso: guarda o que seria enviado (no lugar do e-mail de verdade)
function canalFalso() {
  const enviados: { para: Destinatario; msg: MensagemAlerta }[] = [];
  const canal: CanalAlerta = { id: "EMAIL", enviar: async (para, msg) => void enviados.push({ para, msg }) };
  return { canal, enviados };
}

async function rodar(householdId: string, dia: string, canal: CanalAlerta, hora = 10) {
  return rodarAlertas({ agora: agoraEm(dia, hora), canais: [canal], householdIds: [householdId] });
}

async function lancar(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Teste", status: "CONFIRMED", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function criarOrcamento(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Mercado", color: "#ef4444", icon: "cart", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function convidar(dono: Familia, convidado: Familia, role: "MEMBER" | "VIEWER") {
  const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role });
  expect(conv.status).toBe(201);
  expect((await convidado.agent.post(`/api/invites/${conv.body.url.split("/convite/")[1]}/accept`)).status).toBe(200);
  await convidado.agent.post(`/api/households/${dono.householdId}/activate`);
}

afterEach(() => vi.restoreAllMocks());

// ─────────────────────────────────────────────
describe("alertas: regras puras", () => {
  it("limiar do orçamento: 80% (ou o % do orçamento), 100% e meta zero", () => {
    const d = (v: string) => new Decimal(v);
    expect(nivelDoOrcamento(d("79.99"), d("100"), 80)).toBeNull();
    expect(nivelDoOrcamento(d("80"), d("100"), 80)).toBe("WARNING");
    expect(nivelDoOrcamento(d("100"), d("100"), 80)).toBe("WARNING"); // chegou a 100%, mas não passou
    expect(nivelDoOrcamento(d("100.01"), d("100"), 80)).toBe("OVER");
    expect(nivelDoOrcamento(d("85"), d("100"), 90)).toBeNull(); // alerta do orçamento em 90%
    expect(nivelDoOrcamento(d("95"), d("100"), null)).toBeNull(); // sem alerta: só avisa ao estourar
    expect(nivelDoOrcamento(d("150"), d("100"), null)).toBe("OVER");
    expect(nivelDoOrcamento(d("10"), d("0"), 80)).toBeNull();
  });

  it("datas em Brasília, prazo da fatura e horário de envio", () => {
    expect(diaLocal(new Date("2026-12-08T02:30:00Z"))).toBe("2026-12-07"); // 23:30 do dia 7 em Brasília
    expect(diasEntre("2026-12-07", "2026-12-10")).toBe(3);
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
    expect(faturaNoPrazo(3, 3)).toBe(true);
    expect(faturaNoPrazo(4, 3)).toBe(false);
    expect(faturaNoPrazo(0, 3)).toBe(true);
    expect(faturaNoPrazo(-1, 3)).toBe(false); // já venceu: não avisa
    expect(quandoVence(0)).toBe("vence hoje");
    expect(quandoVence(1)).toBe("vence amanhã");
    expect(quandoVence(3)).toBe("vence em 3 dias");
    expect(dentroDoHorario(agoraEm("2026-12-07", 6))).toBe(false);
    expect(dentroDoHorario(agoraEm("2026-12-07", 7))).toBe(true);
    expect(dentroDoHorario(agoraEm("2026-12-07", 21))).toBe(true);
    expect(dentroDoHorario(agoraEm("2026-12-07", 22))).toBe(false);
  });

  it("resumo de contas: separa hoje e amanhã e ignora outros dias", () => {
    const c = (id: string, dia: string) => ({ id, description: id, amount: new Decimal("10"), date: new Date(`${dia}T12:00:00Z`), accountName: "Carteira" });
    const g = agruparContas([c("luz", "2026-12-07"), c("agua", "2026-12-08"), c("ontem", "2026-12-06"), c("depois", "2026-12-09"), c("gas", "2026-12-07")], "2026-12-07");
    expect(g.hoje.map((x) => x.id)).toEqual(["gas", "luz"]);
    expect(g.amanha.map((x) => x.id)).toEqual(["agua"]);
  });

  it("padrão por papel: Dono ligado, Membro desligado, Visualizador nunca", () => {
    expect(preferenciasEfetivas("OWNER", null)).toEqual({ budget: true, invoice: true, bills: true, invoiceDaysBefore: 3 });
    expect(preferenciasEfetivas("MEMBER", null)).toMatchObject({ budget: false, invoice: false, bills: false });
    const tudo = { budget: true, invoice: true, bills: true, invoiceDaysBefore: 5 };
    expect(preferenciasEfetivas("MEMBER", tudo)).toEqual(tudo);
    expect(preferenciasEfetivas("VIEWER", tudo)).toMatchObject({ budget: false, invoice: false, bills: false });
  });

  it("e-mail: HTML e texto em pt-BR, botão para a tela e link de gerenciar alertas", () => {
    const { html, text } = montarEmail(
      { userId: "u", nome: "Robson Martins", email: "r@x.com" },
      { assunto: "A", titulo: "Orçamento <Mercado>", paragrafos: ["Oi"], grupos: [{ itens: [{ rotulo: "Meta", valor: "R$ 500,00" }] }], botao: { texto: "Ver orçamento", caminho: "/app/orcamentos/b1" }, espaco: "Pessoal" },
    );
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain("Orçamento &lt;Mercado&gt;"); // escapa o nome
    expect(html).toContain("http://localhost:5173/app/orcamentos/b1");
    expect(html).toContain("http://localhost:5173/app/seguranca#alertas");
    expect(html).toContain("white-space:nowrap");
    expect(text).toContain("Olá, Robson!");
    expect(text).toContain("Ver orçamento: http://localhost:5173/app/orcamentos/b1");
    expect(text).toContain("Gerenciar alertas por e-mail: http://localhost:5173/app/seguranca#alertas");
  });
});

// ─────────────────────────────────────────────
describe("alertas: orçamento", () => {
  it("avisa em 80% e ao passar de 100%, uma vez por período e por limiar", async () => {
    const f = await familiaLogada(app, "Robson Martins");
    const mercado = f.categoria("Mercado");
    const id = await criarOrcamento(f.agent, { startMonth: "2026-12", amount: "500.00", categoryIds: [mercado] });
    const { canal, enviados } = canalFalso();

    await lancar(f.agent, { amount: "300", accountId: f.carteiraId, categoryId: mercado, date: "2026-12-02" });
    await rodar(f.householdId, "2026-12-05", canal);
    expect(enviados).toHaveLength(0); // 60%

    await lancar(f.agent, { amount: "110", accountId: f.carteiraId, categoryId: mercado, date: "2026-12-04" });
    await rodar(f.householdId, "2026-12-05", canal);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para.email).toBe(f.email);
    expect(enviados[0].msg.assunto).toBe("Orçamento “Mercado” chegou a 82% da meta");
    expect(enviados[0].msg.botao.caminho).toBe(`/app/orcamentos/${id}?mes=2026-12`);

    // Rodar de novo (outra hora, outro dia): não repete
    await rodar(f.householdId, "2026-12-05", canal, 15);
    await rodar(f.householdId, "2026-12-06", canal);
    expect(enviados).toHaveLength(1);

    // Passou de 100%
    await lancar(f.agent, { amount: "100", accountId: f.carteiraId, categoryId: mercado, date: "2026-12-06" });
    await rodar(f.householdId, "2026-12-06", canal);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].msg.assunto).toBe("Orçamento “Mercado” estourou (102% da meta)");
    await rodar(f.householdId, "2026-12-07", canal);
    expect(enviados).toHaveLength(2);

    // Mês seguinte é outro período: avisa de novo
    await lancar(f.agent, { amount: "450", accountId: f.carteiraId, categoryId: mercado, date: "2027-01-03" });
    await rodar(f.householdId, "2027-01-04", canal);
    expect(enviados).toHaveLength(3);
    expect(enviados[2].msg.botao.caminho).toBe(`/app/orcamentos/${id}?mes=2027-01`);

    const registros = await prisma.sentAlert.findMany({ where: { householdId: f.householdId }, orderBy: { sentAt: "asc" } });
    expect(registros.map((r) => `${r.type}:${r.refKey}`)).toEqual([
      `BUDGET_WARNING:${id}:2026-12`,
      `BUDGET_OVER:${id}:2026-12`,
      `BUDGET_WARNING:${id}:2027-01`,
    ]);
  });

  it("pulou direto de menos de 80% para mais de 100%: só o aviso de estouro", async () => {
    const f = await familiaLogada(app);
    await criarOrcamento(f.agent, { startMonth: "2026-12", amount: "100.00" });
    const { canal, enviados } = canalFalso();
    await lancar(f.agent, { amount: "150", accountId: f.carteiraId, date: "2026-12-02" });
    await rodar(f.householdId, "2026-12-03", canal);
    await rodar(f.householdId, "2026-12-04", canal);
    expect(enviados.map((e) => e.msg.assunto)).toEqual(["Orçamento “Mercado” estourou (150% da meta)"]);
  });

  it("não envia de madrugada; o aviso sai na primeira rodada do dia", async () => {
    const f = await familiaLogada(app);
    await criarOrcamento(f.agent, { startMonth: "2026-12", amount: "100.00" });
    await lancar(f.agent, { amount: "90", accountId: f.carteiraId, date: "2026-12-02" });
    const { canal, enviados } = canalFalso();
    await rodar(f.householdId, "2026-12-03", canal, 3);
    expect(enviados).toHaveLength(0);
    await rodar(f.householdId, "2026-12-03", canal, 7);
    expect(enviados).toHaveLength(1);
  });

  it("falha no envio: não grava como enviado e tenta de novo depois", async () => {
    const f = await familiaLogada(app);
    await criarOrcamento(f.agent, { startMonth: "2026-12", amount: "100.00" });
    await lancar(f.agent, { amount: "90", accountId: f.carteiraId, date: "2026-12-02" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quebrado: CanalAlerta = { id: "EMAIL", enviar: async () => Promise.reject(new Error("SMTP fora")) };
    const r = await rodar(f.householdId, "2026-12-03", quebrado);
    expect(r).toMatchObject({ enviados: 0, erros: 1 });
    expect(await prisma.sentAlert.count({ where: { householdId: f.householdId } })).toBe(0);
    const { canal, enviados } = canalFalso();
    await rodar(f.householdId, "2026-12-03", canal, 11);
    expect(enviados).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
describe("alertas: fatura do cartão", () => {
  // Fecha dia 3, vence dia 10: compra em 05/11 cai na fatura de dezembro (vence 10/12)
  async function cartaoComCompra(f: Familia) {
    const cartao = await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
    expect(cartao.status).toBe(201);
    const compra = await f.agent.post("/api/card-expenses").send({ cardId: cartao.body.id, amount: "1234.56", description: "Mercado", date: "2026-11-05" });
    expect(compra.status, JSON.stringify(compra.body)).toBe(201);
    return cartao.body.id as string;
  }

  it("avisa 3 dias antes do vencimento (padrão), com o valor, uma vez por fatura", async () => {
    const f = await familiaLogada(app);
    const cartaoId = await cartaoComCompra(f);
    const { canal, enviados } = canalFalso();

    await rodar(f.householdId, "2026-12-06", canal); // faltam 4 dias
    expect(enviados).toHaveLength(0);
    await rodar(f.householdId, "2026-12-07", canal); // faltam 3
    expect(enviados).toHaveLength(1);
    expect(enviados[0].msg.assunto).toBe("Fatura Nubank vence em 3 dias: R$ 1.234,56");
    expect(enviados[0].msg.botao.caminho).toBe(`/app/cartoes/${cartaoId}?mes=2026-12`);
    await rodar(f.householdId, "2026-12-08", canal);
    await rodar(f.householdId, "2026-12-10", canal);
    expect(enviados).toHaveLength(1);
  });

  it("respeita os dias escolhidos, não avisa fatura paga nem vencida", async () => {
    const f = await familiaLogada(app);
    const cartaoId = await cartaoComCompra(f);
    expect((await f.agent.put("/api/me/alerts").send({ invoiceDaysBefore: 1 })).status).toBe(200);
    const { canal, enviados } = canalFalso();
    await rodar(f.householdId, "2026-12-07", canal);
    expect(enviados).toHaveLength(0);
    await rodar(f.householdId, "2026-12-09", canal);
    expect(enviados.map((e) => e.msg.assunto)).toEqual(["Fatura Nubank vence amanhã: R$ 1.234,56"]);

    // Outra fatura (janeiro) já paga: não avisa
    await f.agent.post("/api/card-expenses").send({ cardId: cartaoId, amount: "50", description: "Pão", date: "2026-12-05" });
    await prisma.transaction.create({
      data: { householdId: f.householdId, accountId: f.carteiraId, toAccountId: cartaoId, type: "TRANSFER", amount: "50", description: "Pagamento", date: new Date("2027-01-08T12:00:00Z"), invoiceMonth: "2027-01" },
    });
    await rodar(f.householdId, "2027-01-09", canal);
    // Já venceu (dia 11, fatura de dezembro venceu dia 10): não avisa
    await rodar(f.householdId, "2026-12-11", canal);
    expect(enviados).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
describe("alertas: contas a pagar", () => {
  it("um e-mail por dia com as pendentes de hoje e amanhã", async () => {
    const f = await familiaLogada(app);
    const pendente = (description: string, amount: string, date: string, extra = {}) =>
      lancar(f.agent, { description, amount, date, status: "PENDING", accountId: f.carteiraId, noAutoConfirm: true, ...extra });
    await pendente("Luz", "120.50", "2026-12-07");
    await pendente("Internet", "99.90", "2026-12-08");
    await pendente("Água", "80.00", "2026-12-08");
    await pendente("Aluguel", "1500.00", "2026-12-09"); // depois de amanhã: fica de fora
    await pendente("Salário", "3000.00", "2026-12-07", { type: "INCOME" }); // receita: fora
    await lancar(f.agent, { description: "Já paga", amount: "10", date: "2026-12-07", accountId: f.carteiraId }); // efetivada: fora

    const { canal, enviados } = canalFalso();
    await rodar(f.householdId, "2026-12-07", canal, 8);
    await rodar(f.householdId, "2026-12-07", canal, 12);
    expect(enviados).toHaveLength(1);
    const m = enviados[0].msg;
    expect(m.assunto).toBe("Contas a pagar: 1 hoje e 2 amanhã (R$ 300,40)");
    expect(m.grupos!.map((g) => g.titulo)).toEqual(["Vencem hoje (07/12/2026)", "Vencem amanhã (08/12/2026)", undefined]);
    expect(m.grupos![1].itens.map((i) => i.rotulo)).toEqual(["Água", "Internet"]);

    // No dia seguinte, outro resumo
    await rodar(f.householdId, "2026-12-08", canal);
    expect(enviados).toHaveLength(2);
    expect(enviados[1].msg.assunto).toBe("Contas a pagar: 2 hoje e 1 amanhã (R$ 1.679,90)");

    // Sem nada pendente: não envia
    await rodar(f.householdId, "2026-12-20", canal);
    expect(enviados).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
describe("alertas: quem recebe (papéis e preferências)", () => {
  it("Dono recebe; Membro só se ligar; Visualizador nunca", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const membro = await familiaLogada(app, "Paty Garcia");
    const leitor = await familiaLogada(app, "Leitor");
    await convidar(dono, membro, "MEMBER");
    await convidar(dono, leitor, "VIEWER");

    await criarOrcamento(dono.agent, { startMonth: "2026-12", amount: "100.00" });
    await lancar(dono.agent, { amount: "85", accountId: dono.carteiraId, date: "2026-12-02" });

    // Membro começa desligado e liga só orçamento
    const antes = await membro.agent.get("/api/me/alerts");
    expect(antes.body).toMatchObject({ eligible: true, preferences: { budget: false, invoice: false, bills: false } });
    expect((await membro.agent.put("/api/me/alerts").send({ budget: true })).body.preferences).toMatchObject({ budget: true, invoice: false });

    // Visualizador: não pode ligar
    const vis = await leitor.agent.get("/api/me/alerts");
    expect(vis.body.eligible).toBe(false);
    expect((await leitor.agent.put("/api/me/alerts").send({ budget: true })).status).toBe(403);
    // Mesmo com uma linha salva no banco, Visualizador não recebe
    const leitorId = (await leitor.agent.get("/api/me")).body.user.id;
    await prisma.alertPreference.create({ data: { userId: leitorId, householdId: dono.householdId } });

    const { canal, enviados } = canalFalso();
    await rodar(dono.householdId, "2026-12-03", canal);
    expect(enviados.map((e) => e.para.email).sort()).toEqual([dono.email, membro.email].sort());

    // Dono desliga orçamento: no mês seguinte só o membro recebe
    expect((await dono.agent.put("/api/me/alerts").send({ budget: false })).status).toBe(200);
    await lancar(dono.agent, { amount: "95", accountId: dono.carteiraId, date: "2027-01-02" });
    await rodar(dono.householdId, "2027-01-03", canal);
    expect(enviados.slice(2).map((e) => e.para.email)).toEqual([membro.email]);
  });

  it("valida as preferências", async () => {
    const f = await familiaLogada(app);
    expect((await f.agent.put("/api/me/alerts").send({ invoiceDaysBefore: 0 })).status).toBe(400);
    expect((await f.agent.put("/api/me/alerts").send({ invoiceDaysBefore: 11 })).status).toBe(400);
    expect((await f.agent.put("/api/me/alerts").send({ bills: "sim" })).status).toBe(400);
    const r = await f.agent.put("/api/me/alerts").send({ bills: false, invoiceDaysBefore: 5 });
    expect(r.body.preferences).toEqual({ budget: true, invoice: true, bills: false, invoiceDaysBefore: 5 });
    expect((await f.agent.get("/api/me/alerts")).body.preferences).toEqual({ budget: true, invoice: true, bills: false, invoiceDaysBefore: 5 });
  });
});

// ─────────────────────────────────────────────
describe("alertas: canal de e-mail (transporte simulado)", () => {
  it("monta e entrega pelo sendEmail com assunto, HTML e texto", async () => {
    const f = await familiaLogada(app);
    await criarOrcamento(f.agent, { startMonth: "2026-12", amount: "100.00" });
    await lancar(f.agent, { amount: "80", accountId: f.carteiraId, date: "2026-12-02" });
    const envio = vi.mocked(email.sendEmail);
    envio.mockClear();
    await rodar(f.householdId, "2026-12-03", canalEmail);
    expect(envio).toHaveBeenCalledTimes(1);
    const arg = envio.mock.calls[0][0];
    expect(arg.to).toBe(f.email);
    expect(arg.subject).toBe("Orçamento “Mercado” chegou a 80% da meta");
    expect(arg.html).toContain("Famicash");
    expect(arg.html).toContain("Gerenciar alertas por e-mail");
    expect(arg.text).toContain("Espaço: Pessoal");
    expect(email.outbox.at(-1)?.subject).toBe(arg.subject);
  });
});
