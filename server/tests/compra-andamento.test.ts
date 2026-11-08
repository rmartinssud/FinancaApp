import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { somarMeses } from "../src/lib/money.js";
import { faturaAtual } from "../src/services/cartoes.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

// Compra parcelada que começou antes de a pessoa usar o app:
// só as parcelas que faltam são lançadas, a partir da fatura atual.
const NUBANK = { closingDay: 3, dueDay: 10 };

type Parcela = { invoiceMonth: string; amount: string; installmentNumber: number; installmentTotal: number; date: string };
const resumo = (lista: Parcela[]) => lista.map((p) => [p.invoiceMonth, p.amount, `${p.installmentNumber}/${p.installmentTotal}`, p.date.slice(0, 10)]);

async function cenario(nome: string) {
  const { agent, categoria } = await familiaLogada(app, nome);
  const banco = (await agent.post("/api/accounts").send({ name: "Itaú", type: "BANK", initialBalance: "5000" })).body.id as string;
  const cartao = (
    await agent.post("/api/cards").send({ name: "Nubank", brand: "MASTERCARD", creditLimit: "5000", ...NUBANK, color: "#8a05be" })
  ).body.id as string;
  const base = { cardId: cartao, categoryId: categoria("Lazer"), description: "Geladeira", date: "2026-07-15" };
  return { agent, banco, cartao, base };
}

