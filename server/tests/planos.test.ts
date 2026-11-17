import { describe, it, expect, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { mesAtual } from "../src/lib/money.js";
import { consumirMensagemIA, planoEfetivo } from "../src/services/planos.js";
import { familiaLogada, usuarioLogado, emailUnico } from "./helpers.js";

// ─────────────────────────────────────────────
// Fase 10: planos por espaço, limites, teste de 15 dias e cupons
// ─────────────────────────────────────────────

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const DIA = 86_400_000;
// Sem teste e sem plano: Grátis
const paraGratis = (householdId: string) => prisma.household.update({ where: { id: householdId }, data: { trialEndsAt: new Date(Date.now() - DIA), plan: "GRATIS", planEndsAt: null } });

const conta = (agent: Agent, name: string) => agent.post("/api/accounts").send({ name, type: "BANK", initialBalance: "0" });
const cartao = (agent: Agent, name: string) =>
  agent.post("/api/cards").send({ name, brand: "VISA", creditLimit: "1000", closingDay: 5, dueDay: 12, color: "#464fa3" });

let admin: Agent;
beforeAll(async () => {
  const a = await usuarioLogado(app, "Robson Admin");
  await prisma.user.update({ where: { email: a.email }, data: { platformRole: "ADMIN" } });
  admin = a.agent;
});

describe("plano efetivo e teste grátis", () => {
  it("espaço novo começa com 15 dias de Família; vencido volta ao Grátis", async () => {
    const f = await familiaLogada(app);
    let me = await f.agent.get("/api/me");
    expect(me.body.plan).toMatchObject({ id: "FAMILIA", source: "TESTE" });
    const dias = (new Date(me.body.plan.endsAt).getTime() - Date.now()) / DIA;
    expect(dias).toBeGreaterThan(14.9);
    expect(dias).toBeLessThan(15.1);

    await paraGratis(f.householdId);
    me = await f.agent.get("/api/me");
    expect(me.body.plan).toMatchObject({ id: "GRATIS", source: "GRATIS", endsAt: null });
  });

  it("plano de cupom vencido não vale mais", () => {
    const passado = new Date(Date.now() - DIA);
    expect(planoEfetivo({ plan: "FAMILIA_PLUS", planEndsAt: passado, planSource: "VOUCHER", trialEndsAt: null }).plano.id).toBe("GRATIS");
    expect(planoEfetivo({ plan: "FAMILIA_PLUS", planEndsAt: new Date(Date.now() + DIA), planSource: "VOUCHER", trialEndsAt: null }).origem).toBe("CUPOM");
  });
});

describe("limites do Grátis", () => {
  it("contas, cartões, dívidas e objetivos: bloqueia criar além do limite, sem apagar nada", async () => {
    const f = await familiaLogada(app);
    // No teste (Família) cria à vontade
    expect((await conta(f.agent, "Nubank")).status).toBe(201);
    expect((await conta(f.agent, "Inter")).status).toBe(201);
    expect((await cartao(f.agent, "Visa 1")).status).toBe(201);
    expect((await cartao(f.agent, "Visa 2")).status).toBe(201);
    await paraGratis(f.householdId);

    // Carteira + 2 já passam de 2 contas: nada some, mas não cria mais
    expect((await f.agent.get("/api/accounts")).body.filter((c: { type: string }) => c.type !== "CREDIT_CARD")).toHaveLength(3);
    const r = await conta(f.agent, "Itaú");
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "LIMITE_PLANO", upgrade: true });
    expect(r.body.error).toContain("plano Grátis permite até 2 contas");
    expect(r.body.error).toContain("Família");
    expect((await cartao(f.agent, "Visa 3")).body.error).toContain("1 cartão");
    // Cartão também pelo /api/accounts
    expect((await f.agent.post("/api/accounts").send({ name: "X", type: "CREDIT_CARD", initialBalance: "0", creditLimit: "1", closingDay: 1, dueDay: 2, brand: "VISA", color: "#000000" })).status).toBe(403);

    const divida = { name: "Empréstimo", type: "EMPRESTIMO", currentBalance: "1000", minimumPayment: "100", dueDay: 10 };
    const d1 = await f.agent.post("/api/debts").send(divida);
    expect(d1.status, JSON.stringify(d1.body)).toBe(201);
    const d2 = await f.agent.post("/api/debts").send({ ...divida, name: "Outra" });
    expect(d2.status).toBe(403);
    expect(d2.body.error).toContain("1 dívida ativa");
    // Arquivar libera a vaga; reativar com a vaga ocupada não passa
    await f.agent.post(`/api/debts/${d1.body.id}/status`).send({ status: "ARCHIVED" });
    const d3 = await f.agent.post("/api/debts").send({ ...divida, name: "Terceira" });
    expect(d3.status).toBe(201);
    expect((await f.agent.post(`/api/debts/${d1.body.id}/status`).send({ status: "ACTIVE" })).status).toBe(403);

    const o1 = await f.agent.post("/api/goals").send({ name: "Viagem", targetAmount: "5000", color: "#464fa3", icon: "plane" });
    expect(o1.status, JSON.stringify(o1.body)).toBe(201);
    const o2 = await f.agent.post("/api/goals").send({ name: "Carro", targetAmount: "5000", color: "#464fa3", icon: "car" });
    expect(o2.status).toBe(403);
    expect(o2.body.error).toContain("1 objetivo ativo");
  });

  it("pessoas: Grátis só o dono; Família até 4 contando convites pendentes", async () => {
    const f = await familiaLogada(app);
    for (let i = 0; i < 3; i++) expect((await f.agent.post("/api/family/invites").send({ email: emailUnico() })).status).toBe(201);
    const quarto = await f.agent.post("/api/family/invites").send({ email: emailUnico() });
    expect(quarto.status).toBe(403);
    expect(quarto.body.error).toContain("até 4 pessoas");

    const g = await familiaLogada(app);
    await paraGratis(g.householdId);
    const r = await g.agent.post("/api/family/invites").send({});
    expect(r.status).toBe(403);
    expect(r.body.error).toContain("só o dono usa o espaço");
  });

  it("aceitar convite com o espaço cheio é recusado", async () => {
    const f = await familiaLogada(app);
    const convite = await f.agent.post("/api/family/invites").send({});
    await paraGratis(f.householdId);
    const outro = await usuarioLogado(app, "Ana");
    const token = convite.body.url.split("/").pop();
    const r = await outro.agent.post(`/api/invites/${token}/accept`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("LIMITE_PLANO");
  });

  it("mensagens da IA: conta por espaço e mês e para no limite do plano", async () => {
    const f = await familiaLogada(app);
    await paraGratis(f.householdId);
    await prisma.aiUsage.create({ data: { householdId: f.householdId, month: mesAtual(), count: 29 } });
    expect((await consumirMensagemIA(f.householdId)).ok).toBe(true);
    const r = await consumirMensagemIA(f.householdId);
    expect(r).toMatchObject({ ok: false, plano: { mensagensIA: 30 } });
    expect((await prisma.aiUsage.findUnique({ where: { householdId_month: { householdId: f.householdId, month: mesAtual() } } }))!.count).toBe(30);
  });
});

