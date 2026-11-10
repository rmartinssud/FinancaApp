import { Router, type Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { valorPositivo, dataSchema, mesSchema, somarMeses, partesLocais } from "../lib/money.js";
import { dividirParcelas, faturaAtual, mesDaFatura, somarMesesNaData } from "../services/cartoes.js";
import { incluir, serializar, faturasComPagamento } from "../services/lancamentos.js";
import { apagarArquivos } from "../services/armazenamento.js";
import type { Prisma } from "@prisma/client";

export const cardExpensesRouter = Router();

// Compras no cartão de crédito (à vista ou parceladas).
// Cada parcela é um lançamento EXPENSE no cartão com o mês da fatura (invoiceMonth).
// Nas somas do mês, a compra conta como despesa no mês do VENCIMENTO da fatura.
cardExpensesRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const compra = z.object({
  cardId: z.string().min(1),
  amount: valorPositivo, // valor TOTAL da compra (dividido entre as parcelas)
  description: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).nullable().optional(),
  date: dataSchema, // data da compra
  installments: z.number().int().min(1, "De 1 a 24 parcelas.").max(24, "De 1 a 24 parcelas.").default(1),
  // Compra já em andamento: a parcela que cai na fatura ATUAL do cartão (1 = compra nova, padrão)
  currentInstallment: z.number().int().min(1, "A parcela desta fatura precisa ser 1 ou mais.").max(24, "De 1 a 24 parcelas.").default(1),
  // Fatura escolhida pela pessoa ("AAAA-MM"), quando o banco lançou a compra numa fatura diferente
  // da calculada pela data (ex.: compra perto do fechamento que o banco jogou para a fatura seguinte).
  // Vale para a 1ª parcela lançada (a parcela 1, ou a parcela atual da compra em andamento).
  // Sem o campo (ou null): fatura automática.
  invoiceMonth: mesSchema.nullable().optional(),
  // Campos extras (os mesmos do formulário de lançamento que fazem sentido no cartão).
  // Valem para todas as parcelas. Multicategorias e encargos/desconto ficam de fora (ver Central de Ajuda).
  notes: z.string().trim().max(1000, "Até 1000 caracteres.").nullable().optional(),
  launchDate: dataSchema.nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(20, "Até 20 tags.").optional(),
  ignoreInStatistics: z.boolean().optional(),
  ignoreInBudgets: z.boolean().optional(),
  ignoreInMonthlySavings: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.currentInstallment > d.installments) {
    ctx.addIssue({
      code: "custom",
      path: ["currentInstallment"],
      message: `A parcela desta fatura não pode passar do total de parcelas (${d.installments}).`,
    });
  }
  // Compra em andamento já aconteceu: a data não pode ser no futuro
  if (d.currentInstallment > 1 && diaLocal(d.date) > diaLocal(new Date())) {
    ctx.addIssue({
      code: "custom",
      path: ["date"],
      message: "Compra já em andamento: a data da compra não pode ser depois de hoje.",
    });
  }
});

