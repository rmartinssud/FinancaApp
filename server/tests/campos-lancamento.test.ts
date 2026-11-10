import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { efetivarVencidos } from "../src/services/autoEfetivar.js";
import { familiaLogada, usuarioLogado } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const MES = "2026-07"; // mês fixo dos testes (passado)

async function lancar(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Teste", date: `${MES}-10`, status: "CONFIRMED", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function sub(agent: Agent, parentId: string, name = "Feira") {
  const r = await agent.post("/api/categories").send({ name, type: "EXPENSE", color: "#22c55e", icon: "cart", parentId });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}

const resumo = async (agent: Agent, mes = MES) => (await agent.get(`/api/summary?month=${mes}`)).body;
const totalDaCategoria = (r: { byCategory: { categoryId: string | null; total: string }[] }, id: string | null) =>
  r.byCategory.find((c) => c.categoryId === id)?.total;

describe("subcategorias", () => {
  it("cria subcategoria, valida um nível e o tipo, agrega na pai no resumo, histórico e orçamento", async () => {
    const f = await familiaLogada(app);
    const mercado = f.categoria("Mercado");
    const feira = await sub(f.agent, mercado);

    // Um nível só, mesmo tipo
    expect((await f.agent.post("/api/categories").send({ name: "X", type: "EXPENSE", color: "#000000", icon: "x", parentId: feira })).status).toBe(400);
    expect((await f.agent.post("/api/categories").send({ name: "X", type: "INCOME", color: "#000000", icon: "x", parentId: mercado })).status).toBe(400);
    expect((await f.agent.patch(`/api/categories/${mercado}`).send({ parentId: f.categoria("Lazer") })).status).toBe(400); // tem filhas
    const cats = (await f.agent.get("/api/categories")).body;
    expect(cats.find((c: { id: string }) => c.id === feira).parentId).toBe(mercado);

    await lancar(f.agent, { amount: "30", accountId: f.carteiraId, categoryId: feira });
    await lancar(f.agent, { amount: "20", accountId: f.carteiraId, categoryId: mercado });
    const t = await lancar(f.agent, { amount: "5", accountId: f.carteiraId, categoryId: feira });
    expect(t.category).toMatchObject({ id: feira, parentId: mercado, parent: { id: mercado } });

    const r = await resumo(f.agent);
    expect(totalDaCategoria(r, mercado)).toBe("55.00");
    expect(totalDaCategoria(r, feira)).toBeUndefined();

    const h = await f.agent.get(`/api/summary/category-history?categoryId=${mercado}&month=${MES}&months=1`);
    expect(h.body.months[0].total).toBe("55.00");

    // Orçamento da pai conta as filhas
    const b = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Mercado", color: "#ef4444", icon: "cart", startMonth: MES, amount: "100", categoryIds: [mercado] });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    const lista = await f.agent.get(`/api/budgets?month=${MES}&kind=EXPENSE`);
    expect(lista.body.budgets.find((x: { id: string }) => x.id === b.body.id).progress.used).toBe("55.00");

    // Filtro de Lançamentos pela pai traz as filhas
    const l = await f.agent.get(`/api/transactions?month=${MES}&categoryId=${mercado}`);
    expect(l.body).toHaveLength(3);
  });
});

