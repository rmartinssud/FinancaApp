import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { diaLocal } from "../src/services/objetivos.js";
import { familiaLogada, ORIGIN } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const MES = "2026-08"; // mês fixo dos orçamentos (passado)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
// Cabeçalho mínimo de um HEIC: tamanho da caixa + "ftyp" + marca "heic"
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(100, 2)]);

const hoje = () => diaLocal();
const amanha = () => diaLocal(new Date(Date.now() + 36 * 3600 * 1000));
const ontem = () => diaLocal(new Date(Date.now() - 36 * 3600 * 1000));

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

async function progresso(agent: Agent, id: string, mes = MES, kind = "EXPENSE") {
  const res = await agent.get(`/api/budgets?month=${mes}&kind=${kind}`);
  expect(res.status).toBe(200);
  return res.body.budgets.find((x: { id: string }) => x.id === id)?.progress as { goal: string; used: string } | undefined;
}

async function anexar(agent: Agent, transacaoId: string, dados = PNG, mime = "image/png", nome?: string) {
  let r = agent.post(`/api/transactions/${transacaoId}/attachments`).set("Content-Type", mime);
  if (nome) r = r.set("X-File-Name", encodeURIComponent(nome));
  const res = await r.send(dados);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const a = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id: res.body.id } });
  return { id: res.body.id as string, arquivo: path.join(process.env.UPLOADS_DIR!, a.storageKey) };
}

async function entradaId(agent: Agent, goalId: string, kind: "DEPOSIT" | "WITHDRAWAL") {
  const det = await agent.get(`/api/goals/${goalId}`);
  return det.body.entries.find((e: { kind: string }) => e.kind === kind).id as string;
}

