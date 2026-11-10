import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { mesAtual, somarMeses } from "../src/lib/money.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const MES = "2026-08"; // mês fixo dos testes (passado, para não depender de hoje)

// Lançamento simples (receita ou despesa)
async function lancar(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Teste", date: `${MES}-10`, status: "CONFIRMED", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function criarOrcamento(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Mercado", color: "#ef4444", icon: "cart", startMonth: MES, ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

// Progresso de um orçamento no mês (pela lista)
async function progresso(agent: Agent, id: string, mes = MES, kind = "EXPENSE") {
  const res = await agent.get(`/api/budgets?month=${mes}&kind=${kind}`);
  expect(res.status).toBe(200);
  const b = res.body.budgets.find((x: { id: string }) => x.id === id);
  return b?.progress as { goal: string; confirmed: string; pending: string; used: string; balance: string; percent: number | null; status: string } | undefined;
}

async function criarCartao(agent: Agent) {
  const res = await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("orçamentos: meta fixa, previsto e filtros", () => {
  it("meta fixa: efetivado, pendente, saldo, percentual e alerta", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "500.00", categoryIds: [f.categoria("Mercado")] });
    await lancar(f.agent, { amount: "300.10", accountId: f.carteiraId, categoryId: f.categoria("Mercado") });
    await lancar(f.agent, { amount: "120.00", accountId: f.carteiraId, categoryId: f.categoria("Mercado"), status: "PENDING" });

    const p = await progresso(f.agent, id);
    expect(p).toMatchObject({ goal: "500.00", confirmed: "300.10", pending: "120.00", used: "420.10", balance: "79.90", status: "ALERT" });
    expect(p!.percent).toBe(84);

    // Antes da vigência ele não aparece
    expect(await progresso(f.agent, id, somarMeses(MES, -1))).toBeUndefined();
    // Nos meses seguintes ele repete com a mesma meta
    expect((await progresso(f.agent, id, somarMeses(MES, 2)))!.goal).toBe("500.00");

    // Estourou
    await lancar(f.agent, { amount: "100.00", accountId: f.carteiraId, categoryId: f.categoria("Mercado") });
    expect(await progresso(f.agent, id)).toMatchObject({ used: "520.10", balance: "-20.10", status: "OVER" });
  });

  it("Previsto desligado: pendentes não contam no usado", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "100", includePending: false });
    await lancar(f.agent, { amount: "30", accountId: f.carteiraId });
    await lancar(f.agent, { amount: "50", accountId: f.carteiraId, status: "PENDING" });
    expect(await progresso(f.agent, id)).toMatchObject({ confirmed: "30.00", pending: "50.00", used: "30.00", balance: "70.00", status: "OK" });

    const det = await f.agent.get(`/api/budgets/${id}?month=${MES}`);
    expect(det.body.transactions).toHaveLength(1);
  });

  it("filtro por categoria: só as categorias escolhidas; categoria apagada sai do filtro", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "1000", categoryIds: [f.categoria("Mercado"), f.categoria("Transporte")] });
    await lancar(f.agent, { amount: "10", accountId: f.carteiraId, categoryId: f.categoria("Mercado") });
    await lancar(f.agent, { amount: "20", accountId: f.carteiraId, categoryId: f.categoria("Transporte") });
    await lancar(f.agent, { amount: "40", accountId: f.carteiraId, categoryId: f.categoria("Lazer") });
    await lancar(f.agent, { amount: "80", accountId: f.carteiraId });
    expect((await progresso(f.agent, id))!.used).toBe("30.00");

    // Categoria de receita não pode entrar num orçamento de despesa
    const errado = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "X", color: "#000000", icon: "cart", startMonth: MES, amount: "10", categoryIds: [f.categoria("Salário")] });
    expect(errado.status).toBe(400);

    await f.agent.delete(`/api/categories/${f.categoria("Transporte")}`);
    const det = await f.agent.get(`/api/budgets/${id}?month=${MES}`);
    expect(det.body.budget.categoryIds).toEqual([f.categoria("Mercado")]);
  });

  it("cartão: filtro por cartão e data da compra × mês da fatura", async () => {
    const f = await familiaLogada(app);
    const cartao = await criarCartao(f.agent);
    // Fecha dia 3, vence dia 10: compra em 05/08 vai para a fatura de setembro
    const compra = await f.agent.post("/api/card-expenses").send({ cardId: cartao, amount: "200", description: "Tênis", date: `${MES}-05`, categoryId: f.categoria("Contas") });
    expect(compra.status).toBe(201);
    expect(compra.body.invoiceMonth).toBe("2026-09");
    await lancar(f.agent, { amount: "50", accountId: f.carteiraId, categoryId: f.categoria("Contas") });

    const pelaCompra = await criarOrcamento(f.agent, { amount: "1000", accountIds: [cartao] });
    const pelaFatura = await criarOrcamento(f.agent, { amount: "1000", accountIds: [cartao], cardDateRef: "INVOICE" });
    const todas = await criarOrcamento(f.agent, { amount: "1000", cardDateRef: "INVOICE" });

    expect((await progresso(f.agent, pelaCompra))!.used).toBe("200.00");
    expect((await progresso(f.agent, pelaFatura))!.used).toBe("0.00");
    expect((await progresso(f.agent, pelaFatura, "2026-09"))!.used).toBe("200.00");
    expect((await progresso(f.agent, pelaCompra, "2026-09"))!.used).toBe("0.00");
    // Sem filtro de conta: carteira (pela data) + cartão (pela fatura)
    expect((await progresso(f.agent, todas))!.used).toBe("50.00");
    expect((await progresso(f.agent, todas, "2026-09"))!.used).toBe("200.00");

    // Detalhes mostram a compra do cartão (o app abre a fatura)
    const det = await f.agent.get(`/api/budgets/${pelaFatura}?month=2026-09`);
    expect(det.body.transactions[0]).toMatchObject({ description: "Tênis", isCardExpense: true, invoiceMonth: "2026-09" });
  });

  it("contas com Ignorar nos totais ficam de fora, a não ser com a opção ligada", async () => {
    const f = await familiaLogada(app);
    const conta = await f.agent.post("/api/accounts").send({ name: "Conta da empresa", type: "BANK", ignoreInTotals: true });
    expect(conta.status).toBe(201);
    await lancar(f.agent, { amount: "70", accountId: conta.body.id });
    await lancar(f.agent, { amount: "30", accountId: f.carteiraId });

    const normal = await criarOrcamento(f.agent, { amount: "500" });
    const comIgnoradas = await criarOrcamento(f.agent, { amount: "500", includeIgnored: true });
    expect((await progresso(f.agent, normal))!.used).toBe("30.00");
    expect((await progresso(f.agent, comIgnoradas))!.used).toBe("100.00");
  });

  it("transferências, pagamento de fatura e ajustes de saldo nunca contam", async () => {
    const f = await familiaLogada(app);
    const banco = (await f.agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "1000" })).body.id;
    await f.agent.post("/api/transactions").send({ type: "TRANSFER", amount: "100", date: `${MES}-10`, accountId: banco, toAccountId: f.carteiraId });
    const ajuste = await f.agent.post(`/api/accounts/${banco}/adjust`).send({ balance: "500", date: `${MES}-11` });
    expect([200, 201]).toContain(ajuste.status);
    // O ajuste sai com a data de hoje: traz para o mês do teste
    const ajustes = await prisma.transaction.updateMany({ where: { householdId: f.householdId, isAdjustment: true }, data: { date: new Date(`${MES}-11T12:00:00.000Z`) } });
    expect(ajustes.count).toBe(1);

    const despesa = await criarOrcamento(f.agent, { amount: "100" });
    const receita = await criarOrcamento(f.agent, { kind: "INCOME", name: "Entradas", amount: "100" });
    expect((await progresso(f.agent, despesa))!.used).toBe("0.00");
    expect((await progresso(f.agent, receita, MES, "INCOME"))!.used).toBe("0.00");
  });
});