describe("multicategorias", () => {
  it("valida a soma no servidor e agrega pelas partes no resumo, orçamento e estatísticas", async () => {
    const f = await familiaLogada(app);
    const mercado = f.categoria("Mercado");
    const lazer = f.categoria("Lazer");

    const ruim = await f.agent.post("/api/transactions").send({
      type: "EXPENSE", description: "Compra", date: `${MES}-10`, amount: "100", accountId: f.carteiraId,
      splits: [{ categoryId: mercado, amount: "60" }, { categoryId: lazer, amount: "30" }],
    });
    expect(ruim.status).toBe(400);
    expect(ruim.body.detalhes.splits[0]).toMatch(/soma/);

    // Uma categoria só não é divisão; tipo errado; categoria repetida
    const uma = await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "x", date: `${MES}-10`, amount: "10", accountId: f.carteiraId, splits: [{ categoryId: mercado, amount: "10" }] });
    expect(uma.status).toBe(400);
    const tipo = await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "x", date: `${MES}-10`, amount: "10", accountId: f.carteiraId, splits: [{ categoryId: mercado, amount: "5" }, { categoryId: f.categoria("Salário"), amount: "5" }] });
    expect(tipo.status).toBe(400);

    const t = await lancar(f.agent, {
      amount: "100", accountId: f.carteiraId, categoryId: mercado,
      splits: [{ categoryId: mercado, amount: "70" }, { categoryId: lazer, amount: "30" }],
    });
    expect(t.category).toBeNull();
    expect(t.splits).toHaveLength(2);

    const r = await resumo(f.agent);
    expect(r.totals.expense).toBe("100.00");
    expect(totalDaCategoria(r, mercado)).toBe("70.00");
    expect(totalDaCategoria(r, lazer)).toBe("30.00");

    const b = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Lazer", color: "#ef4444", icon: "smile", startMonth: MES, amount: "100", categoryIds: [lazer] });
    const lista = await f.agent.get(`/api/budgets?month=${MES}&kind=EXPENSE`);
    expect(lista.body.budgets.find((x: { id: string }) => x.id === b.body.id).progress.used).toBe("30.00");

    const s = await f.agent.get(`/api/stats?from=${MES}&to=${MES}&type=EXPENSE`);
    expect(s.body.total).toBe("100.00");
    expect(s.body.byCategory.map((c: { total: string }) => c.total)).toEqual(["70.00", "30.00"]);

    // Edição: mudar o valor sem mudar a divisão não bate → 400; trocando a divisão junto, ok
    expect((await f.agent.patch(`/api/transactions/${t.id}`).send({ amount: "120" })).status).toBe(400);
    const ok = await f.agent.patch(`/api/transactions/${t.id}`).send({ amount: "120", splits: [{ categoryId: mercado, amount: "90" }, { categoryId: lazer, amount: "30" }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.splits.map((x: { amount: string }) => x.amount)).toEqual(["90.00", "30.00"]);
    // Desligar a multicategoria
    const um = await f.agent.patch(`/api/transactions/${t.id}`).send({ splits: null, categoryId: lazer });
    expect(um.body.splits).toHaveLength(0);
    expect(um.body.category.id).toBe(lazer);
  });
});

describe("encargos e desconto", () => {
  it("o valor efetivo (valor + encargos − desconto) conta no saldo, resumo e orçamento", async () => {
    const f = await familiaLogada(app);
    const t = await lancar(f.agent, { amount: "100", fees: "12.50", discount: "2.50", accountId: f.carteiraId, categoryId: f.categoria("Contas") });
    expect(t).toMatchObject({ amount: "110.00", baseAmount: "100.00", fees: "12.50", discount: "2.50" });

    const r = await resumo(f.agent);
    expect(r.totals.expense).toBe("110.00");
    const carteira = r.accounts.find((c: { id: string }) => c.id === f.carteiraId);
    expect(carteira.currentBalance).toBe("-110.00");

    // Desconto maior que o valor
    const ruim = await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "x", date: `${MES}-10`, amount: "10", discount: "10", accountId: f.carteiraId });
    expect(ruim.status).toBe(400);

    // Editar só o desconto recalcula a partir do valor digitado
    const e = await f.agent.patch(`/api/transactions/${t.id}`).send({ discount: null });
    expect(e.body).toMatchObject({ amount: "112.50", baseAmount: "100.00", discount: null });
  });
});

