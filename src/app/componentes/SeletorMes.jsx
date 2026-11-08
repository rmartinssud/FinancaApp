import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { nomeDoMes, somarMes } from "../../lib/datas.js";
import { botaoIcone } from "./estilos.js";

// Escolha do mês com setas: ‹ novembro de 2026 ›
function SeletorMes({ mes, onMudar, className = "" }) {
  const nome = nomeDoMes(mes);
  return (
    <div className={`flex items-center justify-between gap-2 rounded-full bg-white p-1 shadow-sm ${className}`} role="group" aria-label="Mês">
      <button type="button" onClick={() => onMudar(somarMes(mes, -1))} className={botaoIcone} aria-label={`Mês anterior (${nomeDoMes(somarMes(mes, -1))})`}>
        <FaChevronLeft aria-hidden="true" />
      </button>
      <p className="min-w-0 flex-1 text-center font-bold text-slate-900 first-letter:uppercase" aria-live="polite">
        {nome}
      </p>
      <button type="button" onClick={() => onMudar(somarMes(mes, 1))} className={botaoIcone} aria-label={`Próximo mês (${nomeDoMes(somarMes(mes, 1))})`}>
        <FaChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

export default SeletorMes;
