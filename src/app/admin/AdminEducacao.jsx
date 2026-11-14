import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaPlus, FaChevronRight, FaGraduationCap, FaFileLines, FaTrash, FaPen, FaUserPlus, FaArrowUpRightFromSquare, FaCamera } from "react-icons/fa6";
import AppLayout from "../AppLayout.jsx";
import Modal from "../componentes/Modal.jsx";
import { cartao } from "../componentes/estilos.js";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { NOMES_TIPO, NOMES_VISIBILIDADE, classeFoco, dataHora, enviarArquivo, situacaoDoItem } from "../../educacao/util.js";
import { useEquipe } from "./useEquipe.js";
import { Campo, Contador, botaoClaro, botaoPerigo, botaoPrimario, classeEntrada } from "./campos.jsx";
import { iniciais } from "../../lib/pessoas.js";

// ─────────────────────────────────────────────
// Painel da Educação financeira (/app/admin/educacao): conteúdos, cursos, categorias, autores e equipe.
// EDITOR vê os seus e os publicados; ADMIN vê tudo, publica e cuida da equipe.
// ─────────────────────────────────────────────

const ABAS = [
  { id: "conteudos", texto: "Conteúdos" },
  { id: "cursos", texto: "Cursos" },
  { id: "categorias", texto: "Categorias" },
  { id: "autores", texto: "Autores" },
  { id: "equipe", texto: "Equipe", soAdmin: true },
];

const FILTROS = [
  { id: "", texto: "Todos" },
  { id: "DRAFT", texto: "Rascunhos" },
  { id: "SUBMITTED", texto: "Aguardando revisão" },
  { id: "SCHEDULED", texto: "Agendados" },
  { id: "PUBLISHED", texto: "Publicados" },
  { id: "ARCHIVED", texto: "Arquivados" },
];

export function SemAcesso() {
  return (
    <div className={cartao}>
      <h1 className="font-heading text-xl font-bold text-slate-900">Área da equipe de conteúdo</h1>
      <p className="mt-2 text-slate-600">Esta área é para quem escreve e publica na Educação financeira do Famicash. Se você faz parte da equipe, peça a um administrador para liberar o seu acesso.</p>
      <Link to="/app/educacao" className={`mt-4 ${botaoClaro}`}>
        Ver a Educação financeira
      </Link>
    </div>
  );
}

export function Erro({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {children}
    </p>
  );
}