describe("campos informativos, tags e flags de ignorar", () => {
  it("data de lançamento, tags (criar, filtrar, renomear, apagar) e as quatro flags", async () => {
    const f = await familiaLogada(app);
    const tag = await f.agent.post("/api/tags").send({ name: "Viagem", color: "#0ea5e9" });
    expect(tag.status).toBe(201);
    expect((await f.agent.post("/api/tags").send({ name: "Viagem" })).status).toBe(409);

    const a = await lancar(f.agent, { amount: "40", accountId: f.carteiraId, categoryId: f.categoria("Lazer"), launchDate: `${MES}-02`, tagIds: [tag.body.id] });
    expect(a.launchDate.slice(0, 10)).toBe(`${MES}-02`);
    expect(a.tags).toEqual([{ id: tag.body.id, name: "Viagem", color: "#0ea5e9" }]);
    await lancar(f.agent, { amount: "10", accountId: f.carteiraId, categoryId: f.categoria("Lazer") });

    const filtrado = await f.agent.get(`/api/transactions?month=${MES}&tagId=${tag.body.id}`);
    expect(filtrado.body.map((x: { id: string }) => x.id)).toEqual([a.id]);

    const s = await f.agent.get(`/api/stats?from=${MES}&to=${MES}&type=EXPENSE`);
    expect(s.body.byTag).toEqual(expect.arrayContaining([expect.objectContaining({ tagId: tag.body.id, total: "40.00" }), expect.objectContaining({ tagId: null, total: "10.00" })]));

    expect((await f.agent.patch(`/api/tags/${tag.body.id}`).send({ name: "Férias" })).body.name).toBe("Férias");
    expect((await f.agent.get("/api/tags")).body[0]).toMatchObject({ name: "Férias", usage: 1 });
    expect((await f.agent.delete(`/api/tags/${tag.body.id}`)).status).toBe(204);
    expect((await f.agent.get(`/api/transactions?month=${MES}`)).body.find((x: { id: string }) => x.id === a.id).tags).toEqual([]);

    // Outra família não usa a tag de ninguém
    const outra = await familiaLogada(app);
    const tagOutra = (await outra.agent.post("/api/tags").send({ name: "Dela" })).body.id;
    const intrusa = await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "x", date: `${MES}-10`, amount: "1", accountId: f.carteiraId, tagIds: [tagOutra] });
    expect(intrusa.status).toBe(404);
  });

  it("cada flag tira o lançamento só do seu lugar", async () => {
    const f = await familiaLogada(app);
    const lazer = f.categoria("Lazer");
    const b = await f.agent.post("/api/budgets").send({ kind: "EXPENSE", name: "Lazer", color: "#ef4444", icon: "smile", startMonth: MES, amount: "1000", categoryIds: [lazer] });
    await lancar(f.agent, { type: "INCOME", amount: "1000", accountId: f.carteiraId, categoryId: f.categoria("Salário") });
    await lancar(f.agent, { amount: "100", accountId: f.carteiraId, categoryId: lazer }); // conta em tudo
    await lancar(f.agent, { amount: "1", accountId: f.carteiraId, categoryId: lazer, ignoreInStatistics: true });
    await lancar(f.agent, { amount: "2", accountId: f.carteiraId, categoryId: lazer, ignoreInBudgets: true });
    await lancar(f.agent, { amount: "4", accountId: f.carteiraId, categoryId: lazer, ignoreInMonthlySavings: true });
    await lancar(f.agent, { amount: "8", accountId: f.carteiraId, categoryId: lazer, ignoreInTotals: true });

    const r = await resumo(f.agent);
    expect(r.totals.expense).toBe("107.00"); // sem o de 8 (ignorar nos totais)
    expect(totalDaCategoria(r, lazer)).toBe("114.00"); // sem o de 1 (ignorar em estatísticas)
    // Saldo da conta continua real (todos contam)
    expect(r.accounts.find((c: { id: string }) => c.id === f.carteiraId).currentBalance).toBe("885.00");

    const orc = await f.agent.get(`/api/budgets?month=${MES}&kind=EXPENSE`);
    expect(orc.body.budgets.find((x: { id: string }) => x.id === b.body.id).progress.used).toBe("113.00"); // sem o de 2

    const s = await f.agent.get(`/api/stats?from=${MES}&to=${MES}&type=EXPENSE`);
    expect(s.body.total).toBe("114.00");
    const ev = await f.agent.get(`/api/stats/evolution?month=${MES}&months=1`);
    expect(ev.body.months[0]).toMatchObject({ income: "1000.00", expense: "114.00", balance: "886.00" });

    const e = await f.agent.get(`/api/savings?month=${MES}&months=1`);
    expect(e.body.months[0]).toMatchObject({ income: "1000.00", expense: "111.00", savings: "889.00", percent: 88.9 }); // sem o de 4
  });
});

