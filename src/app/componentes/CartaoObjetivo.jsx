import { FaCircleCheck } from "react-icons/fa6";
import IconeCategoria from "./IconeCategoria.jsx";
import { formatarReais } from "../../lib/api.js";
import { larguraObjetivo, textoFalta, textoPercentualObjetivo, textoRitmo } from "../../lib/objetivos.js";

// Barra de progresso do objetivo (guardado / meta), na cor do objetivo
export function BarraObjetivo({ objetivo, altura = "h-2.5" }) {
  const largura = larguraObjetivo(objetivo.progress);
  return (
    <div
      role="progressbar"
      aria-label={`Guardado de ${objetivo.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(largura)}
      className={`${altura} overflow-hidden rounded-full bg-slate-100`}
    >
      <div
        className="h-full rounded-full transition-[width] motion-reduce:transition-none"
        style={{ width: `${Math.max(largura, largura > 0 ? 2 : 0)}%`, backgroundColor: objetivo.progress.reached ? "#047857" : objetivo.color }}
      />
    </div>
  );
}

// Selo pequeno: No ritmo / Atrasado / Meta atingida
export function SeloObjetivo({ objetivo }) {
  const p = objetivo.progress;
  if (p.reached && objetivo.status === "ACTIVE") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
        <FaCircleCheck aria-hidden="true" />
        Atingida
      </span>
    );
  }
  const ritmo = objetivo.status === "ACTIVE" ? textoRitmo(p) : null;
  if (!ritmo) return null;
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ritmo.classe}`}>{ritmo.texto}</span>;
}

// Conteúdo de um objetivo na lista: ícone, nome, "R$ guardado de R$ meta", barra e quanto falta
export function ConteudoObjetivo({ objetivo, compacto = false }) {
  const p = objetivo.progress;
  const falta = textoFalta(objetivo);
  return (
    <span className="flex w-full min-w-0 items-start gap-3">
      <IconeCategoria categoria={objetivo} tamanho={compacto ? "h-9 w-9 text-base" : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-bold text-slate-900">{objetivo.name}</span>
          <SeloObjetivo objetivo={objetivo} />
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-slate-600">
            <span className="whitespace-nowrap font-semibold text-slate-800">{formatarReais(p.saved)}</span>
            <span className="whitespace-nowrap"> de {formatarReais(objetivo.targetAmount)}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold text-slate-600">{textoPercentualObjetivo(p)}</span>
        </span>
        <span className="mt-1.5 block">
          <BarraObjetivo objetivo={objetivo} altura={compacto ? "h-2" : "h-2.5"} />
        </span>
        <span className={`mt-1 block truncate whitespace-nowrap text-sm font-medium ${falta.cor}`}>{falta.texto}</span>
      </span>
    </span>
  );
}
