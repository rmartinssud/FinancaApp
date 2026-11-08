import { useEffect, useId, useRef } from "react";
import { FaXmark } from "react-icons/fa6";
import { botaoIcone } from "./estilos.js";

// Janela sobreposta: no celular abre como "bottom sheet" (de baixo para cima),
// no computador fica centralizada. Usa o <dialog> nativo, que já prende o foco
// dentro da janela e fecha com Esc. Abre ao montar; o pai desmonta para fechar.
function Modal({ titulo, onFechar, children }) {
  const ref = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    // Guarda quem tinha o foco para devolver quando a janela fechar
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
        e.preventDefault(); // Esc: quem fecha é o pai (desmontando)
        // Com uma janela aberta por cima de outra, o Esc fecha só a de cima
        if (e.target === ref.current) onFechar();
      }}
      onClick={(e) => {
        // Toque no fundo escuro fora da janela também fecha
        if (e.target === ref.current) onFechar();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3">
        <h2 id={idTitulo} className="font-heading text-xl font-bold text-slate-900">
          {titulo}
        </h2>
        <button type="button" onClick={onFechar} className={botaoIcone} aria-label="Fechar">
          <FaXmark aria-hidden="true" className="text-lg" />
        </button>
      </div>
      <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">{children}</div>
    </dialog>
  );
}

export default Modal;
