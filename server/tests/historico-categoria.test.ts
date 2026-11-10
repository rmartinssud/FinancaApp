import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { mesAtual } from "../src/lib/money.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const MES = "2026-08"; // último mês do histórico nos testes (passado, para não depender de hoje)

async function lancar(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Teste", date: `${MES}-10`, status: "CONFIRMED", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function historico(agent: Agent, categoryId: string, extra = "") {
  const res = await agent.get(`/api/summary/category-history?categoryId=${categoryId}${extra}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { categoryId: string | null; name: string; month: string; months: { month: string; total: string }[]; average: string };
}

// Total da categoria no cartão "Despesas por categoria" (GET /api/summary)
async function totalNoResumo(agent: Agent, mes: string, categoryId: string | null) {
  const res = await agent.get(`/api/summary?month=${mes}`);
  return (res.body.byCategory.find((c: { categoryId: string | null }) => c.categoryId === categoryId)?.total ?? "0.00") as string;
}

describe("GET /api/summary/category-history", () => {
  it("6 meses com as mesmas regras do resumo: confirmadas, cartão no mês da fatura, sem pendentes/transferências", async () => {
    const f = await familiaLogada(app, "Ana Historico");
    const mercado = f.categoria("Mercado");
    const banco = (await f.agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "5000" })).body.id as string;
    const ignorada = (await f.agent.post("/api/accounts").send({ name: "Empresa", type: "BANK", ignoreInTotals: true })).body.id as string;
    const cartao = (
      await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id as string;

    await lancar(f.agent, { amount: "100.00", accountId: f.carteiraId, categoryId: mercado, date: "2026-03-05" }); // 1º mês do histórico
    await lancar(f.agent, { amount: "50.00", accountId: f.carteiraId, categoryId: mercado, date: "2026-02-27" }); // fora (antes)
    await lancar(f.agent, { amount: "40.00", accountId: f.carteiraId, categoryId: mercado, date: "2026-06-01" });
    await lancar(f.agent, { amount: "30.25", accountId: banco, categoryId: mercado });
    await lancar(f.agent, { amount: "999.00", accountId: banco, categoryId: mercado, status: "PENDING" }); // pendente: fora
    await lancar(f.agent, { amount: "20.00", accountId: ignorada, categoryId: mercado }); // conta ignorada: igual ao resumo
    await lancar(f.agent, { amount: "77.00", accountId: banco, categoryId: f.categoria("Lazer") }); // outra categoria
    await f.agent.post("/api/transactions").send({ type: "TRANSFER", description: "Transf", date: `${MES}-11`, status: "CONFIRMED", amount: "500", accountId: banco, toAccountId: f.carteiraId });
    // Compra no cartão em julho que o banco jogou na fatura de agosto: conta em agosto
    const compra = await f.agent.post("/api/card-expenses").send({ cardId: cartao, categoryId: mercado, description: "Atacadão", amount: "60.00", date: "2026-07-25", invoiceMonth: "2026-08" });
    expect(compra.status, JSON.stringify(compra.body)).toBe(201);

    const h = await historico(f.agent, mercado, `&month=${MES}&months=6`);
    expect(h.categoryId).toBe(mercado);
    expect(h.name).toBe("Mercado");
    expect(h.months).toEqual([
      { month: "2026-03", total: "100.00" },
      { month: "2026-04", total: "0.00" },
      { month: "2026-05", total: "0.00" },
      { month: "2026-06", total: "40.00" },
      { month: "2026-07", total: "0.00" },
      { month: "2026-08", total: "110.25" },
    ]);
    expect(h.average).toBe("41.71"); // 250,25 / 6

    // Bate com "Despesas por categoria" em cada mês
    for (const m of h.months) expect(await totalNoResumo(f.agent, m.month, mercado)).toBe(m.total);

    // Padrão: 6 meses terminando no mês atual
    const padrao = await historico(f.agent, mercado);
    expect(padrao.months).toHaveLength(6);
    expect(padrao.months[5].month).toBe(mesAtual());
  });

  it("categoryId=none: despesas sem categoria, sem contar ajuste de saldo", async () => {
    const f = await familiaLogada(app, "Beto Semcat");
    const mes = mesAtual();
    await lancar(f.agent, { amount: "12.34", accountId: f.carteiraId, date: `${mes}-01` });
    await lancar(f.agent, { amount: "5.00", accountId: f.carteiraId, categoryId: f.categoria("Mercado"), date: `${mes}-01` });
    // Ajuste para menos (vira "despesa" de ajuste): não entra
    const ajuste = await f.agent.post(`/api/accounts/${f.carteiraId}/adjust`).send({ balance: "-100" });
    expect(ajuste.status).toBe(201);

    const h = await historico(f.agent, "none", "&months=3");
    expect(h.categoryId).toBeNull();
    expect(h.name).toBe("Sem categoria");
    expect(h.months.at(-1)).toEqual({ month: mes, total: "12.34" });
    expect(await totalNoResumo(f.agent, mes, null)).toBe("12.34");
  });

  it("isolamento por espaço: categoria de outra família dá 404 e lançamentos de outros não entram", async () => {
    const a = await familiaLogada(app, "Carla Espaco");
    const b = await familiaLogada(app, "Davi Espaco");
    await lancar(a.agent, { amount: "80.00", accountId: a.carteiraId, categoryId: a.categoria("Mercado") });
    await lancar(b.agent, { amount: "15.00", accountId: b.carteiraId });

    const outra = await b.agent.get(`/api/summary/category-history?categoryId=${a.categoria("Mercado")}&month=${MES}`);
    expect(outra.status).toBe(404);

    // "Sem categoria" de B não vê nada de A (e vice-versa)
    const semA = await historico(a.agent, "none", `&month=${MES}`);
    expect(semA.months.at(-1)!.total).toBe("0.00");
    const semB = await historico(b.agent, "none", `&month=${MES}`);
    expect(semB.months.at(-1)!.total).toBe("15.00");
  });

  it("valida os parâmetros", async () => {
    const f = await familiaLogada(app, "Edu Valida");
    expect((await f.agent.get("/api/summary/category-history")).status).toBe(400);
    expect((await f.agent.get(`/api/summary/category-history?categoryId=none&months=13`)).status).toBe(400);
    expect((await f.agent.get(`/api/summary/category-history?categoryId=none&month=2026-13`)).status).toBe(400);
  });
});

describe("GET /api/transactions?categoryId=", () => {
  it("filtro por categoria mostra as compras do cartão uma a uma; none = sem categoria", async () => {
    const f = await familiaLogada(app, "Fabi Filtro");
    const mercado = f.categoria("Mercado");
    const cartao = (
      await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" })
    ).body.id as string;
    await lancar(f.agent, { amount: "10.00", accountId: f.carteiraId, categoryId: mercado });
    await lancar(f.agent, { amount: "7.00", accountId: f.carteiraId });
    await f.agent.post("/api/card-expenses").send({ cardId: cartao, categoryId: mercado, description: "Atacadão", amount: "60.00", date: "2026-07-25", invoiceMonth: MES });

    const porCategoria = await f.agent.get(`/api/transactions?month=${MES}&type=EXPENSE&categoryId=${mercado}`);
    expect(porCategoria.status).toBe(200);
    expect(porCategoria.body.map((l: { amount: string }) => l.amount).sort()).toEqual(["10.00", "60.00"]);
    expect(await totalNoResumo(f.agent, MES, mercado)).toBe("70.00");

    const sem = await f.agent.get(`/api/transactions?month=${MES}&type=EXPENSE&categoryId=none`);
    expect(sem.body.map((l: { amount: string }) => l.amount)).toEqual(["7.00"]);
  });
});
