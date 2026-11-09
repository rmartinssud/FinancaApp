import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { mesAtual } from "../src/lib/money.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

type Lanc = { description: string; type: string; isAdjustment: boolean; account: { type: string }; date: string; status: string; category: unknown };
const descricoes = (lista: Lanc[]) => lista.map((l) => l.description).sort();

// Hoje em Brasília ("AAAA-MM-DD")
const hojeBrasilia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Família com carteira (Dinheiro), banco (Débito/Pix) e cartão (fecha 24, vence 30), tudo em outubro/2026
async function cenarioFormas(nome: string) {
  const { agent, carteiraId, categoria } = await familiaLogada(app, nome);
  const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "5000" })).body.id as string;
  const cartao = (
    await agent.post("/api/cards").send({ name: "Santander", brand: "VISA", creditLimit: "5000", closingDay: 24, dueDay: 30, color: "#cc092f" })
  ).body.id as string;

  const lancar = (body: object) => agent.post("/api/transactions").send({ date: "2026-10-05", ...body });
  expect((await lancar({ type: "EXPENSE", amount: "20", description: "Feira", accountId: carteiraId, categoryId: categoria("Mercado") })).status).toBe(201);
  expect((await lancar({ type: "INCOME", amount: "3000", description: "Salário", accountId: banco, categoryId: categoria("Salário") })).status).toBe(201);
  expect((await lancar({ type: "EXPENSE", amount: "100", description: "Luz", accountId: banco, categoryId: categoria("Contas") })).status).toBe(201);
  expect((await lancar({ type: "TRANSFER", amount: "200", description: "Saque", accountId: banco, toAccountId: carteiraId })).status).toBe(201);
  // Compra no cartão em 10/10 → fatura de outubro (vence 30/10)
  const compra = await agent
    .post("/api/card-expenses")
    .send({ cardId: cartao, categoryId: categoria("Lazer"), description: "Cinema", amount: "60", date: "2026-10-10" });
  expect(compra.status).toBe(201);
  // Paga a fatura de outubro pelo banco
  const pago = await agent.post(`/api/cards/${cartao}/invoices/2026-10/pay`).send({ accountId: banco, date: "2026-10-28" });
  expect(pago.status).toBe(201);

  return { agent, carteiraId, banco, cartao, categoria };
}

describe("Lançamentos: filtro por forma de pagamento (accountType)", () => {
  it("sem filtro traz tudo do mês, menos as compras no cartão (que viram a linha da fatura)", async () => {
    const { agent } = await cenarioFormas("Bia Todas");
    const res = await agent.get("/api/transactions?month=2026-10");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(descricoes(res.body)).not.toContain("Cinema");
  });

  it("Cartão (CREDIT_CARD): compra no cartão e o pagamento da fatura", async () => {
    const { agent } = await cenarioFormas("Caio Cartão");
    const res = await agent.get("/api/transactions?month=2026-10&accountType=CREDIT_CARD");
    expect(res.status).toBe(200);
    const nomes = descricoes(res.body);
    expect(nomes).toContain("Cinema");
    expect(nomes).toHaveLength(2); // Cinema + pagamento da fatura (transferência para o cartão)
    expect(res.body.filter((l: Lanc) => l.type === "TRANSFER")).toHaveLength(1);
  });

  it("Débito/Pix (BANK): receitas, despesas e transferências que saem ou entram no banco", async () => {
    const { agent } = await cenarioFormas("Duda Banco");
    const res = await agent.get("/api/transactions?month=2026-10&accountType=BANK");
    expect(res.status).toBe(200);
    expect(descricoes(res.body).filter((d) => d !== "Saque" && !d.toLowerCase().includes("fatura"))).toEqual(["Luz", "Salário"]);
    // Saque (banco → carteira) e pagamento da fatura (banco → cartão)
    expect(res.body.filter((l: Lanc) => l.type === "TRANSFER")).toHaveLength(2);
    expect(res.body).toHaveLength(4);
  });

  it("Dinheiro (WALLET): despesa na carteira e a transferência que entrou nela", async () => {
    const { agent } = await cenarioFormas("Edu Carteira");
    const res = await agent.get("/api/transactions?month=2026-10&accountType=WALLET");
    expect(descricoes(res.body)).toEqual(["Feira", "Saque"]);
  });

  it("combina com o filtro de tipo e mantém a regra do mês da fatura", async () => {
    const { agent } = await cenarioFormas("Fabi Combina");
    const despesasCartao = await agent.get("/api/transactions?month=2026-10&accountType=CREDIT_CARD&type=EXPENSE");
    expect(descricoes(despesasCartao.body)).toEqual(["Cinema"]);
    // A compra é da fatura de outubro: não aparece em novembro
    expect((await agent.get("/api/transactions?month=2026-11&accountType=CREDIT_CARD")).body).toHaveLength(0);
    const receitasBanco = await agent.get("/api/transactions?month=2026-10&accountType=BANK&type=INCOME");
    expect(descricoes(receitasBanco.body)).toEqual(["Salário"]);
  });

  it("recusa forma de pagamento desconhecida", async () => {
    const { agent } = await familiaLogada(app, "Gabi Inválida");
    const res = await agent.get("/api/transactions?month=2026-10&accountType=PIX");
    expect(res.status).toBe(400);
  });
});

