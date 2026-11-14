import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaArrowDown, FaArrowLeft, FaArrowUp, FaFloppyDisk, FaGripVertical, FaPen, FaPlus, FaXmark } from "react-icons/fa6";
import AppLayout from "../AppLayout.jsx";
import { cartao } from "../componentes/estilos.js";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { NOMES_TIPO, classeFoco, situacaoDoItem } from "../../educacao/util.js";
import { useEquipe } from "./useEquipe.js";
import { Erro, SemAcesso } from "./AdminEducacao.jsx";
import { EditorMarkdown, botaoClaro, botaoPrimario, classeEntrada } from "./campos.jsx";
import { AcoesSituacao, CampoCapa, CamposComuns } from "./compartilhado.jsx";
import { corpoComum, formDoItem, useListasDoPainel } from "./painel.js";

// Montagem das aulas: arrastar (computador) ou setas (celular), adicionar existente ou criar nova
function Aulas({ curso, onMudou, bloqueado }) {
  const [aulas, setAulas] = useState(curso.lessons);
  const [arrastando, setArrastando] = useState(null);
  const [todos, setTodos] = useState(null);
  const [busca, setBusca] = useState("");
  const [novaAula, setNovaAula] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setAulas(curso.lessons), [curso.lessons]);
  useEffect(() => {
    if (bloqueado) return;
    api("/admin/educacao/conteudos")
      .then(setTodos)
      .catch(() => setTodos([]));
  }, [bloqueado]);

  async function gravar(lista) {
    setAulas(lista);
    setErro("");
    setSalvando(true);
    try {
      onMudou(await api(`/admin/educacao/cursos/${curso.id}/aulas`, enviarJson("PUT", { contentIds: lista.map((a) => a.id) })));
    } catch (e) {
      setErro(e.message);
      setAulas(curso.lessons);
    } finally {
      setSalvando(false);
    }
  }
  const mover = (de, para) => {
    if (para < 0 || para >= aulas.length || de === para) return;
    const nova = [...aulas];
    const [x] = nova.splice(de, 1);
    nova.splice(para, 0, x);
    gravar(nova);
  };

  async function criarAula(e) {
    e.preventDefault();
    if (novaAula.trim().length < 3) return setErro("Dê um título à aula (pelo menos 3 letras).");
    setErro("");
    try {
      const c = await api(
        "/admin/educacao/conteudos",
        enviarJson("POST", { title: novaAula.trim(), listed: false, visibility: curso.visibility, categoryId: curso.categoryId, authorId: curso.authorId }),
      );
      setNovaAula("");
      await gravar([...aulas, c]);
      setTodos((t) => [c, ...(t ?? [])]);
    } catch (err) {
      setErro(errosPorCampo(err).title ?? err.message);
    }
  }

  const disponiveis = useMemo(() => {
    const ids = new Set(aulas.map((a) => a.id));
    const t = busca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return (todos ?? [])
      .filter((c) => !ids.has(c.id))
      .filter(
        (c) =>
          !t ||
          c.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(t),
      )
      .slice(0, 8);
  }, [todos, aulas, busca]);

  return (
    <section aria-labelledby="titulo-aulas-painel" className={cartao}>
      <h2 id="titulo-aulas-painel" className="font-heading text-lg font-bold text-slate-900">
        Aulas ({aulas.length})
      </h2>
      <p className="mt-1 text-sm text-slate-600">Cada aula é um conteúdo (texto, vídeo ou os dois, com materiais). Arraste ou use as setas para mudar a ordem; salva na hora. Só aulas publicadas aparecem no site.</p>
      <div className="mt-2">
        <Erro>{erro}</Erro>
      </div>
      {aulas.length === 0 && <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nenhuma aula ainda. Crie a primeira abaixo.</p>}
      <ol className="mt-3 space-y-2" aria-busy={salvando}>
        {aulas.map((a, i) => {
          const s = situacaoDoItem(a);
          return (
            <li
              key={a.id}
              draggable={!bloqueado}
              onDragStart={() => setArrastando(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastando !== null) mover(arrastando, i);
                setArrastando(null);
              }}
              onDragEnd={() => setArrastando(null)}
              className={`flex items-center gap-2 rounded-2xl border bg-white p-2 sm:p-3 ${arrastando === i ? "border-primary opacity-60" : "border-slate-200"}`}
            >
              {!bloqueado && <FaGripVertical aria-hidden="true" className="hidden shrink-0 cursor-grab text-slate-400 sm:block" />}
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-900">{a.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${s.classe}`}>{s.texto}</span>
                  {NOMES_TIPO[a.kind]}
                  {a.visibility === "REGISTERED" ? " · só cadastrados" : ""}
                </span>
              </span>
              <Link to={`/app/admin/educacao/conteudos/${a.id}`} aria-label={`Editar a aula ${a.title}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft ${classeFoco}`}>
                <FaPen aria-hidden="true" />
              </Link>
              {!bloqueado && (
                <>
                  <button type="button" disabled={i === 0 || salvando} onClick={() => mover(i, i - 1)} aria-label={`Subir ${a.title}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft disabled:opacity-30 ${classeFoco}`}>
                    <FaArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={i === aulas.length - 1 || salvando}
                    onClick={() => mover(i, i + 1)}
                    aria-label={`Descer ${a.title}`}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft disabled:opacity-30 ${classeFoco}`}
                  >
                    <FaArrowDown aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => gravar(aulas.filter((x) => x.id !== a.id))}
                    aria-label={`Tirar ${a.title} do curso`}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 ${classeFoco}`}
                  >
                    <FaXmark aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {!bloqueado && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <form onSubmit={criarAula} className="rounded-2xl bg-slate-50 p-3">
            <label htmlFor="nova-aula" className="text-sm font-bold text-slate-700">
              Criar aula nova
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row md:flex-col xl:flex-row">
              <input id="nova-aula" value={novaAula} onChange={(e) => setNovaAula(e.target.value)} placeholder="Ex.: Aula 1: o tamanho do problema" className={classeEntrada} />
              <button type="submit" className={botaoPrimario}>
                <FaPlus aria-hidden="true" /> Criar
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Cria um rascunho fora da lista de artigos. Depois toque no lápis para escrever e colocar o vídeo.</p>
          </form>
          <div className="rounded-2xl bg-slate-50 p-3">
            <label htmlFor="busca-aula" className="text-sm font-bold text-slate-700">
              Adicionar conteúdo existente
            </label>
            <input id="busca-aula" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo título..." className={`${classeEntrada} mt-1.5`} />
            <ul className="mt-2 space-y-1">
              {todos === null && <li className="text-sm text-slate-500">Carregando...</li>}
              {todos && disponiveis.length === 0 && <li className="text-sm text-slate-500">Nada encontrado.</li>}
              {disponiveis.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => gravar([...aulas, c])} className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-white ${classeFoco}`}>
                    <FaPlus aria-hidden="true" className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">{situacaoDoItem(c).texto}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

// Editor de curso: /app/admin/educacao/cursos/:id (ou "novo")
function EditorCurso() {
  const { id } = useParams();
  const novo = id === "novo";
  const navigate = useNavigate();
  const { papel, ehAdmin, semAcesso } = useEquipe();
  const { categorias, autores } = useListasDoPainel();
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(null);
  const [slugManual, setSlugManual] = useState(!novo);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState("");

  useEffect(() => {
    if (!papel) return;
    if (novo) {
      setItem({ canEdit: true, lessons: [] });
      setForm({ ...formDoItem(null, { authorId: papel.authorId }), description: "" });
      setSlugManual(false);
      return;
    }
    api(`/admin/educacao/cursos/${id}`)
      .then((k) => {
        setItem(k);
        setForm({ ...formDoItem(k), description: k.description });
        setSlugManual(true);
      })
      .catch((e) => setErro(e.message));
  }, [id, novo, papel]);

  useEffect(() => {
    const anterior = document.title;
    document.title = `${novo ? "Novo curso" : "Editar curso"} · Painel · Famicash`;
    return () => {
      document.title = anterior;
    };
  }, [novo]);

  const mudar = (parcial) => {
    setForm((f) => ({ ...f, ...parcial }));
    setSalvo("");
  };

  async function salvar(e) {
    e?.preventDefault();
    setSalvando(true);
    setErro("");
    setErros({});
    try {
      const corpo = { ...corpoComum(form, slugManual), description: form.description };
      const k = novo ? await api("/admin/educacao/cursos", enviarJson("POST", corpo)) : await api(`/admin/educacao/cursos/${id}`, enviarJson("PUT", corpo));
      setItem(k);
      setForm({ ...formDoItem(k), description: k.description });
      setSlugManual(true);
      setSalvo("Salvo.");
      if (novo) navigate(`/app/admin/educacao/cursos/${k.id}`, { replace: true });
    } catch (err) {
      setErros(errosPorCampo(err));
      setErro(err.message === "Dados inválidos." ? "Confira os campos marcados." : err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (semAcesso)
    return (
      <AppLayout semBotaoNovo>
        <SemAcesso />
      </AppLayout>
    );

  const bloqueado = item && !item.canEdit;

  return (
    <AppLayout semBotaoNovo>
      <Link to="/app/admin/educacao?aba=cursos" className={`inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-primary ${classeFoco}`}>
        <FaArrowLeft aria-hidden="true" /> Painel de conteúdo
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-bold text-slate-900 md:text-3xl">{novo ? "Novo curso" : "Editar curso"}</h1>
      <p className="mt-1 text-[15px] text-slate-600">Um curso junta aulas em ordem. Quem tem conta acompanha o progresso marcando as aulas como concluídas.</p>
      {!form && !erro && <p className="mt-4 text-slate-500">Carregando...</p>}
      {!form && erro && (
        <div className="mt-4">
          <Erro>{erro}</Erro>
        </div>
      )}
      {form && (
        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
          <div className="space-y-5">
            {bloqueado && (
              <p role="note" className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
                Este curso está publicado: só um administrador pode alterar.
              </p>
            )}
            <form id="form-curso" onSubmit={salvar} className={cartao}>
              <CamposComuns form={form} mudar={mudar} erros={erros} slugManual={slugManual} setSlugManual={setSlugManual} ehAdmin={ehAdmin} prefixo="/educacao/cursos" bloqueado={bloqueado} categorias={categorias} autores={autores} />
              <fieldset disabled={bloqueado} className="mt-5">
                <EditorMarkdown rotulo="Sobre o curso (opcional)" valor={form.description} onMudar={(v) => mudar({ description: v })} erro={erros.description} linhas={8} />
              </fieldset>
            </form>
            {!novo && item.id ? <Aulas curso={item} onMudou={setItem} bloqueado={bloqueado} /> : <p className="text-sm text-slate-500">Salve o curso para adicionar as aulas e a capa.</p>}
          </div>
          <div className="mt-5 space-y-5 lg:sticky lg:top-6 lg:mt-0">
            <section className={`${cartao} !p-4 sm:!p-5`}>
              {erro && (
                <div className="mb-3">
                  <Erro>{erro}</Erro>
                </div>
              )}
              {!bloqueado && (
                <button type="submit" form="form-curso" disabled={salvando} className={`${botaoPrimario} w-full`}>
                  <FaFloppyDisk aria-hidden="true" />
                  {salvando ? "Salvando..." : novo ? "Criar curso" : "Salvar"}
                </button>
              )}
              <p role="status" className="mt-2 text-center text-sm text-emerald-700">
                {salvo}
              </p>
            </section>
            {!novo && item.id && (
              <>
                <AcoesSituacao
                  item={item}
                  caminho={`/admin/educacao/cursos/${item.id}`}
                  onMudou={setItem}
                  onApagado={() => navigate("/app/admin/educacao?aba=cursos", { replace: true })}
                  linkPrevia={`/educacao/cursos/${item.slug}`}
                />
                <section className={`${cartao} !p-4 sm:!p-5`}>
                  <CampoCapa item={item} caminho={`/admin/educacao/cursos/${item.id}`} onMudou={setItem} bloqueado={bloqueado} />
                </section>
                <p className="px-1 text-xs text-slate-500">Ao publicar o curso, publique também as aulas: aula em rascunho não aparece no site.</p>
              </>
            )}
            {!bloqueado && !novo && (
              <Link to="/app/admin/educacao?aba=cursos" className={`${botaoClaro} w-full`}>
                Voltar à lista
              </Link>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default EditorCurso;
