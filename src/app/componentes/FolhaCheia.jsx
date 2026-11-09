import { useEffect, useId, useRef } from "react";
import { FaXmark } from "react-icons/fa6";
import { botaoIcone } from "./estilos.js";

// Formulário em tela cheia (celular) ou janela alta centralizada (computador).
// Barra do topo: ✕ para fechar, o título e o botão "Salvar" à direita (envia o <form id={formId}>).
// corSalvar: classes do botão Salvar (vermelho na despesa, verde na receita...).
// Usa o <dialog> nativo: prende o foco e fecha com Esc. Abre ao montar; o pai desmonta para fechar.
function FolhaCheia({ titulo, formId, onFechar, salvando = false, corSalvar = "bg-primary hover:bg-primary-dark", podeSalvar = true, children }) {
  const ref = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    const anterior = document.activeElement;
    if (!dialogo.open) dialogo.showModal();
    return () => {
      if (dialogo.open) dialogo.close();
      anterior?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        if (e.target === ref.current) onFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onFechar();
      }}
      className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-y-auto bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-3xl"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white px-2 py-2 shadow-sm sm:px-3">
        <button type="button" onClick={onFechar} className={botaoIcone} aria-label="Fechar">
          <FaXmark aria-hidden="true" className="text-xl text-slate-600" />
        </button>
        <h2 id={idTitulo} className="min-w-0 flex-1 truncate font-heading text-xl font-bold text-slate-900">
          {titulo}
        </h2>
        {podeSalvar && (
          <button
            type="submit"
            form={formId}
            disabled={salvando}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-5 font-bold text-white shadow transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60 ${corSalvar}`}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        )}
      </div>
      <div className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}

export default FolhaCheia;
