import { useState } from "react";
import { FaCamera, FaTrash, FaChevronDown } from "react-icons/fa6";
import { api, enviarJson } from "../../lib/api.js";
import { cartao } from "../componentes/estilos.js";
import { classeFoco, dataHora, enviarArquivo, situacaoDoItem } from "../../educacao/util.js";
import { Caixa, Campo, Contador, Opcoes, botaoClaro, botaoPerigo, botaoPrimario, classeEntrada } from "./campos.jsx";
import { gerarSlug } from "./painel.js";

// ─────────────────────────────────────────────
// Partes comuns dos editores de conteúdo e de curso
// ─────────────────────────────────────────────

export function CamposComuns({ form, mudar, erros, slugManual, setSlugManual, ehAdmin, prefixo, bloqueado, categorias, autores }) {
  const [seoAberto, setSeoAberto] = useState(Boolean(form.seoTitle || form.seoDescription));
  const slug = slugManual ? form.slug : gerarSlug(form.title);
  return (
    <fieldset disabled={bloqueado} className="space-y-5">
      <Campo rotulo="Título" erro={erros.title} contador={<Contador valor={form.title} max={160} />}>
        {(p) => (
          <input
            {...p}
            value={form.title}
            onChange={(e) => mudar({ title: e.target.value, ...(slugManual ? {} : { slug: gerarSlug(e.target.value) }) })}
            className={`${classeEntrada} text-lg font-bold`}
            placeholder="Ex.: Como sair das dívidas em 5 passos"
          />
        )}
      </Campo>
      <Campo rotulo="Endereço (slug)" erro={erros.slug} dica={`famicash.com${prefixo}/${slug || "..."}`}>
        {(p) => (
          <input
            {...p}
            value={slug}
            onChange={(e) => {
              setSlugManual(true);
              mudar({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
            }}
            className={`${classeEntrada} font-mono text-sm`}
            spellCheck={false}
          />
        )}
      </Campo>
      <Campo rotulo="Resumo" erro={erros.summary} contador={<Contador valor={form.summary} max={300} />} dica="Aparece nos cartões, no Google e na prévia do WhatsApp. Quem não tem conta vê o resumo de conteúdo só para cadastrados.">
        {(p) => <textarea {...p} rows={3} value={form.summary} onChange={(e) => mudar({ summary: e.target.value })} className={classeEntrada} />}
      </Campo>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Categoria" erro={erros.categoryId}>
          {(p) => (
            <select {...p} value={form.categoryId} onChange={(e) => mudar({ categoryId: e.target.value })} className={classeEntrada}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo="Autor (quem assina)" erro={erros.authorId}>
          {(p) => (
            <select {...p} value={form.authorId} onChange={(e) => mudar({ authorId: e.target.value })} className={classeEntrada}>
              <option value="">Sem autor (Famicash)</option>
              {autores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <Opcoes
        rotulo="Quem pode ver"
        nome="visibilidade"
        valor={form.visibility}
        onMudar={(v) => mudar({ visibility: v })}
        opcoes={[
          { valor: "PUBLIC", texto: "Público", dica: "Qualquer pessoa na internet. Aparece no Google." },
          { valor: "REGISTERED", texto: "Só para cadastrados", dica: "Precisa de conta (grátis). Sem conta, vê título, resumo e o convite." },
        ]}
      />
      <Campo rotulo="Tags (separe por vírgula)" erro={erros.tags} dica="Ajudam na busca. Ex.: dívidas, cartão de crédito, juros">
        {(p) => <input {...p} value={form.tags} onChange={(e) => mudar({ tags: e.target.value })} className={classeEntrada} />}
      </Campo>
      {ehAdmin && <Caixa marcado={form.featured} onMudar={(v) => mudar({ featured: v })} texto="Destaque" dica="Aparece no topo da página da Educação financeira." />}

      <div className="rounded-2xl border border-slate-200">
        <button type="button" onClick={() => setSeoAberto(!seoAberto)} aria-expanded={seoAberto} className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-left font-bold text-slate-700 ${classeFoco}`}>
          Google e WhatsApp (opcional)
          <FaChevronDown aria-hidden="true" className={`transition ${seoAberto ? "rotate-180" : ""}`} />
        </button>
        {seoAberto && (
          <div className="space-y-4 px-4 pb-4">
            <Campo rotulo="Título para o Google" erro={erros.seoTitle} contador={<Contador valor={form.seoTitle} max={70} />} dica="Vazio: usa o título.">
              {(p) => <input {...p} value={form.seoTitle} onChange={(e) => mudar({ seoTitle: e.target.value })} className={classeEntrada} />}
            </Campo>
            <Campo rotulo="Descrição para o Google" erro={erros.seoDescription} contador={<Contador valor={form.seoDescription} max={170} />} dica="Vazio: usa o resumo.">
              {(p) => <textarea {...p} rows={2} value={form.seoDescription} onChange={(e) => mudar({ seoDescription: e.target.value })} className={classeEntrada} />}
            </Campo>
          </div>
        )}
      </div>
    </fieldset>
  );
}

// Capa (foto) do conteúdo ou curso
export function CampoCapa({ item, caminho, onMudou, bloqueado }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function enviar(arquivo) {
    if (!arquivo) return;
    setErro("");
    setEnviando(true);
    try {
      onMudou(await enviarArquivo(`${caminho}/capa`, arquivo));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }
  async function remover() {
    setErro("");
    try {
      onMudou(await api(`${caminho}/capa`, { method: "DELETE" }));
    } catch (e) {
      setErro(e.message);
    }
  }
  return (
    <div>
      <p className="text-sm font-bold text-slate-700">Capa</p>
      <div className="mt-1.5 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="Capa atual" className="aspect-video w-full object-cover" />
        ) : (
          <p className="flex aspect-video items-center justify-center p-4 text-center text-sm text-slate-500">{item.videoId ? "Sem capa: usamos a miniatura do vídeo." : "Sem capa. Ideal: 1200 × 630 px."}</p>
        )}
      </div>
      {!bloqueado && (
        <div className="mt-2 flex flex-wrap gap-2">
          <label className={`${botaoClaro} cursor-pointer ${enviando ? "pointer-events-none opacity-60" : ""}`}>
            <FaCamera aria-hidden="true" />
            {enviando ? "Enviando..." : item.coverUrl ? "Trocar capa" : "Enviar capa"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic" className="sr-only" onChange={(e) => enviar(e.target.files?.[0])} />
          </label>
          {item.coverUrl && (
            <button type="button" onClick={remover} className={botaoPerigo}>
              <FaTrash aria-hidden="true" /> Remover
            </button>
          )}
        </div>
      )}
      {erro && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

// Barra de situação: enviar para revisão, publicar (agora ou agendado), voltar a rascunho, arquivar, apagar
export function AcoesSituacao({ item, caminho, onMudou, onApagado, linkPrevia }) {
  const [quando, setQuando] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const s = situacaoDoItem(item);

  async function acao(sufixo, corpo) {
    setErro("");
    setOcupado(true);
    try {
      onMudou(await api(`${caminho}/${sufixo}`, enviarJson("POST", corpo ?? {})));
    } catch (e) {
      setErro(e.detalhes?.body?.[0] ?? e.detalhes?.publishedAt?.[0] ?? e.message);
    } finally {
      setOcupado(false);
    }
  }
  async function apagar() {
    if (!window.confirm(`Apagar “${item.title}” para sempre? Isso não tem volta.`)) return;
    setOcupado(true);
    try {
      await api(caminho, { method: "DELETE" });
      onApagado();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="titulo-situacao" className={`${cartao} !p-4 sm:!p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-situacao" className="font-heading text-lg font-bold text-slate-900">
          Situação
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.classe}`}>{s.texto}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {item.scheduled && `Vai ao ar em ${dataHora(item.publishedAt)}.`}
        {item.status === "PUBLISHED" && !item.scheduled && `No ar desde ${dataHora(item.publishedAt)}.`}
        {item.status === "DRAFT" && item.submittedAt && `Enviado para revisão em ${dataHora(item.submittedAt)}. Um administrador vai revisar e publicar.`}
        {item.status === "DRAFT" && !item.submittedAt && (item.canPublish ? "Rascunho: só a equipe vê." : "Rascunho: quando terminar, envie para revisão.")}
        {item.status === "ARCHIVED" && "Fora do ar. Publique de novo quando quiser."}
      </p>
      {erro && (
        <p role="alert" className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {linkPrevia && (
          <a href={linkPrevia} target="_blank" rel="noopener noreferrer" className={botaoClaro}>
            {item.status === "PUBLISHED" && !item.scheduled ? "Ver no site" : "Ver prévia"}
          </a>
        )}
        {item.canSubmit && !item.submittedAt && (
          <button type="button" disabled={ocupado} onClick={() => acao("enviar")} className={botaoPrimario}>
            Enviar para revisão
          </button>
        )}
        {item.canPublish && (
          <>
            {(item.status !== "PUBLISHED" || item.scheduled) && (
              <button type="button" disabled={ocupado} onClick={() => acao("publicar", {})} className={botaoPrimario}>
                Publicar agora
              </button>
            )}
            <div className="rounded-2xl bg-slate-50 p-3">
              <label htmlFor="agendar" className="text-sm font-bold text-slate-700">
                Agendar publicação
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input id="agendar" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={classeEntrada} />
                <button type="button" disabled={ocupado || !quando} onClick={() => acao("publicar", { publishedAt: new Date(quando).toISOString() })} className={botaoClaro}>
                  Agendar
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Horário de Brasília (o do seu aparelho).</p>
            </div>
            {item.status !== "DRAFT" && (
              <button type="button" disabled={ocupado} onClick={() => acao("rascunho")} className={botaoClaro}>
                Tirar do ar (voltar a rascunho)
              </button>
            )}
            {item.status === "DRAFT" && item.submittedAt && (
              <button type="button" disabled={ocupado} onClick={() => acao("rascunho")} className={botaoClaro}>
                Devolver ao autor
              </button>
            )}
            {item.status !== "ARCHIVED" && (
              <button type="button" disabled={ocupado} onClick={() => acao("arquivar")} className={botaoClaro}>
                Arquivar
              </button>
            )}
          </>
        )}
        {item.canDelete && (
          <button type="button" disabled={ocupado} onClick={apagar} className={botaoPerigo}>
            <FaTrash aria-hidden="true" /> Apagar
          </button>
        )}
      </div>
    </section>
  );
}
