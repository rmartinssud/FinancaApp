import { FaCreditCard, FaHandHoldingDollar, FaFileContract, FaBuildingColumns, FaUserGroup, FaFileInvoiceDollar } from "react-icons/fa6";
import { nomeDoMes } from "./datas.js";

// Tipos de dívida: nome, ícone e cor da bolinha
export const TIPOS_DIVIDA = [
  { valor: "CARTAO", nome: "Cartão de crédito", Icone: FaCreditCard, cor: "#ef4444" },
  { valor: "EMPRESTIMO", nome: "Empréstimo", Icone: FaHandHoldingDollar, cor: "#f59e0b" },
  { valor: "FINANCIAMENTO", nome: "Financiamento", Icone: FaFileContract, cor: "#464fa3" },
  { valor: "CHEQUE_ESPECIAL", nome: "Cheque especial", Icone: FaBuildingColumns, cor: "#8b5cf6" },
  { valor: "PESSOAL", nome: "Pessoal (amigos, família)", Icone: FaUserGroup, cor: "#0891b2" },
  { valor: "OUTRA", nome: "Outra", Icone: FaFileInvoiceDollar, cor: "#64748b" },
];

export const tipoDivida = (valor) => TIPOS_DIVIDA.find((t) => t.valor === valor) ?? TIPOS_DIVIDA[TIPOS_DIVIDA.length - 1];

export const NOMES_SITUACAO_DIVIDA = { ACTIVE: "Ativa", PAID: "Quitada", ARCHIVED: "Arquivada" };

export const CLASSES_SITUACAO_DIVIDA = {
  ACTIVE: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-100 text-slate-700",
};

// "2.5" → "2,5% a.m."
export function textoTaxa(taxa) {
  const n = Number(taxa);
  if (!n) return "sem juros";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.`;
}

// "2026-11" → "nov. de 2026" (curto, para listas)
const formatoMesAno = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
export function mesAnoCurto(mes) {
  if (!mes) return "";
  const [ano, m] = mes.split("-").map(Number);
  return formatoMesAno.format(new Date(Date.UTC(ano, m - 1, 15)));
}

export const mesPorExtenso = (mes) => (mes ? nomeDoMes(mes) : "");

// "1 mês", "14 meses", "2 anos e 3 meses"
export function textoMeses(n) {
  if (n <= 0) return "0 meses";
  const anos = Math.floor(n / 12);
  const meses = n % 12;
  const m = meses === 1 ? "1 mês" : `${meses} meses`;
  if (!anos) return m;
  const a = anos === 1 ? "1 ano" : `${anos} anos`;
  return meses ? `${a} e ${m}` : a;
}