describe("Meu plano e cupons", () => {
  it("ADMIN cria cupom; dono resgata; uma vez por espaço; lista mostra quem usou", async () => {
    const semPermissao = await familiaLogada(app);
    expect((await semPermissao.agent.get("/api/admin/cupons")).status).toBe(403);

    const c = await admin.post("/api/admin/cupons").send({ code: " fundador ", plan: "FAMILIA_PLUS", months: 12, maxUses: 2, note: "Fundadores" });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body).toMatchObject({ code: "FUNDADOR", plan: "FAMILIA_PLUS", months: 12, uses: 0, active: true });
    expect((await admin.post("/api/admin/cupons").send({ code: "FUNDADOR", plan: "FAMILIA", months: 1 })).status).toBe(409);
    expect((await admin.post("/api/admin/cupons").send({ plan: "FAMILIA", months: 13 })).status).toBe(400);
    const auto = await admin.post("/api/admin/cupons").send({ plan: "FAMILIA", months: 1 });
    expect(auto.body.code).toMatch(/^FAMI-[0-9A-F]{8}$/);

    const f = await familiaLogada(app, "Robson");
    const r = await f.agent.post("/api/plano/cupom").send({ code: "fundador" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.plan).toMatchObject({ id: "FAMILIA_PLUS", source: "CUPOM", voice: true });
    const meses = (new Date(r.body.plan.endsAt).getTime() - Date.now()) / DIA;
    expect(meses).toBeGreaterThan(360);
    expect((await f.agent.post("/api/plano/cupom").send({ code: "FUNDADOR" })).status).toBe(409);

    const plano = await f.agent.get("/api/plano");
    expect(plano.body.canManage).toBe(true);
    expect(plano.body.usage.people).toEqual({ used: 1, limit: 8 });
    expect(plano.body.usage.aiMessages.limit).toBe(1000);
    expect(plano.body.plans.map((p: { id: string }) => p.id)).toEqual(["GRATIS", "FAMILIA", "FAMILIA_PLUS"]);

    const lista = await admin.get("/api/admin/cupons");
    const fundador = lista.body.find((v: { code: string }) => v.code === "FUNDADOR");
    expect(fundador.uses).toBe(1);
    expect(fundador.redemptions[0]).toMatchObject({ householdName: "Pessoal", userName: "Robson", userEmail: f.email });

    // Limite de usos e desativar
    const g = await familiaLogada(app);
    expect((await g.agent.post("/api/plano/cupom").send({ code: "FUNDADOR" })).status).toBe(200);
    const h = await familiaLogada(app);
    expect((await h.agent.post("/api/plano/cupom").send({ code: "FUNDADOR" })).body.error).toContain("máximo de vezes");
    await admin.patch(`/api/admin/cupons/${auto.body.id}`).send({ active: false });
    expect((await h.agent.post("/api/plano/cupom").send({ code: auto.body.code })).status).toBe(404);
    expect((await h.agent.post("/api/plano/cupom").send({ code: "NAOEXISTE" })).body.error).toContain("Cupom inválido");
  });

  it("Família durante o teste soma ao fim do teste; mesmo plano soma meses; vencido não resgata; só o dono", async () => {
    await admin.post("/api/admin/cupons").send({ code: "FAM1", plan: "FAMILIA", months: 1 });
    await admin.post("/api/admin/cupons").send({ code: "FAM2", plan: "FAMILIA", months: 2 });
    await admin.post("/api/admin/cupons").send({ code: "VELHO", plan: "FAMILIA", months: 1, expiresAt: new Date(Date.now() - DIA).toISOString() });

    const f = await familiaLogada(app);
    const fimTeste = (await prisma.household.findUniqueOrThrow({ where: { id: f.householdId } })).trialEndsAt!;
    const a = await f.agent.post("/api/plano/cupom").send({ code: "FAM1" });
    expect(new Date(a.body.plan.endsAt).getTime()).toBeGreaterThan(fimTeste.getTime() + 27 * DIA);
    const b = await f.agent.post("/api/plano/cupom").send({ code: "FAM2" });
    expect(new Date(b.body.plan.endsAt).getTime() - new Date(a.body.plan.endsAt).getTime()).toBeGreaterThan(58 * DIA);
    expect((await f.agent.post("/api/plano/cupom").send({ code: "VELHO" })).body.error).toContain("venceu");

    // Quem não é dono não resgata
    const convite = await f.agent.post("/api/family/invites").send({});
    const outro = await usuarioLogado(app, "Bia");
    await outro.agent.post(`/api/invites/${convite.body.url.split("/").pop()}/accept`);
    const r = await outro.agent.post("/api/plano/cupom").send({ code: "FAM1" });
    expect(r.status).toBe(403);
    expect((await outro.agent.get("/api/plano")).body.canManage).toBe(false);
  });

  it("não troca um Família+ ativo por um cupom de Família", async () => {
    await admin.post("/api/admin/cupons").send({ code: "PLUS3", plan: "FAMILIA_PLUS", months: 3 });
    await admin.post("/api/admin/cupons").send({ code: "FAMBAIXO", plan: "FAMILIA", months: 3 });
    const f = await familiaLogada(app);
    await f.agent.post("/api/plano/cupom").send({ code: "PLUS3" });
    const r = await f.agent.post("/api/plano/cupom").send({ code: "FAMBAIXO" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("maior");
  });
});
