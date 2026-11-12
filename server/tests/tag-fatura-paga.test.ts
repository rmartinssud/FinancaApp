import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { familiaLogada } from "./helpers.js";

const app = createApp();

// Editar só os detalhes (tags, observações, categoria) de uma compra no cartão funciona
// mesmo com a fatura já paga; mudar valor, data ou parcelas continua bloqueado.
describe("compra no cartão: editar detalhes com fatura paga", () => {
  it("salva a tag sem refazer as parcelas e mantém o bloqueio do valor", async () => {
    const f = await familiaLogada(app);
    const tag = (await f.agent.post("/api/tags").send({ name: "Siena" })).body.id;
    const cartao = (
      await f.agent.post("/api/cards").send({ name: "SX", brand: "VISA", creditLimit: "5343", closingDay: 24, dueDay: 30, color: "#cc0000" })
    ).body.id;
    const base = { cardId: cartao, amount: "90.00", description: "Peça Siena", date: "2026-10-10", installments: 3, currentInstallment: 1, invoiceMonth: null, categoryId: null, notes: null, launchDate: null };
    const c = await f.agent.post("/api/card-expenses").send(base);
    expect(c.status).toBe(201);
    const idsAntes = c.body.installments.map((p: { id: string }) => p.id);
    expect(c.body.installments[0].invoiceMonth).toBe("2026-10");

    // Paga a fatura de outubro
    expect((await f.agent.post(`/api/cards/${cartao}/invoices/2026-10/pay`).send({ accountId: f.carteiraId })).status).toBe(201);

    // Só a tag e a observação: salva, nas 3 parcelas, sem trocar os ids
    const put = await f.agent.put(`/api/card-expenses/${c.body.purchaseId}`).send({ ...base, tagIds: [tag], notes: "Para o Siena" });
    expect(put.status).toBe(200);
    expect(put.body.installments.map((p: { id: string }) => p.id)).toEqual(idsAntes);
    for (const p of put.body.installments) {
      expect(p.tags.map((t: { id: string }) => t.id)).toEqual([tag]);
      expect(p.notes).toBe("Para o Siena");
    }
    const lido = await f.agent.get(`/api/card-expenses/${c.body.purchaseId}`);
    expect(lido.body.installments[0].tags[0].name).toBe("Siena");

    // Aparece nas Estatísticas (por tag)
    const s = await f.agent.get("/api/stats?from=2026-10&to=2026-10&type=EXPENSE");
    expect(s.body.byTag.find((t: { tagId: string }) => t.tagId === tag)?.total).toBe("30.00");

    // Tirar a tag também funciona
    const semTag = await f.agent.put(`/api/card-expenses/${c.body.purchaseId}`).send({ ...base, tagIds: [] });
    expect(semTag.status).toBe(200);
    expect(semTag.body.installments[0].tags).toEqual([]);

    // Mudar o valor com a fatura paga continua bloqueado
    const valor = await f.agent.put(`/api/card-expenses/${c.body.purchaseId}`).send({ ...base, amount: "120.00" });
    expect(valor.status).toBe(409);
  });
});
