import { useEffect, useId } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaChevronRight, FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import Markdown from "./Markdown.jsx";
import { acharArtigo, buscar, relacionados, secoes } from "./artigos.js";
import { cartao } from "../app/componentes/estilos.js";

const classeFoco = "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Linha clicável de um artigo (lista, busca e relacionados)
function LinhaArtigo({ artigo, base, texto }) {
  return (
    <li>
      <Link to={`${base}/${artigo.slug}`} className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-soft ${classeFoco}`}>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900">{artigo.titulo}</span>
          {(texto ?? artigo.resumo) && <span className="mt-0.5 block text-sm text-slate-500">{texto ?? artigo.resumo}</span>}
        </span>
        <FaChevronRight aria-hidden="true" className="shrink-0 text-sm text-slate-400" />
      </Link>
    </li>
  );
}

function Busca({ valor, onMudar }) {
  const id = useId();
  return (
    <div role="search" className="relative mt-4">
      <label htmlFor={id} className="sr-only">
        Buscar na ajuda
      </label>
      <FaMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder="Buscar: cartão, fatura, saldo, convite..."
        autoComplete="off"
        className="min-h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-12 text-[15px] text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => onMudar("")}
          aria-label="Limpar busca"
          className={`absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-soft ${classeFoco}`}
        >
          <FaXmark aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Lista de artigos por seção + busca
function Indice({ base }) {
  const [params, setParams] = useSearchParams();
  const consulta = params.get("q") ?? "";
  const mudar = (q) => setParams(q ? { q } : {}, { replace: true });
  const achados = consulta.trim() ? buscar(consulta) : null;

  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-3xl">Central de Ajuda</h1>
      <p className="mt-1 text-[15px] text-slate-600">Passo a passo de cada parte do app. Busque uma palavra ou escolha um assunto.</p>
      <Busca valor={consulta} onMudar={mudar} />

      {achados ? (
        <section aria-label="Resultados da busca" className={`mt-5 ${cartao}`}>
          <p role="status" className="px-3 text-sm text-slate-500">
            {achados.length === 0
              ? "Nada encontrado. Tente outra palavra, por exemplo “fatura” ou “saldo”."
              : `${achados.length} ${achados.length === 1 ? "artigo encontrado" : "artigos encontrados"}`}
          </p>
          {achados.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100">
              {achados.map(({ artigo, trecho }) => (
                <LinhaArtigo key={artigo.slug} artigo={artigo} base={base} texto={trecho} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {secoes().map((s) => (
            <section key={s.titulo} aria-label={s.titulo} className={`${cartao} !p-4 sm:!p-5`}>
              <h2 className="px-3 text-xs font-bold uppercase tracking-wider text-slate-500">{s.titulo}</h2>
              <ul className="mt-1 divide-y divide-slate-100">
                {s.artigos.map((a) => (
                  <LinhaArtigo key={a.slug} artigo={a} base={base} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Artigo({ artigo, base }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [artigo.slug]);

  const outros = relacionados(artigo);

  return (
    <>
      <nav aria-label="Caminho">
        <Link to={base} className={`inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-primary hover:text-primary-dark ${classeFoco}`}>
          <FaArrowLeft aria-hidden="true" />
          Central de Ajuda
        </Link>
      </nav>

      <article className={`mt-2 ${cartao}`}>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{artigo.categoria}</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-slate-900 md:text-3xl">{artigo.titulo}</h1>
        {artigo.resumo && <p className="mt-2 text-[15px] text-slate-500">{artigo.resumo}</p>}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <Markdown texto={artigo.corpo} base={base} />
        </div>
      </article>

      {outros.length > 0 && (
        <section aria-labelledby="titulo-relacionados" className={`mt-5 ${cartao} !p-4 sm:!p-5`}>
          <h2 id="titulo-relacionados" className="px-3 font-heading text-lg font-bold text-slate-900">
            Artigos relacionados
          </h2>
          <ul className="mt-1 divide-y divide-slate-100">
            {outros.map((a) => (
              <LinhaArtigo key={a.slug} artigo={a} base={base} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Central de Ajuda: a mesma tela dentro do app (/app/ajuda) e pública (/ajuda).
// base: o começo do endereço, para os links entre artigos ficarem no mesmo lugar.
function CentralAjuda({ base }) {
  const { slug } = useParams();

  useEffect(() => {
    const anterior = document.title;
    const a = slug ? acharArtigo(slug) : null;
    document.title = a ? `${a.titulo} · Ajuda · Famicash` : "Central de Ajuda · Famicash";
    return () => {
      document.title = anterior;
    };
  }, [slug]);

  if (!slug) return <Indice base={base} />;

  const artigo = acharArtigo(slug);
  if (!artigo)
    return (
      <div className={cartao}>
        <h1 className="font-heading text-xl font-bold text-slate-900">Artigo não encontrado</h1>
        <p className="mt-2 text-slate-600">Esse endereço não existe mais ou foi digitado errado.</p>
        <Link to={base} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full font-bold text-primary ${classeFoco}`}>
          <FaArrowLeft aria-hidden="true" />
          Ver todos os artigos
        </Link>
      </div>
    );

  return <Artigo artigo={artigo} base={base} />;
}

export default CentralAjuda;
