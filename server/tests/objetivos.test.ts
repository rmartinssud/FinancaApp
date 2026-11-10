import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Decimal, ZERO, mesAtual } from "../src/lib/money.js";
import { calcularProgresso, evolucao, diaLocal } from "../src/services/objetivos.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const D = (v: string) => new Decimal(v);

async function criarObjetivo(agent: Agent, d: Record<string, unknown> = {}) {
  const res = await agent.post("/api/goals").send({ name: "Viagem", color: "#2ca9bc", icon: "plane", targetAmount: "1000.00", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function criarConta(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/accounts").send({ type: "BANK", initialBalance: "0", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function saldo(agent: Agent, id: string) {
  const res = await agent.get("/api/accounts");
  return res.body.find((c: { id: string }) => c.id === id).currentBalance as string;
}

describe("objetivos: cálculos", () => {
  const base = { targetAmount: D("1200.00"), initialAmount: D("200.00"), targetDate: "2027-10-31", inicio: "2026-11-01" };

  it("progresso, falta e quanto guardar por mês (conta o mês atual e o da data)", () => {
    const p = calcularProgresso(base, D("300.00"), D("100.00"), "2026-11-15");
    expect(p.saved.toFixed(2)).toBe("400.00");
    expect(p.remaining.toFixed(2)).toBe("800.00");
    expect(p.percent).toBe(33.3);
    expect(p.reached).toBe(false);
    // novembro/2026 a outubro/2027 = 12 meses; 800 / 12 = 66,666... → 66,67 (para cima no centavo)
    expect(p.monthsLeft).toBe(12);
    expect(p.perMonth!.toFixed(2)).toBe("66.67");
  });

  it("ritmo: compara com o esperado em linha reta desde a criação", () => {
    // 2026-11-01 → 2027-10-31 = 364 dias; em 2027-05-01 passaram 181 dias
    // esperado = 200 + 1000 × 181/364 = 697,25
    const atras = calcularProgresso(base, D("400.00"), ZERO, "2027-05-01");
    expect(atras.expected!.toFixed(2)).toBe("697.25");
    expect(atras.onTrack).toBe(false);
    const emDia = calcularProgresso(base, D("500.00"), ZERO, "2027-05-01");
    expect(emDia.onTrack).toBe(true);
  });

  it("chegou à meta, data passada e sem data", () => {
    const ok = calcularProgresso(base, D("1000.00"), ZERO, "2027-01-10");
    expect(ok).toMatchObject({ reached: true, percent: 100 });
    expect(ok.perMonth!.toFixed(2)).toBe("0.00");
    expect(ok.remaining.toFixed(2)).toBe("0.00");

    const passou = calcularProgresso(base, D("100.00"), ZERO, "2027-11-05");
    expect(passou).toMatchObject({ monthsLeft: 0, overdue: true, onTrack: false });
    expect(passou.perMonth!.toFixed(2)).toBe("900.00");

    const semData = calcularProgresso({ ...base, targetDate: null }, ZERO, ZERO, "2026-11-15");
    expect(semData).toMatchObject({ monthsLeft: null, perMonth: null, expected: null, onTrack: null, percent: 16.6 });
  });

  it("data alvo no mês atual: 1 mês", () => {
    const p = calcularProgresso({ ...base, targetDate: "2026-11-30" }, ZERO, ZERO, "2026-11-10");
    expect(p.monthsLeft).toBe(1);
    expect(p.perMonth!.toFixed(2)).toBe("1000.00");
  });

  it("evolução: guardado no fim de cada mês", () => {
    const linhas = evolucao(
      { initialAmount: D("100.00"), inicio: "2026-09-10" },
      [
        { kind: "DEPOSIT", amount: D("50.00"), date: new Date("2026-09-20T12:00:00Z") },
        { kind: "WITHDRAWAL", amount: D("30.00"), date: new Date("2026-11-02T12:00:00Z") },
      ],
      "2026-11-15",
    );
    expect(linhas).toEqual([
      { month: "2026-09", saved: "150.00" },
      { month: "2026-10", saved: "150.00" },
      { month: "2026-11", saved: "120.00" },
    ]);
  });
});

describe("objetivos: CRUD, depósitos e retiradas", () => {
  it("cria, lista por situação, edita, conclui, arquiva e exclui", async () => {
    const f = await familiaLogada(app);
    const g = await criarObjetivo(f.agent, { initialAmount: "250.00", description: "Férias em julho", showOnHome: false });
    expect(g).toMatchObject({ name: "Viagem", status: "ACTIVE", targetAmount: "1000.00", initialAmount: "250.00", showOnHome: false });
    expect(g.progress).toMatchObject({ saved: "250.00", remaining: "750.00", percent: 25, reached: false, perMonth: null });

    // Validação
    const ruim = await f.agent.post("/api/goals").send({ name: "", color: "azul", icon: "plane", targetAmount: "0" });
    expect(ruim.status).toBe(400);
    expect(Object.keys(ruim.body.detalhes)).toEqual(expect.arrayContaining(["name", "color", "targetAmount"]));

    const editado = await f.agent.put(`/api/goals/${g.id}`).send({ name: "Viagem ao Nordeste", color: "#22c55e", icon: "plane", targetAmount: "2000", initialAmount: "250", targetDate: "2099-12-31", showOnHome: true });
    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ name: "Viagem ao Nordeste", targetDate: "2099-12-31", description: null, showOnHome: true });
    expect(editado.body.progress.perMonth).not.toBeNull();

    const lista = await f.agent.get("/api/goals?status=ACTIVE");
    expect(lista.body.goals.map((x: { id: string }) => x.id)).toEqual([g.id]);
    expect(lista.body.counts).toEqual({ ACTIVE: 1, COMPLETED: 0, ARCHIVED: 0 });

    const concluido = await f.agent.post(`/api/goals/${g.id}/status`).send({ status: "COMPLETED" });
    expect(concluido.body.status).toBe("COMPLETED");
    expect(concluido.body.completedAt).not.toBeNull();
    expect((await f.agent.get("/api/goals?status=COMPLETED")).body.goals).toHaveLength(1);
    expect((await f.agent.get("/api/goals?status=ACTIVE")).body.goals).toHaveLength(0);
    // Concluído não recebe depósitos
    expect((await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "10" })).status).toBe(400);

    const reativado = await f.agent.post(`/api/goals/${g.id}/status`).send({ status: "ACTIVE" });
    expect(reativado.body).toMatchObject({ status: "ACTIVE", completedAt: null });
    expect((await f.agent.post(`/api/goals/${g.id}/status`).send({ status: "ARCHIVED" })).body.status).toBe("ARCHIVED");

    expect((await f.agent.delete(`/api/goals/${g.id}`)).status).toBe(204);
    expect((await f.agent.get(`/api/goals/${g.id}`)).status).toBe(404);
  });

  it("depósitos e retiradas só de controle: não mexem em saldos nem no resumo", async () => {
    const f = await familiaLogada(app);
    const g = await criarObjetivo(f.agent, { targetAmount: "300.00", initialAmount: "100.00" });
    const antes = await saldo(f.agent, f.carteiraId);

    const dep = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "150.00", notes: "13º" });
    expect(dep.status, JSON.stringify(dep.body)).toBe(201);
    expect(dep.body.entry.transactionId).toBeNull();
    expect(dep.body.goal.progress).toMatchObject({ saved: "250.00", remaining: "50.00" });
    expect(dep.body.suggestComplete).toBe(false);

    const ret = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "WITHDRAWAL", amount: "20.00" });
    expect(ret.body.goal.progress.saved).toBe("230.00");
    // Não dá para retirar mais do que o guardado
    const demais = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "WITHDRAWAL", amount: "230.01" });
    expect(demais.status).toBe(400);
    expect(demais.body.detalhes.amount).toBeTruthy();

    // Chegou à meta: sugere concluir (continua ativo)
    const chegou = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "70.00" });
    expect(chegou.body.suggestComplete).toBe(true);
    expect(chegou.body.goal).toMatchObject({ status: "ACTIVE" });
    expect(chegou.body.goal.progress).toMatchObject({ saved: "300.00", percent: 100, reached: true });

    expect(await saldo(f.agent, f.carteiraId)).toBe(antes);
    expect(await prisma.transaction.count({ where: { householdId: f.householdId, type: "TRANSFER" } })).toBe(0);

    // Detalhes: histórico e evolução
    const det = await f.agent.get(`/api/goals/${g.id}`);
    expect(det.status).toBe(200);
    expect(det.body.entries).toHaveLength(3);
    expect(det.body.entries[0]).toMatchObject({ date: diaLocal(), transfer: null });
    expect(det.body.history.at(-1)).toEqual({ month: mesAtual(), saved: "300.00" });

    // Apagar um depósito que deixaria o guardado negativo é bloqueado
    const g2 = await criarObjetivo(f.agent);
    const d2 = await f.agent.post(`/api/goals/${g2.id}/entries`).send({ kind: "DEPOSIT", amount: "50" });
    await f.agent.post(`/api/goals/${g2.id}/entries`).send({ kind: "WITHDRAWAL", amount: "50" });
    expect((await f.agent.delete(`/api/goals/${g2.id}/entries/${d2.body.entry.id}`)).status).toBe(409);
  });

  it("depósito com transferência real: saldos corretos e não conta como receita/despesa", async () => {
    const f = await familiaLogada(app);
    const banco = await criarConta(f.agent, { name: "Banco", initialBalance: "1000.00" });
    const invest = await criarConta(f.agent, { name: "Corretora", type: "INVESTMENT", initialBalance: "0" });
    const g = await criarObjetivo(f.agent, { accountId: invest });
    expect(g.account).toMatchObject({ id: invest, name: "Corretora", type: "INVESTMENT" });

    const resumoAntes = await f.agent.get(`/api/summary?month=${mesAtual()}`);

    // Sem conta de origem → erro; mesma conta → erro
    expect((await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "100", transfer: true })).status).toBe(400);
    expect((await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "100", transfer: true, accountId: invest })).status).toBe(400);

    const dep = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "300.00", transfer: true, accountId: banco, notes: "Aporte" });
    expect(dep.status, JSON.stringify(dep.body)).toBe(201);
    expect(dep.body.entry.transactionId).toBeTruthy();
    expect(await saldo(f.agent, banco)).toBe("700.00");
    expect(await saldo(f.agent, invest)).toBe("300.00");

    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: dep.body.entry.transactionId } });
    expect(t).toMatchObject({ type: "TRANSFER", accountId: banco, toAccountId: invest, status: "CONFIRMED", description: "Objetivo: Viagem", notes: "Aporte" });

    // Retirada com transferência: volta da conta do objetivo para o banco
    const ret = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "WITHDRAWAL", amount: "50.00", transfer: true, accountId: banco });
    expect(ret.status).toBe(201);
    expect(await saldo(f.agent, banco)).toBe("750.00");
    expect(await saldo(f.agent, invest)).toBe("250.00");
    expect(ret.body.goal.progress.saved).toBe("250.00");

    // Resumo do mês: receitas e despesas não mudam
    const resumoDepois = await f.agent.get(`/api/summary?month=${mesAtual()}`);
    expect(resumoDepois.body.totals.income).toBe(resumoAntes.body.totals.income);
    expect(resumoDepois.body.totals.expense).toBe(resumoAntes.body.totals.expense);

    // Detalhes mostram a transferência
    const det = await f.agent.get(`/api/goals/${g.id}`);
    const comTransf = det.body.entries.find((e: { kind: string }) => e.kind === "DEPOSIT");
    expect(comTransf.transfer).toMatchObject({ from: { name: "Banco" }, to: { name: "Corretora" }, status: "CONFIRMED" });

    // Apagar o depósito apaga a transferência junto (saldos voltam)…
    const semRet = await f.agent.delete(`/api/goals/${g.id}/entries/${ret.body.entry.id}?keepTransfer=true`);
    expect(semRet.status).toBe(200);
    expect(await saldo(f.agent, banco)).toBe("750.00"); // manteve a transferência da retirada
    const apagou = await f.agent.delete(`/api/goals/${g.id}/entries/${dep.body.entry.id}`);
    expect(apagou.status).toBe(200);
    expect(apagou.body.progress.saved).toBe("0.00");
    expect(await prisma.transaction.findUnique({ where: { id: dep.body.entry.transactionId } })).toBeNull();
    expect(await saldo(f.agent, banco)).toBe("1050.00");

    // Conta vinculada não pode ser cartão; transferência sem conta vinculada é recusada
    const cartao = await f.agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
    expect((await f.agent.post("/api/goals").send({ name: "X", color: "#000000", icon: "piggy", targetAmount: "10", accountId: cartao.body.id })).status).toBe(400);
    const solto = await criarObjetivo(f.agent);
    expect((await f.agent.post(`/api/goals/${solto.id}/entries`).send({ kind: "DEPOSIT", amount: "10", transfer: true, accountId: banco })).status).toBe(400);
  });

  it("Início: só ativos marcados, até 3", async () => {
    const f = await familiaLogada(app);
    for (const n of ["A", "B", "C", "D"]) await criarObjetivo(f.agent, { name: n });
    await criarObjetivo(f.agent, { name: "Escondido", showOnHome: false });
    const home = await f.agent.get("/api/goals?home=true");
    expect(home.body.total).toBe(4);
    expect(home.body.goals.map((g: { name: string }) => g.name)).toEqual(["A", "B", "C"]);
  });

  it("ritmo pela API usa a data de criação", async () => {
    const f = await familiaLogada(app);
    const g = await criarObjetivo(f.agent, { targetAmount: "1200.00", targetDate: "2099-12-31" });
    // Finge que foi criado há muito tempo: o esperado hoje já é alto, então está atrasado
    await prisma.goal.update({ where: { id: g.id }, data: { createdAt: new Date("2020-01-01T12:00:00Z") } });
    const det = await f.agent.get(`/api/goals/${g.id}`);
    expect(det.body.goal.progress.onTrack).toBe(false);
    expect(Number(det.body.goal.progress.expected)).toBeGreaterThan(0);
  });
});

