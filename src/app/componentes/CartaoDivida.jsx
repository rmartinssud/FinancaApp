import { formatarReais } from "../../lib/api.js";
import { CLASSES_SITUACAO_DIVIDA, NOMES_SITUACAO_DIVIDA, textoTaxa, tipoDivida } from "../../lib/dividas.js";

// Bolinha com o ícone do tipo de dívida (decorativa)
export function IconeDivida({ tipo, tamanho = "h-11 w-11 text-lg" }) {
  const t = tipoDivida(tipo);
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-2xl text-white ${tamanho}`} style={{ backgroundColor: t.cor }}>
      <t.Icone />
    </span>
  );
}

// Selo da situação: Ativa / Quitada / Arquivada
export function SeloDivida({ status }) {
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${CLASSES_SITUACAO_DIVIDA[status]}`}>{NOMES_SITUACAO_DIVIDA[status]}</span>;
}

// Barra do quanto já foi pago em relação ao saldo de referência
export function BarraDivida({ divida, altura = "h-2.5" }) {
  const largura = Math.min(Math.max(Number(divida.percentPaid) || 0, 0), 100);
  return (
    <div role="progressbar" aria-label={`Pago de ${divida.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(largura)} className={`${altura} overflow-hidden rounded-full bg-slate-100`}>
      <div className="h-full rounded-full bg-emerald-600 transition-[width] motion-reduce:transition-none" style={{ width: `${Math.max(largura, largura > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

// Uma dívida na lista: ícone, nome, saldo devedor, taxa, mínimo e a barra do pago
export function ConteudoDivida({ divida }) {
  const pct = `${Number(divida.percentPaid).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% pago`;
  return (
    <span className="flex w-full min-w-0 items-start gap-3">
      <IconeDivida tipo={divida.type} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-bold text-slate-900">{divida.name}</span>
          <SeloDivida status={divida.status} />
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-slate-600">
            <span className="whitespace-nowrap font-semibold text-slate-800">{formatarReais(divida.currentBalance)}</span>
            <span className="whitespace-nowrap"> de {formatarReais(divida.originalBalance)}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold text-slate-600">{pct}</span>
        </span>
        <span className="mt-1.5 block">
          <BarraDivida divida={divida} />
        </span>
        <span className="mt-1 block truncate text-sm text-slate-600">
          {textoTaxa(divida.interestRateMonthly)}
          {Number(divida.minimumPayment) > 0 && (
            <>
              {" · mínimo "}
              <span className="whitespace-nowrap">{formatarReais(divida.minimumPayment)}</span>
            </>
          )}
          {divida.dueDay && ` · vence dia ${divida.dueDay}`}
        </span>
      </span>
    </span>
  );
}
