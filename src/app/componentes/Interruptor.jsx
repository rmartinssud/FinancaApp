import { useId } from "react";

// Interruptor liga/desliga (role="switch"): o texto inteiro é clicável e funciona com teclado
function Interruptor({ texto, descricao, ligado, onMudar, className = "" }) {
  const id = useId();
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <span className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer font-medium text-slate-800">
          {texto}
        </label>
        {descricao && <span className="block text-sm text-slate-500">{descricao}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => onMudar(!ligado)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 motion-reduce:transition-none ${
          ligado ? "bg-primary" : "bg-slate-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${ligado ? "translate-x-7" : "translate-x-1"}`}
        />
      </button>
    </div>
  );
}

export default Interruptor;
