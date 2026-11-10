import { FaWallet, FaBuildingColumns, FaCreditCard, FaChartLine, FaEllipsis } from "react-icons/fa6";

// Ícone, nome e cor de cada tipo de conta (cor: círculo do campo "Categoria" no formulário de conta)
export const TIPOS_CONTA = {
  WALLET: { Icone: FaWallet, nome: "Carteira", cor: "bg-amber-500" },
  BANK: { Icone: FaBuildingColumns, nome: "Conta corrente", cor: "bg-emerald-600" },
  INVESTMENT: { Icone: FaChartLine, nome: "Investimento", cor: "bg-blue-600" },
  OTHER: { Icone: FaEllipsis, nome: "Outros", cor: "bg-slate-500" },
  CREDIT_CARD: { Icone: FaCreditCard, nome: "Cartão de crédito" },
};