describe("efetivação automática", () => {
  it("efetiva pendentes vencidos, respeita o toggle e não mexe em cartão, transferência nem antigos", async () => {
    const f = await familiaLogada(app);
    const venceu = await lancar(f.agent, { amount: "10", accountId: f.carteiraId, status: "PENDING" });
    const travado = await lancar(f.agent, { amount: "11", accountId: f.carteiraId, status: "PENDING", noAutoConfirm: true });
    const futuro = await lancar(f.agent, { amount: "12", accountId: f.carteiraId, status: "PENDING", date: "2099-01-10" });
    const banco = (await f.agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "0" })).body;
    const transf = await lancar(f.agent, { type: "TRANSFER", amount: "5", accountId: f.carteiraId, toAccountId: banco.id, status: "PENDING" });
    const cartao = (await f.agent.post("/api/cards").send({ name: "Nu", brand: "MASTERCARD", creditLimit: "1000", closingDay: 3, dueDay: 10, color: "#8a05be" })).body.id;
    const compra = await f.agent.post("/api/card-expenses").send({ cardId: cartao, amount: "7", description: "x", date: `${MES}-05` });
    expect(compra.status).toBe(201);
    await prisma.transaction.updateMany({ where: { purchaseId: compra.body.purchaseId }, data: { status: "PENDING" } });
    // "Antigo": pendente de antes da migração (a migração marcou noAutoConfirm = true)
    const antigo = await lancar(f.agent, { amount: "13", accountId: f.carteiraId, status: "PENDING" });
    await prisma.transaction.update({ where: { id: antigo.id }, data: { noAutoConfirm: true } });

    // Repetição: o toggle vale para todas as entradas
    const fixa = await f.agent.post("/api/transactions").send({ type: "EXPENSE", description: "Aluguel", date: `${MES}-10`, amount: "100", accountId: f.carteiraId, status: "PENDING", recurrence: "FIXED", noAutoConfirm: true });
    expect(fixa.body.group.every((g: { noAutoConfirm: boolean }) => g.noAutoConfirm)).toBe(true);

    await efetivarVencidos();
    await efetivarVencidos(); // idempotente

    const st = async (id: string) => (await prisma.transaction.findUniqueOrThrow({ where: { id } })).status;
    expect(await st(venceu.id)).toBe("CONFIRMED");
    expect(await st(travado.id)).toBe("PENDING");
    expect(await st(futuro.id)).toBe("PENDING");
    expect(await st(transf.id)).toBe("PENDING");
    expect(await st(antigo.id)).toBe("PENDING");
    expect(await st(fixa.body.id)).toBe("PENDING");
    const parcelas = await prisma.transaction.findMany({ where: { purchaseId: compra.body.purchaseId } });
    expect(parcelas.every((p) => p.status === "PENDING")).toBe(true);
  });
});

// PNG mínimo (assinatura + lixo) e um "PDF"
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const PDF = Buffer.from("%PDF-1.4\n%fake\n");