describe("orçamentos: meta em %, agrupados e personalizados", () => {
  it("meta em % do total de receitas e da meta de um orçamento de receita", async () => {
    const f = await familiaLogada(app);
    await lancar(f.agent, { type: "INCOME", amount: "5000", accountId: f.carteiraId, categoryId: f.categoria("Salário") });
    await lancar(f.agent, { type: "INCOME", amount: "1000.01", accountId: f.carteiraId, categoryId: f.categoria("Salário"), status: "PENDING" });

    const salario = await criarOrcamento(f.agent, { kind: "INCOME", name: "Salário", amount: "4000", categoryIds: [f.categoria("Salário")] });
    const pReceita = await progresso(f.agent, salario, MES, "INCOME");
    expect(pReceita).toMatchObject({ goal: "4000.00", used: "6000.01", status: "REACHED" });

    // 30% do total de receitas confirmadas do mês (5000) = 1500
    const doTotal = await criarOrcamento(f.agent, { name: "Moradia", goalType: "PERCENT_INCOME", percent: "30" });
    expect((await progresso(f.agent, doTotal))!.goal).toBe("1500.00");
    // 12,5% da meta do Salário (4000) = 500
    const doSalario = await criarOrcamento(f.agent, { name: "Lazer", goalType: "PERCENT_BUDGET", percent: "12.5", percentOfBudgetId: salario });
    expect((await progresso(f.agent, doSalario))!.goal).toBe("500.00");

    // % não vale para receita nem personalizado
    const ruim = await f.agent.post("/api/budgets").send({ kind: "INCOME", name: "X", color: "#000000", icon: "cart", startMonth: MES, goalType: "PERCENT_INCOME", percent: "10" });
    expect(ruim.status).toBe(400);
    // A base não pode ser apagada enquanto alguém usa
    expect((await f.agent.delete(`/api/budgets/${salario}`)).status).toBe(409);
  });

  it("agrupado soma metas e usados dos componentes; resumo não conta duas vezes", async () => {
    const f = await familiaLogada(app);
    const essenciais = await criarOrcamento(f.agent, { name: "Essenciais", amount: "1000", categoryIds: [f.categoria("Moradia")] });
    const estilo = await criarOrcamento(f.agent, { name: "Estilo de vida", amount: "300", categoryIds: [f.categoria("Lazer")] });
    await lancar(f.agent, { amount: "800", accountId: f.carteiraId, categoryId: f.categoria("Moradia") });
    await lancar(f.agent, { amount: "350", accountId: f.carteiraId, categoryId: f.categoria("Lazer") });
    const grupo = await criarOrcamento(f.agent, { name: "50/30/20", isGroup: true, componentIds: [essenciais, estilo] });

    const lista = await f.agent.get(`/api/budgets?month=${MES}&kind=EXPENSE`);
    const g = lista.body.budgets.find((x: { id: string }) => x.id === grupo);
    expect(g.progress).toMatchObject({ goal: "1300.00", used: "1150.00", balance: "150.00" });
    expect(g.components).toHaveLength(2);
    expect(lista.body.summary).toEqual({ goal: "1300.00", used: "1150.00", balance: "150.00" });

    // Detalhes do agrupado listam os lançamentos dos componentes
    const det = await f.agent.get(`/api/budgets/${grupo}?month=${MES}`);
    expect(det.body.transactions).toHaveLength(2);

    // Componente precisa ser mensal de despesa
    const receita = await criarOrcamento(f.agent, { kind: "INCOME", name: "Renda", amount: "10" });
    const ruim = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", isGroup: true, name: "G", color: "#000000", icon: "cart", startMonth: MES, componentIds: [receita] });
    expect(ruim.status).toBe(400);
  });

  it("personalizado calcula o intervalo inteiro e aparece nos meses que encosta", async () => {
    const f = await familiaLogada(app);
    const viagem = await criarOrcamento(f.agent, { name: "Viagem", period: "CUSTOM", startMonth: null, startDate: "2026-08-20", endDate: "2026-09-05", amount: "2000" });
    await lancar(f.agent, { amount: "100", accountId: f.carteiraId, date: "2026-08-19" }); // antes
    await lancar(f.agent, { amount: "300", accountId: f.carteiraId, date: "2026-08-20" });
    await lancar(f.agent, { amount: "400", accountId: f.carteiraId, date: "2026-09-05" });
    await lancar(f.agent, { amount: "500", accountId: f.carteiraId, date: "2026-09-06" }); // depois

    expect((await progresso(f.agent, viagem, "2026-08"))!.used).toBe("700.00");
    expect((await progresso(f.agent, viagem, "2026-09"))!.used).toBe("700.00");
    expect(await progresso(f.agent, viagem, "2026-10")).toBeUndefined();

    const det = await f.agent.get(`/api/budgets/${viagem}?month=2026-08`);
    expect(det.body.history).toBeNull();
    expect(det.body.transactions).toHaveLength(2);
    // Não dá para arquivar personalizado nem mudar a meta por mês
    expect((await f.agent.post(`/api/budgets/${viagem}/archive`).send({ fromMonth: "2026-09" })).status).toBe(400);
    expect((await f.agent.post(`/api/budgets/${viagem}/goal`).send({ amount: "10", month: "2026-08", scope: "month" })).status).toBe(400);
  });
});

