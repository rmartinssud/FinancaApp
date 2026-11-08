import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Decimal } from "../src/lib/money.js";
import { mesDaFatura, datasDaFatura, dividirParcelas, somarMesesNaData } from "../src/services/cartoes.js";
import { usuarioLogado, familiaLogada } from "./helpers.js";

const app = createApp();

type Agent = Awaited<ReturnType<typeof familiaLogada>>["agent"];
const saldo = async (agent: Agent, id: string) =>
  (await agent.get("/api/accounts")).body.find((c: { id: string }) => c.id === id).currentBalance as string;

describe("regras da fatura (funções)", () => {
  it("compra no dia do fechamento ou depois vai para a fatura seguinte", () => {
    const nubank = { closingDay: 3, dueDay: 10 };
    expect(mesDaFatura(new Date("2026-11-02T12:00:00Z"), nubank)).toBe("2026-11");
    expect(mesDaFatura(new Date("2026-11-03T12:00:00Z"), nubank)).toBe("2026-12");
    expect(mesDaFatura(new Date("2026-11-05T12:00:00Z"), nubank)).toBe("2026-12");
    // 31/12 às 23:30 em Brasília (já é 01/01 em UTC) ainda é dezembro
    expect(mesDaFatura(new Date("2027-01-01T02:30:00Z"), nubank)).toBe("2027-01");

    // Vence antes do dia de fechamento: vence no mês seguinte ao fechamento
    const itau = { closingDay: 25, dueDay: 5 };
    expect(mesDaFatura(new Date("2026-11-10T12:00:00Z"), itau)).toBe("2026-12");
    expect(mesDaFatura(new Date("2026-11-26T12:00:00Z"), itau)).toBe("2027-01");
    expect(datasDaFatura("2026-12", itau)).toEqual({
      closingDate: new Date("2026-11-25T12:00:00.000Z"),
      dueDate: new Date("2026-12-05T12:00:00.000Z"),
    });

    // Fechamento dia 31 em fevereiro vira dia 28
    const fim = { closingDay: 31, dueDay: 8 };
    expect(mesDaFatura(new Date("2027-02-27T12:00:00Z"), fim)).toBe("2027-03");
    expect(mesDaFatura(new Date("2027-02-28T12:00:00Z"), fim)).toBe("2027-04");
  });

  it("divide parcelas com centavos na primeira e soma meses sem passar do fim do mês", () => {
    expect(dividirParcelas(new Decimal("100"), 3).map((v) => v.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(dividirParcelas(new Decimal("0.05"), 2).map((v) => v.toFixed(2))).toEqual(["0.03", "0.02"]);
    expect(somarMesesNaData(new Date("2027-01-31T12:00:00Z"), 1).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
});

describe("transferências (/api/transactions type=TRANSFER)", () => {
  it("tira da origem, põe no destino e não conta como receita nem despesa", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Olga Prado");
    const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "1000.00" })).body.id;

    const criar = await agent
      .post("/api/transactions")
      .send({ type: "TRANSFER", amount: "300", date: "2026-10-05", accountId: banco, toAccountId: carteiraId });
    expect(criar.status).toBe(201);
    expect(criar.body).toMatchObject({
      type: "TRANSFER",
      amount: "300.00",
      description: "Transferência",
      category: null,
      account: { id: banco, name: "Itaú" },
      toAccount: { id: carteiraId, name: "Carteira" },
      isInvoicePayment: false,
    });
    expect(await saldo(agent, banco)).toBe("700.00");
    expect(await saldo(agent, carteiraId)).toBe("300.00");

    const resumo = await agent.get("/api/summary?month=2026-10");
    expect(resumo.body.totals).toEqual({ income: "0.00", expense: "0.00", balance: "0.00" });
    expect(resumo.body.byCategory).toEqual([]);

    // Aparece no filtro das duas contas e no filtro por tipo
    expect((await agent.get(`/api/transactions?month=2026-10&accountId=${carteiraId}`)).body).toHaveLength(1);
    expect((await agent.get(`/api/transactions?month=2026-10&accountId=${banco}`)).body).toHaveLength(1);
    expect((await agent.get("/api/transactions?month=2026-10&type=TRANSFER")).body).toHaveLength(1);

    // Editar mexe nas duas pontas de uma vez (inverte o sentido e muda o valor)
    const editar = await agent
      .patch(`/api/transactions/${criar.body.id}`)
      .send({ amount: "50.25", accountId: carteiraId, toAccountId: banco, description: "Devolução" });
    expect(editar.status).toBe(200);
    expect(editar.body).toMatchObject({ description: "Devolução", account: { id: carteiraId }, toAccount: { id: banco } });
    expect(await saldo(agent, banco)).toBe("1050.25");
    expect(await saldo(agent, carteiraId)).toBe("-50.25");

    // Pendente não mexe no saldo
    await agent.patch(`/api/transactions/${criar.body.id}`).send({ status: "PENDING" });
    expect(await saldo(agent, banco)).toBe("1000.00");
    expect(await saldo(agent, carteiraId)).toBe("0.00");

    // Virar despesa limpa o destino
    const virou = await agent.patch(`/api/transactions/${criar.body.id}`).send({ type: "EXPENSE", status: "CONFIRMED" });
    expect(virou.status).toBe(200);
    expect(virou.body.toAccount).toBeNull();
    expect(await saldo(agent, banco)).toBe("1000.00");
    expect(await saldo(agent, carteiraId)).toBe("-50.25");

    // Voltar a ser transferência exige destino
    expect((await agent.patch(`/api/transactions/${criar.body.id}`).send({ type: "TRANSFER" })).status).toBe(400);
    const deNovo = await agent.patch(`/api/transactions/${criar.body.id}`).send({ type: "TRANSFER", toAccountId: banco });
    expect(deNovo.status).toBe(200);

    // Apagar desfaz as duas pontas
    expect((await agent.delete(`/api/transactions/${criar.body.id}`)).status).toBe(204);
    expect(await saldo(agent, banco)).toBe("1000.00");
    expect(await saldo(agent, carteiraId)).toBe("0.00");
  });

  it("valida a transferência", async () => {
    const { agent, carteiraId, categoria } = await familiaLogada(app);
    const banco = (await agent.post("/api/accounts").send({ name: "Banco", type: "BANK" })).body.id;
    const cartao = (
      await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "1000", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id;
    const outra = await familiaLogada(app);
    const base = { type: "TRANSFER", amount: "10", date: "2026-10-01", accountId: banco };
    const post = (body: object) => agent.post("/api/transactions").send({ ...base, ...body });

    const semDestino = await post({});
    expect(semDestino.status).toBe(400);
    expect(semDestino.body.detalhes.toAccountId).toBeDefined();
    const mesma = await post({ toAccountId: banco });
    expect(mesma.status).toBe(400);
    expect(mesma.body.detalhes.toAccountId[0]).toMatch(/diferente/);
    expect((await post({ toAccountId: carteiraId, categoryId: categoria("Mercado") })).status).toBe(400);
    expect((await post({ toAccountId: cartao })).status).toBe(400);
    expect((await post({ toAccountId: outra.carteiraId })).status).toBe(404);
    // Receita/despesa não aceita destino nem descrição vazia
    expect((await post({ type: "EXPENSE", toAccountId: carteiraId, description: "x" })).status).toBe(400);
    expect((await post({ type: "EXPENSE", description: "" })).status).toBe(400);
    // Receita/despesa direto no cartão: use Despesa cartão
    expect((await post({ type: "EXPENSE", description: "x", accountId: cartao })).status).toBe(400);
  });
});

describe("cartões de crédito (/api/cards)", () => {
  it("cria com e sem conta de pagamento, edita, arquiva e reativa", async () => {
    const { agent } = await familiaLogada(app, "Paulo Nunes");

    const semConta = await agent
      .post("/api/cards")
      .send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000.00", closingDay: 3, dueDay: 10, color: "#8a05be", paymentAccountId: null });
    expect(semConta.status).toBe(201);
    expect(semConta.body).toMatchObject({
      name: "Nubank",
      type: "CREDIT_CARD",
      brand: "MASTERCARD",
      color: "#8a05be",
      creditLimit: "5000.00",
      closingDay: 3,
      dueDay: 10,
      paymentAccount: null,
      archived: false,
      usedLimit: "0.00",
      availableLimit: "5000.00",
      currentInvoice: { total: "0.00", month: expect.stringMatching(/^\d{4}-\d{2}$/) },
    });

    // Conta criada na hora (como no formulário com "+ Criar nova conta") e ligada ao cartão
    const conta = (await agent.post("/api/accounts").send({ name: "Inter", type: "BANK" })).body;
    const comConta = await agent
      .post("/api/cards")
      .send({ name: "Inter Gold", brand: "ELO", creditLimit: 800, closingDay: 25, dueDay: 5, color: "#ff7a00", paymentAccountId: conta.id });
    expect(comConta.body.paymentAccount).toEqual({ id: conta.id, name: "Inter" });

    const editar = await agent.patch(`/api/cards/${semConta.body.id}`).send({ name: "Nu", paymentAccountId: conta.id, creditLimit: "6000" });
    expect(editar.status).toBe(200);
    expect(editar.body).toMatchObject({ name: "Nu", creditLimit: "6000.00", paymentAccount: { id: conta.id } });

    // Arquivar tira da lista normal
    expect((await agent.patch(`/api/cards/${comConta.body.id}`).send({ archived: true })).body.archived).toBe(true);
    expect((await agent.get("/api/cards")).body.map((c: { name: string }) => c.name)).toEqual(["Nu"]);
    expect((await agent.get("/api/cards?archived=true")).body.map((c: { name: string }) => c.name)).toEqual(["Inter Gold"]);
    // Cartão arquivado não recebe compras
    const compra = await agent
      .post("/api/card-expenses")
      .send({ cardId: comConta.body.id, amount: "10", description: "x", date: "2026-11-05" });
    expect(compra.status).toBe(400);
    expect((await agent.patch(`/api/cards/${comConta.body.id}`).send({ archived: false })).body.archived).toBe(false);
    expect((await agent.get("/api/cards")).body).toHaveLength(2);

    // Apagar a conta de pagamento só desliga a conta do cartão
    await agent.delete(`/api/accounts/${conta.id}`);
    expect((await agent.get(`/api/cards/${semConta.body.id}`)).body.paymentAccount).toBeNull();
  });

  it("valida os dados do cartão e isola por família", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    const outra = await familiaLogada(app);
    const base = { name: "C", brand: "VISA", creditLimit: "100", closingDay: 3, dueDay: 10, color: "#000000" };
    const post = (body: object) => agent.post("/api/cards").send({ ...base, ...body });

    expect((await post({})).status).toBe(201);
    expect((await post({ brand: "DINERS" })).status).toBe(400);
    expect((await post({ closingDay: 0 })).status).toBe(400);
    expect((await post({ dueDay: 32 })).status).toBe(400);
    expect((await post({ color: "roxo" })).status).toBe(400);
    expect((await post({ creditLimit: "-1" })).status).toBe(400);
    expect((await post({ name: "" })).status).toBe(400);
    expect((await post({ paymentAccountId: outra.carteiraId })).status).toBe(404);
    const cartao = (await post({ paymentAccountId: carteiraId })).body.id;
    expect((await post({ paymentAccountId: cartao })).status).toBe(400); // cartão não paga cartão

    expect((await outra.agent.get(`/api/cards/${cartao}`)).status).toBe(404);
    expect((await outra.agent.patch(`/api/cards/${cartao}`).send({ name: "Hack" })).status).toBe(404);
    expect((await outra.agent.get("/api/cards")).body).toEqual([]);
    expect((await agent.get(`/api/cards/${carteiraId}`)).status).toBe(404); // carteira não é cartão
  });
});

describe("despesa no cartão e fatura", () => {
  it("parcela, joga na fatura certa, conta no mês do vencimento e paga sem contar duas vezes", async () => {
    const { agent, carteiraId, categoria } = await familiaLogada(app, "Rita Campos");
    const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "2000" })).body.id;
    const cartao = (
      await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "1000", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id;
    const mercado = categoria("Mercado");
    const lazer = categoria("Lazer");
    const comprar = (body: object) =>
      agent.post("/api/card-expenses").send({ cardId: cartao, categoryId: mercado, description: "Compra", ...body });

    // Antes do fechamento (02/11): fatura de novembro. No dia do fechamento (03/11): dezembro.
    const antes = await comprar({ amount: "40", date: "2026-11-02" });
    expect(antes.status).toBe(201);
    expect(antes.body.installments).toHaveLength(1);
    expect(antes.body.installments[0]).toMatchObject({
      invoiceMonth: "2026-11",
      isCardExpense: true,
      installmentNumber: null,
      account: { id: cartao, type: "CREDIT_CARD" },
    });
    const noDia = await comprar({ amount: "60", date: "2026-11-03", categoryId: lazer });
    expect(noDia.body.installments[0].invoiceMonth).toBe("2026-12");

    // 100,00 em 3x a partir de 10/11 → faturas de dez, jan e fev
    const parcelada = await comprar({ amount: "100", date: "2026-11-10", installments: 3, description: "Tênis" });
    expect(parcelada.status).toBe(201);
    expect(
      parcelada.body.installments.map((p: { invoiceMonth: string; amount: string; installmentNumber: number; installmentTotal: number; date: string }) => [
        p.invoiceMonth,
        p.amount,
        `${p.installmentNumber}/${p.installmentTotal}`,
        p.date.slice(0, 10),
      ]),
    ).toEqual([
      ["2026-12", "33.34", "1/3", "2026-11-10"],
      ["2027-01", "33.33", "2/3", "2026-12-10"],
      ["2027-02", "33.33", "3/3", "2027-01-10"],
    ]);

    // Saldo das contas não muda com compra no cartão
    expect(await saldo(agent, banco)).toBe("2000.00");
    expect(await saldo(agent, carteiraId)).toBe("0.00");

    // Resumo: compras contam no mês do vencimento da fatura
    const nov = (await agent.get("/api/summary?month=2026-11")).body;
    expect(nov.totals.expense).toBe("40.00");
    const dez = (await agent.get("/api/summary?month=2026-12")).body;
    expect(dez.totals).toEqual({ income: "0.00", expense: "93.34", balance: "-93.34" });
    expect(dez.byCategory.map((c: { name: string; total: string }) => [c.name, c.total])).toEqual([
      ["Lazer", "60.00"],
      ["Mercado", "33.34"],
    ]);

    // Limite usado inclui as parcelas futuras
    const card = (await agent.get(`/api/cards/${cartao}`)).body;
    expect(card.usedLimit).toBe("200.00");
    expect(card.availableLimit).toBe("800.00");

    // Fatura de dezembro
    const fatura = await agent.get(`/api/cards/${cartao}/invoices/2026-12`);
    expect(fatura.status).toBe(200);
    expect(fatura.body).toMatchObject({
      month: "2026-12",
      closingDate: "2026-12-03T12:00:00.000Z",
      dueDate: "2026-12-10T12:00:00.000Z",
      total: "93.34",
      paid: "0.00",
      remaining: "93.34",
      payments: [],
    });
    expect(fatura.body.purchases.map((p: { description: string }) => p.description)).toEqual(["Tênis", "Compra"]);
    expect((await agent.get(`/api/cards/${cartao}/invoices/atual`)).status).toBe(200);
    expect((await agent.get(`/api/cards/${cartao}/invoices/2026-13`)).status).toBe(400);

    // Pagar: sem conta ligada ao cartão, precisa escolher
    const semConta = await agent.post(`/api/cards/${cartao}/invoices/2026-12/pay`).send({});
    expect(semConta.status).toBe(400);
    const pagar = await agent.post(`/api/cards/${cartao}/invoices/2026-12/pay`).send({ accountId: banco, date: "2026-12-10" });
    expect(pagar.status).toBe(201);
    expect(pagar.body).toMatchObject({
      type: "TRANSFER",
      amount: "93.34",
      isInvoicePayment: true,
      account: { id: banco },
      toAccount: { id: cartao },
      invoiceMonth: "2026-12",
    });
    expect(await saldo(agent, banco)).toBe("1906.66");
    // Não conta como despesa de novo
    expect((await agent.get("/api/summary?month=2026-12")).body.totals.expense).toBe("93.34");
    const paga = (await agent.get(`/api/cards/${cartao}/invoices/2026-12`)).body;
    expect(paga).toMatchObject({ status: "PAID", paid: "93.34", remaining: "0.00" });
    expect(paga.payments).toHaveLength(1);
    expect((await agent.get(`/api/cards/${cartao}`)).body.usedLimit).toBe("106.66");
    // Pagar de novo: já está paga
    expect((await agent.post(`/api/cards/${cartao}/invoices/2026-12/pay`).send({ accountId: banco })).status).toBe(409);

    // Compra em fatura com pagamento fica travada (pelas duas rotas)
    const parcelaDez = parcelada.body.installments[0];
    expect((await agent.delete(`/api/card-expenses/${parcelada.body.purchaseId}`)).status).toBe(409);
    expect((await agent.delete(`/api/transactions/${parcelaDez.id}`)).status).toBe(409);
    expect((await agent.patch(`/api/transactions/${parcelaDez.id}`).send({ amount: "1" })).status).toBe(409);
    expect((await agent.patch(`/api/transactions/${pagar.body.id}`).send({ amount: "1" })).status).toBe(409);

    // Desfazer o pagamento (apagar a transferência) devolve o dinheiro e destrava
    expect((await agent.delete(`/api/transactions/${pagar.body.id}`)).status).toBe(204);
    expect(await saldo(agent, banco)).toBe("2000.00");
    expect((await agent.get(`/api/cards/${cartao}/invoices/2026-12`)).body.paid).toBe("0.00");

    // Editar a compra refaz as parcelas (3x → 2x de 50)
    const editar = await agent
      .put(`/api/card-expenses/${parcelada.body.purchaseId}`)
      .send({ cardId: cartao, amount: "100", description: "Tênis novo", date: "2026-11-10", installments: 2, categoryId: lazer });
    expect(editar.status).toBe(200);
    expect(editar.body.purchaseId).toBe(parcelada.body.purchaseId);
    expect(editar.body.installments.map((p: { amount: string; invoiceMonth: string }) => [p.amount, p.invoiceMonth])).toEqual([
      ["50.00", "2026-12"],
      ["50.00", "2027-01"],
    ]);
    expect((await agent.get("/api/summary?month=2027-02")).body.totals.expense).toBe("0.00");

    // Apagar uma parcela pela lista de lançamentos apaga a compra toda
    expect((await agent.delete(`/api/transactions/${editar.body.installments[1].id}`)).status).toBe(204);
    expect((await agent.get(`/api/card-expenses/${parcelada.body.purchaseId}`)).status).toBe(404);
    expect((await agent.get(`/api/cards/${cartao}`)).body.usedLimit).toBe("100.00");
  });

  it("pagamento usa a conta ligada ao cartão e valida a compra", async () => {
    const { agent, carteiraId, categoria } = await familiaLogada(app);
    const cartao = (
      await agent
        .post("/api/cards")
        .send({ name: "Itaú", brand: "VISA", creditLimit: "500", closingDay: 25, dueDay: 5, color: "#ec7000", paymentAccountId: carteiraId })
    ).body.id;
    const base = { cardId: cartao, amount: "20", description: "Padaria", date: "2026-11-26" };
    const post = (body: object) => agent.post("/api/card-expenses").send({ ...base, ...body });

    expect((await post({ installments: 0 })).status).toBe(400);
    expect((await post({ installments: 25 })).status).toBe(400);
    expect((await post({ amount: "0" })).status).toBe(400);
    expect((await post({ description: "" })).status).toBe(400);
    expect((await post({ categoryId: categoria("Salário") })).status).toBe(400);
    expect((await post({ cardId: carteiraId })).status).toBe(404);

    const ok = await post({ installments: 24 });
    expect(ok.status).toBe(201);
    expect(ok.body.installments).toHaveLength(24);
    expect(ok.body.installments[0].invoiceMonth).toBe("2027-01");
    expect(ok.body.installments[23].invoiceMonth).toBe("2028-12");
    expect(ok.body.installments[23].installmentNumber).toBe(24);

    // Sem accountId: paga pela conta ligada ao cartão (Carteira)
    const pagar = await agent.post(`/api/cards/${cartao}/invoices/2027-01/pay`).send({});
    expect(pagar.status).toBe(201);
    expect(pagar.body.account.id).toBe(carteiraId);
    expect(await saldo(agent, carteiraId)).toBe("-0.91"); // 20,00 / 24 = 0,83 + 0,08 de sobra na 1ª parcela

    // Fatura sem compras não pode ser paga
    expect((await agent.post(`/api/cards/${cartao}/invoices/2030-01/pay`).send({})).status).toBe(409);
  });

  it("VIEWER só lê cartões e faturas; outra família não vê nada", async () => {
    const dono = await familiaLogada(app, "Sara Melo");
    const cartao = (
      await dono.agent.post("/api/cards").send({ name: "Nu", brand: "MASTERCARD", creditLimit: "100", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id;
    const compra = (await dono.agent.post("/api/card-expenses").send({ cardId: cartao, amount: "10", description: "x", date: "2026-11-05" })).body;

    const convidado = await usuarioLogado(app, "Téo Lima");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: convidado.email } });
    await prisma.householdMember.create({ data: { householdId: dono.householdId, userId: user.id, role: "VIEWER" } });
    const h = { "X-Household-Id": dono.householdId };

    expect((await convidado.agent.get("/api/cards").set(h)).body).toHaveLength(1);
    expect((await convidado.agent.get(`/api/cards/${cartao}/invoices/2026-12`).set(h)).status).toBe(200);
    const escritas = [
      convidado.agent.post("/api/cards").set(h).send({ name: "X", brand: "VISA", creditLimit: "1", closingDay: 1, dueDay: 2, color: "#000000" }),
      convidado.agent.patch(`/api/cards/${cartao}`).set(h).send({ archived: true }),
      convidado.agent.post("/api/card-expenses").set(h).send({ cardId: cartao, amount: "1", description: "x", date: "2026-11-05" }),
      convidado.agent.delete(`/api/card-expenses/${compra.purchaseId}`).set(h),
      convidado.agent.post(`/api/cards/${cartao}/invoices/2026-12/pay`).set(h).send({ accountId: dono.carteiraId }),
    ];
    for (const r of await Promise.all(escritas)) expect(r.status).toBe(403);

    const outra = await familiaLogada(app);
    expect((await outra.agent.get(`/api/cards/${cartao}/invoices/2026-12`)).status).toBe(404);
    expect((await outra.agent.get(`/api/card-expenses/${compra.purchaseId}`)).status).toBe(404);
    expect((await outra.agent.delete(`/api/card-expenses/${compra.purchaseId}`)).status).toBe(404);
    expect((await outra.agent.post("/api/card-expenses").send({ cardId: cartao, amount: "1", description: "x", date: "2026-11-05" })).status).toBe(404);
    expect((await outra.agent.post(`/api/cards/${cartao}/invoices/2026-12/pay`).send({ accountId: outra.carteiraId })).status).toBe(404);

    for (const rota of ["/api/cards", `/api/card-expenses/${compra.purchaseId}`]) {
      expect((await request(app).get(rota)).status).toBe(401);
    }
  });
});