describe("anexos", () => {
  it("envia foto/PDF, limita 3 MB e o tipo, baixa só no espaço e apaga junto com o lançamento", async () => {
    const f = await familiaLogada(app);
    const t = await lancar(f.agent, { amount: "10", accountId: f.carteiraId });

    const up = await f.agent.post(`/api/transactions/${t.id}/attachments`).set("Content-Type", "image/png").set("X-File-Name", encodeURIComponent("Nota fiscal.png")).send(PNG);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({ originalName: "Nota fiscal.png", mime: "image/png", size: PNG.length });
    const pdf = await f.agent.post(`/api/transactions/${t.id}/attachments`).set("Content-Type", "application/pdf").send(PDF);
    expect(pdf.body.mime).toBe("application/pdf");

    // Tipo não aceito (mesmo dizendo que é PNG)
    const exe = await f.agent.post(`/api/transactions/${t.id}/attachments`).set("Content-Type", "image/png").send(Buffer.from("MZ executável"));
    expect(exe.status).toBe(400);
    expect(exe.body.error).toMatch(/Tipo de arquivo/);
    // Grande demais
    const grande = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]);
    const g = await f.agent.post(`/api/transactions/${t.id}/attachments`).set("Content-Type", "application/pdf").send(grande);
    expect(g.status).toBe(413);
    expect(g.body.error).toMatch(/3 MB/);

    const baixa = await f.agent.get(`/api/attachments/${up.body.id}`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => cb(null, Buffer.concat(partes)));
    });
    expect(baixa.status).toBe(200);
    expect(baixa.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(baixa.body as Buffer, PNG)).toBe(0);

    const lista = (await f.agent.get(`/api/transactions?month=${MES}`)).body.find((x: { id: string }) => x.id === t.id);
    expect(lista.attachments).toHaveLength(2);

    // Outra família não baixa nem envia
    const outra = await familiaLogada(app);
    expect((await outra.agent.get(`/api/attachments/${up.body.id}`)).status).toBe(404);
    expect((await outra.agent.post(`/api/transactions/${t.id}/attachments`).set("Content-Type", "image/png").send(PNG)).status).toBe(404);

    // VIEWER baixa, mas não envia nem apaga
    const leitor = await usuarioLogado(app, "Leitor");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: leitor.email } });
    await prisma.householdMember.create({ data: { householdId: f.householdId, userId: user.id, role: "VIEWER" } });
    const h = { "X-Household-Id": f.householdId };
    expect((await leitor.agent.get(`/api/attachments/${up.body.id}`).set(h)).status).toBe(200);
    expect((await leitor.agent.post(`/api/transactions/${t.id}/attachments`).set(h).set("Content-Type", "image/png").send(PNG)).status).toBe(403);
    expect((await leitor.agent.delete(`/api/attachments/${up.body.id}`).set(h)).status).toBe(403);
    expect((await leitor.agent.post("/api/tags").set(h).send({ name: "x" })).status).toBe(403);

    // Apagar o lançamento apaga os anexos (banco e disco)
    const chaves = (await prisma.transactionAttachment.findMany({ where: { transactionId: t.id } })).map((a) => a.storageKey);
    expect((await f.agent.delete(`/api/transactions/${t.id}`)).status).toBe(204);
    expect(await prisma.transactionAttachment.count({ where: { transactionId: t.id } })).toBe(0);
    const fs = await import("node:fs");
    for (const c of chaves) expect(fs.existsSync(`${process.env.UPLOADS_DIR}/${c}`)).toBe(false);
  });
});