// ─────────────────────────────────────────────
// Objetivos: editar depósito/retirada
// ─────────────────────────────────────────────
describe("objetivos: editar depósito ou retirada", () => {
  it("sem transferência: muda valor, data e observação; guardado recalcula; retirada acima do disponível é 400", async () => {
    const f = await familiaLogada(app);
    const g = await criarObjetivo(f.agent, { initialAmount: "100.00" });
    const dep = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "200.00", notes: "Salário" });
    const ret = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "WITHDRAWAL", amount: "50.00" });
    expect(ret.body.goal.progress.saved).toBe("250.00");
    const antes = await saldo(f.agent, f.carteiraId);

    const ed = await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "300.00", date: ontem(), notes: "13º" });
    expect(ed.status, JSON.stringify(ed.body)).toBe(200);
    expect(ed.body.progress.saved).toBe("350.00");
    const e1 = await prisma.goalEntry.findUniqueOrThrow({ where: { id: dep.body.entry.id } });
    expect(e1).toMatchObject({ kind: "DEPOSIT", notes: "13º", transactionId: null });
    expect(e1.amount.toFixed(2)).toBe("300.00");
    expect(diaLocal(e1.date)).toBe(ontem());

    // Sem notes no corpo: mantém; null: limpa
    await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "300.00", date: ontem() });
    expect((await prisma.goalEntry.findUniqueOrThrow({ where: { id: dep.body.entry.id } })).notes).toBe("13º");
    await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "300.00", date: ontem(), notes: null });
    expect((await prisma.goalEntry.findUniqueOrThrow({ where: { id: dep.body.entry.id } })).notes).toBeNull();

    // Retirada: disponível = 100 + 300 = 400 (sem contar ela mesma)
    const demais = await f.agent.put(`/api/goals/${g.id}/entries/${ret.body.entry.id}`).send({ amount: "400.01", date: hoje() });
    expect(demais.status).toBe(400);
    expect(demais.body.detalhes.amount[0]).toMatch(/400,00/);
    const tudo = await f.agent.put(`/api/goals/${g.id}/entries/${ret.body.entry.id}`).send({ amount: "400.00", date: hoje() });
    expect(tudo.status).toBe(200);
    expect(tudo.body.progress.saved).toBe("0.00");

    // Depósito que deixaria negativo (já há retirada de 400) é 400
    const neg = await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "299.99", date: hoje() });
    expect(neg.status).toBe(400);
    expect(neg.body.detalhes.amount).toBeTruthy();

    // Validação e ids errados
    expect((await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "0", date: hoje() })).status).toBe(400);
    expect((await f.agent.put(`/api/goals/${g.id}/entries/nao-existe`).send({ amount: "1", date: hoje() })).status).toBe(404);
    const outro = await criarObjetivo(f.agent, { name: "Outro" });
    expect((await f.agent.put(`/api/goals/${outro.id}/entries/${dep.body.entry.id}`).send({ amount: "1", date: hoje() })).status).toBe(404);

    // Só controle: nenhum lançamento, saldos iguais
    expect(await prisma.transaction.count({ where: { householdId: f.householdId, type: "TRANSFER" } })).toBe(0);
    expect(await saldo(f.agent, f.carteiraId)).toBe(antes);
  });

  it("com transferência: valor, saldos e situação acompanham a data", async () => {
    const f = await familiaLogada(app);
    const banco = await criarConta(f.agent, { name: "Banco", initialBalance: "1000.00" });
    const invest = await criarConta(f.agent, { name: "Corretora", type: "INVESTMENT", initialBalance: "0" });
    const g = await criarObjetivo(f.agent, { accountId: invest });

    const dep = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "300.00", transfer: true, accountId: banco, notes: "Aporte" });
    expect(dep.status, JSON.stringify(dep.body)).toBe(201);
    const tId = dep.body.entry.transactionId as string;
    expect(await saldo(f.agent, banco)).toBe("700.00");

    // Valor novo: transferência e saldos atualizados; observação igual acompanha
    const ed = await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "400.00", date: hoje(), notes: "Aporte maior" });
    expect(ed.status, JSON.stringify(ed.body)).toBe(200);
    expect(ed.body.progress.saved).toBe("400.00");
    let t = await prisma.transaction.findUniqueOrThrow({ where: { id: tId } });
    expect(t).toMatchObject({ status: "CONFIRMED", notes: "Aporte maior", accountId: banco, toAccountId: invest });
    expect(t.amount.toFixed(2)).toBe("400.00");
    expect(await saldo(f.agent, banco)).toBe("600.00");
    expect(await saldo(f.agent, invest)).toBe("400.00");

    // Observação da transferência editada à parte não é sobrescrita
    await prisma.transaction.update({ where: { id: tId }, data: { notes: "Minha nota" } });
    await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "400.00", date: hoje(), notes: "Outra" });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tId } })).notes).toBe("Minha nota");

    // Data futura: transferência fica pendente (sai dos saldos)
    const fut = await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "400.00", date: amanha() });
    expect(fut.status).toBe(200);
    t = await prisma.transaction.findUniqueOrThrow({ where: { id: tId } });
    expect(t.status).toBe("PENDING");
    expect(diaLocal(t.date)).toBe(amanha());
    expect(await saldo(f.agent, banco)).toBe("1000.00");
    expect(await saldo(f.agent, invest)).toBe("0.00");

    // Voltou para hoje: estava pendente só por ser futura → efetiva
    await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "400.00", date: hoje() });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tId } })).status).toBe("CONFIRMED");
    expect(await saldo(f.agent, banco)).toBe("600.00");

    // Pendente de propósito (data passada): continua pendente ao editar
    await prisma.transaction.update({ where: { id: tId }, data: { status: "PENDING" } });
    await f.agent.put(`/api/goals/${g.id}/entries/${dep.body.entry.id}`).send({ amount: "350.00", date: ontem() });
    t = await prisma.transaction.findUniqueOrThrow({ where: { id: tId } });
    expect(t.status).toBe("PENDING");
    expect(t.amount.toFixed(2)).toBe("350.00");
    expect(diaLocal(t.date)).toBe(ontem());

    // Retirada com transferência acima do disponível: 400 e nada muda
    await prisma.transaction.update({ where: { id: tId }, data: { status: "CONFIRMED" } });
    const ret = await f.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "WITHDRAWAL", amount: "50.00", transfer: true, accountId: banco });
    expect(ret.status).toBe(201);
    const demais = await f.agent.put(`/api/goals/${g.id}/entries/${ret.body.entry.id}`).send({ amount: "350.01", date: hoje() });
    expect(demais.status).toBe(400);
    const tRet = await prisma.transaction.findUniqueOrThrow({ where: { id: ret.body.entry.transactionId } });
    expect(tRet.amount.toFixed(2)).toBe("50.00");
    expect(await saldo(f.agent, banco)).toBe("700.00"); // 1000 − 350 + 50
    expect(await saldo(f.agent, invest)).toBe("300.00");
  });

  it("VIEWER não edita (403) e outro espaço não acha (404)", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const g = await criarObjetivo(dono.agent);
    await dono.agent.post(`/api/goals/${g.id}/entries`).send({ kind: "DEPOSIT", amount: "10" });
    const id = await entradaId(dono.agent, g.id, "DEPOSIT");

    const outro = await familiaLogada(app, "Bruno Costa");
    expect((await outro.agent.put(`/api/goals/${g.id}/entries/${id}`).send({ amount: "1", date: hoje() })).status).toBe(404);

    const leitor = await familiaLogada(app, "Leitor");
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect(conv.status).toBe(201);
    expect((await leitor.agent.post(`/api/invites/${conv.body.url.split("/convite/")[1]}/accept`)).status).toBe(200);
    await leitor.agent.post(`/api/households/${dono.householdId}/activate`);
    expect((await leitor.agent.put(`/api/goals/${g.id}/entries/${id}`).send({ amount: "1", date: hoje() })).status).toBe(403);
    expect((await prisma.goalEntry.findUniqueOrThrow({ where: { id } })).amount.toFixed(2)).toBe("10.00");
  });
});