function Selo({ item }) {
  const s = situacaoDoItem(item);
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.classe}`}>{s.texto}</span>;
}

// Lista de conteúdos ou cursos com filtros
function Lista({ tipo }) {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const meus = params.get("meus") === "1";
  const [q, setQ] = useState("");
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;
    const busca = new URLSearchParams();
    if (status) busca.set("status", status);
    if (meus) busca.set("meus", "1");
    if (q.trim()) busca.set("q", q.trim());
    const t = setTimeout(() => {
      api(`/admin/educacao/${tipo}?${busca}`)
        .then((d) => ativo && setItens(d))
        .catch((e) => ativo && setErro(e.message));
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [tipo, status, meus, q]);

  const mudar = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const Icone = tipo === "cursos" ? FaGraduationCap : FaFileLines;
  return (
    <section className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="busca-painel">
          Buscar pelo título
        </label>
        <input id="busca-painel" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo título..." className={`${classeEntrada} sm:max-w-xs`} />
        <span className="flex-1" />
        <button type="button" onClick={() => navigate(`/app/admin/educacao/${tipo}/novo`)} className={botaoPrimario}>
          <FaPlus aria-hidden="true" />
          {tipo === "cursos" ? "Novo curso" : "Novo conteúdo"}
        </button>
      </div>
      <div role="group" aria-label="Filtrar por situação" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTROS.map((f) => (
          <button
            key={f.id || "todos"}
            type="button"
            aria-pressed={status === f.id}
            onClick={() => mudar("status", f.id)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold ${classeFoco} ${status === f.id ? "bg-primary text-white" : "bg-white text-slate-700 shadow-sm hover:bg-soft"}`}
          >
            {f.texto}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={meus}
          onClick={() => mudar("meus", meus ? "" : "1")}
          className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold ${classeFoco} ${meus ? "bg-accent-strong text-white" : "bg-white text-slate-700 shadow-sm hover:bg-soft"}`}
        >
          Só os meus
        </button>
      </div>

      <div className="mt-4">
        <Erro>{erro}</Erro>
        {!itens && !erro && <p className="text-slate-500">Carregando...</p>}
        {itens?.length === 0 && (
          <div className={`${cartao} text-center`}>
            <p className="font-bold text-slate-900">{status || meus || q ? "Nada com esse filtro." : tipo === "cursos" ? "Nenhum curso ainda." : "Nenhum conteúdo ainda."}</p>
            <p className="mt-1 text-sm text-slate-600">{tipo === "cursos" ? "Crie um curso e adicione as aulas em ordem." : "Escreva um artigo, cole um vídeo do YouTube ou os dois."}</p>
          </div>
        )}
        {itens?.length > 0 && (
          <ul className={`${cartao} !p-2 sm:!p-3 divide-y divide-slate-100`}>
            {itens.map((i) => (
              <li key={i.id}>
                <Link to={`/app/admin/educacao/${tipo}/${i.id}`} className={`flex items-center gap-3 rounded-2xl p-2 transition hover:bg-soft sm:p-3 ${classeFoco}`}>
                  <span className="relative hidden h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-light sm:block">
                    {i.thumbUrl ? (
                      <img src={i.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="flex h-full items-center justify-center text-xl text-white/70">
                        <Icone />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{i.title}</span>
                      <Selo item={i} />
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {tipo === "cursos" ? `${i.lessonsCount} ${i.lessonsCount === 1 ? "aula" : "aulas"}` : NOMES_TIPO[i.kind]} · {NOMES_VISIBILIDADE[i.visibility] ?? i.visibility}
                      {i.author ? ` · ${i.author.name}` : ""}
                      {i.category ? ` · ${i.category.name}` : ""}
                      {tipo === "conteudos" && !i.listed ? " · só em curso" : ""}
                    </span>
                    <span className="block text-xs text-slate-400">
                      Atualizado em {dataHora(i.updatedAt)}
                      {i.createdBy ? ` por ${i.createdBy.name}` : ""}
                      {i.scheduled ? ` · vai ao ar em ${dataHora(i.publishedAt)}` : ""}
                    </span>
                  </span>
                  <FaChevronRight aria-hidden="true" className="shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Categorias: ADMIN cria, renomeia e apaga
function Categorias({ ehAdmin }) {
  const [lista, setLista] = useState(null);
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => api("/admin/educacao/categorias").then(setLista).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    try {
      if (editando) await api(`/admin/educacao/categorias/${editando.id}`, enviarJson("PUT", { name: editando.name }));
      else await api("/admin/educacao/categorias", enviarJson("POST", { name: nome, position: (lista?.length ?? 0) + 1 }));
      setNome("");
      setEditando(null);
      carregar();
    } catch (err) {
      setErro(errosPorCampo(err).name ?? err.message);
    }
  }
  async function apagar(c) {
    if (!window.confirm(`Apagar a categoria “${c.name}”? Os conteúdos dela ficam sem categoria.`)) return;
    try {
      await api(`/admin/educacao/categorias/${c.id}`, { method: "DELETE" });
      carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <section className={`mt-4 ${cartao}`}>
      <p className="text-sm text-slate-600">Categorias organizam a página pública (filtro “Tudo · Dívidas · Investimentos...”). {ehAdmin ? "" : "Só um administrador cria ou muda categorias."}</p>
      <div className="mt-3">
        <Erro>{erro}</Erro>
      </div>
      {ehAdmin && (
        <form onSubmit={salvar} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="nova-categoria" className="sr-only">
            Nome da categoria
          </label>
          <input id="nova-categoria" value={editando ? editando.name : nome} onChange={(e) => (editando ? setEditando({ ...editando, name: e.target.value }) : setNome(e.target.value))} placeholder="Ex.: Investimentos" className={classeEntrada} />
          <button type="submit" className={botaoPrimario}>
            {editando ? "Salvar nome" : "Adicionar"}
          </button>
          {editando && (
            <button type="button" onClick={() => setEditando(null)} className={botaoClaro}>
              Cancelar
            </button>
          )}
        </form>
      )}
      <ul className="mt-4 divide-y divide-slate-100">
        {lista?.length === 0 && <li className="py-3 text-slate-500">Nenhuma categoria ainda.</li>}
        {lista?.map((c) => (
          <li key={c.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-slate-900">{c.name}</span>
              <span className="block text-xs text-slate-500">
                /educacao?categoria={c.slug} · {c.count} {c.count === 1 ? "item" : "itens"}
              </span>
            </span>
            {ehAdmin && (
              <>
                <button type="button" onClick={() => setEditando({ id: c.id, name: c.name })} aria-label={`Renomear ${c.name}`} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-soft ${classeFoco}`}>
                  <FaPen aria-hidden="true" />
                </button>
                <button type="button" onClick={() => apagar(c)} aria-label={`Apagar ${c.name}`} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50 ${classeFoco}`}>
                  <FaTrash aria-hidden="true" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Formulário de autor (nome, mini bio e foto)
function FormAutor({ autor, onFechar, onSalvo }) {
  const [form, setForm] = useState({ name: autor?.name ?? "", bio: autor?.bio ?? "" });
  const [atual, setAtual] = useState(autor);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setErros({});
    try {
      const salvo = atual ? await api(`/admin/educacao/autores/${atual.id}`, enviarJson("PUT", form)) : await api("/admin/educacao/autores", enviarJson("POST", form));
      setAtual(salvo);
      onSalvo();
      if (atual) onFechar();
    } catch (err) {
      setErros(errosPorCampo(err));
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }
  async function foto(arquivo) {
    if (!arquivo || !atual) return;
    setErro("");
    try {
      setAtual(await enviarArquivo(`/admin/educacao/autores/${atual.id}/foto`, arquivo));
      onSalvo();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <Modal titulo={autor ? "Editar autor" : "Novo autor"} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Erro>{erro}</Erro>
        <Campo rotulo="Nome (como aparece no conteúdo)" erro={erros.name}>
          {(p) => <input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={classeEntrada} />}
        </Campo>
        <Campo rotulo="Mini bio (opcional)" erro={erros.bio} contador={<Contador valor={form.bio} max={600} />} dica="Aparece no fim do conteúdo. Ex.: “Planejadora financeira, mãe de dois”.">
          {(p) => <textarea {...p} rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={classeEntrada} />}
        </Campo>
        {atual ? (
          <div className="flex items-center gap-3">
            {atual.photoUrl ? (
              <img src={atual.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-soft font-bold text-primary">
                {iniciais(atual.name)}
              </span>
            )}
            <label className={`${botaoClaro} cursor-pointer`}>
              <FaCamera aria-hidden="true" />
              {atual.photoUrl ? "Trocar foto" : "Enviar foto"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic" className="sr-only" onChange={(e) => foto(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Depois de salvar, você pode enviar uma foto.</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} className={botaoClaro}>
            {atual && !autor ? "Concluir" : "Cancelar"}
          </button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Autores({ ehAdmin }) {
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null); // null | "novo" | autor
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => api("/admin/educacao/autores").then(setLista).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function apagar(a) {
    if (!window.confirm(`Apagar o autor “${a.name}”? Os conteúdos dele ficam sem autor.`)) return;
    try {
      await api(`/admin/educacao/autores/${a.id}`, { method: "DELETE" });
      carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <section className={`mt-4 ${cartao}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-slate-600">Quem assina os conteúdos. Pode ser um parceiro que grava vídeos, mesmo sem conta no Famicash.</p>
        <button type="button" onClick={() => setAberto("novo")} className={botaoPrimario}>
          <FaPlus aria-hidden="true" /> Novo autor
        </button>
      </div>
      <div className="mt-3">
        <Erro>{erro}</Erro>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {lista?.length === 0 && <li className="py-3 text-slate-500">Nenhum autor ainda.</li>}
        {lista?.map((a) => (
          <li key={a.id} className="flex min-h-16 items-center gap-3 py-2">
            {a.photoUrl ? (
              <img src={a.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft font-bold text-primary">
                {iniciais(a.name)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-slate-900">{a.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {a.userId ? "Da equipe · " : ""}
                {a.count ?? 0} {a.count === 1 ? "item" : "itens"}
                {a.bio ? ` · ${a.bio}` : ""}
              </span>
            </span>
            <button type="button" onClick={() => setAberto(a)} aria-label={`Editar ${a.name}`} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-soft ${classeFoco}`}>
              <FaPen aria-hidden="true" />
            </button>
            {ehAdmin && (
              <button type="button" onClick={() => apagar(a)} aria-label={`Apagar ${a.name}`} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50 ${classeFoco}`}>
                <FaTrash aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {aberto && <FormAutor autor={aberto === "novo" ? null : aberto} onFechar={() => setAberto(null)} onSalvo={carregar} />}
    </section>
  );
}

// Equipe (só ADMIN): dar e tirar o papel de EDITOR
function Equipe() {
  const [lista, setLista] = useState(null);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const carregar = useCallback(() => api("/admin/educacao/equipe").then(setLista).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mudar(alvo, role) {
    setErro("");
    setOk("");
    try {
      const p = await api("/admin/educacao/equipe", enviarJson("POST", { email: alvo, role }));
      setOk(role === "EDITOR" ? `${p.name} agora é editor(a).` : `${p.name} saiu da equipe.`);
      setEmail("");
      carregar();
    } catch (err) {
      setErro(errosPorCampo(err).email ?? err.message);
    }
  }

  return (
    <section className={`mt-4 ${cartao}`}>
      <p className="text-sm text-slate-600">
        <strong>Editores</strong> escrevem e gravam conteúdo e enviam para revisão. Só <strong>administradores</strong> publicam. A pessoa precisa ter uma conta no Famicash (o plano grátis serve).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mudar(email, "EDITOR");
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="email-editor" className="sr-only">
          Email da pessoa
        </label>
        <input id="email-editor" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@da-pessoa.com" className={classeEntrada} autoComplete="off" />
        <button type="submit" className={botaoPrimario}>
          <FaUserPlus aria-hidden="true" /> Tornar editor(a)
        </button>
      </form>
      <div className="mt-3 space-y-2">
        <Erro>{erro}</Erro>
        {ok && (
          <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {ok}
          </p>
        )}
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {lista?.map((p) => (
          <li key={p.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-slate-900">{p.name}</span>
              <span className="block truncate text-xs text-slate-500">{p.email}</span>
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.role === "ADMIN" ? "bg-primary text-white" : "bg-soft text-primary-dark"}`}>{p.role === "ADMIN" ? "Administrador" : "Editor"}</span>
            {p.viaEnv ? (
              <span className="text-xs text-slate-500">pela variável ADMIN_EMAILS</span>
            ) : (
              p.role === "EDITOR" && (
                <button type="button" onClick={() => window.confirm(`Tirar ${p.name} da equipe? O conteúdo dela continua.`) && mudar(p.email, "USER")} className={botaoPerigo}>
                  Remover
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminEducacao() {
  const { papel, ehAdmin, semAcesso, erro } = useEquipe();
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") ?? "conteudos";

  useEffect(() => {
    const anterior = document.title;
    document.title = "Painel de conteúdo · Famicash";
    return () => {
      document.title = anterior;
    };
  }, []);

  let corpo;
  if (semAcesso) corpo = <SemAcesso />;
  else if (erro) corpo = <Erro>{erro}</Erro>;
  else if (!papel) corpo = <p className="text-slate-500">Carregando...</p>;
  else
    corpo = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-3xl">Painel de conteúdo</h1>
            <p className="mt-1 text-[15px] text-slate-600">Educação financeira · você é {ehAdmin ? "administrador(a)" : "editor(a)"}.</p>
          </div>
          <a href="/educacao" target="_blank" rel="noopener noreferrer" className={botaoClaro}>
            Ver o site <FaArrowUpRightFromSquare aria-hidden="true" className="text-sm" />
          </a>
        </div>
        <div role="tablist" aria-label="Seções do painel" className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
          {ABAS.filter((a) => !a.soAdmin || ehAdmin).map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setParams({ aba: a.id }, { replace: true })}
              className={`-mb-px min-h-12 shrink-0 border-b-4 px-4 text-sm font-bold ${classeFoco} ${aba === a.id ? "border-primary text-primary-dark" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {a.texto}
            </button>
          ))}
        </div>
        {aba === "conteudos" && <Lista tipo="conteudos" />}
        {aba === "cursos" && <Lista tipo="cursos" />}
        {aba === "categorias" && <Categorias ehAdmin={ehAdmin} />}
        {aba === "autores" && <Autores ehAdmin={ehAdmin} />}
        {aba === "equipe" && ehAdmin && <Equipe />}
      </>
    );

  return <AppLayout semBotaoNovo>{corpo}</AppLayout>;
}

export default AdminEducacao;
