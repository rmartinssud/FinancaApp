import { useEffect, useMemo, useRef, useState } from "react";
import { FaMagnifyingGlass, FaXmark, FaCheck, FaBan } from "react-icons/fa6";
import { BANCOS, urlLogo } from "../dados/bancos.js";
import { botaoIcone } from "./estilos.js";

// Tira acentos e deixa minúsculo, para a busca achar "itau" em "Itaú"
const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const TIPOS = { banco: "Banco", fintech: "Banco digital", cooperativa: "Cooperativa", corretora: "Corretora" };

// "Selecionar imagem": lista de bancos com busca, em tela cheia (carregado só quando abre)
function SeletorLogoBanco({ valor, onEscolher, onFechar }) {
  const ref = useRef(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const dialogo = ref.current;
    const anterior = document.activeElement;
    if (!dialogo.open) dialogo.showModal();
    return () => {
      if (dialogo.open) dialogo.close();
      anterior?.focus?.();
    };
  }, []);

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    return termo ? BANCOS.filter((b) => normalizar(`${b.nome} ${b.slug} ${TIPOS[b.tipo] ?? ""}`).includes(termo)) : BANCOS;
  }, [busca]);

  const item = "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

  return (
    <dialog
      ref={ref}
      aria-label="Selecionar logo do banco"
      onCancel={(e) => {
        e.preventDefault();
        if (e.target === ref.current) onFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onFechar();
      }}
      className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 sm:m-auto sm:h-[85dvh] sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 px-2 pb-3 pt-2 shadow-sm sm:px-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onFechar} className={botaoIcone} aria-label="Fechar">
              <FaXmark aria-hidden="true" className="text-xl text-slate-600" />
            </button>
            <h2 className="font-heading text-xl font-bold text-slate-900">Selecionar imagem</h2>
          </div>
          <div className="relative mt-2 px-1">
            <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar banco (ex.: Nubank, Itaú, XP)"
              aria-label="Buscar banco"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto overscroll-contain p-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {!busca && (
            <li>
              <button type="button" onClick={() => onEscolher(null)} className={item} aria-pressed={!valor}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FaBan aria-hidden="true" />
                </span>
                <span className="flex-1 font-medium">Sem logo</span>
                {!valor && <FaCheck aria-hidden="true" className="text-primary" />}
              </button>
            </li>
          )}
          {lista.map((b) => (
            <li key={b.slug}>
              <button type="button" onClick={() => onEscolher(b.slug)} className={item} aria-pressed={valor === b.slug}>
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200"
                  style={b.fundo ? { backgroundColor: b.fundo } : undefined}
                >
                  <img src={urlLogo(b.slug)} alt="" loading="lazy" decoding="async" className="h-7 w-7 object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{b.nome}</span>
                  <span className="block text-xs text-slate-500">{TIPOS[b.tipo]}</span>
                </span>
                {valor === b.slug && <FaCheck aria-hidden="true" className="text-primary" />}
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Nenhum banco encontrado para “{busca}”.</li>}
        </ul>
      </div>
    </dialog>
  );
}

export default SeletorLogoBanco;