describe("orçamentos: alterar meta, transferir, arquivar e recomendada", () => {
  it("alterar meta só neste mês × deste mês em diante mantém os meses anteriores", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "500" });
    const meta = async (m: string) => (await progresso(f.agent, id, m))!.goal;

    const so = await f.agent.post(`/api/budgets/${id}/goal`).send({ amount: "650", month: "2026-09", scope: "month" });
    expect(so.status).toBe(200);
    expect([await meta("2026-08"), await meta("2026-09"), await meta("2026-10")]).toEqual(["500.00", "650.00", "500.00"]);

    await f.agent.post(`/api/budgets/${id}/goal`).send({ amount: "700", month: "2026-10", scope: "forward" });
    expect([await meta("2026-08"), await meta("2026-09"), await meta("2026-10"), await meta("2026-12")]).toEqual(["500.00", "650.00", "700.00", "700.00"]);

    // Deste mês em diante a partir de setembro substitui o "só neste mês" e o de outubro
    await f.agent.post(`/api/budgets/${id}/goal`).send({ amount: "600", month: "2026-09", scope: "forward" });
    expect([await meta("2026-08"), await meta("2026-09"), await meta("2026-11")]).toEqual(["500.00", "600.00", "600.00"]);

    // Editar pelo formulário: o valor novo vale do mês informado em diante
    const editar = await f.agent.put(`/api/budgets/${id}`).send({ kind: "EXPENSE", name: "Mercado", color: "#ef4444", icon: "cart", startMonth: MES, amount: "800", goalFromMonth: "2026-11" });
    expect(editar.status).toBe(200);
    expect([await meta("2026-08"), await meta("2026-10"), await meta("2026-11")]).toEqual(["500.00", "600.00", "800.00"]);

    // Histórico de 6 meses nos detalhes
    const det = await f.agent.get(`/api/budgets/${id}?month=2026-11`);
    expect(det.body.history.map((h: { goal: string | null }) => h.goal)).toEqual([null, null, "500.00", "600.00", "600.00", "800.00"]);
  });

  it("transferir saldo entre dois orçamentos mensais de despesa, só no mês", async () => {
    const f = await familiaLogada(app);
    const mercado = await criarOrcamento(f.agent, { name: "Mercado", amount: "500", categoryIds: [f.categoria("Mercado")] });
    const lazer = await criarOrcamento(f.agent, { name: "Lazer", amount: "200", categoryIds: [f.categoria("Lazer")] });
    await lancar(f.agent, { amount: "350", accountId: f.carteiraId, categoryId: f.categoria("Mercado") });

    // Saldo do Mercado é 150: não dá para mandar 200
    const demais = await f.agent.post("/api/budgets/transfer").send({ fromId: mercado, toId: lazer, month: MES, amount: "200" });
    expect(demais.status).toBe(400);

    const ok = await f.agent.post("/api/budgets/transfer").send({ fromId: mercado, toId: lazer, month: MES, amount: "100.50" });
    expect(ok.status).toBe(200);
    expect(ok.body.from.progress).toMatchObject({ goal: "399.50", balance: "49.50" });
    expect(ok.body.to.progress.goal).toBe("300.50");
    // Mês seguinte volta ao normal
    expect((await progresso(f.agent, mercado, "2026-09"))!.goal).toBe("500.00");
    // Alterar a meta do mês continua somando o ajuste da transferência
    await f.agent.post(`/api/budgets/${lazer}/goal`).send({ amount: "250", month: MES, scope: "month" });
    expect((await progresso(f.agent, lazer))!.goal).toBe("350.50");

    const receita = await criarOrcamento(f.agent, { kind: "INCOME", name: "Renda", amount: "10" });
    expect((await f.agent.post("/api/budgets/transfer").send({ fromId: mercado, toId: receita, month: MES, amount: "1" })).status).toBe(400);
  });

  it("arquivar a partir de um mês mantém o histórico e excluir apaga", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "100" });
    expect((await f.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: MES })).status).toBe(400);
    const arq = await f.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-10" });
    expect(arq.status).toBe(200);
    expect(arq.body.archivedFromMonth).toBe("2026-10");
    expect(await progresso(f.agent, id, "2026-09")).toBeDefined();
    expect(await progresso(f.agent, id, "2026-10")).toBeUndefined();

    expect((await f.agent.delete(`/api/budgets/${id}`)).status).toBe(204);
    expect(await prisma.budget.count({ where: { id } })).toBe(0);
    expect(await prisma.budgetGoal.count({ where: { budgetId: id } })).toBe(0);
  });

  it("meta recomendada: média dos 3 últimos meses completos, arredondada para cima em R$ 10", async () => {
    const f = await familiaLogada(app);
    const atual = mesAtual();
    const id = await criarOrcamento(f.agent, { amount: "100", startMonth: atual });
    expect((await f.agent.get(`/api/budgets/${id}/recommended`)).body.recommended).toBeNull();

    const valores = ["100", "200", "301"];
    for (let i = 0; i < 3; i++) await lancar(f.agent, { amount: valores[i], accountId: f.carteiraId, date: `${somarMeses(atual, i - 3)}-15` });
    const rec = await f.agent.get(`/api/budgets/${id}/recommended`);
    // (100 + 200 + 301) / 3 = 200,33 → 210
    expect(rec.body.recommended).toMatchObject({ amount: "210.00", average: "200.33" });
  });
});

