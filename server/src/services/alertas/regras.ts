import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────
// Regras puras dos alertas (sem banco): datas em Brasília, limiares, prazos e agrupamento.
// Brasília é UTC-3 fixo (sem horário de verão desde 2019), igual ao resto do app.
// ─────────────────────────────────────────────

const TRES_HORAS = 3 * 60 * 60 * 1000;
const UM_DIA = 24 * 60 * 60 * 1000;

// "AAAA-MM-DD" da data no horário de Brasília
export function diaLocal(data: Date) {
  return new Date(data.getTime() - TRES_HORAS).toISOString().slice(0, 10);
}

// Hora (0 a 23) em Brasília
export function horaLocal(data: Date) {
  return new Date(data.getTime() - TRES_HORAS).getUTCHours();
}

// 00:00 do dia "AAAA-MM-DD" em Brasília
export function inicioDoDiaLocal(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 3));
}

export function somarDias(dia: string, n: number) {
  return diaLocal(new Date(inicioDoDiaLocal(dia).getTime() + n * UM_DIA));
}

// Quantos dias de "de" até "ate" (mesmo dia = 0, amanhã = 1, ontem = -1)
export function diasEntre(de: string, ate: string) {
  return Math.round((inicioDoDiaLocal(ate).getTime() - inicioDoDiaLocal(de).getTime()) / UM_DIA);
}

// "2026-11-20" → "20/11/2026"
export function formatarDia(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatarReais(v: Prisma.Decimal | number | string) {
  return reais.format(Number(v)).replace(/\u00a0/g, " ");
}

// Alertas só saem de dia (07:00 até 21:59 em Brasília), nunca de madrugada
export const HORA_INICIO = 7;
export const HORA_FIM = 22;
export function dentroDoHorario(agora: Date) {
  const h = horaLocal(agora);
  return h >= HORA_INICIO && h < HORA_FIM;
}

// ── Orçamento ──────────────────────────────────

export type NivelOrcamento = "WARNING" | "OVER" | null;

// Qual aviso o orçamento merece agora:
// - OVER: passou de 100% (usado maior que a meta: saldo negativo, o mesmo "Estourado" da tela);
// - WARNING: chegou ao % de alerta do orçamento (padrão 80%). Sem % de alerta: sem esse aviso;
// - meta zero ou vazia: nada.
export function nivelDoOrcamento(usado: Prisma.Decimal, meta: Prisma.Decimal, alertPercent: number | null): NivelOrcamento {
  if (!meta.gt(0)) return null;
  if (usado.gt(meta)) return "OVER";
  if (alertPercent !== null && usado.times(100).gte(meta.times(alertPercent))) return "WARNING";
  return null;
}

export function percentual(usado: Prisma.Decimal, meta: Prisma.Decimal) {
  return meta.gt(0) ? Number(usado.dividedBy(meta).times(100).toFixed(1)) : 0;
}

export function formatarPercentual(p: number) {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ── Fatura ─────────────────────────────────────

// A fatura entra no aviso quando faltam de 0 até "diasAntes" dias para o vencimento.
// (0 a N, e não só N: se o servidor ficou fora no dia exato, o aviso sai mesmo assim, uma vez só.)
export function faturaNoPrazo(diasParaVencer: number, diasAntes: number) {
  return diasParaVencer >= 0 && diasParaVencer <= diasAntes;
}

export function quandoVence(dias: number) {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

// ── Contas a pagar ─────────────────────────────

export type ContaPendente = { id: string; description: string; amount: Prisma.Decimal; date: Date; accountName: string };

// Separa as despesas pendentes em "hoje" e "amanhã" (as outras ficam de fora)
export function agruparContas(lista: ContaPendente[], hoje: string) {
  const amanha = somarDias(hoje, 1);
  const ordenar = (a: ContaPendente, b: ContaPendente) => a.date.getTime() - b.date.getTime() || a.description.localeCompare(b.description, "pt-BR");
  return {
    hoje: lista.filter((c) => diaLocal(c.date) === hoje).sort(ordenar),
    amanha: lista.filter((c) => diaLocal(c.date) === amanha).sort(ordenar),
  };
}
