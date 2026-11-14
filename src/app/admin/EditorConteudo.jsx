import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaArrowDown, FaArrowLeft, FaArrowUp, FaFloppyDisk, FaPaperclip, FaTrash } from "react-icons/fa6";
import AppLayout from "../AppLayout.jsx";
import { cartao } from "../componentes/estilos.js";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { tamanhoEmTexto } from "../../lib/anexos.js";
import VideoYoutube from "../../educacao/VideoYoutube.jsx";
import { classeFoco, enviarArquivo, idDoYoutube } from "../../educacao/util.js";
import { useEquipe } from "./useEquipe.js";
import { Erro, SemAcesso } from "./AdminEducacao.jsx";
import { Caixa, Campo, EditorMarkdown, botaoPrimario, classeEntrada } from "./campos.jsx";
import { AcoesSituacao, CampoCapa, CamposComuns } from "./compartilhado.jsx";
import { corpoComum, formDoItem, useListasDoPainel } from "./painel.js";

const ACEITOS_MATERIAL = ".pdf,.xlsx,.xlsm,.xls,.ods,.csv,.docx,.doc,.odt,.txt,.pptx,.ppt,.zip,.jpg,.jpeg,.png,.webp";
const LIMITE_MATERIAL = 20 * 1024 * 1024;

