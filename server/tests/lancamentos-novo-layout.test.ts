import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

type Lanc = {
  id: string;
  description: string;
  amount: string;
  date: string;
  status: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  groupId: string | null;
  recurrence: string | null;
  notes: string | null;
  isCardExpense: boolean;
};
type Fatura = { cardId: string; cardName: string; month: string; total: string; paidAmount: string; dueDate: string; status: string; paid: boolean };

const diaBrasilia = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

describe("Lançamentos: compras no cartão viram a linha da fatura", () => {
  async function cenario(nome: string) {
    const { agent, carteiraId, categoria } = await familiaLogada(app, nome);
    const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "1000" })).body.id as string;
    const nubank = (await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", closingDay: 3, dueDay: 10, color: "#820ad1" })).body
      .id as string;
    const santander = (await agent.post("/api/cards").send({ name: "Santander", brand: "VISA", creditLimit: "5000", closingDay: 24, dueDay: 30, color: "#cc092f" })).body
      .id as string;
    const comprar = (cardId: string, description: string, amount: string, date: string, installments = 1) =>
      agent.post("/api/card-expenses").send({ cardId, description, amount, date, installments, categoryId: categoria("Lazer") });
    // Nubank (fecha 3, vence 10): compra em 05/10 → fatura de novembro; 300 em 3x → 100 em nov, dez e jan
    expect((await comprar(nubank, "Cinema", "60", "2026-10-05")).status).toBe(201);
    expect((await comprar(nubank, "Tênis", "300", "2026-10-06", 3)).status).toBe(201);
    // Santander (fecha 24, vence 30): compra em 10/11 → fatura de novembro
    expect((await comprar(santander, "Livro", "45.50", "2026-11-10")).status).toBe(201);
    // Despesa comum em novembro
    await agent.post("/api/transactions").send({ type: "EXPENSE", amount: "20", description: "Padaria", date: "2026-11-02", accountId: carteiraId });
    return { agent, banco, nubank, santander, carteiraId };
  }

  it("a lista do mês não traz as compras no cartão, só os outros lançamentos", async () => {
    const { agent } = await cenario("Ana Faturas");
    const lista = (await agent.get("/api/transactions?month=2026-11")).body as Lanc[];
    expect(lista.map((l) => l.description)).toEqual(["Padaria"]);
    expect(lista.some((l) => l.isCardExpense)).toBe(false);
    // Despesas também
    expect(((await agent.get("/api/transactions?month=2026-11&type=EXPENSE")).body as Lanc[]).map((l) => l.description)).toEqual(["Padaria"]);
  });

  it("filtrando pelo cartão (accountId) as compras continuam aparecendo", async () => {
    const { agent, nubank } = await cenario("Bruno Cartao");
    const lista = (await agent.get(`/api/transactions?month=2026-11&accountId=${nubank}`)).body as Lanc[];
    expect(lista.map((l) => l.description).sort()).toEqual(["Cinema", "Tênis"]);
  });

  it("/api/transactions/invoices traz uma linha por cartão com o total da fatura do mês", async () => {
    const { agent, nubank, santander } = await cenario("Carla Linhas");
    const res = await agent.get("/api/transactions/invoices?month=2026-11");
    expect(res.status).toBe(200);
    const faturas = res.body as Fatura[];
    expect(faturas).toHaveLength(2);
    const nu = faturas.find((f) => f.cardId === nubank)!;
    expect(nu).toMatchObject({ cardName: "Nubank", month: "2026-11", total: "160.00", paidAmount: "0.00", paid: false });
    expect(diaBrasilia(nu.dueDate)).toBe("2026-11-10");
    const sa = faturas.find((f) => f.cardId === santander)!;
    expect(sa).toMatchObject({ cardName: "Santander", total: "45.50" });
    expect(diaBrasilia(sa.dueDate)).toBe("2026-11-30");

    // Dezembro: só a 2ª parcela do tênis (Nubank)
    const dez = (await agent.get("/api/transactions/invoices?month=2026-12")).body as Fatura[];
    expect(dez.map((f) => [f.cardName, f.total])).toEqual([["Nubank", "100.00"]]);
    // Mês sem compras: lista vazia
    expect((await agent.get("/api/transactions/invoices?month=2026-08")).body).toEqual([]);
  });

  it("o total da fatura é o mesmo que entra como despesa no resumo do mês", async () => {
    const { agent } = await cenario("Davi Resumo");
    const faturas = (await agent.get("/api/transactions/invoices?month=2026-11")).body as Fatura[];
    const somaFaturas = faturas.reduce((s, f) => s + Number(f.total), 0);
    const resumo = (await agent.get("/api/summary?month=2026-11")).body;
    // 160 + 45,50 das faturas + 20 da padaria
    expect(Number(resumo.totals.expense)).toBeCloseTo(somaFaturas + 20, 2);
    expect(resumo.totals.expense).toBe("225.50");
  });

  it("fatura paga aparece como paga", async () => {
    const { agent, banco, santander } = await cenario("Eva Paga");
    expect((await agent.post(`/api/cards/${santander}/invoices/2026-11/pay`).send({ accountId: banco, date: "2026-11-28" })).status).toBe(201);
    const sa = ((await agent.get("/api/transactions/invoices?month=2026-11")).body as Fatura[]).find((f) => f.cardId === santander)!;
    expect(sa).toMatchObject({ paidAmount: "45.50", paid: true, status: "PAID" });
  });

  it("valida o mês", async () => {
    const { agent } = await familiaLogada(app, "Fabio Mes");
    expect((await agent.get("/api/transactions/invoices?month=2026-13")).status).toBe(400);
  });
});

