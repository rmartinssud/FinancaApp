import { useId } from "react";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { formatarReais } from "../../lib/api.js";
import { mascarar, centavosDe } from "../../lib/dinheiro.js";

// Multicategorias: linhas de categoria + valor. A soma tem que bater com o valor final do lançamento.
// opcoes: categorias do tipo (com subcategorias, campo "rotulo"); totalCentavos: valor final.
function CamposDivisao({ linhas, onMudar, opcoes, totalCentavos, erro }) {
  const base = useId();
  const soma = linhas.reduce((s, l) => s + centavosDe(l.valor), 0);
  const diferenca = totalCentavos - soma;
  const mudar = (i, campo, valor) => onMudar(linhas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const remover = (i) => onMudar(linhas.filter((_, j) => j !== i));
  // A linha nova já vem com o que falta para fechar a conta
  const adicionar = () => onMudar([...linhas, { categoryId: "", valor: diferenca > 0 ? mascarar(String(diferenca)) : "" }]);

  return (
    <div className="space-y-2 border-b border-slate-100 bg-soft/50 px-5 py-3 pl-[3.75rem]">
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <label htmlFor={`${base}-cat-${i}`} className="sr-only">
            Categoria {i + 1}
          </label>
          <select
            id={`${base}-cat-${i}`}
            value={l.categoryId}
            onChange={(e) => mudar(i, "categoryId", e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
          >
            <option value="">Categoria</option>
            {opcoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
          <label htmlFor={`${base}-valor-${i}`} className="sr-only">
            Valor da categoria {i + 1}
          </label>
          <input
            id={`${base}-valor-${i}`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={l.valor}
            onChange={(e) => mudar(i, "valor", mascarar(e.target.value))}
            className="h-11 w-28 shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-right text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => remover(i)}
            disabled={linhas.length <= 2}
            aria-label={`Tirar a categoria ${i + 1}`}
            className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-30"
          >
            <FaXmark aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={adicionar}
          disabled={linhas.length >= 20}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-primary transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <FaPlus aria-hidden="true" />
          Adicionar categoria
        </button>
        <p aria-live="polite" className={`whitespace-nowrap text-sm font-bold ${diferenca === 0 ? "text-emerald-700" : "text-red-600"}`}>
          {diferenca === 0
            ? "Soma confere"
            : diferenca > 0
              ? `Falta ${formatarReais((diferenca / 100).toFixed(2))}`
              : `Passou ${formatarReais((-diferenca / 100).toFixed(2))}`}
        </p>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}

export default CamposDivisao;
