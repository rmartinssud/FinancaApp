import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft, FaTags } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import BotaoApagar from "./componentes/BotaoApagar.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../lib/api.js";
import { CORES_CATEGORIA } from "../lib/icones.js";

// Criar, renomear (e trocar a cor) ou apagar uma tag
function FormTag({ tag, onFechar, onSalvo }) {
  const editando = Boolean(tag);
  const [nome, setNome] = useState(tag?.name ?? "");
  const [cor, setCor] = useState(tag?.color ?? CORES_CATEGORIA[0].cor);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return setErros({ name: "Escreva o nome da tag." });
    setErros({});
    setErro("");
    setSalvando(true);
    try {
      const corpo = { name: nome.trim(), color: cor };
      if (editando) await api(`/tags/${tag.id}`, enviarJson("PATCH", corpo));
      else await api("/tags", enviarJson("POST", corpo));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function apagar() {
    setApagando(true);
    try {
      await api(`/tags/${tag.id}`, { method: "DELETE" });
      onSalvo();
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar tag" : "Nova tag"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>
        <Campo label="Nome" maxLength={30} autoComplete="off" placeholder="Ex.: Viagem" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} />
        <fieldset>
          <legend className="mb-2 block font-medium text-slate-800">Cor</legend>
          <div className="grid grid-cols-6 gap-2">
            {CORES_CATEGORIA.map((c) => (
              <label key={c.cor} className="flex justify-center">
                <input type="radio" name="cor-tag" value={c.cor} checked={cor === c.cor} onChange={() => setCor(c.cor)} className="peer sr-only" aria-label={c.nome} />
                <span
                  aria-hidden="true"
                  className={`h-10 w-10 cursor-pointer rounded-xl border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${cor === c.cor ? "border-slate-900" : "border-transparent"}`}
                  style={{ backgroundColor: c.cor }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <BotaoEnviar texto={editando ? "Salvar alterações" : "Criar tag"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />
        {editando && (
          <div className="flex justify-center">
            <BotaoApagar texto="Apagar tag" pergunta="Apagar esta tag? Os lançamentos continuam, só sem ela." onConfirmar={apagar} carregando={apagando} />
          </div>
        )}
      </form>
    </Modal>
  );
}

// Tags do espaço: quantos lançamentos usam cada uma; tocar abre os lançamentos com a tag
function Tags() {
  const { erroMe, podeEditar } = useMe();
  const [tags, setTags] = useState(null);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState(null);

  const carregar = useCallback(() => {
    api("/tags")
      .then(setTags)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>
      <div className="flex items-center gap-2">
        <Link
          to="/app/categorias"
          aria-label="Voltar para Categorias"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 font-heading text-2xl font-bold text-slate-900 md:text-4xl">Tags</h1>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEdicao("nova")}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            + Nova<span className="sr-only"> tag</span>
          </button>
        )}
      </div>

      <section className={`${cartao} mt-6`} aria-label="Lista de tags">
        {tags === null && !erro && <p role="status" className="text-slate-500">Carregando tags...</p>}
        {tags?.length === 0 && (
          <div className="py-4 text-center">
            <FaTags aria-hidden="true" className="mx-auto text-3xl text-primary-light" />
            <p className="mt-3 text-slate-600">Nenhuma tag ainda. Crie aqui ou direto no formulário da despesa/receita.</p>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {(tags ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Link
                to={`/app/lancamentos?tag=${t.id}`}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: t.color ?? "#94a3b8" }} />
                <span className="min-w-0 flex-1 truncate font-bold text-slate-900">{t.name}</span>
                <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">
                  {t.usage} {t.usage === 1 ? "lançamento" : "lançamentos"}
                </span>
              </Link>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => setEdicao(t)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  Editar<span className="sr-only"> tag {t.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {edicao && (
        <FormTag
          tag={edicao === "nova" ? null : edicao}
          onFechar={() => setEdicao(null)}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Tags;
