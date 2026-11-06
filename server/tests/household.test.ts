import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { usuarioLogado } from "./helpers.js";

const app = createApp();

describe("escopo por família (household)", () => {
  it("GET /api/accounts exige login", async () => {
    const res = await request(app).get("/api/accounts");
    expect(res.status).toBe(401);
  });

  it("cada usuário só vê as contas da própria família", async () => {
    const a = await usuarioLogado(app, "Carlos Alves");
    const b = await usuarioLogado(app, "Beatriz Rocha");

    // Cria um cartão direto no banco para a família do Carlos
    const meA = await a.agent.get("/api/me");
    await prisma.financialAccount.create({
      data: {
        householdId: meA.body.household.id,
        name: "Nubank",
        type: "CREDIT_CARD",
        initialBalance: "0",
        creditLimit: "1500.50",
        closingDay: 3,
        dueDay: 10,
      },
    });

    const contasA = await a.agent.get("/api/accounts");
    expect(contasA.status).toBe(200);
    expect(contasA.body.map((c: { name: string }) => c.name)).toEqual(["Carteira", "Nubank"]);
    expect(contasA.body[1].creditLimit).toBe("1500.50");

    const contasB = await b.agent.get("/api/accounts");
    expect(contasB.body.map((c: { name: string }) => c.name)).toEqual(["Carteira"]);
  });

  it("não deixa escolher a família de outra pessoa pelo header", async () => {
    const a = await usuarioLogado(app, "Diego Melo");
    const b = await usuarioLogado(app, "Elisa Prado");
    const meA = await a.agent.get("/api/me");

    const res = await b.agent.get("/api/accounts").set("X-Household-Id", meA.body.household.id);
    expect(res.status).toBe(403);
  });

  it("valida o filtro com zod", async () => {
    const { agent } = await usuarioLogado(app);
    const ok = await agent.get("/api/accounts?type=WALLET");
    expect(ok.body).toHaveLength(1);
    const ruim = await agent.get("/api/accounts?type=POUPANCA");
    expect(ruim.status).toBe(400);
  });
});
