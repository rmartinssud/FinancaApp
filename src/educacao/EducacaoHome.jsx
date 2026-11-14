import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaMagnifyingGlass, FaXmark, FaGraduationCap, FaSeedling } from "react-icons/fa6";
import { api } from "../lib/api.js";
import { cartao } from "../app/componentes/estilos.js";
import CartaoItem from "./CartaoItem.jsx";
import { Carregando } from "./Partes.jsx";
import { useSeo } from "./useSeo.js";
import { classeFoco, linkCadastro } from "./util.js";

function Busca({ valor, onMudar }) {
  const id = useId();
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  // Espera a pessoa parar de digitar para buscar
  useEffect(() => {
    if (texto === valor) return undefined;
    const t = setTimeout(() => onMudar(texto), 350);
    return () => clearTimeout(t);
  }, [texto, valor, onMudar]);
  return (
    <div role="search" className="relative mt-4">
      <label htmlFor={id} className="sr-only">
        Buscar na Educação financeira
      </label>
      <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar: dívidas, orçamento, investir..."
        autoComplete="off"
        className="min-h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-12 text-[15px] text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {texto && (
        <button
          type="button"
          onClick={() => {
            setTexto("");
            onMudar("");
          }}
          aria-label="Limpar busca"
          className={`absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-soft ${classeFoco}`}
        >
          <FaXmark aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Grade({ itens, base }) {
  return (
    <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((item) => (
        <li key={`${item.type}-${item.id}`}>
          <CartaoItem item={item} base={base} />
        </li>
      ))}
    </ul>
  );
}

// Início da Educação financeira: destaques, cursos, últimos conteúdos, busca e filtro por categoria.
// base: "/educacao" (público) ou "/app/educacao" (dentro do app). soCursos: a página /educacao/cursos.
function EducacaoHome({ base, soCursos = false }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoria = params.get("categoria") ?? "";
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useSeo({
    titulo: soCursos ? "Cursos grátis de educação financeira · Famicash" : "Educação financeira · Famicash",
    descricao: "Artigos, vídeos e cursos grátis de educação financeira: organize o orçamento, saia das dívidas e comece a investir.",
    indexar: base === "/educacao" && !q,
    canonico: soCursos ? "/educacao/cursos" : "/educacao",
  });

  useEffect(() => {
    let ativo = true;
    const busca = new URLSearchParams();
    if (q.trim()) busca.set("q", q.trim());
    if (categoria) busca.set("categoria", categoria);
    setErro("");
    api(`/educacao${busca.toString() ? `?${busca}` : ""}`)
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [q, categoria]);

  const mudar = (novo) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novo)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };
  const mudarBusca = (texto) => mudar({ q: texto });

  const filtrando = Boolean(q.trim() || categoria);
  const vazio = dados && !filtrando && !dados.contents.length && !dados.courses.length;

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-accent-strong">Famicash · grátis</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-slate-900 md:text-4xl">{soCursos ? "Cursos de educação financeira" : "Educação financeira"}</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-slate-600 md:text-base">
          Artigos, vídeos e cursos curtos para organizar o dinheiro da família, sair das dívidas e começar a investir.
        </p>
        {soCursos && (
          <Link to={base} className={`mt-2 inline-flex min-h-11 items-center rounded-full text-sm font-bold text-primary ${classeFoco}`}>
            Ver artigos e vídeos também
          </Link>
        )}
      </header>

      {!vazio && <Busca valor={q} onMudar={mudarBusca} />}

      {dados?.categories?.length > 0 && !vazio && (
        <div role="group" aria-label="Filtrar por categoria" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ slug: "", name: "Tudo" }, ...dados.categories].map((c) => {
            const ativo = c.slug === categoria;
            return (
              <button
                key={c.slug || "tudo"}
                type="button"
                aria-pressed={ativo}
                onClick={() => mudar({ categoria: c.slug })}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition ${classeFoco} ${ativo ? "bg-primary text-white shadow" : "bg-white text-slate-700 shadow-sm hover:bg-soft"}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {erro && (
        <p role="alert" className={`mt-5 ${cartao} text-red-600`}>
          {erro}
        </p>
      )}
      {!dados && !erro && (
        <div className="mt-5">
          <Carregando />
        </div>
      )}

      {vazio && (
        <section className={`mt-6 ${cartao} text-center`}>
          <span aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-soft text-2xl text-primary">
            <FaSeedling />
          </span>
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-900">Os primeiros conteúdos estão chegando</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-slate-600">
            Estamos preparando artigos, vídeos e cursos grátis sobre orçamento, dívidas e investimentos. Volte em breve!
          </p>
          {!dados.loggedIn && (
            <Link to={linkCadastro(base)} className={`mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-bold text-white shadow hover:bg-primary-dark ${classeFoco}`}>
              Criar conta grátis no Famicash
            </Link>
          )}
        </section>
      )}

      {dados && !vazio && (
        <div aria-live="polite">
          {filtrando && (
            <p role="status" className="mt-5 text-sm text-slate-500">
              {dados.total.contents + dados.total.courses === 0
                ? "Nada encontrado. Tente outra palavra, por exemplo “dívida” ou “orçamento”."
                : `${dados.total.contents + dados.total.courses} ${dados.total.contents + dados.total.courses === 1 ? "resultado" : "resultados"}${dados.category ? ` em ${dados.category.name}` : ""}`}
            </p>
          )}

          {!soCursos && dados.featured.length > 0 && (
            <section aria-labelledby="titulo-destaques" className="mt-6">
              <h2 id="titulo-destaques" className="font-heading text-xl font-bold text-slate-900">
                Destaques
              </h2>
              <Grade itens={dados.featured} base={base} />
            </section>
          )}

          {dados.courses.length > 0 && (
            <section aria-labelledby="titulo-cursos" className="mt-8">
              <div className="flex items-center gap-2">
                <FaGraduationCap aria-hidden="true" className="text-xl text-primary" />
                <h2 id="titulo-cursos" className="font-heading text-xl font-bold text-slate-900">
                  Cursos
                </h2>
              </div>
              <Grade itens={dados.courses} base={base} />
            </section>
          )}

          {!soCursos && dados.contents.length > 0 && (
            <section aria-labelledby="titulo-ultimos" className="mt-8">
              <h2 id="titulo-ultimos" className="font-heading text-xl font-bold text-slate-900">
                {filtrando ? "Artigos e vídeos" : "Últimos artigos e vídeos"}
              </h2>
              <Grade itens={dados.contents} base={base} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default EducacaoHome;
