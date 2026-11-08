import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { usuarioLogado, familiaLogada } from "./helpers.js";

const app = createApp();

describe("contas (/api/accounts)", () => {
  it("cria, altera e apaga contas; currentBalance começa no saldo inicial", async () => {
    const { agent } = await familiaLogada(app, "Gabriel Costa");

    const criar = await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "1500.75" });
    expect(criar.status).toBe(201);
    expect(criar.body).toMatchObject({ name: "Itaú", type: "BANK", initialBalance: "1500.75", currentBalance: "1500.75", creditLimit: null });

    const cartao = await agent
      .post("/api/accounts")
      .send({ name: "Nubank", type: "CREDIT_CARD", creditLimit: 2000, closingDay: 3, dueDay: 10 });
    expect(cartao.status).toBe(201);
    expect(cartao.body).toMatchObject({ initialBalance: "0.00", creditLimit: "2000.00", closingDay: 3, dueDay: 10 });

    const editar = await agent.patch(`/api/accounts/${criar.body.id}`).send({ name: "Itaú PF", initialBalance: 100 });
    expect(editar.status).toBe(200);
    expect(editar.body).toMatchObject({ name: "Itaú PF", initialBalance: "100.00", currentBalance: "100.00" });

    // Cartão vira carteira: limpa os campos de cartão
    const virouCarteira = await agent.patch(`/api/accounts/${cartao.body.id}`).send({ type: "WALLET" });
    expect(virouCarteira.body).toMatchObject({ type: "WALLET", creditLimit: null, closingDay: null, dueDay: null });

    expect((await agent.delete(`/api/accounts/${criar.body.id}`)).status).toBe(204);
    const lista = await agent.get("/api/accounts");
    expect(lista.body.map((c: { name: string }) => c.name)).toEqual(["Carteira", "Nubank"]);
  });

  it("valida os dados da conta", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    expect((await agent.post("/api/accounts").send({ name: "", type: "BANK" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "POUPANCA" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "BANK", initialBalance: "10.123" })).status).toBe(400);
    expect((await agent.post("/api/accounts").send({ name: "X", type: "CREDIT_CARD", closingDay: 32 })).status).toBe(400);

    // Campos de cartão em conta que não é cartão
    const ruim = await agent.post("/api/accounts").send({ name: "X", type: "BANK", creditLimit: 100 });
    expect(ruim.status).toBe(400);
    expect(ruim.body.detalhes.creditLimit).toBeDefined();
    expect((await agent.patch(`/api/accounts/${carteiraId}`).send({ dueDay: 5 })).status).toBe(400);
  });

  it("não apaga a última conta da família (409)", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    const res = await agent.delete(`/api/accounts/${carteiraId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBeTypeOf("string");
  });
});

describe("categorias (/api/categories)", () => {
  it("lista com filtro, cria, altera e apaga (lançamentos ficam sem categoria)", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Helena Dias");

    const todas = await agent.get("/api/categories");
    expect(todas.status).toBe(200);
    expect(todas.body).toHaveLength(10);
    const receitas = await agent.get("/api/categories?type=INCOME");
    expect(receitas.body.map((c: { name: string }) => c.name)).toEqual(["Freelance", "Outros", "Salário"]);
    expect((await agent.get("/api/categories?type=X")).status).toBe(400);

    const criar = await agent.post("/api/categories").send({ name: "Pets", type: "EXPENSE", color: "#a16207", icon: "paw" });
    expect(criar.status).toBe(201);
    expect(criar.body).toEqual({ id: expect.any(String), name: "Pets", type: "EXPENSE", color: "#a16207", icon: "paw" });

    const editar = await agent.patch(`/api/categories/${criar.body.id}`).send({ name: "Pet", color: "#000000" });
    expect(editar.body).toMatchObject({ name: "Pet", color: "#000000", type: "EXPENSE" });

    const lanc = await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "50", description: "Ração", date: "2026-03-10", accountId: carteiraId, categoryId: criar.body.id });
    expect(lanc.status).toBe(201);

    expect((await agent.delete(`/api/categories/${criar.body.id}`)).status).toBe(204);
    const depois = await prisma.transaction.findUniqueOrThrow({ where: { id: lanc.body.id } });
    expect(depois.categoryId).toBeNull();
  });

  it("valida os dados da categoria", async () => {
    const { agent } = await familiaLogada(app);
    expect((await agent.post("/api/categories").send({ name: "X", type: "EXPENSE", color: "vermelho", icon: "x" })).status).toBe(400);
    expect((await agent.post("/api/categories").send({ name: "X", type: "TRANSFER", color: "#ffffff", icon: "x" })).status).toBe(400);
    expect((await agent.post("/api/categories").send({ name: "", type: "INCOME", color: "#ffffff", icon: "x" })).status).toBe(400);
  });
});

describe("lançamentos (/api/transactions)", () => {
  it("cria, lista por mês com filtros, altera e apaga", async () => {
    const { agent, carteiraId, categoria } = await familiaLogada(app, "Igor Ramos");
    const mercado = categoria("Mercado");
    const salario = categoria("Salário");

    const despesa = await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: 120.5, description: "Feira", date: "2026-05-03", accountId: carteiraId, categoryId: mercado });
    expect(despesa.status).toBe(201);
    expect(despesa.body).toMatchObject({
      type: "EXPENSE",
      amount: "120.50",
      description: "Feira",
      date: "2026-05-03T12:00:00.000Z",
      status: "CONFIRMED",
      source: "APP",
      category: { id: mercado, name: "Mercado", color: "#22c55e", icon: "cart" },
      account: { id: carteiraId, name: "Carteira" },
    });

    await agent
      .post("/api/transactions")
      .send({ type: "INCOME", amount: "3000", description: "Salário", date: "2026-05-05", accountId: carteiraId, categoryId: salario });
    await agent.post("/api/transactions").send({ type: "EXPENSE", amount: "10", description: "Abril", date: "2026-04-30", accountId: carteiraId });
    // 31/05 às 23:30 em Brasília ainda é maio (em UTC já é 01/06)
    await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "5", description: "Fim de maio", date: "2026-05-31T23:30:00-03:00", accountId: carteiraId });

    const maio = await agent.get("/api/transactions?month=2026-05");
    expect(maio.status).toBe(200);
    expect(maio.body.map((t: { description: string }) => t.description)).toEqual(["Fim de maio", "Salário", "Feira"]);
    expect(maio.body[0].category).toBeNull();

    const soDespesas = await agent.get("/api/transactions?month=2026-05&type=EXPENSE");
    expect(soDespesas.body).toHaveLength(2);
    const porCategoria = await agent.get(`/api/transactions?month=2026-05&categoryId=${mercado}`);
    expect(porCategoria.body).toHaveLength(1);
    const porConta = await agent.get(`/api/transactions?month=2026-04&accountId=${carteiraId}`);
    expect(porConta.body.map((t: { description: string }) => t.description)).toEqual(["Abril"]);

    const editar = await agent.patch(`/api/transactions/${despesa.body.id}`).send({ amount: "99.90", status: "PENDING" });
    expect(editar.status).toBe(200);
    expect(editar.body).toMatchObject({ amount: "99.90", status: "PENDING", category: { id: mercado } });

    expect((await agent.delete(`/api/transactions/${despesa.body.id}`)).status).toBe(204);
    expect((await agent.get("/api/transactions?month=2026-05")).body).toHaveLength(2);
    expect((await agent.delete(`/api/transactions/${despesa.body.id}`)).status).toBe(404);
  });

  it("sem month, lista o mês atual (Brasília) e guarda quem criou", async () => {
    const { agent, carteiraId, email } = await familiaLogada(app);
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const criar = await agent.post("/api/transactions").send({ type: "INCOME", amount: "1", description: "Hoje", date: hoje, accountId: carteiraId });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(criar.body.createdById).toBe(user.id);

    const lista = await agent.get("/api/transactions");
    expect(lista.body.map((t: { description: string }) => t.description)).toEqual(["Hoje"]);
  });

  it("valida os dados do lançamento", async () => {
    const { agent, carteiraId, categoria } = await familiaLogada(app);
    const base = { type: "EXPENSE", amount: "10.00", description: "Café", date: "2026-05-01", accountId: carteiraId };
    const post = (body: object) => agent.post("/api/transactions").send({ ...base, ...body });

    expect((await post({ type: "TRANSFER" })).status).toBe(400);
    expect((await post({ amount: 0 })).status).toBe(400);
    expect((await post({ amount: "-5" })).status).toBe(400);
    expect((await post({ amount: "1.999" })).status).toBe(400);
    expect((await post({ amount: "abc" })).status).toBe(400);
    expect((await post({ description: "" })).status).toBe(400);
    expect((await post({ description: "x".repeat(121) })).status).toBe(400);
    expect((await post({ date: "07/11/2026" })).status).toBe(400);
    expect((await post({ accountId: undefined })).status).toBe(400);
    expect((await post({ status: "PAGO" })).status).toBe(400);

    // Categoria de receita em despesa
    const tipoErrado = await post({ categoryId: categoria("Salário") });
    expect(tipoErrado.status).toBe(400);
    expect(tipoErrado.body.error).toMatch(/categoria/i);

    expect((await agent.get("/api/transactions?month=2026-13")).status).toBe(400);
    expect((await agent.get("/api/transactions?type=OUTRO")).status).toBe(400);

    // Mudar o tipo sem trocar a categoria também é recusado
    const ok = await post({ categoryId: categoria("Mercado") });
    expect(ok.status).toBe(201);
    expect((await agent.patch(`/api/transactions/${ok.body.id}`).send({ type: "INCOME" })).status).toBe(400);
    const trocou = await agent.patch(`/api/transactions/${ok.body.id}`).send({ type: "INCOME", categoryId: categoria("Salário") });
    expect(trocou.status).toBe(200);
  });
});

describe("saldo e resumo com centavos", () => {
  it("0.10 + 0.20 = 0.30 e saldo = inicial + receitas − despesas confirmadas", async () => {
    const { agent, categoria } = await familiaLogada(app, "Júlia Freitas");
    const conta = await agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "100.00" });
    const accountId = conta.body.id;
    const lancar = (body: object) =>
      agent.post("/api/transactions").send({ description: "x", date: "2026-07-15", accountId, ...body });

    await lancar({ type: "INCOME", amount: 0.1, categoryId: categoria("Salário") });
    await lancar({ type: "INCOME", amount: "0.20", categoryId: categoria("Freelance") });
    await lancar({ type: "EXPENSE", amount: "33.33", categoryId: categoria("Mercado") });
    await lancar({ type: "EXPENSE", amount: "0.07", categoryId: categoria("Mercado") });
    await lancar({ type: "EXPENSE", amount: "50.00", categoryId: categoria("Lazer") });
    await lancar({ type: "EXPENSE", amount: "1.01" }); // sem categoria
    await lancar({ type: "EXPENSE", amount: "999.99", status: "PENDING" }); // pendente não conta
    await lancar({ type: "INCOME", amount: "7.00", date: "2026-06-30" }); // outro mês: só no saldo

    const contas = await agent.get("/api/accounts");
    const banco = contas.body.find((c: { id: string }) => c.id === accountId);
    // 100 + 0.10 + 0.20 + 7.00 − 33.33 − 0.07 − 50.00 − 1.01 = 22.89
    expect(banco.currentBalance).toBe("22.89");

    const resumo = await agent.get("/api/summary?month=2026-07");
    expect(resumo.status).toBe(200);
    expect(resumo.body.month).toBe("2026-07");
    expect(resumo.body.totals).toEqual({ income: "0.30", expense: "84.41", balance: "-84.11" });
    expect(resumo.body.byCategory).toEqual([
      { categoryId: categoria("Lazer"), name: "Lazer", color: "#ec4899", total: "50.00" },
      { categoryId: categoria("Mercado"), name: "Mercado", color: "#22c55e", total: "33.40" },
      { categoryId: null, name: "Sem categoria", color: "#94a3b8", total: "1.01" },
    ]);
    expect(resumo.body.accounts.find((c: { id: string }) => c.id === accountId).currentBalance).toBe("22.89");

    // Confirmar o pendente muda o saldo
    const pend = (await agent.get(`/api/transactions?month=2026-07&accountId=${accountId}`)).body.find(
      (t: { status: string }) => t.status === "PENDING",
    );
    await agent.patch(`/api/transactions/${pend.id}`).send({ status: "CONFIRMED", amount: "0.89" });
    const depois = await agent.get("/api/accounts");
    expect(depois.body.find((c: { id: string }) => c.id === accountId).currentBalance).toBe("22.00");

    const vazio = await agent.get("/api/summary?month=2020-01");
    expect(vazio.body.totals).toEqual({ income: "0.00", expense: "0.00", balance: "0.00" });
    expect(vazio.body.byCategory).toEqual([]);
    expect((await agent.get("/api/summary?month=2026-7")).status).toBe(400);
  });
});

describe("segurança: família e papéis", () => {
  it("rotas novas exigem login", async () => {
    for (const rota of ["/api/transactions", "/api/categories", "/api/summary"]) {
      expect((await request(app).get(rota)).status).toBe(401);
    }
  });

  it("ids de outra família dão 404 e não aparecem nas listas", async () => {
    const a = await familiaLogada(app, "Karina Lopes");
    const b = await familiaLogada(app, "Lucas Moura");

    const lancA = await a.agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "10", description: "Da Karina", date: "2026-08-01", accountId: a.carteiraId, categoryId: a.categoria("Mercado") });
    const contaA = await a.agent.post("/api/accounts").send({ name: "Banco da Karina", type: "BANK" });
    const catA = a.categoria("Lazer");

    // B não enxerga nada de A
    expect((await b.agent.get("/api/transactions?month=2026-08")).body).toEqual([]);
    expect((await b.agent.get(`/api/transactions?month=2026-08&accountId=${a.carteiraId}`)).body).toEqual([]);
    expect((await b.agent.get("/api/summary?month=2026-08")).body.totals.expense).toBe("0.00");
    expect((await b.agent.get("/api/accounts")).body.map((c: { name: string }) => c.name)).toEqual(["Carteira"]);
    expect((await b.agent.get("/api/categories")).body.map((c: { id: string }) => c.id)).not.toContain(catA);

    // B não altera nem apaga nada de A
    expect((await b.agent.patch(`/api/transactions/${lancA.body.id}`).send({ amount: "1" })).status).toBe(404);
    expect((await b.agent.delete(`/api/transactions/${lancA.body.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/accounts/${contaA.body.id}`).send({ name: "Hack" })).status).toBe(404);
    expect((await b.agent.delete(`/api/accounts/${contaA.body.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/categories/${catA}`).send({ name: "Hack" })).status).toBe(404);
    expect((await b.agent.delete(`/api/categories/${catA}`)).status).toBe(404);

    // B não lança na conta nem na categoria de A
    const base = { type: "EXPENSE", amount: "1", description: "x", date: "2026-08-01" };
    expect((await b.agent.post("/api/transactions").send({ ...base, accountId: a.carteiraId })).status).toBe(404);
    expect((await b.agent.post("/api/transactions").send({ ...base, accountId: b.carteiraId, categoryId: catA })).status).toBe(404);
    // Nem move um lançamento próprio para a conta de A
    const lancB = await b.agent.post("/api/transactions").send({ ...base, accountId: b.carteiraId });
    expect((await b.agent.patch(`/api/transactions/${lancB.body.id}`).send({ accountId: a.carteiraId })).status).toBe(404);

    // Nada de A mudou
    const intacto = await prisma.transaction.findUniqueOrThrow({ where: { id: lancA.body.id } });
    expect(intacto.amount.toFixed(2)).toBe("10.00");
    expect(await prisma.financialAccount.count({ where: { householdId: a.householdId } })).toBe(2);
  });

  it("VIEWER só lê: escritas dão 403", async () => {
    const dono = await familiaLogada(app, "Marcos Reis");
    const lanc = await dono.agent
      .post("/api/transactions")
      .send({ type: "INCOME", amount: "10", description: "Pix", date: "2026-09-01", accountId: dono.carteiraId });

    // Convidado entra na família do dono como VIEWER
    const convidado = await usuarioLogado(app, "Nina Torres");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: convidado.email } });
    await prisma.householdMember.create({ data: { householdId: dono.householdId, userId: user.id, role: "VIEWER" } });
    const h = { "X-Household-Id": dono.householdId };

    // Leitura funciona
    const lista = await convidado.agent.get("/api/transactions?month=2026-09").set(h);
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    expect((await convidado.agent.get("/api/summary?month=2026-09").set(h)).body.totals.income).toBe("10.00");
    expect((await convidado.agent.get("/api/accounts").set(h)).status).toBe(200);
    expect((await convidado.agent.get("/api/categories").set(h)).status).toBe(200);

    // Escrita não
    const cat = dono.categoria("Mercado");
    const escritas = [
      convidado.agent.post("/api/transactions").set(h).send({ type: "EXPENSE", amount: "1", description: "x", date: "2026-09-01", accountId: dono.carteiraId }),
      convidado.agent.patch(`/api/transactions/${lanc.body.id}`).set(h).send({ amount: "1" }),
      convidado.agent.delete(`/api/transactions/${lanc.body.id}`).set(h),
      convidado.agent.post("/api/categories").set(h).send({ name: "X", type: "EXPENSE", color: "#ffffff", icon: "x" }),
      convidado.agent.patch(`/api/categories/${cat}`).set(h).send({ name: "X" }),
      convidado.agent.delete(`/api/categories/${cat}`).set(h),
      convidado.agent.post("/api/accounts").set(h).send({ name: "X", type: "BANK" }),
      convidado.agent.patch(`/api/accounts/${dono.carteiraId}`).set(h).send({ name: "X" }),
      convidado.agent.delete(`/api/accounts/${dono.carteiraId}`).set(h),
    ];
    for (const r of await Promise.all(escritas)) expect(r.status).toBe(403);

    expect(await prisma.transaction.count({ where: { householdId: dono.householdId } })).toBe(1);
  });
});
