import { useId, useState } from "react";
import { FaChevronDown, FaCheck, FaPlus, FaUser, FaUsers } from "react-icons/fa6";
import Modal from "./Modal.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";

// Troca de espaço: o servidor guarda o último usado; recarregar a página
// limpa os dados em memória e abre tudo do espaço novo.
async function trocarPara(id) {
  await api(`/households/${id}/activate`, { method: "POST" });
  window.location.assign("/app");
}

function CriarEspaco({ onFechar }) {
  const [nome, setNome] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return setErros({ name: "Dê um nome ao espaço." });
    setSalvando(true);
    try {
      await api("/households", enviarJson("POST", { name: nome.trim() }));
      window.location.assign("/app/familia");
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Criar espaço" onFechar={onFechar}>
      <form onSubmit={criar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>
        <p className="text-slate-600">
          Um espaço tem contas, cartões, categorias e lançamentos próprios. Crie um para a família e convide quem vai lançar junto.
        </p>
        <Campo label="Nome do espaço" maxLength={60} placeholder="Ex.: Família Martins" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} autoFocus />
        <BotaoEnviar texto="Criar espaço" carregando={salvando} textoCarregando="Criando..." className="w-full" />
      </form>
    </Modal>
  );
}

// Nome do espaço ativo + chevron. Abre a lista de espaços e o "Criar espaço".
function SeletorEspaco({ me }) {
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const idLista = useId();
  const espacos = me?.households ?? [];
  const ativo = espacos.find((h) => h.active) ?? me?.household;

  async function escolher(h) {
    if (h.active) return setAberto(false);
    setErro("");
    try {
      await trocarPara(h.id);
    } catch (falha) {
      setErro(falha.message);
    }
  }

  return (
    <div className="mx-3">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-controls={idLista}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        {ativo?.isPersonal ? <FaUser aria-hidden="true" className="text-primary" /> : <FaUsers aria-hidden="true" className="text-primary" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Espaço</span>
          <span className="block truncate font-bold text-slate-900">{ativo?.name ?? "..."}</span>
        </span>
        <FaChevronDown aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div id={idLista} className="mt-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-lg">
          <Alerta className="m-1">{erro}</Alerta>
          <ul aria-label="Seus espaços">
            {espacos.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => escolher(h)}
                  aria-current={h.active ? "true" : undefined}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-slate-700 hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {h.name}
                    {h.memberCount > 1 && <span className="ml-1 text-xs text-slate-500">· {h.memberCount} pessoas</span>}
                  </span>
                  {h.active && <FaCheck aria-label="Espaço atual" className="shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl border-t border-slate-100 px-3 text-left font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <FaPlus aria-hidden="true" /> Criar espaço
          </button>
        </div>
      )}

      {criando && <CriarEspaco onFechar={() => setCriando(false)} />}
    </div>
  );
}

export default SeletorEspaco;
