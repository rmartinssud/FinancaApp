import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { somarMeses } from "../src/lib/money.js";
import { faturaAtual } from "../src/services/cartoes.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

// Caso real: Santander fecha dia 24 e vence dia 30. Compras de 22/10 e 23/10/2026
// foram lançadas pelo banco na fatura que vence em 30/11 (atraso no processamento).
// A pessoa escolhe a fatura no formulário para o app bater com o banco.
const SANTANDER = { closingDay: 24, dueDay: 30 };

type Parcela = { invoiceMonth: string; amount: string; installmentNumber: number | null; installmentTotal: number | null };
const faturas = (lista: Parcela[]) => lista.map((p) => p.invoiceMonth);

async function cenario(nome: string) {
  const { agent, categoria } = await familiaLogada(app, nome);
  const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "5000" })).body.id as string;
  const cartao = (
    await agent.post("/api/cards").send({ name: "Santander", brand: "VISA", creditLimit: "5000", ...SANTANDER, color: "#cc092f" })
  ).body.id as string;
  const base = { cardId: cartao, categoryId: categoria("Lazer"), description: "Mercado", amount: "90", date: "2026-10-23" };
  return { agent, banco, cartao, base };
}

describe("escolher a fatura da compra (invoiceMonth)", () => {
  it("sem escolher: compra de 23/10 em cartão que fecha dia 24 entra na fatura de outubro", async () => {
    const { agent, base } = await cenario("Rui Automática");
    const res = await agent.post("/api/card-expenses").send(base);
    expect(res.status).toBe(201);
    expect(faturas(res.body.installments)).toEqual(["2026-10"]);
    expect(res.body.invoiceMonth).toBe("2026-10");

    // null também é "automática"
    const nula = await agent.post("/api/card-expenses").send({ ...base, invoiceMonth: null });
    expect(nula.status).toBe(201);
    expect(faturas(nula.body.installments)).toEqual(["2026-10"]);
  });

  it("escolhendo novembro: a compra vai para a fatura que vence em 30/11", async () => {
    const { agent, cartao, base } = await cenario("Ana Novembro");
    const res = await agent.post("/api/card-expenses").send({ ...base, invoiceMonth: "2026-11" });
    expect(res.status).toBe(201);
    expect(faturas(res.body.installments)).toEqual(["2026-11"]);
    expect(res.body.invoiceMonth).toBe("2026-11");

    expect((await agent.get(`/api/cards/${cartao}/invoices/2026-11`)).body.total).toBe("90.00");
    expect((await agent.get(`/api/cards/${cartao}/invoices/2026-10`)).body.total).toBe("0.00");

    // A data da compra continua a mesma (só a fatura muda)
    const reaberta = (await agent.get(`/api/card-expenses/${res.body.purchaseId}`)).body;
    expect(reaberta.invoiceMonth).toBe("2026-11");
    expect(reaberta.installments[0].date.slice(0, 10)).toBe("2026-10-23");
  });

  it("3x escolhendo novembro: parcelas em novembro, dezembro e janeiro", async () => {
    const { agent, base } = await cenario("Leo Parcelas");
    const res = await agent.post("/api/card-expenses").send({ ...base, installments: 3, invoiceMonth: "2026-11" });
    expect(res.status).toBe(201);
    expect(res.body.installments.map((p: Parcela) => [p.installmentNumber, p.invoiceMonth, p.amount])).toEqual([
      [1, "2026-11", "30.00"],
      [2, "2026-12", "30.00"],
      [3, "2027-01", "30.00"],
    ]);
  });

  it("recusa fatura longe da data da compra (de 1 mês antes a 2 meses depois)", async () => {
    const { agent, base } = await cenario("Gil Faixa");
    const post = (invoiceMonth: string) => agent.post("/api/card-expenses").send({ ...base, invoiceMonth });

    // Dentro da faixa: setembro a dezembro (automática = outubro)
    for (const mes of ["2026-09", "2026-10", "2026-11", "2026-12"]) expect((await post(mes)).status).toBe(201);

    for (const mes of ["2026-08", "2027-01"]) {
      const fora = await post(mes);
      expect(fora.status).toBe(400);
      expect(fora.body.error).toBe("Escolha uma fatura próxima da data da compra.");
      expect(fora.body.detalhes.invoiceMonth[0]).toBe("Escolha uma fatura próxima da data da compra.");
    }

    // Formato errado
    const formato = await post("2026-13");
    expect(formato.status).toBe(400);
    expect(formato.body.detalhes.invoiceMonth[0]).toBe("Use o formato AAAA-MM (ex.: 2026-11).");
    expect((await post("11/2026")).status).toBe(400);
  });

  it("compra já em andamento: a parcela atual vai para a fatura escolhida", async () => {
    const { agent, base } = await cenario("Eva Andamento");
    const atual = faturaAtual(SANTANDER);
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const res = await agent
      .post("/api/card-expenses")
      .send({ ...base, date: hoje, amount: "300", installments: 3, currentInstallment: 2, invoiceMonth: somarMeses(atual, 1) });
    expect(res.status).toBe(201);
    expect(res.body.installments.map((p: Parcela) => [p.installmentNumber, p.invoiceMonth])).toEqual([
      [2, somarMeses(atual, 1)],
      [3, somarMeses(atual, 2)],
    ]);
    // Faixa conta a partir da fatura atual
    const longe = await agent
      .post("/api/card-expenses")
      .send({ ...base, date: hoje, amount: "300", installments: 3, currentInstallment: 2, invoiceMonth: somarMeses(atual, 3) });
    expect(longe.status).toBe(400);
  });

  it("editar mantém a fatura escolhida; sem o campo volta para a automática", async () => {
    const { agent, base } = await cenario("Tom Edita");
    const criada = (await agent.post("/api/card-expenses").send({ ...base, installments: 2, invoiceMonth: "2026-11" })).body;

    // O formulário reenvia a fatura que veio no GET
    const reaberta = (await agent.get(`/api/card-expenses/${criada.purchaseId}`)).body;
    const editar = await agent
      .put(`/api/card-expenses/${criada.purchaseId}`)
      .send({ ...base, description: "Mercado Extra", amount: "100", installments: 2, invoiceMonth: reaberta.invoiceMonth });
    expect(editar.status).toBe(200);
    expect(editar.body.invoiceMonth).toBe("2026-11");
    expect(editar.body.installments.map((p: Parcela) => [p.invoiceMonth, p.amount])).toEqual([
      ["2026-11", "50.00"],
      ["2026-12", "50.00"],
    ]);

    // Fora da faixa também é recusado na edição
    expect((await agent.put(`/api/card-expenses/${criada.purchaseId}`).send({ ...base, invoiceMonth: "2027-01" })).status).toBe(400);

    // Voltar para a automática
    const automatica = await agent.put(`/api/card-expenses/${criada.purchaseId}`).send({ ...base, installments: 2 });
    expect(automatica.status).toBe(200);
    expect(faturas(automatica.body.installments)).toEqual(["2026-10", "2026-11"]);
  });

  it("não move a compra para uma fatura que já tem pagamento (409)", async () => {
    const { agent, banco, cartao, base } = await cenario("Lu Travada");
    // Outra compra em novembro, e a fatura de novembro paga
    await agent.post("/api/card-expenses").send({ ...base, description: "Farmácia", date: "2026-10-30" });
    expect((await agent.post(`/api/cards/${cartao}/invoices/2026-11/pay`).send({ accountId: banco })).status).toBe(201);

    // Compra de 23/10 em outubro: mover para novembro (paga) é recusado
    const outubro = (await agent.post("/api/card-expenses").send(base)).body;
    const mover = await agent.put(`/api/card-expenses/${outubro.purchaseId}`).send({ ...base, invoiceMonth: "2026-11" });
    expect(mover.status).toBe(409);
    expect(mover.body.error).toBe("A compra cairia numa fatura que já tem pagamento. Desfaça o pagamento antes.");
    expect(faturas((await agent.get(`/api/card-expenses/${outubro.purchaseId}`)).body.installments)).toEqual(["2026-10"]);

    // Parcelado: basta uma parcela cair na fatura paga (out → nov)
    const parcelada = await agent.put(`/api/card-expenses/${outubro.purchaseId}`).send({ ...base, installments: 2, invoiceMonth: "2026-10" });
    expect(parcelada.status).toBe(409);

    // Compra que já está na fatura paga não pode ser movida para fora dela
    const naPaga = (await agent.get(`/api/cards/${cartao}/invoices/2026-11`)).body;
    expect(naPaga.purchases).toHaveLength(1);
    const sair = await agent.put(`/api/card-expenses/${naPaga.purchases[0].purchaseId}`).send({ ...base, date: "2026-10-30", invoiceMonth: "2026-12" });
    expect(sair.status).toBe(409);
  });

  it("Lançamentos mostra a compra no mês da fatura escolhida, não no mês da data", async () => {
    const { agent, banco, base } = await cenario("Bia Lista");
    const res = await agent.post("/api/card-expenses").send({ ...base, description: "Ferramenta", installments: 6, invoiceMonth: "2026-11" });
    expect(res.status).toBe(201);
    const doMes = async (m: string) =>
      ((await agent.get(`/api/transactions?month=${m}&accountId=${base.cardId}`)).body as { description: string; installmentNumber: number | null }[])
        .filter((l) => l.description === "Ferramenta")
        .map((l) => l.installmentNumber);
    expect(await doMes("2026-10")).toEqual([]);
    expect(await doMes("2026-11")).toEqual([1]);
    expect(await doMes("2026-12")).toEqual([2]);

    // Lançamento comum continua pelo dia
    await agent.post("/api/transactions").send({ type: "EXPENSE", accountId: banco, amount: "10", description: "Padaria", date: "2026-10-23", categoryId: base.categoryId });
    const out = (await agent.get(`/api/transactions?month=2026-10`)).body as { description: string }[];
    expect(out.map((l) => l.description)).toContain("Padaria");
  });
});