describe("orçamentos: espaços e permissões", () => {
  it("cada espaço vê só os seus; VIEWER lê mas não escreve", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const outro = await familiaLogada(app, "Bruno Costa");
    const id = await criarOrcamento(dono.agent, { amount: "100" });

    expect((await outro.agent.get(`/api/budgets/${id}`)).status).toBe(404);
    expect((await outro.agent.put(`/api/budgets/${id}`).send({ kind: "EXPENSE", name: "x", color: "#000000", icon: "cart", startMonth: MES, amount: "1" })).status).toBe(404);
    expect((await outro.agent.delete(`/api/budgets/${id}`)).status).toBe(404);
    expect((await outro.agent.get(`/api/budgets?month=${MES}`)).body.budgets).toHaveLength(0);
    // Categoria de outro espaço não entra no filtro
    const alheia = await outro.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "x", color: "#000000", icon: "cart", startMonth: MES, amount: "1", categoryIds: [dono.categoria("Lazer")] });
    expect(alheia.status).toBe(400);

    // Convida um leitor (VIEWER) para o espaço do dono
    const leitor = await familiaLogada(app, "Leitor");
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect(conv.status).toBe(201);
    const token = conv.body.url.split("/convite/")[1];
    expect((await leitor.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    await leitor.agent.post(`/api/households/${dono.householdId}/activate`);

    expect((await leitor.agent.get(`/api/budgets/${id}?month=${MES}`)).status).toBe(200);
    expect((await leitor.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "x", color: "#000000", icon: "cart", startMonth: MES, amount: "1" })).status).toBe(403);
    expect((await leitor.agent.post(`/api/budgets/${id}/goal`).send({ amount: "5", month: MES, scope: "month" })).status).toBe(403);
    expect((await leitor.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-10" })).status).toBe(403);
    expect((await leitor.agent.delete(`/api/budgets/${id}`)).status).toBe(403);
  });
});
