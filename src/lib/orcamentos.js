// Orçamentos: textos e cores usados nas telas (Orçamentos, detalhes e Início)
import { formatarReais } from "./api.js";

// Cor da barra de progresso conforme a situação calculada pela API
// OVER = estourado (vermelho), ALERT = passou do alerta (âmbar), REACHED = receita alcançada (verde)
export function corDaBarra(orcamento) {
  const s = orcamento.progress?.status;
  if (s === "OVER") return "#dc2626";
  if (s === "ALERT") return "#d97706";
  if (s === "REACHED") return "#059669";
  return orcamento.color ?? "#464fa3";
}

// Largura da barra (0 a 100%)
export function larguraDaBarra(progresso) {
  if (!progresso) return 0;
  if (progresso.percent === null) return Number(progresso.used) > 0 ? 100 : 0;
  return Math.min(Math.max(progresso.percent, 0), 100);
}

// "Resta R$ 79,90" / "Estourou R$ 20,10" (despesa) · "Falta R$ 100,00" / "Alcançado" (receita)
export function textoSaldo(orcamento) {
  const saldo = Number(orcamento.progress.balance);
  if (orcamento.kind === "INCOME") {
    if (saldo <= 0) return { texto: Number(orcamento.progress.goal) > 0 ? "Alcançado" : "Sem meta", cor: "text-emerald-700" };
    return { texto: `Falta ${formatarReais(saldo)}`, cor: "text-slate-600" };
  }
  if (saldo < 0) return { texto: `Estourou ${formatarReais(-saldo)}`, cor: "text-red-600" };
  return { texto: `Resta ${formatarReais(saldo)}`, cor: "text-emerald-700" };
}

// Percentual em texto: "84%" (ou "—" sem meta)
export function textoPercentual(progresso) {
  if (progresso?.percent === null || progresso?.percent === undefined) return "—";
  return `${Math.round(progresso.percent)}%`;
}

// "dd/mm/aaaa" de "AAAA-MM-DD"
export function dataBr(dia) {
  if (!dia) return "";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

export const NOMES_META = {
  FIXED: "Valor fixo",
  PERCENT_INCOME: "% do total de receitas do mês",
  PERCENT_BUDGET: "% da meta de um orçamento de receita",
};
