import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

type Conta = { id: string; type: string; currentBalance: string; availableBalance: string; overdraftLimit: string | null; bankLogo: string | null };
const acharConta = async (agent: Awaited<ReturnType<typeof familiaLogada>>["agent"], id: string) =>
  ((await agent.get("/api/accounts")).body as Conta[]).find((c) => c.id === id)!;

describe("Cheque especial (overdraftLimit)", () => {
  it("conta bancária com limite: saldo negativo e disponível = saldo + limite", async () => {
    const { agent, categoria } = await familiaLogada(app, "Ana Cheque");
    const criada = await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "100", overdraftLimit: "500" });
    expect(criada.status).toBe(201);
    expect(criada.body.overdraftLimit).toBe("500.00");
    expect(criada.body.availableBalance).toBe("600.00");

    const gasto = await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "250", description: "Aluguel", date: "2026-10-05", accountId: criada.body.id, categoryId: categoria("Contas") });
    expect(gasto.status).toBe(201);

    const conta = await acharConta(agent, criada.body.id);
    expect(conta.currentBalance).toBe("-150.00");
    expect(conta.availableBalance).toBe("350.00");
  });

  it("valida: não aceita negativo nem em carteira, investimento ou cartão", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Beto Valida");
    expect((await agent.post("/api/accounts").send({ name: "X", type: "BANK", overdraftLimit: "-1" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "WALLET", overdraftLimit: "100" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "INVESTMENT", overdraftLimit: "100" })).status).toBe(400);
    const patch = await agent.patch(`/api/accounts/${carteiraId}`).send({ overdraftLimit: "100" });
    expect(patch.status).toBe(400);
    expect(patch.body.detalhes.overdraftLimit).toBeTruthy();
  });

  it("editar: muda o limite, zero tira; deixar de ser conta bancária limpa o limite", async () => {
    const { agent } = await familiaLogada(app, "Caio Edita");
    const id = (await agent.post("/api/accounts").send({ name: "Bradesco", type: "BANK", initialBalance: "0" })).body.id as string;

    let res = await agent.patch(`/api/accounts/${id}`).send({ overdraftLimit: "1000.50" });
    expect(res.status).toBe(200);
    expect(res.body.overdraftLimit).toBe("1000.50");
    expect(res.body.availableBalance).toBe("1000.50");

    res = await agent.patch(`/api/accounts/${id}`).send({ overdraftLimit: "0" });
    expect(res.body.overdraftLimit).toBeNull();

    await agent.patch(`/api/accounts/${id}`).send({ overdraftLimit: "300" });
    res = await agent.patch(`/api/accounts/${id}`).send({ type: "WALLET" });
    expect(res.status).toBe(200);
    expect(res.body.overdraftLimit).toBeNull();
    expect(res.body.availableBalance).toBe("0.00");
  });
});

describe("Conta de investimento (INVESTMENT)", () => {
  it("cria, recebe transferência, ajusta saldo e aparece no resumo", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Duda Invest");
    const banco = (await agent.post("/api/accounts").send({ name: "Inter", type: "BANK", initialBalance: "2000" })).body.id as string;
    const criada = await agent.post("/api/accounts").send({ name: "XP", type: "INVESTMENT", initialBalance: "1000", bankLogo: "xp" });
    expect(criada.status).toBe(201);
    expect(criada.body.type).toBe("INVESTMENT");
    expect(criada.body.bankLogo).toBe("xp");
    const invest = criada.body.id as string;

    const aporte = await agent.post("/api/transactions").send({ type: "TRANSFER", amount: "500", date: "2026-10-05", accountId: banco, toAccountId: invest });
    expect(aporte.status).toBe(201);
    expect(aporte.body.toAccount.type).toBe("INVESTMENT");
    expect(aporte.body.toAccount.bankLogo).toBe("xp");

    const resgate = await agent.post("/api/transactions").send({ type: "TRANSFER", amount: "100", date: "2026-10-06", accountId: invest, toAccountId: carteiraId });
    expect(resgate.status).toBe(201);

    expect((await acharConta(agent, invest)).currentBalance).toBe("1400.00");
    expect((await acharConta(agent, banco)).currentBalance).toBe("1500.00");

    // Rendimento: ajuste de saldo
    const ajuste = await agent.post(`/api/accounts/${invest}/adjust`).send({ balance: "1450" });
    expect(ajuste.status).toBe(201);
    expect(ajuste.body.account.currentBalance).toBe("1450.00");

    // Filtro por tipo e resumo
    const soInvest = await agent.get("/api/accounts?type=INVESTMENT");
    expect(soInvest.body.map((c: Conta) => c.id)).toEqual([invest]);
    const resumo = await agent.get("/api/summary?month=2026-10");
    expect(resumo.body.accounts.some((c: Conta) => c.id === invest && c.type === "INVESTMENT")).toBe(true);
    // Transferência não é receita nem despesa
    expect(resumo.body.totals.income).toBe("0.00");
  });
});

describe("Logo do banco (bankLogo)", () => {
  it("aceita slug da lista, recusa desconhecido, null tira; cartão também", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Eva Logo");
    expect((await agent.post("/api/accounts").send({ name: "N", type: "BANK", bankLogo: "nao-existe" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "N", type: "BANK", bankLogo: "../x" })).status).toBe(400);

    let res = await agent.patch(`/api/accounts/${carteiraId}`).send({ bankLogo: "nubank" });
    expect(res.status).toBe(200);
    expect(res.body.bankLogo).toBe("nubank");
    res = await agent.patch(`/api/accounts/${carteiraId}`).send({ bankLogo: null });
    expect(res.body.bankLogo).toBeNull();

    const cartao = await agent
      .post("/api/cards")
      .send({ name: "Roxinho", brand: "MASTERCARD", creditLimit: "3000", closingDay: 3, dueDay: 10, color: "#820ad1", bankLogo: "nubank" });
    expect(cartao.status).toBe(201);
    expect(cartao.body.bankLogo).toBe("nubank");
    const editado = await agent.patch(`/api/cards/${cartao.body.id}`).send({ bankLogo: "itau" });
    expect(editado.body.bankLogo).toBe("itau");
    expect((await agent.patch(`/api/cards/${cartao.body.id}`).send({ bankLogo: "zzz" })).status).toBe(400);
  });
});
