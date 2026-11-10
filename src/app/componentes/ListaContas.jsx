import { formatarReais } from "../../lib/api.js";
import { TIPOS_CONTA } from "../../lib/contas.js";
import LogoConta from "./LogoConta.jsx";

// Saldo em vermelho quando negativo (com o sinal de menos, para não depender só da cor)
export function Saldo({ valor, className = "" }) {
  const negativo = Number(valor) < 0;
  return <span className={`font-bold ${negativo ? "text-red-600" : "text-slate-900"} ${className}`}>{formatarReais(valor)}</span>;
}

// Cheque especial: quanto está usando (se o saldo está negativo) e quanto ainda dá para gastar
export function InfoCheque({ conta }) {
  const limite = Number(conta.overdraftLimit ?? 0);
  if (limite <= 0) return null;
  const saldo = Number(conta.currentBalance);
  return (
    <>
      {saldo < 0 && <span className="block text-sm font-medium text-red-600">Usando {formatarReais(Math.min(-saldo, limite))} do cheque especial</span>}
      <span className="block text-sm text-slate-500">Disponível {formatarReais(conta.availableBalance ?? saldo + limite)}</span>
    </>
  );
}

// Uma linha de conta: logo do banco (ou ícone do tipo), nome e saldo atual
export function LinhaConta({ conta, detalhe }) {
  const { nome } = TIPOS_CONTA[conta.type] ?? TIPOS_CONTA.WALLET;
  return (
    <>
      <LogoConta conta={conta} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">{conta.name}</span>
        <span className="block text-sm text-slate-500">{detalhe ?? nome}</span>
        <InfoCheque conta={conta} />
      </span>
      <span className="text-right">
        <span className="block text-xs text-slate-500">Saldo atual</span>
        <Saldo valor={conta.currentBalance} />
      </span>
    </>
  );
}
