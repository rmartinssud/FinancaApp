import { formatarReais } from "../../lib/api.js";
import { TIPOS_CONTA } from "../../lib/contas.js";

// Saldo em vermelho quando negativo (com o sinal de menos, para não depender só da cor)
export function Saldo({ valor, className = "" }) {
  const negativo = Number(valor) < 0;
  return <span className={`font-bold ${negativo ? "text-red-600" : "text-slate-900"} ${className}`}>{formatarReais(valor)}</span>;
}

// Uma linha de conta: ícone do tipo, nome e saldo atual
export function LinhaConta({ conta, detalhe }) {
  const { Icone, nome } = TIPOS_CONTA[conta.type] ?? TIPOS_CONTA.WALLET;
  return (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-soft text-lg text-primary">
        <Icone aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">{conta.name}</span>
        <span className="block text-sm text-slate-500">{detalhe ?? nome}</span>
      </span>
      <span className="text-right">
        <span className="block text-xs text-slate-500">Saldo atual</span>
        <Saldo valor={conta.currentBalance} />
      </span>
    </>
  );
}
