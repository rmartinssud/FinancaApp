import { FaTriangleExclamation, FaCircleCheck, FaLayerGroup } from "react-icons/fa6";
import IconeCategoria from "./IconeCategoria.jsx";
import { formatarReais } from "../../lib/api.js";
import { corDaBarra, larguraDaBarra, textoPercentual, textoSaldo } from "../../lib/orcamentos.js";

// Selo pequeno: Estourado (vermelho), Alerta (âmbar) ou Alcançado (verde)
export function SeloOrcamento({ status }) {
  if (status === "OVER")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
        <FaTriangleExclamation aria-hidden="true" />
        Estourado
      </span>
    );
  if (status === "ALERT")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
        <FaTriangleExclamation aria-hidden="true" />
        Alerta
      </span>
    );
  if (status === "REACHED")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
        <FaCircleCheck aria-hidden="true" />
        Alcançado
      </span>
    );
  return null;
}

// Barra de progresso (usado / meta)
export function BarraOrcamento({ orcamento, altura = "h-2.5" }) {
  const largura = larguraDaBarra(orcamento.progress);
  return (
    <div
      role="progressbar"
      aria-label={`Usado de ${orcamento.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(largura)}
      className={`${altura} overflow-hidden rounded-full bg-slate-100`}
    >
      <div className="h-full rounded-full transition-[width] motion-reduce:transition-none" style={{ width: `${Math.max(largura, largura > 0 ? 2 : 0)}%`, backgroundColor: corDaBarra(orcamento) }} />
    </div>
  );
}

// Ícone do orçamento (cor + ícone, igual às categorias). Agrupado sem ícone usa camadas.
export function IconeOrcamento({ orcamento, tamanho }) {
  if (!orcamento.icon && orcamento.isGroup) {
    return (
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white" style={{ backgroundColor: orcamento.color }}>
        <FaLayerGroup />
      </span>
    );
  }
  return <IconeCategoria categoria={orcamento} tamanho={tamanho} />;
}

// Conteúdo de um orçamento na lista: ícone, nome, "R$ usado de R$ meta", barra e saldo
export function ConteudoOrcamento({ orcamento, compacto = false }) {
  const p = orcamento.progress;
  const saldo = textoSaldo(orcamento);
  return (
    <span className="flex w-full min-w-0 items-start gap-3">
      <IconeOrcamento orcamento={orcamento} tamanho={compacto ? "h-9 w-9 text-base" : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-bold text-slate-900">{orcamento.name}</span>
          {orcamento.isGroup && <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">Agrupado</span>}
          <SeloOrcamento status={p.status} />
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-slate-600">
            <span className="whitespace-nowrap font-semibold text-slate-800">{formatarReais(p.used)}</span>
            <span className="whitespace-nowrap"> de {formatarReais(p.goal)}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold text-slate-600">{textoPercentual(p)}</span>
        </span>
        <span className="mt-1.5 block">
          <BarraOrcamento orcamento={orcamento} altura={compacto ? "h-2" : "h-2.5"} />
        </span>
        <span className={`mt-1 block whitespace-nowrap text-sm font-medium ${saldo.cor}`}>{saldo.texto}</span>
      </span>
    </span>
  );
}
