import { Prisma } from "@prisma/client";
import { z } from "zod";

// ─────────────────────────────────────────────
// Dinheiro: sempre Decimal (nunca float). No JSON sai como texto "10.50".
// ─────────────────────────────────────────────

export const Decimal = Prisma.Decimal;
export const ZERO = new Prisma.Decimal(0);

// Aceita "10.5", "10.50" ou 10.5 (até 2 casas, até 10 dígitos antes do ponto)
const valorBase = z
  .union([z.string().trim(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d{1,10}(\.\d{1,2})?$/.test(v), {
    message: "Use um número com até 2 casas decimais (ex.: 10.50).",
    abort: true, // formato errado: nem tenta as outras regras
  });

// Valor de lançamento: maior que zero
export const valorPositivo = valorBase
  .refine((v) => new Prisma.Decimal(v).gt(0), "O valor precisa ser maior que zero.")
  .transform((v) => new Prisma.Decimal(v));

// Saldo inicial: pode ser negativo (ex.: conta no cheque especial)
export const valorComSinal = valorBase.transform((v) => new Prisma.Decimal(v));

// Limite do cartão: zero ou mais
export const valorNaoNegativo = valorBase
  .refine((v) => new Prisma.Decimal(v).gte(0), "O valor não pode ser negativo.")
  .transform((v) => new Prisma.Decimal(v));

// ─────────────────────────────────────────────
// Datas e meses (fuso de Brasília)
// ─────────────────────────────────────────────

const FUSO = "America/Sao_Paulo";

export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM (ex.: 2026-11).");

// Mês atual em Brasília, ex.: "2026-11"
export function mesAtual() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(new Date());
}

// Hoje em Brasília como data de lançamento (12:00 UTC = 09:00 em Brasília, igual a uma data "AAAA-MM-DD")
export function hojeComoData() {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${dia}T12:00:00.000Z`);
}

// Início e fim do mês no horário de Brasília (UTC-3 fixo: sem horário de verão desde 2019).
// Uso: where: { date: intervaloDoMes("2026-11") }
export function intervaloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(ano, m - 1, 1, 3)), // dia 1 às 00:00 em Brasília
    lt: new Date(Date.UTC(ano, m, 1, 3)), // dia 1 do mês seguinte
  };
}

// Data do lançamento: "2026-11-07" ou data/hora ISO com fuso ("2026-11-07T14:30:00-03:00").
// Só a data vira 12:00 UTC (09:00 em Brasília), assim nunca "pula" para o dia anterior.
export const dataSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], { error: "Use uma data ISO (ex.: 2026-11-07)." })
  .transform((s) => (s.length === 10 ? new Date(`${s}T12:00:00.000Z`) : new Date(s)));

// Soma (ou subtrai) meses: somarMeses("2026-01", -1) → "2025-12"
export function somarMeses(mes: string, quantidade: number) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + quantidade, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Quantos dias tem o mês "2026-02" (→ 28)
export function diasNoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

// Ano, mês ("AAAA-MM") e dia de uma data no horário de Brasília (UTC-3 fixo)
export function partesLocais(data: Date) {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  const mes = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
  return { mes, dia: local.getUTCDate() };
}

// Data (12:00 UTC = 09:00 em Brasília) de um dia do mês, sem passar do último dia.
// diaDoMes("2026-02", 31) → 28/02/2026
export function diaDoMes(mes: string, dia: number) {
  const d = Math.min(dia, diasNoMes(mes));
  return new Date(`${mes}-${String(d).padStart(2, "0")}T12:00:00.000Z`);
}
