import { formatarReais } from "./api.js";

// Largura da barra (0 a 100)
export const larguraObjetivo = (progresso) => Math.min(Math.max(Number(progresso.percent) || 0, 0), 100);

// "45,5%"
export const textoPercentualObjetivo = (progresso) => `${Number(progresso.percent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// Linha curta embaixo da barra: falta, quanto por mês ou meta atingida
export function textoFalta(objetivo) {
  const p = objetivo.progress;
  if (p.reached) return { texto: "Meta atingida!", cor: "text-emerald-700" };
  if (p.overdue) return { texto: `Data passou · faltam ${formatarReais(p.remaining)}`, cor: "text-red-600" };
  if (p.perMonth !== null) return { texto: `${formatarReais(p.perMonth)}/mês · faltam ${formatarReais(p.remaining)}`, cor: "text-slate-600" };
  return { texto: `Faltam ${formatarReais(p.remaining)}`, cor: "text-slate-600" };
}

// Ritmo (só com data alvo): no ritmo ou atrasado
export function textoRitmo(progresso) {
  if (progresso.onTrack === null || progresso.reached) return null;
  return progresso.onTrack ? { texto: "No ritmo", classe: "bg-emerald-100 text-emerald-800" } : { texto: "Atrasado", classe: "bg-amber-100 text-amber-800" };
}

export const NOMES_SITUACAO = { ACTIVE: "Ativo", COMPLETED: "Concluído", ARCHIVED: "Arquivado" };
