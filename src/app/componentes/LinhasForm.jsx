import { FaChevronDown } from "react-icons/fa6";
import Interruptor from "./Interruptor.jsx";

// ─────────────────────────────────────────────
// Peças do formulário em linhas (ícone à esquerda, campo à direita)
// ─────────────────────────────────────────────

export const classeCampo =
  "w-full min-w-0 bg-transparent py-1 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400";

export function EmBreve() {
  return <span className="ml-2 shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">Em breve</span>;
}

// Uma linha do formulário. rotulo: texto pequeno em cima (como no app de referência).
export function Linha({ Icone, rotulo, idCampo, erro, children, acao, apagada = false }) {
  return (
    <div className={`border-b border-slate-100 px-5 py-3 ${apagada ? "opacity-70" : ""}`}>
      {rotulo && (
        <label htmlFor={idCampo} className="mb-1 ml-10 block text-sm text-slate-500">
          {rotulo}
        </label>
      )}
      <div className="flex min-h-11 items-center gap-4">
        <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        {acao}
      </div>
      {erro && (
        <p id={`${idCampo}-erro`} className="ml-10 mt-1 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

// Lista de opções sem borda, com a setinha à direita
export function SelectLimpo({ id, erro, children, ...props }) {
  return (
    <div className="relative w-full">
      <select
        id={id}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${classeCampo} appearance-none rounded-lg pr-8 focus-visible:ring-4 focus-visible:ring-primary/20`}
        {...props}
      >
        {children}
      </select>
      <FaChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
    </div>
  );
}

// Interruptor de algo que ainda não existe (aparece desligado, com "Em breve")
export function InterruptorEmBreve({ Icone, texto }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-400" />
      <Interruptor
        texto={
          <>
            {texto}
            <EmBreve />
          </>
        }
        ligado={false}
        desabilitado
        className="min-w-0 flex-1"
      />
    </div>
  );
}

// Linha de algo que ainda não existe (sem interruptor)
export function LinhaEmBreve({ Icone, texto, children }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2 text-slate-400" aria-disabled="true">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl" />
      <span className="min-w-0 flex-1 font-medium">
        {texto}
        <EmBreve />
      </span>
      {children}
    </div>
  );
}