describe("Contas: ajustar saldo (POST /api/accounts/:id/adjust)", () => {
  const saldoDe = async (agent: Awaited<ReturnType<typeof familiaLogada>>["agent"], id: string) =>
    ((await agent.get("/api/accounts")).body as { id: string; currentBalance: string }[]).find((c) => c.id === id)!.currentBalance;

  it("saldo do banco maior: lança receita de ajuste e o saldo fica igual ao digitado", async () => {
    const { agent } = await familiaLogada(app, "Hugo Maior");
    const banco = (await agent.post("/api/accounts").send({ name: "Nubank", type: "BANK", initialBalance: "1000" })).body.id as string;
    await agent.post("/api/transactions").send({ type: "EXPENSE", amount: "150.40", description: "Mercado", date: hojeBrasilia(), accountId: banco });
    expect(await saldoDe(agent, banco)).toBe("849.60");

    const res = await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "1234.56" });
    expect(res.status).toBe(201);
    expect(res.body.previousBalance).toBe("849.60");
    expect(res.body.account.currentBalance).toBe("1234.56");
    expect(res.body.adjustment).toMatchObject({
      type: "INCOME",
      amount: "384.96",
      description: "Ajuste de saldo",
      status: "CONFIRMED",
      isAdjustment: true,
      category: null,
    });
    expect(res.body.adjustment.date.slice(0, 10)).toBe(hojeBrasilia());
    expect(await saldoDe(agent, banco)).toBe("1234.56");
  });

  it("saldo do banco menor: lança despesa de ajuste (aceita saldo negativo)", async () => {
    const { agent } = await familiaLogada(app, "Iris Menor");
    const banco = (await agent.post("/api/accounts").send({ name: "Caixa", type: "BANK", initialBalance: "100" })).body.id as string;
    const res = await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "-25.50" });
    expect(res.status).toBe(201);
    expect(res.body.adjustment).toMatchObject({ type: "EXPENSE", amount: "125.50", isAdjustment: true });
    expect(await saldoDe(agent, banco)).toBe("-25.50");
  });

  it("saldo igual: não cria lançamento", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Jade Igual");
    const antes = await saldoDe(agent, carteiraId);
    const res = await agent.post(`/api/accounts/${carteiraId}/adjust`).send({ balance: antes });
    expect(res.status).toBe(200);
    expect(res.body.adjustment).toBeNull();
    expect((await agent.get(`/api/transactions?month=${mesAtual()}`)).body).toHaveLength(0);
  });

  it("ajuste não entra em receitas, despesas nem categorias do resumo", async () => {
    const { agent, categoria } = await familiaLogada(app, "Kiko Resumo");
    const banco = (await agent.post("/api/accounts").send({ name: "Inter", type: "BANK", initialBalance: "500" })).body.id as string;
    await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "80", description: "Farmácia", date: hojeBrasilia(), accountId: banco, categoryId: categoria("Saúde") });
    const antes = (await agent.get(`/api/summary?month=${mesAtual()}`)).body;

    expect((await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "300" })).status).toBe(201); // despesa de ajuste 120
    expect((await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "1000" })).status).toBe(201); // receita de ajuste 700

    const depois = (await agent.get(`/api/summary?month=${mesAtual()}`)).body;
    expect(depois.totals).toEqual(antes.totals);
    expect(depois.totals).toEqual({ income: "0.00", expense: "80.00", balance: "-80.00" });
    expect(depois.byCategory).toEqual(antes.byCategory);
    // Mas o saldo da conta (no resumo também) acompanha o ajuste
    expect(depois.accounts.find((c: { id: string }) => c.id === banco).currentBalance).toBe("1000.00");

    // Aparece em Lançamentos marcado como ajuste
    const lista = (await agent.get(`/api/transactions?month=${mesAtual()}`)).body as Lanc[];
    expect(lista.filter((l) => l.isAdjustment).map((l) => l.description)).toEqual(["Ajuste de saldo", "Ajuste de saldo"]);
    expect(lista.find((l) => l.description === "Farmácia")!.isAdjustment).toBe(false);
  });

  it("ajuste não pode ser editado, mas pode ser apagado (o saldo volta)", async () => {
    const { agent } = await familiaLogada(app, "Lia Apaga");
    const banco = (await agent.post("/api/accounts").send({ name: "BB", type: "BANK", initialBalance: "200" })).body.id as string;
    const ajuste = (await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "250" })).body.adjustment;
    const editar = await agent.patch(`/api/transactions/${ajuste.id}`).send({ amount: "10" });
    expect(editar.status).toBe(409);
    expect((await agent.delete(`/api/transactions/${ajuste.id}`)).status).toBe(204);
    expect(await saldoDe(agent, banco)).toBe("200.00");
  });

  it("recusa cartão de crédito, conta de outra família e valor inválido", async () => {
    const { agent } = await familiaLogada(app, "Mia Recusa");
    const cartao = (
      await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id as string;
    const noCartao = await agent.post(`/api/accounts/${cartao}/adjust`).send({ balance: "100" });
    expect(noCartao.status).toBe(400);
    expect(noCartao.body.error).toContain("Cartão de crédito");

    const outra = await familiaLogada(app, "Nei Outra");
    expect((await outra.agent.post(`/api/accounts/${cartao}/adjust`).send({ balance: "100" })).status).toBe(404);

    const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK" })).body.id as string;
    expect((await agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "12,50" })).status).toBe(400);
    expect((await agent.post(`/api/accounts/${banco}/adjust`).send({})).status).toBe(400);
  });
});
