import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { familiaLogada, usuarioLogado } from "./helpers.js";

const app = createApp();
type Familia = Awaited<ReturnType<typeof familiaLogada>>;
type Agent = Familia["agent"];

const MES = "2026-07"; // mês fixo (passado)

async function lancar(agent: Agent, d: Record<string, unknown>) {
  const res = await agent.post("/api/transactions").send({ type: "EXPENSE", description: "Teste", date: `${MES}-10`, status: "CONFIRMED", ...d });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function cartao(agent: Agent) {
  const r = await agent.post("/api/cards").send({ name: "Nu", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#8a05be" });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}

async function leitorDe(f: Familia) {
  const leitor = await usuarioLogado(app, "Leitor");
  const user = await prisma.user.findUniqueOrThrow({ where: { email: leitor.email } });
  await prisma.householdMember.create({ data: { householdId: f.householdId, userId: user.id, role: "VIEWER" } });
  return { agent: leitor.agent, h: { "X-Household-Id": f.householdId } };
}

type Grupo = { key: string | null; name: string; total: string; percent: number };
const grupo = (lista: Grupo[], key: string | null) => lista.find((g) => g.key === key);

describe("relatórios", () => {
  it("totais, regras (transferência, ajuste, ignorar nos totais), cartão pelo vencimento e agrupamentos", async () => {
    const f = await familiaLogada(app);
    const mercado = f.categoria("Mercado");
    const lazer = f.categoria("Lazer");
    const feira = (await f.agent.post("/api/categories").send({ name: "Feira", type: "EXPENSE", color: "#22c55e", icon: "cart", parentId: mercado })).body.id;
    const banco = (await f.agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "0" })).body.id;
    const viagem = (await f.agent.post("/api/tags").send({ name: "viagem" })).body.id;

    await lancar(f.agent, { amount: "100", accountId: f.carteiraId, categoryId: mercado, tagIds: [viagem] });
    await lancar(f.agent, { amount: "30", accountId: f.carteiraId, categoryId: feira, date: `${MES}-20`, status: "PENDING" });
    // Multicategorias: 50 em Mercado e 20 em Lazer
    await lancar(f.agent, { amount: "70", accountId: banco, splits: [{ categoryId: mercado, amount: "50" }, { categoryId: lazer, amount: "20" }] });
    await lancar(f.agent, { type: "INCOME", amount: "1000", accountId: banco, description: "Salário", categoryId: null });
    // Nunca entram: transferência, ajuste, "Ignorar nos totais" e fora do período
    await lancar(f.agent, { type: "TRANSFER", amount: "300", accountId: banco, toAccountId: f.carteiraId });
    await prisma.transaction.create({ data: { householdId: f.householdId, accountId: banco, type: "INCOME", amount: "999", description: "Ajuste", date: new Date(`${MES}-05T12:00:00Z`), isAdjustment: true } });
    await lancar(f.agent, { amount: "40", accountId: f.carteiraId, ignoreInTotals: true });
    await lancar(f.agent, { amount: "15", accountId: f.carteiraId, date: "2026-08-01" });

    // Cartão (fecha 3, vence 10): compra em 25/06 → fatura de julho (vence 10/07); compra em 05/07 → fatura de agosto
    const nu = await cartao(f.agent);
    expect((await f.agent.post("/api/card-expenses").send({ cardId: nu, amount: "60", description: "Cinema", date: "2026-06-25", categoryId: lazer })).status).toBe(201);
    expect((await f.agent.post("/api/card-expenses").send({ cardId: nu, amount: "80", description: "Livro", date: `${MES}-05`, categoryId: lazer })).status).toBe(201);

    const r = (await f.agent.get(`/api/reports?month=${MES}`)).body;
    expect(r.from).toBe(`${MES}-01`);
    expect(r.to).toBe(`${MES}-31`);
    expect(r.totals).toMatchObject({ income: "1000.00", expense: "260.00", balance: "740.00", count: 5, pending: 1 });
    const cinema = r.items.find((i: { description: string }) => i.description === "Cinema");
    expect(cinema.reportDate).toBe(`${MES}-10`);
    expect(r.items.some((i: { description: string }) => i.description === "Livro")).toBe(false);

    // Por categoria (subcategoria soma na pai; multicategorias pelas partes)
    expect(grupo(r.groups.expense, mercado)).toMatchObject({ total: "180.00", percent: 69.2 });
    expect(grupo(r.groups.expense, lazer)).toMatchObject({ total: "80.00" });
    expect(grupo(r.groups.income, null)).toMatchObject({ name: "Sem categoria", total: "1000.00", percent: 100 });

    // Por subcategoria
    const sub = (await f.agent.get(`/api/reports?month=${MES}&type=EXPENSE&groupBy=subcategory`)).body;
    expect(grupo(sub.groups.expense, feira)).toMatchObject({ name: "Mercado › Feira", total: "30.00" });
    expect(grupo(sub.groups.expense, mercado)?.total).toBe("150.00");
    expect(sub.groups.income).toEqual([]);

    // Filtro de categoria: só a parte dessas categorias conta (inclui a subcategoria)
    const soMercado = (await f.agent.get(`/api/reports?month=${MES}&categoryIds=${mercado}`)).body;
    expect(soMercado.totals.expense).toBe("180.00");
    expect(soMercado.totals.income).toBe("0.00");
    expect(soMercado.items.find((i: { splits: unknown[] }) => i.splits.length).reportAmount).toBe("50.00");

    // Situação, conta, tag, pessoa
    expect((await f.agent.get(`/api/reports?month=${MES}&status=PENDING`)).body.totals.expense).toBe("30.00");
    expect((await f.agent.get(`/api/reports?month=${MES}&status=CONFIRMED`)).body.totals.expense).toBe("230.00");
    expect((await f.agent.get(`/api/reports?month=${MES}&accountIds=${nu}`)).body.totals.expense).toBe("60.00");
    expect((await f.agent.get(`/api/reports?month=${MES}&tagIds=${viagem}`)).body.totals.expense).toBe("100.00");
    const porTag = (await f.agent.get(`/api/reports?month=${MES}&type=EXPENSE&groupBy=tag`)).body.groups.expense;
    expect(grupo(porTag, viagem)?.total).toBe("100.00");
    expect(grupo(porTag, null)?.name).toBe("Sem tag");
    const me = (await f.agent.get("/api/me")).body;
    const porPessoa = (await f.agent.get(`/api/reports?month=${MES}&groupBy=person`)).body.groups.expense;
    expect(grupo(porPessoa, me.user.id)?.total).toBe("260.00");
    expect((await f.agent.get(`/api/reports?month=${MES}&createdById=outra-pessoa`)).body.totals.count).toBe(0);
    const porConta = (await f.agent.get(`/api/reports?month=${MES}&groupBy=account`)).body.groups.expense;
    expect(grupo(porConta, nu)).toMatchObject({ name: "Nu", total: "60.00" });

    // "Ignorar nos totais" desligado: o lançamento marcado volta
    expect((await f.agent.get(`/api/reports?month=${MES}&excludeIgnored=false`)).body.totals.expense).toBe("300.00");

    // Compras no cartão pela data da compra: entra o Livro (05/07) e sai o Cinema (25/06)
    const porCompra = (await f.agent.get(`/api/reports?month=${MES}&cardDate=PURCHASE`)).body;
    expect(porCompra.totals.expense).toBe("280.00");

    // Intervalo de datas e agrupamento por mês
    const intervalo = (await f.agent.get(`/api/reports?from=${MES}-15&to=2026-08-31&groupBy=month&type=EXPENSE`)).body;
    expect(intervalo.totals.expense).toBe("125.00"); // feira 30 (20/07) + 15 (01/08) + livro 80 (vence 10/08)
    expect(intervalo.groups.expense.map((g: Grupo) => [g.key, g.total])).toEqual([
      [MES, "30.00"],
      ["2026-08", "95.00"],
    ]);
  });

  it("valida o período e escopa por espaço; VIEWER lê", async () => {
    const f = await familiaLogada(app);
    await lancar(f.agent, { amount: "10", accountId: f.carteiraId });
    expect((await f.agent.get("/api/reports?from=2026-08-01&to=2026-07-01")).status).toBe(400);
    expect((await f.agent.get("/api/reports?from=2020-01-01&to=2026-07-01")).status).toBe(400);
    expect((await f.agent.get("/api/reports?groupBy=xpto")).status).toBe(400);
    const outra = await familiaLogada(app);
    expect((await outra.agent.get(`/api/reports?month=${MES}`)).body.totals.count).toBe(0);
    const leitor = await leitorDe(f);
    expect((await leitor.agent.get(`/api/reports?month=${MES}`).set(leitor.h)).body.totals.expense).toBe("10.00");
  });

  it("CSV para o Excel: BOM, ponto e vírgula, decimal com vírgula e aspas", async () => {
    const f = await familiaLogada(app);
    await lancar(f.agent, { amount: "1234.5", accountId: f.carteiraId, description: 'Mercado; "promoção"', categoryId: f.categoria("Mercado"), notes: "linha" });
    await lancar(f.agent, { type: "INCOME", amount: "10", accountId: f.carteiraId, description: "Pix", categoryId: null });
    const r = await f.agent.get(`/api/reports/csv?month=${MES}`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => cb(null, Buffer.concat(partes)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.headers["content-disposition"]).toContain(`relatorio-${MES}-01-a-${MES}-31.csv`);
    const bytes = r.body as Buffer;
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const linhas = bytes.toString("utf8").slice(1).trim().split("\r\n");
    expect(linhas[0]).toBe("Data;Descrição;Tipo;Categoria;Subcategoria;Conta;Tags;Pessoa;Situação;Valor;Fatura;Parcela;Observações");
    expect(linhas).toHaveLength(3);
    const despesa = linhas.find((l) => l.includes("promoção"))!;
    expect(despesa).toContain('10/07/2026;"Mercado; ""promoção""";Despesa;Mercado;;');
    expect(despesa).toContain(";Efetivado;-1234,50;;;linha");
    expect(linhas.find((l) => l.includes("Pix"))).toContain("Receita;Sem categoria");
    expect(linhas.find((l) => l.includes("Pix"))).toContain(";10,00;");
  });
});

describe("calendário", () => {
  it("totais por dia, faturas no vencimento, pendentes vencidos e efetivar (VIEWER não)", async () => {
    const f = await familiaLogada(app);
    const banco = (await f.agent.post("/api/accounts").send({ name: "Banco", type: "BANK", initialBalance: "0" })).body.id;
    await lancar(f.agent, { amount: "50", accountId: f.carteiraId, date: `${MES}-05` });
    const pend = await lancar(f.agent, { amount: "20", accountId: f.carteiraId, date: `${MES}-05`, status: "PENDING", noAutoConfirm: true });
    await lancar(f.agent, { type: "INCOME", amount: "500", accountId: banco, date: `${MES}-05`, description: "Salário" });
    await lancar(f.agent, { amount: "7", accountId: f.carteiraId, date: `${MES}-05`, ignoreInTotals: true });
    await lancar(f.agent, { type: "TRANSFER", amount: "100", accountId: banco, toAccountId: f.carteiraId, date: `${MES}-06` });
    // Pendente de um mês anterior (vencido)
    await lancar(f.agent, { amount: "9", accountId: f.carteiraId, date: "2026-05-05", status: "PENDING", noAutoConfirm: true });
    const nu = await cartao(f.agent);
    await f.agent.post("/api/card-expenses").send({ cardId: nu, amount: "60", description: "Cinema", date: "2026-06-25" });
    await f.agent.post("/api/card-expenses").send({ cardId: nu, amount: "40", description: "Pizza", date: "2026-06-26" });

    const c = (await f.agent.get(`/api/calendar?month=${MES}`)).body;
    expect(c.month).toBe(MES);
    const dia5 = c.days.find((d: { date: string }) => d.date === `${MES}-05`);
    expect(dia5).toMatchObject({ income: "500.00", expense: "70.00", pending: 1, overdue: 1, count: 4 });
    const dia6 = c.days.find((d: { date: string }) => d.date === `${MES}-06`);
    expect(dia6).toMatchObject({ income: "0.00", expense: "0.00", count: 1 });
    const dia10 = c.days.find((d: { date: string }) => d.date === `${MES}-10`);
    expect(dia10).toMatchObject({ expense: "100.00", invoices: "100.00" });
    expect(c.invoices).toHaveLength(1);
    expect(c.invoices[0]).toMatchObject({ cardName: "Nu", total: "100.00", day: `${MES}-10`, overdue: true, status: "OVERDUE" });
    // Compras no cartão não aparecem uma a uma
    expect(c.transactions.some((t: { description: string }) => t.description === "Cinema")).toBe(false);
    expect(c.transactions.find((t: { id: string }) => t.id === pend.id)).toMatchObject({ day: `${MES}-05`, overdue: true });
    expect(c.totals).toMatchObject({ income: "500.00", expense: "170.00", balance: "330.00", pending: 1, overdueBefore: 1 });

    // VIEWER vê, mas não efetiva
    const leitor = await leitorDe(f);
    expect((await leitor.agent.get(`/api/calendar?month=${MES}`).set(leitor.h)).status).toBe(200);
    expect((await leitor.agent.patch(`/api/transactions/${pend.id}`).set(leitor.h).send({ status: "CONFIRMED" })).status).toBe(403);

    // Efetivar
    const ok = await f.agent.patch(`/api/transactions/${pend.id}`).send({ status: "CONFIRMED" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("CONFIRMED");
    const depois = (await f.agent.get(`/api/calendar?month=${MES}`)).body;
    expect(depois.days.find((d: { date: string }) => d.date === `${MES}-05`)).toMatchObject({ pending: 0, overdue: 0 });

    // Outro espaço não vê nada
    const outra = await familiaLogada(app);
    expect((await outra.agent.get(`/api/calendar?month=${MES}`)).body.days).toEqual([]);
    expect((await f.agent.get("/api/calendar?month=2026-13")).status).toBe(400);
  });
});

describe("despesa cartão: campos extras", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);

  it("subcategoria, tags, observações, data lançamento e flags em todas as parcelas; anexos sobrevivem à edição", async () => {
    const f = await familiaLogada(app);
    const nu = await cartao(f.agent);
    const mercado = f.categoria("Mercado");
    const feira = (await f.agent.post("/api/categories").send({ name: "Feira", type: "EXPENSE", color: "#22c55e", icon: "cart", parentId: mercado })).body.id;
    const tag = (await f.agent.post("/api/tags").send({ name: "casa" })).body.id;
    const base = { cardId: nu, amount: "90", description: "Feira", date: "2026-06-25", installments: 3, categoryId: feira };

    const criar = await f.agent.post("/api/card-expenses").send({
      ...base,
      tagIds: [tag],
      notes: "Feira do mês",
      launchDate: "2026-06-26",
      ignoreInStatistics: true,
      ignoreInBudgets: true,
      ignoreInMonthlySavings: true,
    });
    expect(criar.status, JSON.stringify(criar.body)).toBe(201);
    const parcelas = criar.body.installments;
    expect(parcelas).toHaveLength(3);
    for (const p of parcelas) {
      expect(p).toMatchObject({
        notes: "Feira do mês",
        ignoreInStatistics: true,
        ignoreInBudgets: true,
        ignoreInMonthlySavings: true,
        ignoreInTotals: false,
        category: { id: feira, parentId: mercado },
      });
      expect(p.launchDate.slice(0, 10)).toBe("2026-06-26");
      expect(p.tags.map((t: { id: string }) => t.id)).toEqual([tag]);
    }

    // Flags valem nas telas: fora de Estatísticas e Economia mensal, mas no Resumo
    expect((await f.agent.get("/api/stats?from=2026-07&to=2026-07")).body.total).toBe("0.00");
    expect((await f.agent.get("/api/savings?month=2026-07&months=1")).body.months[0].expense).toBe("0.00");
    expect((await f.agent.get("/api/summary?month=2026-07")).body.totals.expense).toBe("30.00");

    // Anexo na 1ª parcela continua depois de editar (as parcelas são recriadas)
    const up = await f.agent.post(`/api/transactions/${parcelas[0].id}/attachments`).set("Content-Type", "image/png").set("X-File-Name", "nota.png").send(PNG);
    expect(up.status).toBe(201);
    const editar = await f.agent.put(`/api/card-expenses/${criar.body.purchaseId}`).send({ ...base, amount: "120", notes: null });
    expect(editar.status, JSON.stringify(editar.body)).toBe(200);
    const novas = editar.body.installments;
    expect(novas[0].amount).toBe("40.00");
    expect(novas[0].attachments.map((a: { id: string; originalName: string }) => a.originalName)).toEqual(["nota.png"]);
    expect(novas[0].notes).toBeNull();
    expect(novas[0].ignoreInStatistics).toBe(false);
    // Sem tagIds na edição: mantém as tags
    expect(novas.every((p: { tags: unknown[] }) => p.tags.length === 1)).toBe(true);
    const anexoId = novas[0].attachments[0].id;
    expect((await f.agent.get(`/api/attachments/${anexoId}`)).status).toBe(200);

    // Tag de outro espaço não vale
    const outra = await familiaLogada(app);
    const tagOutra = (await outra.agent.post("/api/tags").send({ name: "x" })).body.id;
    expect((await f.agent.post("/api/card-expenses").send({ ...base, tagIds: [tagOutra] })).status).toBe(404);

    // Apagar a compra apaga os anexos
    expect((await f.agent.delete(`/api/card-expenses/${criar.body.purchaseId}`)).status).toBe(204);
    expect(await prisma.transactionAttachment.count({ where: { id: anexoId } })).toBe(0);
  });
});
