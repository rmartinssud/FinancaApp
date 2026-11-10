import { lazy, Suspense, useState } from "react";
import { FaChevronRight } from "react-icons/fa6";
import LogoConta from "./LogoConta.jsx";
import { BANCOS } from "../dados/bancos.js";

// A lista com busca só é baixada quando a pessoa abre o seletor
const SeletorLogoBanco = lazy(() => import("./SeletorLogoBanco.jsx"));

// Linha "Logo do banco" do formulário: mostra o logo atual e abre a lista para trocar
function CampoLogo({ valor, onMudar, tipo, erro }) {
  const [aberto, setAberto] = useState(false);
  const banco = BANCOS.find((b) => b.slug === valor);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2.5 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <LogoConta conta={{ type: tipo, bankLogo: valor }} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-slate-800">Logo do banco</span>
          <span className="block truncate text-sm text-slate-500">{banco?.nome ?? "Sem logo"}</span>
        </span>
        <FaChevronRight aria-hidden="true" className="text-slate-400" />
      </button>
      {erro && <p className="mt-1 text-sm text-red-600">{erro}</p>}
      {aberto && (
        <Suspense fallback={null}>
          <SeletorLogoBanco
            valor={valor}
            onFechar={() => setAberto(false)}
            onEscolher={(slug) => {
              onMudar(slug);
              setAberto(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default CampoLogo;