// ─────────────────────────────────────────────
// Orçamentos: arquivados e desarquivar
// ─────────────────────────────────────────────
describe("orçamentos: arquivados e desarquivar", () => {
  it("lista os arquivados (mais recente primeiro) com o último mês e a contagem na lista", async () => {
    const f = await familiaLogada(app);
    const a = await criarOrcamento(f.agent, { name: "A", amount: "100" });
    const b = await criarOrcamento(f.agent, { name: "B", amount: "200" });
    const r = await criarOrcamento(f.agent, { kind: "INCOME", name: "Renda", amount: "300" });
    await criarOrcamento(f.agent, { name: "Ativo", amount: "50" });
    await f.agent.post(`/api/budgets/${a}/archive`).send({ fromMonth: "2026-10" });
    await f.agent.post(`/api/budgets/${b}/archive`).send({ fromMonth: "2026-12" });
    await f.agent.post(`/api/budgets/${r}/archive`).send({ fromMonth: "2026-09" });

    const arq = await f.agent.get("/api/budgets/archived");
    expect(arq.status, JSON.stringify(arq.body)).toBe(200);
    expect(arq.body.budgets.map((x: { name: string }) => x.name)).toEqual(["B", "A", "Renda"]);
    expect(arq.body.budgets.map((x: { lastMonth: string }) => x.lastMonth)).toEqual(["2026-11", "2026-09", "2026-08"]);
    expect(arq.body.budgets[1]).toMatchObject({ archivedFromMonth: "2026-10", usedBy: [] });
    expect(arq.body.budgets[1].progress.goal).toBe("100.00");

    expect((await f.agent.get(`/api/budgets?month=${MES}&kind=EXPENSE`)).body.archivedCount).toBe(2);
    expect((await f.agent.get(`/api/budgets?month=${MES}&kind=INCOME`)).body.archivedCount).toBe(1);

    // Outro espaço não vê
    const outro = await familiaLogada(app);
    expect((await outro.agent.get("/api/budgets/archived")).body.budgets).toHaveLength(0);
  });

  it("desarquivar no mês do arquivamento volta sem pausa", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "100" });
    await f.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-10" });
    expect(await progresso(f.agent, id, "2026-10")).toBeUndefined();

    const des = await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-10" });
    expect(des.status, JSON.stringify(des.body)).toBe(200);
    expect(des.body).toMatchObject({ archivedFromMonth: null, pausedMonths: [] });
    expect(des.body.progress.goal).toBe("100.00");
    for (const m of ["2026-09", "2026-10", "2026-11"]) expect(await progresso(f.agent, id, m)).toBeDefined();
    expect((await f.agent.get("/api/budgets/archived")).body.budgets).toHaveLength(0);

    // Não arquivado → 400
    expect((await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-10" })).status).toBe(400);
  });

  it("desarquivar mais adiante pausa os meses do meio (fora da lista, do histórico e do resumo)", async () => {
    const f = await familiaLogada(app);
    const id = await criarOrcamento(f.agent, { amount: "100" });
    await f.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-10" });

    // Antes do arquivamento: 400
    const cedo = await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-09" });
    expect(cedo.status).toBe(400);
    expect(cedo.body.detalhes.fromMonth).toBeTruthy();
    expect((await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-13" })).status).toBe(400);

    const des = await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-12" });
    expect(des.status, JSON.stringify(des.body)).toBe(200);
    expect(des.body).toMatchObject({ archivedFromMonth: null, pausedMonths: ["2026-10", "2026-11"] });
    expect(await progresso(f.agent, id, "2026-09")).toBeDefined();
    expect(await progresso(f.agent, id, "2026-10")).toBeUndefined();
    expect(await progresso(f.agent, id, "2026-11")).toBeUndefined();
    expect((await progresso(f.agent, id, "2026-12"))!.goal).toBe("100.00");
    expect((await f.agent.get(`/api/budgets?month=2026-11&kind=EXPENSE`)).body.summary.goal).toBe("0.00");

    const det = await f.agent.get(`/api/budgets/${id}?month=2026-12`);
    expect(det.body.history.map((h: { month: string; active: boolean }) => `${h.month}:${h.active}`)).toEqual([
      "2026-07:false", "2026-08:true", "2026-09:true", "2026-10:false", "2026-11:false", "2026-12:true",
    ]);

    // Arquivar de novo: o último mês pula os pausados; pausas antigas se mantêm ao desarquivar outra vez
    await f.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-12" });
    const arq = await f.agent.get("/api/budgets/archived");
    expect(arq.body.budgets[0].lastMonth).toBe("2026-09");
    const de2 = await f.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2027-01" });
    expect(de2.body.pausedMonths).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("VIEWER não desarquiva", async () => {
    const dono = await familiaLogada(app, "Robson Martins");
    const id = await criarOrcamento(dono.agent, { amount: "100" });
    await dono.agent.post(`/api/budgets/${id}/archive`).send({ fromMonth: "2026-10" });
    const leitor = await familiaLogada(app, "Leitor");
    const conv = await dono.agent.post("/api/family/invites").set("Origin", ORIGIN).send({ role: "VIEWER" });
    expect((await leitor.agent.post(`/api/invites/${conv.body.url.split("/convite/")[1]}/accept`)).status).toBe(200);
    await leitor.agent.post(`/api/households/${dono.householdId}/activate`);
    expect((await leitor.agent.get("/api/budgets/archived")).body.budgets).toHaveLength(1);
    expect((await leitor.agent.post(`/api/budgets/${id}/unarchive`).send({ fromMonth: "2026-10" })).status).toBe(403);
  });
});

// ─────────────────────────────────────────────
// Orçamentos: parte do lançamento multicategoria
// ─────────────────────────────────────────────
describe("orçamentos: budgetAmount nos detalhes", () => {
  it("multicategoria conta só a parte da categoria; soma bate com o progresso; agrupado soma as partes", async () => {
    const f = await familiaLogada(app);
    const mercado = f.categoria("Mercado");
    const lazer = f.categoria("Lazer");
    const multi = await lancar(f.agent, {
      amount: "100", accountId: f.carteiraId, description: "Compra mista",
      splits: [{ categoryId: mercado, amount: "70" }, { categoryId: lazer, amount: "30" }],
    });
    const simples = await lancar(f.agent, { amount: "25.50", accountId: f.carteiraId, categoryId: lazer });
    await lancar(f.agent, { amount: "40", accountId: f.carteiraId, categoryId: f.categoria("Transporte") });

    const bLazer = await criarOrcamento(f.agent, { name: "Lazer", amount: "500", categoryIds: [lazer] });
    const bMercado = await criarOrcamento(f.agent, { name: "Mercado", amount: "500", categoryIds: [mercado] });
    const semFiltro = await criarOrcamento(f.agent, { name: "Tudo", amount: "500" });
    const grupo = await criarOrcamento(f.agent, { name: "Grupo", isGroup: true, componentIds: [bLazer, bMercado] });

    type L = { id: string; amount: string; budgetAmount: string; partial: boolean };
    const detalhes = async (id: string) => {
      const det = await f.agent.get(`/api/budgets/${id}?month=${MES}`);
      expect(det.status).toBe(200);
      const lista = det.body.transactions as L[];
      const soma = lista.reduce((s, t) => s + Math.round(Number(t.budgetAmount) * 100), 0) / 100;
      return { lista, soma: soma.toFixed(2), used: det.body.budget.progress.used as string };
    };

    const dl = await detalhes(bLazer);
    expect(dl.used).toBe("55.50");
    expect(dl.soma).toBe(dl.used);
    expect(dl.lista.find((t) => t.id === multi.id)).toMatchObject({ amount: "100.00", budgetAmount: "30.00", partial: true });
    expect(dl.lista.find((t) => t.id === simples.id)).toMatchObject({ amount: "25.50", budgetAmount: "25.50", partial: false });

    const dm = await detalhes(bMercado);
    expect(dm.used).toBe("70.00");
    expect(dm.soma).toBe(dm.used);
    expect(dm.lista).toHaveLength(1);
    expect(dm.lista[0]).toMatchObject({ budgetAmount: "70.00", partial: true });

    const dt = await detalhes(semFiltro);
    expect(dt.used).toBe("165.50");
    expect(dt.soma).toBe(dt.used);
    expect(dt.lista.every((t) => !t.partial && t.budgetAmount === t.amount)).toBe(true);

    const dg = await detalhes(grupo);
    expect(dg.used).toBe("125.50");
    expect(dg.soma).toBe(dg.used);
    expect(dg.lista.find((t) => t.id === multi.id)).toMatchObject({ budgetAmount: "100.00", partial: false });
  });
});

// ─────────────────────────────────────────────
// Anexos: arquivos somem do disco ao apagar conta ou espaço; HEIC baixa
// ─────────────────────────────────────────────
describe("anexos: limpeza do disco e HEIC", () => {
  it("apagar conta remove os arquivos dos lançamentos dela (inclusive transferências), e só esses", async () => {
    const f = await familiaLogada(app);
    const banco = await criarConta(f.agent, { name: "Banco", initialBalance: "500" });
    const despesa = await lancar(f.agent, { amount: "10", accountId: banco });
    const transf = await lancar(f.agent, { type: "TRANSFER", amount: "20", accountId: f.carteiraId, toAccountId: banco });
    const fica = await lancar(f.agent, { amount: "5", accountId: f.carteiraId });

    const a1 = await anexar(f.agent, despesa.id);
    const a2 = await anexar(f.agent, transf.id);
    const a3 = await anexar(f.agent, fica.id);
    for (const a of [a1, a2, a3]) expect(fs.existsSync(a.arquivo)).toBe(true);

    expect((await f.agent.delete(`/api/accounts/${banco}`)).status).toBe(204);
    expect(fs.existsSync(a1.arquivo)).toBe(false);
    expect(fs.existsSync(a2.arquivo)).toBe(false);
    expect(fs.existsSync(a3.arquivo)).toBe(true);
    expect(await prisma.transactionAttachment.count({ where: { id: { in: [a1.id, a2.id] } } })).toBe(0);
    expect((await f.agent.get(`/api/attachments/${a3.id}`)).status).toBe(200);
  });

  it("apagar o espaço remove os arquivos de todos os lançamentos dele", async () => {
    const f = await familiaLogada(app);
    const pessoal = await lancar(f.agent, { amount: "3", accountId: f.carteiraId });
    const aPessoal = await anexar(f.agent, pessoal.id);

    const novo = await f.agent.post("/api/households").set("Origin", ORIGIN).send({ name: "Família Martins" });
    expect(novo.status).toBe(201);
    const carteira = (await f.agent.get("/api/accounts")).body[0].id as string;
    const t1 = await lancar(f.agent, { amount: "10", accountId: carteira });
    const t2 = await lancar(f.agent, { type: "INCOME", amount: "15", accountId: carteira });
    const a1 = await anexar(f.agent, t1.id);
    const a2 = await anexar(f.agent, t1.id);
    const a3 = await anexar(f.agent, t2.id);

    expect((await f.agent.delete("/api/family")).status).toBe(204);
    for (const a of [a1, a2, a3]) expect(fs.existsSync(a.arquivo)).toBe(false);
    expect(fs.existsSync(aPessoal.arquivo)).toBe(true);
    expect(await prisma.transactionAttachment.count({ where: { id: { in: [a1.id, a2.id, a3.id] } } })).toBe(0);
  });

  it("anexo HEIC sempre vem como download; PNG abre na tela", async () => {
    const f = await familiaLogada(app);
    const t = await lancar(f.agent, { amount: "10", accountId: f.carteiraId });
    const heic = await anexar(f.agent, t.id, HEIC, "image/heic", "Foto do iPhone.heic");
    const png = await anexar(f.agent, t.id);

    const r = await f.agent.get(`/api/attachments/${heic.id}`);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("image/heic");
    expect(r.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(r.headers["content-disposition"]).toContain(encodeURIComponent("Foto do iPhone.heic"));

    const p = await f.agent.get(`/api/attachments/${png.id}`);
    expect(p.headers["content-disposition"]).toMatch(/^inline;/);
    expect((await f.agent.get(`/api/attachments/${png.id}?download=1`)).headers["content-disposition"]).toMatch(/^attachment;/);
  });
});
