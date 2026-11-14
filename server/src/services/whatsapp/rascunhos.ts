import type { WhatsAppDraft } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { dividirParcelas } from "../cartoes.js";
import { diaLocal, formatarDia, formatarReais } from "../alertas/regras.js";
import { somarDiasAoDia } from "./parser.js";
import type { CategoriaSimples } from "./casamento.js";

// ─────────────────────────────────────────────
// Peças do rascunho de lançamento do WhatsApp usadas pelo bot (parser) e pelo assistente (IA).
// O rascunho só vira lançamento quando a pessoa confirma (botão Confirmar ou "sim").
// ─────────────────────────────────────────────

export const VALIDADE_RASCUNHO_MIN = 30;

export const hojeLocal = () => diaLocal(new Date());

export async function categoriasDoEspaco(householdId: string): Promise<CategoriaSimples[]> {
  return prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true, parentId: true }, orderBy: { name: "asc" } });
}

export async function contasDoEspaco(householdId: string) {
  return prisma.financialAccount.findMany({
    where: { householdId },
    select: { id: true, name: true, type: true, isDefault: true, archivedAt: true, closingDay: true, dueDay: true },
    orderBy: { createdAt: "asc" },
  });
}

// Rascunho pendente (e ainda válido) desta pessoa no WhatsApp
export async function rascunhoPendente(waId: string, userId: string) {
  return prisma.whatsAppDraft.findFirst({
    where: { waId, userId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
  });
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const nomeFatura = (mes: string) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

export function quando(dia: string) {
  const hoje = hojeLocal();
  const curto = formatarDia(dia).slice(0, 5);
  if (dia === hoje) return `hoje (${curto})`;
  if (dia === somarDiasAoDia(hoje, -1)) return `ontem (${curto})`;
  return formatarDia(dia);
}

export async function textoDoRascunho(r: WhatsAppDraft, espaco: string) {
  const [conta, categoria] = await Promise.all([
    prisma.financialAccount.findUnique({ where: { id: r.accountId }, select: { name: true, type: true } }),
    r.categoryId ? prisma.category.findUnique({ where: { id: r.categoryId }, include: { parent: { select: { name: true } } } }) : null,
  ]);
  const receita = r.type === "INCOME";
  const cartao = conta?.type === "CREDIT_CARD";
  const nomeCategoria = categoria ? (categoria.parent ? `${categoria.parent.name} › ${categoria.name}` : categoria.name) : "sem categoria";
  const parcelas = r.installments > 1 ? ` em ${r.installments}x de ${formatarReais(dividirParcelas(r.amount, r.installments).at(-1)!)}` : "";
  return [
    `*Confirma ${receita ? "esta receita" : "esta despesa"}?*`,
    `${receita ? "💰" : "💸"} ${formatarReais(r.amount)}${parcelas} · ${r.description}`,
    `🏷️ ${nomeCategoria}`,
    cartao ? `💳 Cartão ${conta?.name}${r.invoiceMonth ? ` · fatura de ${nomeFatura(r.invoiceMonth)}` : ""}` : `🏦 ${conta?.name ?? "Conta"}`,
    `📅 ${quando(diaLocal(r.date))}`,
    `📁 Espaço ${espaco}`,
  ].join("\n");
}
