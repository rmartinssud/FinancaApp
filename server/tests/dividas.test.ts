import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Decimal, mesAtual, somarMeses } from "../src/lib/money.js";
import { simularPlano, type DividaPlano } from "../src/services/dividas.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const D = (v: string) => new Decimal(v);
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function criarDivida(agent: Agent, d: Record<string, unknown> = {}) {
  const res = await agent.post("/api/debts").send({ name: "Cartão Nubank", type: "CARTAO", currentBalance: "1000.00", interestRateMonthly: "10", minimumPayment: "100.00", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function saldoConta(agent: Agent, id: string) {
  const res = await agent.get("/api/accounts");
  return res.body.find((c: { id: string }) => c.id === id).currentBalance as string;
}

// Exemplo conhecido de 3 dívidas
const TRES: DividaPlano[] = [
  { id: "cartao", name: "Cartão", balance: D("3000.00"), rate: D("12"), minimum: D("150.00") },
  { id: "emprestimo", name: "Empréstimo", balance: D("5000.00"), rate: D("3"), minimum: D("250.00") },
  { id: "amigo", name: "Amigo", balance: D("800.00"), rate: D("0"), minimum: D("50.00") },
];

describe("dívidas: simulação do plano", () => {
  it("uma dívida com juros: conta mês a mês (juros antes do pagamento)", () => {
    // 1000 a 10% a.m., 600/mês: mês 1 → 1100 − 600 = 500; mês 2 → 550 − 550 = 0
    const r = simularPlano([{ id: "a", name: "A", balance: D("1000"), rate: D("10"), minimum: D("100") }], D("600"), "AVALANCHE");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.months).toBe(2);
    expect(r.totalInterest).toBe(15000);
    expect(r.totalPaid).toBe(115000);
    expect(r.schedule[0].payments[0]).toEqual({ debtId: "a", amount: 60000, interest: 10000, balance: 50000 });
    expect(r.debts[0]).toMatchObject({ id: "a", order: 1, payoffMonth: 2 });
  });

  it("avalanche ataca a maior taxa; bola de neve, o menor saldo; avalanche paga menos juros", () => {
    const av = simularPlano(TRES, D("1000"), "AVALANCHE");
    const sn = simularPlano(TRES, D("1000"), "SNOWBALL");
    expect(av.ok && sn.ok).toBe(true);
    if (!av.ok || !sn.ok) return;
    expect(av.debts[0].id).toBe("cartao");
    expect(sn.debts[0].id).toBe("amigo");
    expect(sn.debts.map((d) => d.id)).toEqual(["amigo", "cartao", "emprestimo"]);
    // No 1º mês a bola de neve põe todo o extra (550) no amigo: 50 + 550 = 600
    expect(sn.schedule[0].payments.find((p) => p.debtId === "amigo")!.amount).toBe(60000);
    // e a avalanche no cartão: juros 360, paga 150 + 550 = 700
    expect(av.schedule[0].payments.find((p) => p.debtId === "cartao")).toMatchObject({ interest: 36000, amount: 70000 });
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
    expect(av.totalInterest).toBeLessThan(sn.totalInterest);
    // Pago = saldo + juros, nos dois métodos
    expect(av.totalPaid).toBe(880000 + av.totalInterest);
    expect(sn.totalPaid).toBe(880000 + sn.totalInterest);
    // Orçamento todo usado todo mês, menos no último
    for (const m of av.schedule.slice(0, -1)) expect(m.totalPaid).toBe(100000);
  });

  it("orçamento menor que os mínimos e dívida que nunca acaba", () => {
    expect(simularPlano(TRES, D("400"), "AVALANCHE")).toEqual({ ok: false, reason: "BUDGET_BELOW_MINIMUMS", minimumsTotal: 45000 });
    // 10.000 a 10% a.m. (1.000 de juros) pagando 900: só cresce
    const r = simularPlano([{ id: "x", name: "X", balance: D("10000"), rate: D("10"), minimum: D("900") }], D("900"), "SNOWBALL");
    expect(r).toMatchObject({ ok: false, reason: "NEVER_ENDS" });
  });
});

describe("dívidas: cadastro, pagamentos e plano pela API", () => {
  it("CRUD: cria, lista com totais, edita o saldo, arquiva, reativa e apaga", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    const d = await criarDivida(agent, { creditor: "Nubank", dueDay: 10, accountId: carteiraId, notes: "rotativo" });
    expect(d).toMatchObject({ name: "Cartão Nubank", creditor: "Nubank", type: "CARTAO", status: "ACTIVE", currentBalance: "1000.00", originalBalance: "1000.00", paidAmount: "0.00", interestRateMonthly: "10", minimumPayment: "100.00", dueDay: 10 });
    expect(d.account.id).toBe(carteiraId);

    await criarDivida(agent, { name: "Empréstimo", type: "EMPRESTIMO", currentBalance: "500.00", interestRateMonthly: "2,5", minimumPayment: "50.00" });
    const lista = await agent.get("/api/debts?status=ACTIVE");
    expect(lista.status).toBe(200);
    expect(lista.body.debts).toHaveLength(2);
    expect(lista.body.totals).toMatchObject({ currentBalance: "1500.00", minimumPayments: "150.00" });
    expect(lista.body.debts[1].interestRateMonthly).toBe("2.5");

    // Validação
    expect((await agent.post("/api/debts").send({ name: "", currentBalance: "0" })).status).toBe(400);
    expect((await agent.post("/api/debts").send({ name: "x", currentBalance: "10", dueDay: 32 })).status).toBe(400);
    expect((await agent.post("/api/debts").send({ name: "x", currentBalance: "10", interestRateMonthly: "150" })).status).toBe(400);

    const ed = await agent.put(`/api/debts/${d.id}`).send({ name: "Cartão Nu", type: "CARTAO", currentBalance: "1100.00", interestRateMonthly: "9.9", minimumPayment: "120" });
    expect(ed.status).toBe(200);
    expect(ed.body).toMatchObject({ name: "Cartão Nu", currentBalance: "1100.00", interestRateMonthly: "9.9", dueDay: null, accountId: null });

    const arq = await agent.post(`/api/debts/${d.id}/status`).send({ status: "ARCHIVED" });
    expect(arq.body.status).toBe("ARCHIVED");
    expect((await agent.get("/api/debts")).body.counts).toEqual({ ACTIVE: 1, PAID: 0, ARCHIVED: 1 });
    expect((await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "10", accountId: carteiraId })).status).toBe(400);
    expect((await agent.post(`/api/debts/${d.id}/status`).send({ status: "ACTIVE" })).body.status).toBe("ACTIVE");

    expect((await agent.delete(`/api/debts/${d.id}`)).status).toBe(204);
    expect((await agent.get(`/api/debts/${d.id}`)).status).toBe(404);
  });

  it("pagamento cria DESPESA em Lançamentos, baixa o saldo e quita no zero; apagar o lançamento devolve o saldo", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    const d = await criarDivida(agent, { currentBalance: "300.00" });

    const p1 = await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "100.00", accountId: carteiraId, date: hoje(), notes: "parcela 1" });
    expect(p1.status, JSON.stringify(p1.body)).toBe(201);
    expect(p1.body.debt).toMatchObject({ currentBalance: "200.00", paidAmount: "100.00", percentPaid: 33.3, status: "ACTIVE" });
    expect(p1.body.paidOff).toBe(false);

    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: p1.body.payment.transactionId }, include: { category: true } });
    expect(t).toMatchObject({ type: "EXPENSE", status: "CONFIRMED", isAdjustment: false, accountId: carteiraId, description: "Pagamento: Cartão Nubank", notes: "parcela 1" });
    expect(t.amount.toFixed(2)).toBe("100.00");
    expect(t.category?.name).toBe("Dívidas");
    expect(await saldoConta(agent, carteiraId)).toBe("-100.00");

    // Aparece no resumo do mês como despesa
    const resumo = await agent.get(`/api/summary?month=${mesAtual()}`);
    expect(resumo.status).toBe(200);
    expect(resumo.body.totals.expense).toBe("100.00");
    expect(resumo.body.totals.income).toBe("0.00");

    // Maior que o saldo, data futura e cartão de crédito: recusados
    expect((await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "250", accountId: carteiraId })).status).toBe(400);
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    expect((await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "10", accountId: carteiraId, date: amanha })).status).toBe(400);
    const cartao = await agent.post("/api/cards").send({ name: "Nubank", creditLimit: "1000", closingDay: 3, dueDay: 10, brand: "MASTERCARD", color: "#8b5cf6" });
    expect(cartao.status).toBe(201);
    expect((await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "10", accountId: cartao.body.id })).status).toBe(400);

    // Quita
    const p2 = await agent.post(`/api/debts/${d.id}/payments`).send({ amount: "200.00", accountId: carteiraId });
    expect(p2.status).toBe(201);
    expect(p2.body.paidOff).toBe(true);
    expect(p2.body.debt).toMatchObject({ status: "PAID", currentBalance: "0.00", percentPaid: 100 });
    expect(p2.body.debt.paidAt).toBeTruthy();
    // A categoria "Dívidas" é reaproveitada (não duplica)
    expect((await agent.get("/api/categories")).body.filter((c: { name: string }) => c.name === "Dívidas")).toHaveLength(1);

    // Regra: apagar o lançamento em Lançamentos apaga o pagamento e o saldo devedor volta (e a dívida reabre)
    expect((await agent.delete(`/api/transactions/${p2.body.payment.transactionId}`)).status).toBe(204);
    const det = await agent.get(`/api/debts/${d.id}`);
    expect(det.body.debt).toMatchObject({ status: "ACTIVE", currentBalance: "200.00" });
    expect(det.body.payments).toHaveLength(1);
    expect(await saldoConta(agent, carteiraId)).toBe("-100.00");

    // Editar o valor do lançamento muda o pago
    const put = await agent.patch(`/api/transactions/${p1.body.payment.transactionId}`).send({ amount: "120.00" });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await agent.get(`/api/debts/${d.id}`)).body.debt.currentBalance).toBe("180.00");

    // Desfazer pelo detalhe da dívida apaga a despesa também
    const pid = det.body.payments[0].id;
    const desfazer = await agent.delete(`/api/debts/${d.id}/payments/${pid}`);
    expect(desfazer.status).toBe(200);
    expect(desfazer.body.currentBalance).toBe("300.00");
    expect(await prisma.transaction.count({ where: { id: p1.body.payment.transactionId } })).toBe(0);
    expect(await saldoConta(agent, carteiraId)).toBe("0.00");
  });

  it("apagar a dívida mantém os lançamentos, a não ser com removeTransactions=true", async () => {
    const { agent, carteiraId } = await familiaLogada(app);
    const a = await criarDivida(agent);
    const pa = await agent.post(`/api/debts/${a.id}/payments`).send({ amount: "50", accountId: carteiraId });
    expect((await agent.delete(`/api/debts/${a.id}`)).status).toBe(204);
    expect(await prisma.transaction.count({ where: { id: pa.body.payment.transactionId } })).toBe(1);

    const b = await criarDivida(agent);
    const pb = await agent.post(`/api/debts/${b.id}/payments`).send({ amount: "50", accountId: carteiraId });
    expect((await agent.delete(`/api/debts/${b.id}?removeTransactions=true`)).status).toBe(204);
    expect(await prisma.transaction.count({ where: { id: pb.body.payment.transactionId } })).toBe(0);
  });

  it("plano: avalanche × bola de neve, comparação e orçamento abaixo dos mínimos", async () => {
    const { agent } = await familiaLogada(app);
    const vazio = await agent.get("/api/debts/plan?monthlyBudget=1000");
    expect(vazio.status).toBe(200);
    expect(vazio.body.empty).toBe(true);

    const c = await criarDivida(agent, { name: "Cartão", currentBalance: "3000.00", interestRateMonthly: "12", minimumPayment: "150" });
    const e = await criarDivida(agent, { name: "Empréstimo", type: "EMPRESTIMO", currentBalance: "5000.00", interestRateMonthly: "3", minimumPayment: "250" });
    const m = await criarDivida(agent, { name: "Amigo", type: "PESSOAL", currentBalance: "800.00", interestRateMonthly: "0", minimumPayment: "50" });

    const av = await agent.get("/api/debts/plan?method=AVALANCHE&monthlyBudget=1000");
    expect(av.status, JSON.stringify(av.body)).toBe(200);
    const sn = await agent.get("/api/debts/plan?method=SNOWBALL&monthlyBudget=1000.00");
    expect(sn.status).toBe(200);
    expect(av.body.debts[0].id).toBe(c.id);
    expect(sn.body.debts.map((d: { id: string }) => d.id)).toEqual([m.id, c.id, e.id]);
    expect(Number(av.body.totalInterest)).toBeLessThan(Number(sn.body.totalInterest));
    expect(av.body).toMatchObject({ monthlyBudget: "1000.00", minimumsTotal: "450.00", extraPerMonth: "550.00", startMonth: somarMeses(mesAtual(), 1) });
    expect(av.body.debtFreeMonth).toBe(somarMeses(mesAtual(), av.body.months));
    expect(av.body.schedule).toHaveLength(av.body.months);
    expect(av.body.comparison.AVALANCHE.totalInterest).toBe(av.body.totalInterest);
    expect(av.body.comparison.SNOWBALL.totalInterest).toBe(sn.body.totalInterest);
    expect(Number(av.body.comparison.interestSavedByAvalanche)).toBeCloseTo(Number(sn.body.totalInterest) - Number(av.body.totalInterest), 2);
    expect(av.body.debts[0]).toMatchObject({ order: 1, payoffDate: somarMeses(mesAtual(), av.body.debts[0].payoffMonth) });

    // Sem orçamento: usa a soma dos mínimos (aqui o mínimo do cartão nem cobre os juros: nunca acaba)
    const soMinimos = await agent.get("/api/debts/plan");
    expect(soMinimos.status).toBe(400);
    expect(soMinimos.body.reason).toBe("NEVER_ENDS");

    const pouco = await agent.get("/api/debts/plan?monthlyBudget=300");
    expect(pouco.status).toBe(400);
    expect(pouco.body.reason).toBe("BUDGET_BELOW_MINIMUMS");
    expect(pouco.body.minimumsTotal).toBe("450.00");
    expect(pouco.body.error).toContain("menor que a soma dos pagamentos mínimos");
    expect((await agent.get("/api/debts/plan?method=XYZ")).status).toBe(400);
  });

  it("aviso quando o mínimo não cobre os juros e 400 quando nunca acaba", async () => {
    const { agent } = await familiaLogada(app);
    await criarDivida(agent, { name: "Rotativo", currentBalance: "10000", interestRateMonthly: "10", minimumPayment: "500" });
    const ok = await agent.get("/api/debts/plan?monthlyBudget=2000");
    expect(ok.status).toBe(200);
    expect(ok.body.warnings[0]).toContain("não cobre os juros");
    const nunca = await agent.get("/api/debts/plan?monthlyBudget=900");
    expect(nunca.status).toBe(400);
    expect(nunca.body.reason).toBe("NEVER_ENDS");
  });
});