// Materiais para baixar: enviar (até 20 MB cada), renomear, ordenar e apagar
function Materiais({ conteudo, onMudou, bloqueado }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState("");
  const lista = conteudo.materials;

  async function enviar(arquivos) {
    setErro("");
    let atuais = [...lista];
    for (const arquivo of arquivos) {
      if (arquivo.size > LIMITE_MATERIAL) {
        setErro(`“${arquivo.name}” passa de 20 MB.`);
        continue;
      }
      setEnviando(arquivo.name);
      try {
        const m = await enviarArquivo(`/admin/educacao/conteudos/${conteudo.id}/materiais`, arquivo);
        atuais = [...atuais, m];
        onMudou({ ...conteudo, materials: atuais });
      } catch (e) {
        setErro(`“${arquivo.name}”: ${e.message}`);
      }
    }
    setEnviando("");
  }
  async function renomear(m, title) {
    try {
      const novo = await api(`/admin/educacao/materiais/${m.id}`, enviarJson("PUT", { title }));
      onMudou({ ...conteudo, materials: lista.map((x) => (x.id === m.id ? novo : x)) });
    } catch (e) {
      setErro(e.message);
    }
  }
  async function mover(i, d) {
    const nova = [...lista];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    onMudou({ ...conteudo, materials: nova });
    try {
      await Promise.all(nova.map((m, pos) => api(`/admin/educacao/materiais/${m.id}`, enviarJson("PUT", { title: m.title === m.originalName ? null : m.title, position: pos }))));
    } catch (e) {
      setErro(e.message);
    }
  }
  async function apagar(m) {
    if (!window.confirm(`Apagar o material “${m.title}”?`)) return;
    try {
      await api(`/admin/educacao/materiais/${m.id}`, { method: "DELETE" });
      onMudou({ ...conteudo, materials: lista.filter((x) => x.id !== m.id) });
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section aria-labelledby="titulo-materiais-painel" className={`${cartao} !p-4 sm:!p-5`}>
      <h2 id="titulo-materiais-painel" className="font-heading text-lg font-bold text-slate-900">
        Materiais para baixar
      </h2>
      <p className="mt-1 text-sm text-slate-600">PDF, planilhas (XLSX, XLS, ODS, CSV), documentos, apresentações, ZIP ou imagens. Até 20 MB cada; planilhas vão do jeito que estão (sem compressão).</p>
      <div className="mt-2">
        <Erro>{erro}</Erro>
      </div>
      <ul className="mt-2 space-y-2">
        {lista.map((m, i) => (
          <li key={m.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`mat-${m.id}`} className="sr-only">
                Título do material
              </label>
              <input
                id={`mat-${m.id}`}
                defaultValue={m.title}
                disabled={bloqueado}
                onBlur={(e) => e.target.value.trim() !== m.title && renomear(m, e.target.value.trim() || null)}
                className={`${classeEntrada} !py-2`}
              />
              {!bloqueado && (
                <>
                  <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${m.title}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft disabled:opacity-30 ${classeFoco}`}>
                    <FaArrowUp aria-hidden="true" />
                  </button>
                  <button type="button" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${m.title}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft disabled:opacity-30 ${classeFoco}`}>
                    <FaArrowDown aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => apagar(m)} aria-label={`Apagar ${m.title}`} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 ${classeFoco}`}>
                    <FaTrash aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              <a href={m.url} className="underline">
                {m.originalName}
              </a>{" "}
              · {tamanhoEmTexto(m.size)}
            </p>
          </li>
        ))}
      </ul>
      {!bloqueado && (
        <label className={`mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary/30 px-5 font-bold text-primary hover:bg-soft has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${enviando ? "pointer-events-none opacity-60" : ""}`}>
          <FaPaperclip aria-hidden="true" />
          {enviando ? `Enviando ${enviando}...` : "Adicionar material"}
          <input
            type="file"
            multiple
            accept={ACEITOS_MATERIAL}
            className="sr-only"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = "";
              enviar(arquivos);
            }}
          />
        </label>
      )}
    </section>
  );
}

// Editor de artigo / vídeo / aula: /app/admin/educacao/conteudos/:id (ou "novo")
function EditorConteudo() {
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
      setItem({ materials: [], canEdit: true, coverUrl: null });
      setForm({ ...formDoItem(null, { authorId: papel.authorId }), body: "", videoUrl: "", listed: true });
      setSlugManual(false);
      return;
    }
    api(`/admin/educacao/conteudos/${id}`)
      .then((c) => {
        setItem(c);
        setForm({ ...formDoItem(c), body: c.body, videoUrl: c.videoUrl ?? "", listed: c.listed });
        setSlugManual(true);
      })
      .catch((e) => setErro(e.message));
  }, [id, novo, papel]);

  useEffect(() => {
    const anterior = document.title;
    document.title = `${novo ? "Novo conteúdo" : "Editar conteúdo"} · Painel · Famicash`;
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
      const corpo = { ...corpoComum(form, slugManual), body: form.body, videoUrl: form.videoUrl || null, listed: form.listed };
      const c = novo ? await api("/admin/educacao/conteudos", enviarJson("POST", corpo)) : await api(`/admin/educacao/conteudos/${id}`, enviarJson("PUT", corpo));
      setItem(c);
      setForm({ ...formDoItem(c), body: c.body, videoUrl: c.videoUrl ?? "", listed: c.listed });
      setSlugManual(true);
      setSalvo("Salvo.");
      if (novo) navigate(`/app/admin/educacao/conteudos/${c.id}`, { replace: true });
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
  const videoId = form ? idDoYoutube(form.videoUrl) : null;

  return (
    <AppLayout semBotaoNovo>
      <Link to="/app/admin/educacao?aba=conteudos" className={`inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-primary ${classeFoco}`}>
        <FaArrowLeft aria-hidden="true" /> Painel de conteúdo
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-bold text-slate-900 md:text-3xl">{novo ? "Novo conteúdo" : "Editar conteúdo"}</h1>
      <p className="mt-1 text-[15px] text-slate-600">Artigo (só texto), vídeo (só YouTube) ou os dois juntos. Também pode virar aula de um curso.</p>
      {!form && !erro && <p className="mt-4 text-slate-500">Carregando...</p>}
      {!form && erro && (
        <div className="mt-4">
          <Erro>{erro}</Erro>
        </div>
      )}

      {form && (
        <form onSubmit={salvar} className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
          <div className="space-y-5">
            {bloqueado && (
              <p role="note" className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
                Este conteúdo está publicado: só um administrador pode alterar. Peça para tirá-lo do ar se precisar mudar algo.
              </p>
            )}
            <section className={cartao}>
              <CamposComuns form={form} mudar={mudar} erros={erros} slugManual={slugManual} setSlugManual={setSlugManual} ehAdmin={ehAdmin} prefixo="/educacao" bloqueado={bloqueado} categorias={categorias} autores={autores} />
              <div className="mt-5">
                <Caixa
                  marcado={form.listed}
                  onMudar={(v) => mudar({ listed: v })}
                  texto="Mostrar na lista de artigos e vídeos"
                  dica="Desmarque para uma aula que só deve aparecer dentro do curso (o endereço continua funcionando)."
                />
              </div>
            </section>

            <section className={cartao}>
              <fieldset disabled={bloqueado} className="space-y-5">
                <Campo rotulo="Vídeo do YouTube (opcional)" erro={erros.videoUrl} dica="Cole o link do vídeo (youtube.com/watch?v=..., youtu.be/... ou Shorts). O vídeo pode ficar como “Não listado” no YouTube.">
                  {(p) => <input {...p} type="url" inputMode="url" value={form.videoUrl} onChange={(e) => mudar({ videoUrl: e.target.value })} placeholder="https://youtu.be/..." className={classeEntrada} />}
                </Campo>
                {form.videoUrl && !videoId && <p className="text-sm text-amber-700">Não reconhecemos esse link como um vídeo do YouTube.</p>}
                {videoId && <VideoYoutube id={videoId} titulo={form.title} />}
                <EditorMarkdown rotulo="Texto (opcional se tiver vídeo)" valor={form.body} onMudar={(v) => mudar({ body: v })} erro={erros.body} />
              </fieldset>
            </section>

            {!novo && item.id && <Materiais conteudo={item} onMudou={setItem} bloqueado={bloqueado} />}
            {novo && <p className="text-sm text-slate-500">Salve o rascunho para enviar a capa e os materiais.</p>}
          </div>

          <div className="mt-5 space-y-5 lg:sticky lg:top-6 lg:mt-0">
            <section className={`${cartao} !p-4 sm:!p-5`}>
              {erro && (
                <div className="mb-3">
                  <Erro>{erro}</Erro>
                </div>
              )}
              {!bloqueado && (
                <button type="submit" disabled={salvando} className={`${botaoPrimario} w-full`}>
                  <FaFloppyDisk aria-hidden="true" />
                  {salvando ? "Salvando..." : novo ? "Salvar rascunho" : "Salvar"}
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
                  caminho={`/admin/educacao/conteudos/${item.id}`}
                  onMudou={(c) => setItem(c)}
                  onApagado={() => navigate("/app/admin/educacao?aba=conteudos", { replace: true })}
                  linkPrevia={`/educacao/${item.slug}`}
                />
                <section className={`${cartao} !p-4 sm:!p-5`}>
                  <CampoCapa item={item} caminho={`/admin/educacao/conteudos/${item.id}`} onMudou={setItem} bloqueado={bloqueado} />
                </section>
                {item.courses?.length > 0 && (
                  <section className={`${cartao} !p-4 sm:!p-5`}>
                    <h2 className="font-heading text-lg font-bold text-slate-900">Aula nos cursos</h2>
                    <ul className="mt-2 space-y-1">
                      {item.courses.map((k) => (
                        <li key={k.id}>
                          <Link to={`/app/admin/educacao/cursos/${k.id}`} className={`inline-flex min-h-11 items-center rounded font-bold text-primary ${classeFoco}`}>
                            {k.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </AppLayout>
  );
}

export default EditorConteudo;
