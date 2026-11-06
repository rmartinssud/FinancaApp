import { FaArrowRight } from "react-icons/fa6";

// Botão pílula com seta (mesmo estilo do ButtonArrow45 da landing),
// com estado de "carregando" para formulários.
const variantes = {
  primary: "bg-primary text-white hover:shadow-lg",
  light: "bg-soft text-primary hover:bg-primary hover:text-white",
  perigo: "bg-red-50 text-red-700 hover:bg-red-600 hover:text-white",
};

function BotaoEnviar({ texto, carregando = false, textoCarregando = "Aguarde...", variante = "primary", type = "submit", onClick, className = "" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={carregando}
      aria-busy={carregando}
      className={`group inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 py-3 font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-wait disabled:opacity-70 ${variantes[variante]} ${className}`}
    >
      {carregando ? textoCarregando : texto}
      {!carregando && (
        <FaArrowRight aria-hidden="true" className="-rotate-45 transition-transform duration-300 group-hover:rotate-0" />
      )}
    </button>
  );
}

export default BotaoEnviar;