// Amanhã (ou depois) em Brasília, para testar data no futuro
const depoisDeAmanha = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("compra parcelada já em andamento (currentInstallment)", () => {
  it("10x de R$ 1.000 na parcela 4: lança 7 parcelas de 100, a 4/10 na fatura atual", async () => {
    const { agent, cartao, base } = await cenario("Lia Andamento");
    const atual = faturaAtual(NUBANK);

    const criar = await agent.post("/api/card-expenses").send({ ...base, amount: "1000", installments: 10, currentInstallment: 4 });
    expect(criar.status).toBe(201);
    expect(criar.body.installments).toHaveLength(7);
    expect(resumo(criar.body.installments)).toEqual([4, 5, 6, 7, 8, 9, 10].map((k, i) => [
      somarMeses(atual, i),
      "100.00",
      `${k}/10`,
      // data de cada parcela = data da compra + (k − 1) meses (só para mostrar)
      `${somarMeses("2026-07", k - 1)}-15`,
    ]));

    // Fatura atual tem só a parcela 4; nada nas faturas passadas
    const fatura = (await agent.get(`/api/cards/${cartao}/invoices/atual`)).body;
    expect(fatura.month).toBe(atual);
    expect(fatura.total).toBe("100.00");
    expect((await agent.get(`/api/cards/${cartao}/invoices/${somarMeses(atual, -1)}`)).body.total).toBe("0.00");

    // Limite usado = só o que falta (7 × 100)
    const card = (await agent.get(`/api/cards/${cartao}`)).body;
    expect(card.usedLimit).toBe("700.00");
    expect(card.availableLimit).toBe("4300.00");
    expect(card.closedInvoice).toBeNull(); // nenhuma fatura antiga "vencida"

    // Reabrir a compra: a primeira parcela existente diz qual é a parcela atual
    const reaberta = (await agent.get(`/api/card-expenses/${criar.body.purchaseId}`)).body;
    expect(reaberta.installments[0]).toMatchObject({ installmentNumber: 4, installmentTotal: 10, invoiceMonth: atual });

    // Centavos que sobram ficam na 1ª parcela (que não é lançada): valores iguais aos do banco
    const quebrada = await agent.post("/api/card-expenses").send({ ...base, amount: "1000.05", installments: 10, currentInstallment: 4 });
    expect(quebrada.status).toBe(201);
    expect(quebrada.body.installments.map((p: Parcela) => p.amount)).toEqual(Array(7).fill("100.00"));

    // Última parcela: só uma, na fatura atual
    const ultima = await agent.post("/api/card-expenses").send({ ...base, amount: "300", installments: 3, currentInstallment: 3 });
    expect(resumo(ultima.body.installments)).toEqual([[atual, "100.00", "3/3", "2026-09-15"]]);
  });

  it("valida a parcela atual e a data da compra", async () => {
    const { agent, base } = await cenario("Caio Valida");
    const post = (body: object) => agent.post("/api/card-expenses").send({ ...base, amount: "1000", installments: 10, ...body });

    const maior = await post({ currentInstallment: 11 });
    expect(maior.status).toBe(400);
    expect(maior.body.detalhes.currentInstallment[0]).toBe("A parcela desta fatura não pode passar do total de parcelas (10).");
    expect((await post({ currentInstallment: 2, installments: 1 })).status).toBe(400);
    expect((await post({ currentInstallment: 0 })).status).toBe(400);
    expect((await post({ currentInstallment: 1.5 })).status).toBe(400);

    const futura = await post({ currentInstallment: 2, date: depoisDeAmanha() });
    expect(futura.status).toBe(400);
    expect(futura.body.detalhes.date[0]).toBe("Compra já em andamento: a data da compra não pode ser depois de hoje.");

    // Compra nova (parcela 1) continua podendo ter data futura, como antes
    expect((await post({ currentInstallment: 1, date: depoisDeAmanha() })).status).toBe(201);
    // Sem o campo: comportamento antigo (todas as parcelas a partir da data)
    const semCampo = await post({ installments: 2, amount: "100" });
    expect(semCampo.status).toBe(201);
    expect(semCampo.body.installments.map((p: Parcela) => p.installmentNumber)).toEqual([1, 2]);
  });

  it("editar mantém a compra em andamento e respeita fatura com pagamento", async () => {
    const { agent, banco, cartao, base } = await cenario("Bia Edita");
    const atual = faturaAtual(NUBANK);
    const criada = (await agent.post("/api/card-expenses").send({ ...base, amount: "1000", installments: 10, currentInstallment: 4 })).body;

    // Mesmo pedido de volta (só muda descrição e valor): continua 4/10 a 10/10 a partir da fatura atual
    const editar = await agent
      .put(`/api/card-expenses/${criada.purchaseId}`)
      .send({ ...base, description: "Geladeira Brastemp", amount: "1200", installments: 10, currentInstallment: 4 });
    expect(editar.status).toBe(200);
    expect(editar.body.purchaseId).toBe(criada.purchaseId);
    expect(editar.body.installments).toHaveLength(7);
    expect(editar.body.installments[0]).toMatchObject({ installmentNumber: 4, amount: "120.00", invoiceMonth: atual, description: "Geladeira Brastemp" });
    expect(editar.body.installments[6]).toMatchObject({ installmentNumber: 10, invoiceMonth: somarMeses(atual, 6) });
    expect((await agent.get(`/api/cards/${cartao}`)).body.usedLimit).toBe("840.00");

    // Trocar para parcela 5: lança 5/10 a 10/10, a 5/10 na fatura atual
    const cinco = await agent.put(`/api/card-expenses/${criada.purchaseId}`).send({ ...base, amount: "1000", installments: 10, currentInstallment: 5 });
    expect(cinco.status).toBe(200);
    expect(cinco.body.installments.map((p: Parcela) => [p.installmentNumber, p.invoiceMonth])).toEqual(
      [5, 6, 7, 8, 9, 10].map((k, i) => [k, somarMeses(atual, i)]),
    );

    // Validação também vale na edição
    expect((await agent.put(`/api/card-expenses/${criada.purchaseId}`).send({ ...base, amount: "1000", installments: 4, currentInstallment: 5 })).status).toBe(400);

    // Com a fatura atual paga, a compra fica travada
    expect((await agent.post(`/api/cards/${cartao}/invoices/${atual}/pay`).send({ accountId: banco })).status).toBe(201);
    const travada = await agent.put(`/api/card-expenses/${criada.purchaseId}`).send({ ...base, amount: "1000", installments: 10, currentInstallment: 5 });
    expect(travada.status).toBe(409);
  });
});
