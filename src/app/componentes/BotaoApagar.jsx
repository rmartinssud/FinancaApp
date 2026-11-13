import { useState } from "react";
import { FaTrashCan } from "react-icons/fa6";

// Apagar em duas etapas: o primeiro toque pede confirmação.
// "opcoes" ([{ rotulo, valor }]) troca o "Sim, apagar" por um botão por opção;
// onConfirmar recebe o valor escolhido.
function BotaoApagar({ texto = "Apagar", pergunta, onConfirmar, carregando = false, opcoes = null }) {
  const [escolhido, setEscolhido] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-bold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
      >
        <FaTrashCan aria-hidden="true" />
        {texto}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirmar exclusão" className="w-full rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">{pergunta}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(opcoes ?? [{ rotulo: "Sim, apagar", valor: undefined }]).map((opcao, i) => (
          <button
            key={opcao.rotulo}
            type="button"
            onClick={() => {
              setEscolhido(opcao.rotulo);
              onConfirmar(opcao.valor);
            }}
            disabled={carregando}
            aria-busy={carregando && escolhido === opcao.rotulo}
            autoFocus={i === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
          >
            {carregando && escolhido === opcao.rotulo ? "Apagando..." : opcao.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default BotaoApagar;
