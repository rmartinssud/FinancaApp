import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { outbox } from "../src/lib/email.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

const app = createApp();
type Agent = Awaited<ReturnType<typeof familiaLogada>>["agent"];

// Cria o espaço "Família Martins" para o agent e devolve o id (fica ativo)
async function criarFamilia(agent: Agent, nome = "Família Martins") {
  const res = await agent.post("/api/households").set("Origin", ORIGIN).send({ name: nome });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// Dono convida (por link) e o convidado aceita. Devolve o token.
async function convidarEAceitar(dono: Agent, convidado: Agent, role = "MEMBER") {
  const conv = await dono.post("/api/family/invites").send({ role });
  expect(conv.status).toBe(201);
  const token = conv.body.url.split("/convite/")[1];
  const ok = await convidado.post(`/api/invites/${token}/accept`);
  expect(ok.status).toBe(200);
  return token as string;
}

describe("espaços: um login, vários espaços", () => {
  it("cadastro cria o espaço Pessoal; criar espaço novo vem com categorias e fica ativo", async () => {
    const { agent, householdId } = await familiaLogada(app, "Robson Martins");
    const me = await agent.get("/api/me");
    expect(me.body.household).toMatchObject({ name: "Pessoal", role: "OWNER", isPersonal: true });
    expect(me.body.households).toHaveLength(1);

    const familiaId = await criarFamilia(agent);
    const me2 = await agent.get("/api/me");
    expect(me2.body.household.id).toBe(familiaId);
    expect(me2.body.households.map((h: { name: string }) => h.name)).toEqual(["Pessoal", "Família Martins"]);
    const cats = await agent.get("/api/categories");
    expect(cats.body.length).toBeGreaterThan(5);

    // Dados separados por espaço
    await agent.post("/api/accounts").send({ name: "Conta da casa", type: "BANK" });
    const contasFamilia = await agent.get("/api/accounts");
    expect(contasFamilia.body.map((c: { name: string }) => c.name)).toContain("Conta da casa");

    // Trocar para o Pessoal (servidor lembra o último usado)
    expect((await agent.post(`/api/households/${householdId}/activate`)).status).toBe(200);
    const contasPessoal = await agent.get("/api/accounts");
    expect(contasPessoal.body.map((c: { name: string }) => c.name)).not.toContain("Conta da casa");

    // Header escolhe um espaço do qual é membro
    const pelaHeader = await agent.get("/api/accounts").set("X-Household-Id", familiaId);
    expect(pelaHeader.body.map((c: { name: string }) => c.name)).toContain("Conta da casa");
  });

  it("não lê nem escreve em espaço alheio (header, activate ou id)", async () => {
    const a = await familiaLogada(app, "Ana Lima");
    const b = await familiaLogada(app, "Bruno Costa");
    const familiaA = await criarFamilia(a.agent, "Família Lima");
    const contaA = (await a.agent.get("/api/accounts")).body[0].id;

    expect((await b.agent.get("/api/accounts").set("X-Household-Id", familiaA)).status).toBe(403);
    expect((await b.agent.post("/api/accounts").set("X-Household-Id", familiaA).send({ name: "X", type: "BANK" })).status).toBe(403);
    expect((await b.agent.post(`/api/households/${familiaA}/activate`)).status).toBe(403);
    expect((await b.agent.get("/api/family").set("X-Household-Id", familiaA)).status).toBe(403);
    // Pelo id da conta, no próprio espaço: não encontra
    expect((await b.agent.patch(`/api/accounts/${contaA}`).send({ name: "Hack" })).status).toBe(404);
    expect(
      (await b.agent.post("/api/transactions").send({ type: "EXPENSE", amount: "10.00", description: "x", date: "2026-11-01", accountId: contaA })).status,
    ).not.toBe(201);
    expect((await prisma.financialAccount.findUnique({ where: { id: contaA } }))!.name).toBe("Carteira");
  });
});

describe("convites", () => {
  it("convite por email: envia link, aceitar entra como membro e avisa o dono", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const filho = await familiaLogada(app, "Luiz Martins");
    const familiaId = await criarFamilia(dono.agent);

    const conv = await dono.agent.post("/api/family/invites").send({ email: filho.email, role: "MEMBER" });
    expect(conv.status).toBe(201);
    const email = [...outbox].reverse().find((m) => m.to === filho.email && m.subject.includes("Convite"));
    expect(email?.text).toContain(conv.body.url);
    const token = conv.body.url.split("/convite/")[1];

    const pub = await request(app).get(`/api/invites/${token}`);
    expect(pub.body).toMatchObject({ householdName: "Família Martins", invitedBy: "Robson Martins", role: "MEMBER" });

    // Sem login não aceita
    expect((await request(app).post(`/api/invites/${token}/accept`)).status).toBe(401);

    const ok = await filho.agent.post(`/api/invites/${token}/accept`);
    expect(ok.body).toMatchObject({ householdId: familiaId, role: "MEMBER", alreadyMember: false });
    expect(outbox.some((m) => m.to === dono.email && m.subject.includes("entrou"))).toBe(true);

    // Continua com o espaço pessoal e a família fica ativa
    const me = await filho.agent.get("/api/me");
    expect(me.body.household.id).toBe(familiaId);
    expect(me.body.households).toHaveLength(2);

    // Token usado não vale de novo
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);

    const fam = await dono.agent.get("/api/family");
    expect(fam.body.members.map((m: { name: string; role: string }) => `${m.name}:${m.role}`)).toEqual([
      "Robson Martins:OWNER",
      "Luiz Martins:MEMBER",
    ]);
  });

  it("cancelar, reenviar (link antigo para de valer) e expirar", async () => {
    const dono = await familiaLogada(app);
    const outro = await familiaLogada(app);
    await criarFamilia(dono.agent);

    const c1 = await dono.agent.post("/api/family/invites").send({ role: "VIEWER" });
    const antigo = c1.body.url.split("/convite/")[1];
    const re = await dono.agent.post(`/api/family/invites/${c1.body.invite.id}/resend`);
    expect(re.status).toBe(200);
    expect((await request(app).get(`/api/invites/${antigo}`)).status).toBe(404);
    const novo = re.body.url.split("/convite/")[1];
    expect((await request(app).get(`/api/invites/${novo}`)).status).toBe(200);

    expect((await dono.agent.get("/api/family")).body.invites).toHaveLength(1);
    expect((await dono.agent.delete(`/api/family/invites/${c1.body.invite.id}`)).status).toBe(204);
    expect((await outro.agent.post(`/api/invites/${novo}/accept`)).status).toBe(404);
    expect((await dono.agent.get("/api/family")).body.invites).toHaveLength(0);

    const c2 = await dono.agent.post("/api/family/invites").send({});
    await prisma.householdInvite.update({ where: { id: c2.body.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const exp = await outro.agent.post(`/api/invites/${c2.body.url.split("/convite/")[1]}/accept`);
    expect(exp.status).toBe(404);
    expect(exp.body.error).toContain("expirou");
  });
});

describe("papéis", () => {
  it("MEMBER lança mas não gerencia; VIEWER só lê", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const membro = await familiaLogada(app, "Paty Garcia");
    const leitor = await familiaLogada(app, "Vó Leitora");
    await criarFamilia(dono.agent);
    await convidarEAceitar(dono.agent, membro.agent, "MEMBER");
    await convidarEAceitar(dono.agent, leitor.agent, "VIEWER");

    const carteira = (await membro.agent.get("/api/accounts")).body[0].id;
    const lanc = await membro.agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "50.00", description: "Mercado", date: "2026-11-05", accountId: carteira });
    expect(lanc.status).toBe(201);
    expect(lanc.body.createdBy).toMatchObject({ name: "Paty Garcia" });

    expect((await membro.agent.post("/api/family/invites").send({})).status).toBe(403);
    expect((await membro.agent.patch("/api/family").send({ name: "Minha" })).status).toBe(403);
    expect((await membro.agent.delete("/api/family")).status).toBe(403);

    expect((await leitor.agent.get("/api/transactions?month=2026-11")).status).toBe(200);
    expect(
      (await leitor.agent.post("/api/transactions").send({ type: "EXPENSE", amount: "1.00", description: "x", date: "2026-11-05", accountId: carteira })).status,
    ).toBe(403);
    expect((await leitor.agent.delete(`/api/transactions/${lanc.body.id}`)).status).toBe(403);
    expect((await leitor.agent.post("/api/accounts").send({ name: "X", type: "BANK" })).status).toBe(403);

    // Filtro por pessoa
    const meus = await dono.agent.get(`/api/transactions?month=2026-11&createdById=${lanc.body.createdById}`);
    expect(meus.body.map((t: { id: string }) => t.id)).toEqual([lanc.body.id]);
  });

  it("último dono não sai, não é removido nem rebaixado; outros podem sair", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const membro = await familiaLogada(app, "Paty Garcia");
    const familiaId = await criarFamilia(dono.agent);
    await convidarEAceitar(dono.agent, membro.agent);
    const donoId = (await dono.agent.get("/api/me")).body.user.id;
    const membroId = (await membro.agent.get("/api/me")).body.user.id;

    expect((await dono.agent.post("/api/family/leave")).status).toBe(409);
    expect((await dono.agent.delete(`/api/family/members/${donoId}`)).status).toBe(409);
    expect((await dono.agent.patch(`/api/family/members/${donoId}`).send({ role: "MEMBER" })).status).toBe(409);

    // Promove a Paty a dona; aí o Robson pode virar membro
    expect((await dono.agent.patch(`/api/family/members/${membroId}`).send({ role: "OWNER" })).status).toBe(200);
    expect((await dono.agent.patch(`/api/family/members/${donoId}`).send({ role: "MEMBER" })).status).toBe(200);
    expect((await dono.agent.post("/api/family/invites").send({})).status).toBe(403);

    // Robson sai: avisa a dona, e o ativo volta para o Pessoal dele
    expect((await dono.agent.post("/api/family/leave")).status).toBe(204);
    expect(outbox.some((m) => m.to === membro.email && m.subject.includes("saiu"))).toBe(true);
    const me = await dono.agent.get("/api/me");
    expect(me.body.household.isPersonal).toBe(true);
    expect((await dono.agent.get("/api/accounts").set("X-Household-Id", familiaId)).status).toBe(403);
  });

  it("dono remove membro, renomeia e apaga o espaço (o pessoal não)", async () => {
    const dono = await familiaLogada(app);
    const membro = await familiaLogada(app);
    const familiaId = await criarFamilia(dono.agent);
    await convidarEAceitar(dono.agent, membro.agent);
    const membroId = (await membro.agent.get("/api/me")).body.user.id;

    expect((await dono.agent.delete(`/api/family/members/${membroId}`)).status).toBe(204);
    expect((await membro.agent.get("/api/accounts").set("X-Household-Id", familiaId)).status).toBe(403);

    expect((await dono.agent.patch("/api/family").send({ name: "Casa" })).body.name).toBe("Casa");
    expect((await dono.agent.delete("/api/family")).status).toBe(204);
    expect(await prisma.household.findUnique({ where: { id: familiaId } })).toBeNull();
    // Agora o ativo é o Pessoal, que não pode ser apagado
    expect((await dono.agent.delete("/api/family")).status).toBe(409);
  });
});