// "2026-11-07" (dia em Brasília) para comparar datas sem horário
function diaLocal(data: Date) {
  const { mes, dia } = partesLocais(data);
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

type Compra = z.infer<typeof compra>;
type Erro = { status: number; error: string; detalhes?: Record<string, string[]> };
type DiasCartao = { closingDay: number; dueDay: number };

// Quantos meses a fatura escolhida pode ficar antes/depois da automática
const MESES_ANTES = 1;
const MESES_DEPOIS = 2;

// Quantos meses de "de" até "ate" ("2026-11", "2027-02" → 3)
function mesesEntre(de: string, ate: string) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

// Fatura da 1ª parcela lançada: a escolhida pela pessoa ou a automática.
// Automática: pela data da compra (compra nova) ou a fatura atual (compra já em andamento).
function faturaInicial(d: Compra, dias: DiasCartao): Erro | { mes: string } {
  const automatica = (d.currentInstallment ?? 1) > 1 ? faturaAtual(dias) : mesDaFatura(d.date, dias);
  if (!d.invoiceMonth) return { mes: automatica };
  const distancia = mesesEntre(automatica, d.invoiceMonth);
  if (distancia < -MESES_ANTES || distancia > MESES_DEPOIS) {
    const error = "Escolha uma fatura próxima da data da compra.";
    return { status: 400, error, detalhes: { invoiceMonth: [error] } };
  }
  return { mes: d.invoiceMonth };
}

async function conferir(req: Request, d: Compra): Promise<Erro | DiasCartao> {
  const cartao = await prisma.financialAccount.findFirst({ where: { id: d.cardId, type: "CREDIT_CARD", ...scope(req) } });
  if (!cartao) return { status: 404, error: "Cartão não encontrado." };
  if (cartao.archivedAt) return { status: 400, error: "Este cartão está arquivado. Reative para lançar compras." };
  if (!cartao.closingDay || !cartao.dueDay) {
    return { status: 400, error: "Cadastre o dia de fechamento e de vencimento do cartão antes de lançar compras." };
  }
  if (d.categoryId) {
    const categoria = await prisma.category.findFirst({ where: { id: d.categoryId, ...scope(req) } });
    if (!categoria) return { status: 404, error: "Categoria não encontrada." };
    if (categoria.type !== "EXPENSE") return { status: 400, error: "Use uma categoria de despesa." };
  }
  const tagIds = [...new Set(d.tagIds ?? [])];
  if (tagIds.length) {
    const n = await prisma.tag.count({ where: { id: { in: tagIds }, ...scope(req) } });
    if (n !== tagIds.length) return { status: 404, error: "Tag não encontrada." };
  }
  return { closingDay: cartao.closingDay, dueDay: cartao.dueDay };
}

// Monta as parcelas: uma por mês, cada uma na fatura seguinte à anterior.
// Compra já em andamento (currentInstallment > 1): divide o valor total entre todas as
// parcelas (igual ao banco), mas só lança da parcela atual em diante; ela cai na fatura
// atual do cartão (ou na escolhida) e as seguintes nas próximas. As anteriores já foram pagas fora do app.
function montarParcelas(req: Request, d: Compra, faturaDaPrimeira: string, purchaseId: string) {
  const atual = d.currentInstallment ?? 1;
  // Fatura em que cairia a 1ª parcela (para a parcela "atual" ficar na fatura escolhida)
  const primeiraFatura = somarMeses(faturaDaPrimeira, -(atual - 1));
  const valores = dividirParcelas(d.amount, d.installments);
  const parcelado = d.installments > 1;
  const todas = valores.map((valor, i) => ({
    ...scope(req),
    createdById: req.user!.id,
    type: "EXPENSE" as const,
    accountId: d.cardId,
    categoryId: d.categoryId ?? null,
    amount: valor,
    description: d.description,
    date: somarMesesNaData(d.date, i),
    status: "CONFIRMED" as const,
    invoiceMonth: somarMeses(primeiraFatura, i),
    purchaseId,
    installmentNumber: parcelado ? i + 1 : null,
    installmentTotal: parcelado ? d.installments : null,
    notes: d.notes || null,
    launchDate: d.launchDate ?? null,
    ignoreInStatistics: d.ignoreInStatistics ?? false,
    ignoreInBudgets: d.ignoreInBudgets ?? false,
    ignoreInMonthlySavings: d.ignoreInMonthlySavings ?? false,
  }));
  return todas.slice(atual - 1);
}

type Parcela = ReturnType<typeof montarParcelas>[number];
type Anexo = { originalName: string; mime: string; size: number; storageKey: string; createdAt: Date };

// Cria as parcelas (com as tags em cada uma). Os anexos ficam na 1ª parcela lançada.
async function criarParcelas(tx: Prisma.TransactionClient, parcelas: Parcela[], tagIds: string[], anexos: Anexo[] = []) {
  for (const [i, p] of parcelas.entries()) {
    await tx.transaction.create({
      data: {
        ...p,
        ...(tagIds.length ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
        ...(i === 0 && anexos.length ? { attachments: { create: anexos } } : {}),
      },
    });
  }
}

async function devolverCompra(req: Request, purchaseId: string) {
  const parcelas = await prisma.transaction.findMany({
    where: { ...scope(req), purchaseId },
    include: incluir,
    orderBy: { date: "asc" },
  });
  // invoiceMonth: fatura da 1ª parcela lançada (o formulário usa para manter a fatura ao editar)
  return { purchaseId, invoiceMonth: parcelas[0]?.invoiceMonth ?? null, installments: parcelas.map(serializar) };
}

// Busca a compra e confere se nenhuma parcela está numa fatura com pagamento
async function compraEditavel(req: Request) {
  const purchaseId = String(req.params.purchaseId);
  const parcelas = await prisma.transaction.findMany({ where: { ...scope(req), purchaseId, type: "EXPENSE" } });
  if (parcelas.length === 0) return { status: 404, error: "Compra não encontrada." } as Erro;
  const travadas = await faturasComPagamento(scope(req).householdId, parcelas[0].accountId, parcelas.map((p) => p.invoiceMonth!));
  if (travadas.length) return { status: 409, error: "Esta compra está numa fatura que já tem pagamento. Desfaça o pagamento antes." } as Erro;
  return { purchaseId };
}

// POST /api/card-expenses → lança uma compra no cartão (gera as parcelas)
cardExpensesRouter.post("/", validateBody(compra), async (req, res) => {
  const d = req.body as Compra;
  const r = await conferir(req, d);
  if ("error" in r) return res.status(r.status).json({ error: r.error });
  const fatura = faturaInicial(d, r);
  if ("error" in fatura) return res.status(fatura.status).json({ error: fatura.error, detalhes: fatura.detalhes });

  const purchaseId = randomUUID();
  const parcelas = montarParcelas(req, d, fatura.mes, purchaseId);
  await prisma.$transaction((tx) => criarParcelas(tx, parcelas, [...new Set(d.tagIds ?? [])]));
  res.status(201).json(await devolverCompra(req, purchaseId));
});

// GET /api/card-expenses/:purchaseId → a compra com todas as parcelas
cardExpensesRouter.get("/:purchaseId", async (req, res) => {
  const compraAtual = await devolverCompra(req, String(req.params.purchaseId));
  if (compraAtual.installments.length === 0) return res.status(404).json({ error: "Compra não encontrada." });
  res.json(compraAtual);
});

// PUT /api/card-expenses/:purchaseId → refaz a compra com os dados novos (troca todas as parcelas de uma vez)
cardExpensesRouter.put("/:purchaseId", validateBody(compra), async (req, res) => {
  const d = req.body as Compra;
  const atual = await compraEditavel(req);
  if ("error" in atual) return res.status(atual.status).json({ error: atual.error });
  const r = await conferir(req, d);
  if ("error" in r) return res.status(r.status).json({ error: r.error });
  const fatura = faturaInicial(d, r);
  if ("error" in fatura) return res.status(fatura.status).json({ error: fatura.error, detalhes: fatura.detalhes });

  const novas = montarParcelas(req, d, fatura.mes, atual.purchaseId);
  const travadas = await faturasComPagamento(scope(req).householdId, d.cardId, novas.map((p) => p.invoiceMonth));
  if (travadas.length) return res.status(409).json({ error: "A compra cairia numa fatura que já tem pagamento. Desfaça o pagamento antes." });

  // Anexos continuam (passam para a 1ª parcela nova; o arquivo é o mesmo). Tags: sem o campo, mantém as de antes.
  await prisma.$transaction(async (tx) => {
    const antigas = await tx.transaction.findMany({
      where: { ...scope(req), purchaseId: atual.purchaseId },
      select: { tags: { select: { tagId: true } }, attachments: { select: { originalName: true, mime: true, size: true, storageKey: true, createdAt: true } } },
      orderBy: { date: "asc" },
    });
    const anexos = antigas.flatMap((p) => p.attachments);
    const tagIds = d.tagIds ? [...new Set(d.tagIds)] : (antigas[0]?.tags.map((t) => t.tagId) ?? []);
    await tx.transaction.deleteMany({ where: { ...scope(req), purchaseId: atual.purchaseId } });
    await criarParcelas(tx, novas, tagIds, anexos);
  });
  res.json(await devolverCompra(req, atual.purchaseId));
});

// DELETE /api/card-expenses/:purchaseId → apaga a compra e todas as parcelas
cardExpensesRouter.delete("/:purchaseId", async (req, res) => {
  const atual = await compraEditavel(req);
  if ("error" in atual) return res.status(atual.status).json({ error: atual.error });
  const anexos = await prisma.transactionAttachment.findMany({
    where: { transaction: { ...scope(req), purchaseId: atual.purchaseId } },
    select: { storageKey: true },
  });
  await prisma.transaction.deleteMany({ where: { ...scope(req), purchaseId: atual.purchaseId } });
  await apagarArquivos(anexos.map((a) => a.storageKey));
  res.status(204).end();
});