describe("estatísticas e economia mensal", () => {
  it("estatísticas: por categoria, subcategoria, conta, pendentes opcionais, sem transferências e ajustes", async () => {
    const f = await familiaLogada(app);
    const mercado = f.categoria("Mercado");
    const feira = await sub(f.agent, mercado);
    const banco = (await f.agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "500" })).body;
    await lancar(f.agent, { amount: "30", accountId: f.carteiraId, categoryId: feira });
    await lancar(f.agent, { amount: "20", accountId: banco.id, categoryId: mercado });
    await lancar(f.agent, { amount: "15", accountId: banco.id, categoryId: f.categoria("Lazer"), status: "PENDING", noAutoConfirm: true });
    await lancar(f.agent, { type: "TRANSFER", amount: "50", accountId: banco.id, toAccountId: f.carteiraId });
    await f.agent.post(`/api/accounts/${banco.id}/adjust`).send({ balance: "100" });
    const cartao = (await f.agent.post("/api/cards").send({ name: "Nu", brand: "MASTERCARD", creditLimit: "1000", closingDay: 3, dueDay: 10, color: "#8a05be" })).body.id;
    // Compra em 20/06 com fechamento dia 3 → fatura de julho (vencimento 10/07)
    await f.agent.post("/api/card-expenses").send({ cardId: cartao, amount: "25", description: "x", date: "2026-06-20", categoryId: mercado });

    const s = await f.agent.get(`/api/stats?from=${MES}&to=${MES}&type=EXPENSE&categoryId=${mercado}`);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.total).toBe("75.00");
    expect(s.body.byCategory).toHaveLength(1);
    expect(s.body.byCategory[0]).toMatchObject({ categoryId: mercado, total: "75.00", hasChildren: true });
    expect(s.body.bySubcategory).toEqual([
      expect.objectContaining({ categoryId: mercado, total: "45.00" }),
      expect.objectContaining({ categoryId: feira, total: "30.00" }),
    ]);
    expect(s.body.byAccount.map((a: { name: string; total: string }) => [a.name, a.total])).toEqual([
      ["Carteira", "30.00"],
      ["Nu", "25.00"],
      ["Banco", "20.00"],
    ]);

    const comPendentes = await f.agent.get(`/api/stats?from=${MES}&to=${MES}&type=EXPENSE&includePending=true`);
    expect(comPendentes.body.total).toBe("90.00");

    const ev = await f.agent.get(`/api/stats/evolution?month=${MES}&months=3`);
    expect(ev.body.months.map((m: { month: string }) => m.month)).toEqual(["2026-05", "2026-06", MES]);
    expect(ev.body.months[2]).toMatchObject({ income: "0.00", expense: "75.00", balance: "-75.00", accumulated: "-75.00" });

    expect((await f.agent.get("/api/stats?from=2026-08&to=2026-07")).status).toBe(400);
  });

  it("economia mensal: valor, %, média, melhor e pior mês; contas ignoradas nos totais ficam de fora", async () => {
    const f = await familiaLogada(app);
    const sal = f.categoria("Salário");
    const ignorada = (await f.agent.post("/api/accounts").send({ name: "Reserva", type: "BANK", initialBalance: "0", ignoreInTotals: true })).body;
    expect(ignorada.ignoreInTotals).toBe(true);
    await lancar(f.agent, { type: "INCOME", amount: "1000", accountId: f.carteiraId, categoryId: sal, date: "2026-05-05" });
    await lancar(f.agent, { amount: "900", accountId: f.carteiraId, date: "2026-05-06" });
    await lancar(f.agent, { type: "INCOME", amount: "2000", accountId: f.carteiraId, categoryId: sal, date: "2026-06-05" });
    await lancar(f.agent, { amount: "500", accountId: f.carteiraId, date: "2026-06-06" });
    await lancar(f.agent, { type: "INCOME", amount: "9999", accountId: ignorada.id, categoryId: sal, date: "2026-06-07" });

    const e = await f.agent.get(`/api/savings?month=${MES}&months=12`);
    expect(e.status).toBe(200);
    expect(e.body.months).toHaveLength(12);
    const porMes = Object.fromEntries(e.body.months.map((m: { month: string }) => [m.month, m]));
    expect(porMes["2026-05"]).toMatchObject({ savings: "100.00", percent: 10 });
    expect(porMes["2026-06"]).toMatchObject({ income: "2000.00", savings: "1500.00", percent: 75 });
    expect(porMes[MES]).toMatchObject({ savings: "0.00", percent: null, hasData: false });
    expect(e.body).toMatchObject({ total: "1600.00", average: "800.00", averagePercent: 53.3 });
    expect(e.body.best.month).toBe("2026-06");
    expect(e.body.worst.month).toBe("2026-05");
  });
});
