import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { nomeDoMes, somarMes } from "../../lib/datas.js";
import { FATURA_MESES_ANTES, FATURA_MESES_DEPOIS, mesesEntre, vencimentoCurto } from "../../lib/cartoes.js";
import { botaoIcone } from "./estilos.js";

const textoFatura = (mes, dueDay) => `${nomeDoMes(mes)} (vence ${vencimentoCurto(mes, dueDay)})`;

// Escolha da fatura da compra: Fatura: ‹ outubro de 2026 (vence 30/10) ›
// "automatica" é a fatura calculada pela data; dá para ir de 1 mês antes a 2 meses depois
// (o banco às vezes lança compras feitas perto do fechamento na fatura seguinte).
function SeletorFatura({ rotulo = "Fatura", mes, automatica, dueDay, onMudar, erro }) {
  const distancia = mesesEntre(automatica, mes);
  const anterior = somarMes(mes, -1);
  const proxima = somarMes(mes, 1);
  const manual = mes !== automatica;
  // Voltar para a automática = "sem escolha" (acompanha a data se ela mudar)
  const mudar = (novo) => onMudar(novo === automatica ? null : novo);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1" role="group" aria-label={rotulo}>
        <span className="shrink-0 font-medium">{rotulo}:</span>
        <button
          type="button"
          onClick={() => mudar(anterior)}
          disabled={distancia <= -FATURA_MESES_ANTES}
          className={`${botaoIcone} h-9 w-9`}
          aria-label={`Fatura anterior (${nomeDoMes(anterior)})`}
        >
          <FaChevronLeft aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 text-center font-bold first-letter:uppercase" aria-live="polite">
          {textoFatura(mes, dueDay)}
        </p>
        <button
          type="button"
          onClick={() => mudar(proxima)}
          disabled={distancia >= FATURA_MESES_DEPOIS}
          className={`${botaoIcone} h-9 w-9`}
          aria-label={`Próxima fatura (${nomeDoMes(proxima)})`}
        >
          <FaChevronRight aria-hidden="true" />
        </button>
      </div>
      {manual && (
        <p className="text-slate-600">
          O banco às vezes lança compras feitas perto do fechamento na fatura seguinte. Escolha a fatura em que a compra aparece no app do banco.{" "}
          <button
            type="button"
            onClick={() => onMudar(null)}
            className="rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            Voltar para a automática
          </button>
        </p>
      )}
      {erro && (
        <p className="text-red-600" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

export default SeletorFatura;
