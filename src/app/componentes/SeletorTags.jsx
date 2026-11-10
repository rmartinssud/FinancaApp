import { useId, useState } from "react";
import { FaCheck, FaPlus } from "react-icons/fa6";
import Modal from "./Modal.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson } from "../../lib/api.js";

// Escolha de várias tags, com "criar tag nova" na hora.
// tags: todas do espaço; escolhidas: ids marcados. onCriada recebe a tag nova (já fica marcada).
function SeletorTags({ tags, escolhidas, onMudar, onCriada, onFechar, podeCriar = true }) {
  const idNova = useId();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  const alternar = (id) => onMudar(escolhidas.includes(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id]);

  async function criar(e) {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return setErro("Escreva o nome da tag.");
    const existente = tags.find((t) => t.name.toLowerCase() === limpo.toLowerCase());
    if (existente) {
      if (!escolhidas.includes(existente.id)) onMudar([...escolhidas, existente.id]);
      setNome("");
      return setErro("");
    }
    setCriando(true);
    setErro("");
    try {
      const nova = await api("/tags", enviarJson("POST", { name: limpo }));
      onCriada(nova);
      onMudar([...escolhidas, nova.id]);
      setNome("");
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setCriando(false);
    }
  }

  return (
    <Modal titulo="Tags" onFechar={onFechar}>
      <div className="space-y-4">
        <Alerta>{erro}</Alerta>
        {podeCriar && (
          <form onSubmit={criar} className="flex items-center gap-2">
            <label htmlFor={idNova} className="sr-only">
              Nova tag
            </label>
            <input
              id={idNova}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={30}
              autoComplete="off"
              placeholder="Nova tag (ex.: Viagem)"
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={criando}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 font-bold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"
            >
              <FaPlus aria-hidden="true" className="text-sm" />
              {criando ? "Criando..." : "Criar"}
            </button>
          </form>
        )}

        {tags.length === 0 ? (
          <p className="text-slate-500">Nenhuma tag ainda. Crie a primeira acima.</p>
        ) : (
          <ul className="max-h-[50dvh] divide-y divide-slate-100 overflow-y-auto">
            {tags.map((t) => {
              const marcada = escolhidas.includes(t.id);
              return (
                <li key={t.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-1 py-2">
                    <input type="checkbox" checked={marcada} onChange={() => alternar(t.id)} className="peer sr-only" />
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs text-white peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${
                        marcada ? "border-primary bg-primary" : "border-slate-300 bg-white"
                      }`}
                    >
                      {marcada && <FaCheck />}
                    </span>
                    <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color ?? "#94a3b8" }} />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={onFechar}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 font-bold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          Pronto
        </button>
      </div>
    </Modal>
  );
}

// Chips das tags escolhidas (ou "Nenhuma")
export function ChipsTags({ tags, vazio = "Nenhuma" }) {
  if (!tags.length) return <span className="text-slate-400">{vazio}</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-soft px-2.5 py-0.5 text-sm font-bold text-primary-dark">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color ?? "#94a3b8" }} />
          <span className="truncate">{t.name}</span>
        </span>
      ))}
    </span>
  );
}

export default SeletorTags;