describe("dívidas: espaços e permissões", () => {
  it("cada espaço vê só as suas; VIEWER lê mas não escreve", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const outro = await familiaLogada(app, "Bruno Costa");
    const d = await criarDivida(dono.agent);
    const corpo = { name: "x", currentBalance: "10" };

    expect((await outro.agent.get(`/api/debts/${d.id}`)).status).toBe(404);
    expect((await outro.agent.put(`/api/debts/${d.id}`).send(corpo)).status).toBe(404);
    expect((await outro.agent.delete(`/api/debts/${d.id}`)).status).toBe(404);
    expect((await outro.agent.post(`/api/debts/${d.id}/payments`).send({ amount: "1", accountId: outro.carteiraId })).status).toBe(404);
    expect((await outro.agent.get("/api/debts")).body.debts).toHaveLength(0);
    expect((await outro.agent.get("/api/debts/plan?monthlyBudget=500")).body.empty).toBe(true);
    // Conta de outro espaço: recusada
    expect((await outro.agent.post("/api/debts").send({ ...corpo, accountId: dono.carteiraId })).status).toBe(400);
    expect((await dono.agent.post(`/api/debts/${d.id}/payments`).send({ amount: "1", accountId: outro.carteiraId })).status).toBe(400);

    const leitor = await familiaLogada(app, "Leitor");
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect(conv.status).toBe(201);
    const token = conv.body.url.split("/convite/")[1];
    expect((await leitor.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    await leitor.agent.post(`/api/households/${dono.householdId}/activate`);

    expect((await leitor.agent.get(`/api/debts/${d.id}`)).status).toBe(200);
    expect((await leitor.agent.get("/api/debts")).body.debts).toHaveLength(1);
    expect((await leitor.agent.get("/api/debts/plan?monthlyBudget=500")).status).toBe(200);
    expect((await leitor.agent.post("/api/debts").send(corpo)).status).toBe(403);
    expect((await leitor.agent.put(`/api/debts/${d.id}`).send(corpo)).status).toBe(403);
    expect((await leitor.agent.post(`/api/debts/${d.id}/status`).send({ status: "ARCHIVED" })).status).toBe(403);
    expect((await leitor.agent.post(`/api/debts/${d.id}/payments`).send({ amount: "1", accountId: dono.carteiraId })).status).toBe(403);
    expect((await leitor.agent.delete(`/api/debts/${d.id}`)).status).toBe(403);
  });
});
