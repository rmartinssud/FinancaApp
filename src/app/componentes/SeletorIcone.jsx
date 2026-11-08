import { useMemo, useState } from "react";
import { FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import { GRUPOS_ICONES, ICONES_CATEGORIA } from "../../lib/icones.js";

// Tira acentos e deixa minúsculo, para a busca achar "agua" em "Água"
const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Escolha do ícone da categoria: busca + ícones em grupos, numa área com rolagem
function SeletorIcone({ valor, onMudar, cor, erro, nome = "icone-categoria" }) {
  const [busca, setBusca] = useState("");

  const grupos = useMemo(() => {
    const termo = normalizar(busca.trim());
    const lista = GRUPOS_ICONES.map((g) => ({
      grupo: g.grupo,
      icones: termo
        ? g.icones.filter((i) => normalizar(`${i.nome} ${i.busca} ${g.grupo}`).includes(termo))
        : g.icones,
    })).filter((g) => g.icones.length);
    // Ícone salvo que não está mais na lista continua aparecendo na edição
    if (valor && !ICONES_CATEGORIA[valor] && !termo) lista.unshift({ grupo: "Atual", icones: [{ chave: valor, nome: "Ícone atual", Icone: null }] });
    return lista;
  }, [busca, valor]);

  const atual = ICONES_CATEGORIA[valor];

  return (
    <fieldset>
      <legend className="mb-2 flex w-full items-center justify-between font-medium text-slate-800">
        <span>Ícone</span>
        {atual && <span className="text-sm font-normal text-slate-500">{atual.nome}</span>}
      </legend>

      <div className="relative mb-3">
        <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ícone (ex.: luz, pet, mercado)"
          aria-label="Buscar ícone"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
          >
            <FaXmark />
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 p-2">
        {grupos.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nenhum ícone encontrado para “{busca}”.</p>}
        {grupos.map((g) => (
          <div key={g.grupo} className="mb-3 last:mb-0">
            <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.grupo}</p>
            <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
              {g.icones.map((i) => {
                const ativo = valor === i.chave;
                return (
                  <label key={i.chave} className="flex justify-center" title={i.nome}>
                    <input type="radio" name={nome} value={i.chave} checked={ativo} onChange={() => onMudar(i.chave)} className="peer sr-only" aria-label={i.nome} />
                    <span
                      className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 text-lg transition peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${
                        ativo ? "border-slate-900 text-white" : "border-transparent bg-soft text-primary hover:bg-primary/10"
                      }`}
                      style={ativo ? { backgroundColor: cor } : undefined}
                    >
                      {i.Icone ? <i.Icone aria-hidden="true" /> : "?"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </fieldset>
  );
}

export default SeletorIcone;