describe("objetivos: espaços e permissões", () => {
  it("cada espaço vê só os seus; VIEWER lê mas não escreve", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const outro = await familiaLogada(app, "Bruno Costa");
    const g = await criarObjetivo(dono.agent);
    const corpo = { name: "x", color: "#000000", icon: "piggy", targetAmount: "1" };

    expect((await outro.agent.get(`/api/goals/${g.id}`)).status).toBe(404);
    expect((await outro.agent.put(`/api/goals/${g.id}`).send(corpo)).status).toBe(404);
    expect((await outro.agent.delete(`/api/goals/${g.id}`)).status).toBe(404);
    expect((await outro.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "1" })).status).toBe(404);
    expect((await outro.agent.get("/api/goals")).body.goals).toHaveLength(0);
    // Conta de outro espaço não pode ser vinculada
    expect((await outro.agent.post("/api/goals").send({ ...corpo, accountId: dono.carteiraId })).status).toBe(400);

    const leitor = await familiaLogada(app, "Leitor");
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect(conv.status).toBe(201);
    const token = conv.body.url.split("/convite/")[1];
    expect((await leitor.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    await leitor.agent.post(`/api/households/${dono.householdId}/activate`);

    expect((await leitor.agent.get(`/api/goals/${g.id}`)).status).toBe(200);
    expect((await leitor.agent.get("/api/goals")).body.goals).toHaveLength(1);
    expect((await leitor.agent.post("/api/goals").send(corpo)).status).toBe(403);
    expect((await leitor.agent.put(`/api/goals/${g.id}`).send(corpo)).status).toBe(403);
    expect((await leitor.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "1" })).status).toBe(403);
    expect((await leitor.agent.post(`/api/goals/${g.id}/status`).send({ status: "ARCHIVED" })).status).toBe(403);
    expect((await leitor.agent.delete(`/api/goals/${g.id}`)).status).toBe(403);
  });
});
