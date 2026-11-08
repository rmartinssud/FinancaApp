import { FaPlus } from "react-icons/fa6";

// Botão redondo fixo no canto da tela (acima do menu de baixo no celular)
function BotaoFlutuante({ texto, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-14 items-center gap-2 rounded-full bg-primary px-6 font-bold text-white shadow-[0_12px_30px_-6px_rgba(70,79,163,0.7)] transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:ring-offset-2 lg:bottom-8 lg:right-8"
    >
      <FaPlus aria-hidden="true" />
      {texto}
    </button>
  );
}

export default BotaoFlutuante;