describe("Repetição: parcelar, repetir e fixa mensal", () => {
  async function base(nome: string) {
    const { agent, carteiraId, categoria } = await familiaLogada(app, nome);
    const post = (body: object) =>
      agent.post("/api/transactions").send({ type: "EXPENSE", description: "Curso", date: "2026-01-31", accountId: carteiraId, categoryId: categoria("Lazer"), ...body });
    return { agent, post };
  }

  it("parcelar divide o valor em N meses (k/N), centavos na 1ª, só a 1ª efetivada", async () => {
    const { agent, post } = await base("Gabi Parcela");
    const res = await post({ amount: "100", recurrence: "INSTALLMENT", times: 3 });
    expect(res.status).toBe(201);
    const grupo = res.body.group as Lanc[];
    expect(grupo).toHaveLength(3);
    expect(grupo.map((l) => l.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(grupo.map((l) => `${l.installmentNumber}/${l.installmentTotal}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(grupo.map((l) => l.status)).toEqual(["CONFIRMED", "PENDING", "PENDING"]);
    // 31/01 → 28/02 → 31/03 (sem passar do último dia do mês)
    expect(grupo.map((l) => diaBrasilia(l.date))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(new Set(grupo.map((l) => l.groupId)).size).toBe(1);
    expect(grupo.every((l) => l.recurrence === "INSTALLMENT")).toBe(true);
    expect(res.body.id).toBe(grupo[0].id);

    // Cada parcela aparece no seu mês
    const fev = (await agent.get("/api/transactions?month=2026-02")).body as Lanc[];
    expect(fev.map((l) => [l.description, l.amount, l.installmentNumber])).toEqual([["Curso", "33.33", 2]]);
  });

  it("repetir usa o mesmo valor em cada mês", async () => {
    const { post } = await base("Hugo Repete");
    const res = await post({ amount: "80", recurrence: "REPEAT", times: 4, status: "PENDING", date: "2026-11-10" });
    expect(res.status).toBe(201);
    const grupo = res.body.group as Lanc[];
    expect(grupo.map((l) => l.amount)).toEqual(["80.00", "80.00", "80.00", "80.00"]);
    expect(grupo.map((l) => l.installmentNumber)).toEqual([1, 2, 3, 4]);
    expect(grupo.every((l) => l.status === "PENDING")).toBe(true);
    expect(grupo.map((l) => diaBrasilia(l.date))).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
  });

  it("fixa mensal cria 12 meses, sem número de parcela, só a 1ª segue o Efetivada", async () => {
    const { agent, post } = await base("Iara Fixa");
    const res = await post({ amount: "99.99", recurrence: "FIXED", type: "INCOME", description: "Aluguel recebido", categoryId: null, date: "2026-11-05" });
    expect(res.status).toBe(201);
    const grupo = res.body.group as Lanc[];
    expect(grupo).toHaveLength(12);
    expect(grupo.every((l) => l.amount === "99.99" && l.recurrence === "FIXED" && l.installmentTotal === null)).toBe(true);
    expect(grupo[0].status).toBe("CONFIRMED");
    expect(grupo.slice(1).every((l) => l.status === "PENDING")).toBe(true);
    expect(diaBrasilia(grupo[11].date)).toBe("2027-10-05");

    // Só a 1ª (efetivada) conta no resumo de novembro; dezembro está pendente
    expect((await agent.get("/api/summary?month=2026-11")).body.totals.income).toBe("99.99");
    expect((await agent.get("/api/summary?month=2026-12")).body.totals.income).toBe("0.00");
  });

  it("editar ou apagar um lançamento do grupo mexe só nele", async () => {
    const { agent, post } = await base("Juca Grupo");
    const grupo = (await post({ amount: "50", recurrence: "REPEAT", times: 3 })).body.group as Lanc[];
    expect((await agent.patch(`/api/transactions/${grupo[1].id}`).send({ amount: "70" })).body.amount).toBe("70.00");
    expect((await agent.delete(`/api/transactions/${grupo[2].id}`)).status).toBe(204);
    const jan = (await agent.get("/api/transactions?month=2026-01")).body as Lanc[];
    expect(jan[0].amount).toBe("50.00");
    expect(((await agent.get("/api/transactions?month=2026-02")).body as Lanc[])[0].amount).toBe("70.00");
    expect((await agent.get("/api/transactions?month=2026-03")).body).toHaveLength(0);
  });

  it("apagar com escopo=futuros apaga este e os próximos do grupo, e mantém os anteriores", async () => {
    const { agent, post } = await base("Lia Futuros");
    const grupo = (await post({ amount: "40", recurrence: "FIXED", date: "2026-11-05" })).body.group as Lanc[];
    expect(grupo).toHaveLength(12);
    expect((await agent.delete(`/api/transactions/${grupo[3].id}?escopo=futuros`)).status).toBe(204);
    expect((await agent.get("/api/transactions?month=2027-01")).body).toHaveLength(1);
    expect((await agent.get("/api/transactions?month=2027-02")).body).toHaveLength(0);
    expect((await agent.get("/api/transactions?month=2027-10")).body).toHaveLength(0);
    // Escopo inválido
    expect((await agent.delete(`/api/transactions/${grupo[0].id}?escopo=todos`)).status).toBe(400);
    // escopo=futuros num lançamento sem grupo apaga só ele
    const avulso = (await post({ amount: "5", date: "2026-11-06" })).body.id as string;
    expect((await agent.delete(`/api/transactions/${avulso}?escopo=futuros`)).status).toBe(204);
    expect(((await agent.get("/api/transactions?month=2026-11")).body as Lanc[]).map((l) => l.amount)).toEqual(["40.00"]);
  });

  it("valida: parcelar/repetir pedem de 2 a 48 vezes; transferência não repete", async () => {
    const { agent, post } = await base("Kaio Valida");
    expect((await post({ amount: "10", recurrence: "INSTALLMENT" })).status).toBe(400);
    expect((await post({ amount: "10", recurrence: "REPEAT", times: 1 })).status).toBe(400);
    expect((await post({ amount: "10", recurrence: "REPEAT", times: 49 })).status).toBe(400);
    expect((await post({ amount: "10", recurrence: "MENSAL" })).status).toBe(400);
    const contas = (await agent.get("/api/accounts")).body as { id: string }[];
    const banco = (await agent.post("/api/accounts").send({ name: "Inter", type: "BANK", initialBalance: "0" })).body.id;
    const t = await agent
      .post("/api/transactions")
      .send({ type: "TRANSFER", amount: "10", date: "2026-11-01", accountId: contas[0].id, toAccountId: banco, recurrence: "FIXED" });
    expect(t.status).toBe(400);
  });

  it("sem repetição continua devolvendo um lançamento só (sem group)", async () => {
    const { post } = await base("Lia Simples");
    const res = await post({ amount: "10" });
    expect(res.status).toBe(201);
    expect(res.body.group).toBeUndefined();
    expect(res.body.groupId).toBeNull();
    expect(res.body.recurrence).toBeNull();
  });
});

describe("Observações (notes)", () => {
  it("salva, edita e limpa as observações", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Mia Notas");
    const criar = await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "15", description: "Farmácia", date: "2026-11-03", accountId: carteiraId, notes: "  Remédio da Luiza  " });
    expect(criar.status).toBe(201);
    expect(criar.body.notes).toBe("Remédio da Luiza");
    const lista = (await agent.get("/api/transactions?month=2026-11")).body as Lanc[];
    expect(lista[0].notes).toBe("Remédio da Luiza");

    expect((await agent.patch(`/api/transactions/${criar.body.id}`).send({ notes: "Com receita" })).body.notes).toBe("Com receita");
    expect((await agent.patch(`/api/transactions/${criar.body.id}`).send({ amount: "16" })).body.notes).toBe("Com receita");
    expect((await agent.patch(`/api/transactions/${criar.body.id}`).send({ notes: "" })).body.notes).toBeNull();
    expect((await agent.patch(`/api/transactions/${criar.body.id}`).send({ notes: "x".repeat(1001) })).status).toBe(400);
  });

  it("observações também vão para todos os lançamentos de uma repetição", async () => {
    const { agent, carteiraId } = await familiaLogada(app, "Nina Notas");
    const res = await agent
      .post("/api/transactions")
      .send({ type: "EXPENSE", amount: "30", description: "Academia", date: "2026-11-03", accountId: carteiraId, notes: "Plano anual", recurrence: "REPEAT", times: 2 });
    expect((res.body.group as Lanc[]).map((l) => l.notes)).toEqual(["Plano anual", "Plano anual"]);
  });
});
