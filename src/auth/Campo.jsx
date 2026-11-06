import { useId, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

// Campo de formulário com rótulo, mensagem de erro e (se for senha) botão de mostrar/ocultar.
function Campo({ label, erro, dica, type = "text", className = "", ...props }) {
  const id = useId();
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const ehSenha = type === "password";
  const idAjuda = `${id}-ajuda`;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block font-medium text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={ehSenha && mostrarSenha ? "text" : type}
          aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro || dica ? idAjuda : undefined}
          className={`h-12 w-full rounded-2xl border bg-white px-4 text-slate-900 transition placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 ${
            ehSenha ? "pr-14" : ""
          } ${erro ? "border-red-500" : "border-slate-300"}`}
          {...props}
        />
        {ehSenha && (
          <button
            type="button"
            onClick={() => setMostrarSenha(!mostrarSenha)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={mostrarSenha}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-soft hover:text-primary focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            {mostrarSenha ? <FaEyeSlash /> : <FaEye />}
          </button>
        )}
      </div>
      {(erro || dica) && (
        <p id={idAjuda} className={`mt-2 text-sm ${erro ? "text-red-600" : "text-slate-500"}`}>
          {erro || dica}
        </p>
      )}
    </div>
  );
}

export default Campo;
