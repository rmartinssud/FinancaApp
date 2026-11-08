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
