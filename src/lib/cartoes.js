// Cartões de crédito: bandeiras, cores e as mesmas regras de fatura do servidor
// (server/src/services/cartoes.ts). A fatura é identificada pelo mês do VENCIMENTO.
import { hoje, somarMes } from "./datas.js";

export const BANDEIRAS = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  ELO: "Elo",
  AMEX: "Amex",
  HIPERCARD: "Hipercard",
  OTHER: "Outra",
};

export const CORES_CARTAO = [
  { valor: "#8a05be", nome: "Roxo" },
  { valor: "#ec7000", nome: "Laranja" },
  { valor: "#cc092f", nome: "Vermelho" },
  { valor: "#464fa3", nome: "Índigo" },
  { valor: "#0e7490", nome: "Ciano" },
  { valor: "#15803d", nome: "Verde" },
  { valor: "#1e293b", nome: "Grafite" },
  { valor: "#b45309", nome: "Dourado" },
  { valor: "#db2777", nome: "Rosa" },
  { valor: "#2563eb", nome: "Azul" },
];

export const COR_PADRAO = "#464fa3";

const diasNoMes = (mes) => {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
};

// Mês da fatura de uma compra feita no dia "AAAA-MM-DD" (data local de Brasília)
export function mesDaFatura(data, closingDay, dueDay) {
  if (!data || !closingDay || !dueDay) return null;
  const mes = data.slice(0, 7);
  const dia = Number(data.slice(8, 10));
  const fecha = Math.min(closingDay, diasNoMes(mes));
  const mesFechamento = dia >= fecha ? somarMes(mes, 1) : mes;
  return dueDay > closingDay ? mesFechamento : somarMes(mesFechamento, 1);
}

// Fatura aberta hoje (onde entra uma compra feita agora)
export const faturaAtual = (cartao) => mesDaFatura(hoje(), cartao?.closingDay, cartao?.dueDay);

// Quantos meses de "de" até "ate" ("2026-11", "2027-02" → 3)
export function mesesEntre(de, ate) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

// Fatura escolhida à mão: de 1 mês antes a 2 meses depois da automática (igual ao servidor)
export const FATURA_MESES_ANTES = 1;
export const FATURA_MESES_DEPOIS = 2;
export function faturaPermitida(mes, automatica) {
  if (!mes || !automatica) return false;
  const distancia = mesesEntre(automatica, mes);
  return distancia >= -FATURA_MESES_ANTES && distancia <= FATURA_MESES_DEPOIS;
}

// Mesma data N meses antes/depois, sem passar do último dia do mês ("2026-07-31", 1 → "2026-08-31"; 2 → "2026-09-30")
export function somarMesesNaData(data, meses, dia = Number(data.slice(8, 10))) {
  const mes = somarMes(data.slice(0, 7), meses);
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, "0")}`;
}

// Dia do vencimento da fatura de "mes" (ex.: "2026-12", 10 → "10/12")
export function vencimentoCurto(mes, dueDay) {
  const dia = Math.min(dueDay, diasNoMes(mes));
  return `${String(dia).padStart(2, "0")}/${mes.slice(5, 7)}`;
}

// Situação da fatura vinda da API
export const SITUACOES = {
  OPEN: { texto: "Aberta", classe: "bg-sky-100 text-sky-800" },
  CLOSED: { texto: "Fechada", classe: "bg-amber-100 text-amber-800" },
  PAID: { texto: "Paga", classe: "bg-emerald-100 text-emerald-800" },
  OVERDUE: { texto: "Vencida", classe: "bg-red-100 text-red-700" },
};

// "2/10" nas parcelas
export const textoParcela = (l) => (l.installmentTotal ? `${l.installmentNumber}/${l.installmentTotal}` : "");

// Data ISO da API -> "10/12" (em Brasília)
export const dataCurta = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
