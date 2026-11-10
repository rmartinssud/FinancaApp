import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

type Conta = {
  id: string;
  type: string;
  isDefault: boolean;
  showOnSummary: boolean;
  ignoreInTotals: boolean;
  accountNumber: string | null;
  notes: string | null;
  currentBalance: string;
};

describe("Formulário de conta: campos novos", () => {
  it("valores padrão ao criar e textos opcionais", async () => {
    const { agent } = await familiaLogada(app, "Dora Padrao");
    const res = await agent.post("/api/accounts").send({ name: "Santander", type: "BANK", initialBalance: "-4432.63" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isDefault: false, showOnSummary: true, ignoreInTotals: false, accountNumber: null, notes: null, initialBalance: "-4432.63" });

    const outra = await agent
      .post("/api/accounts")
      .send({ name: "Cofre", type: "OTHER", accountNumber: " ag. 1234 c/c 56789-0 ", notes: "Guardado em casa" });
    expect(outra.status).toBe(201);
    expect(outra.body).toMatchObject({ type: "OTHER", accountNumber: "ag. 1234 c/c 56789-0", notes: "Guardado em casa" });

    const limpa = await agent.patch(`/api/accounts/${outra.body.id}`).send({ accountNumber: "", notes: null });
    expect(limpa.body).toMatchObject({ accountNumber: null, notes: null });

    expect((await agent.post("/api/accounts").send({ name: "X", type: "BANK", accountNumber: "1".repeat(41) })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "BANK", notes: "a".repeat(501) })).status).toBe(400);
  });

  it("conta padrão: só uma por espaço; marcar outra desmarca a anterior", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Edu Padrao");
    const banco = await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", isDefault: true });
    expect(banco.body.isDefault).toBe(true);

    const res = await agent.patch(`/api/accounts/${carteiraId}`).send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);

    let contas = (await agent.get("/api/accounts")).body as Conta[];
    expect(contas.filter((c) => c.isDefault).map((c) => c.id)).toEqual([carteiraId]);

    // Criar uma nova já como padrão também desmarca a anterior
    const nova = await agent.post("/api/accounts").send({ name: "Nubank", type: "BANK", isDefault: true });
    contas = (await agent.get("/api/accounts")).body as Conta[];
    expect(contas.filter((c) => c.isDefault).map((c) => c.id)).toEqual([nova.body.id]);

    // Outro espaço não é afetado
    const outro = await familiaLogada(app, "Fabi Outro");
    await outro.agent.patch(`/api/accounts/${outro.carteiraId}`).send({ isDefault: true });
    contas = (await agent.get("/api/accounts")).body as Conta[];
    expect(contas.filter((c) => c.isDefault).map((c) => c.id)).toEqual([nova.body.id]);
  });

  it("resumo: ignorar nos totais tira do total; exibir no resumo volta na lista", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Gabi Totais");
    await agent.patch(`/api/accounts/${carteiraId}`).send({ initialBalance: "100" });
    const ignorada = await agent.post("/api/accounts").send({ name: "Conta da empresa", type: "BANK", initialBalance: "1000", ignoreInTotals: true });
    const escondida = await agent.post("/api/accounts").send({ name: "Poupança", type: "INVESTMENT", initialBalance: "50", showOnSummary: false });

    const resumo = await agent.get("/api/summary?month=2026-11");
    expect(resumo.status).toBe(200);
    // 100 (carteira) + 50 (escondida, mas conta no total); a ignorada fica de fora
    expect(resumo.body.accountsTotals).toEqual({ total: "150.00", investments: "50.00" });
    const lista = resumo.body.accounts as Conta[];
    expect(lista.find((c) => c.id === escondida.body.id)?.showOnSummary).toBe(false);
    expect(lista.find((c) => c.id === ignorada.body.id)?.ignoreInTotals).toBe(true);
  });
});
