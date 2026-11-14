import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaCircleCheck, FaLock, FaPlay, FaGraduationCap } from "react-icons/fa6";
import { api } from "../lib/api.js";
import { cartao } from "../app/componentes/estilos.js";
import Markdown from "../ajuda/Markdown.jsx";
import ConviteCadastro from "./ConviteCadastro.jsx";
import { SeloCadastrados } from "./Selos.jsx";
import { Assinatura, AvisoPrevia, Carregando, NaoEncontrado, SobreAutor, Voltar } from "./Partes.jsx";
import { useSeo } from "./useSeo.js";
import { NOMES_TIPO, classeFoco } from "./util.js";

// Barra de progresso do curso
export function Progresso({ feitas, total }) {
  const pct = total ? Math.round((feitas / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-slate-900">Seu progresso</span>
        <span className="text-slate-600">
          {feitas} de {total} {total === 1 ? "aula" : "aulas"}
        </span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso no curso" className="mt-2 h-3 overflow-hidden rounded-full bg-soft">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Lista das aulas (página do curso e lateral da aula)
export function ListaAulas({ curso, base, atual }) {
  return (
    <ol className="space-y-1">
      {curso.lessons.map((l) => {
        const ativa = l.slug === atual;
        return (
          <li key={l.id}>
            <Link
              to={`${base}/cursos/${curso.slug}/${l.slug}`}
              aria-current={ativa ? "page" : undefined}
              className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition ${classeFoco} ${ativa ? "bg-soft" : "hover:bg-slate-50"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  l.completed ? "bg-emerald-100 text-emerald-700" : l.locked ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary"
                }`}
              >
                {l.completed ? <FaCircleCheck /> : l.locked ? <FaLock /> : l.position}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-bold ${ativa ? "text-primary-dark" : "text-slate-900"}`}>{l.title}</span>
                <span className="block text-xs text-slate-500">
                  Aula {l.position} · {NOMES_TIPO[l.kind]}
                  {l.locked ? " · para cadastrados" : ""}
                  {l.completed ? " · concluída" : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// Página do curso: /educacao/cursos/:slug
function CursoPagina({ base }) {
  const { slug } = useParams();
  const [k, setK] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    setK(null);
    setErro(null);
    window.scrollTo(0, 0);
    api(`/educacao/cursos/${encodeURIComponent(slug)}`)
      .then((d) => ativo && setK(d))
      .catch((e) => ativo && setErro(e));
    return () => {
      ativo = false;
    };
  }, [slug]);

  useSeo({
    titulo: k ? `${k.seoTitle || k.title} · Curso grátis · Famicash` : null,
    descricao: k ? k.seoDescription || k.summary : null,
    indexar: k?.visibility === "PUBLIC" && !k?.preview,
    imagem: k?.coverUrl,
    canonico: k ? `/educacao/cursos/${k.slug}` : null,
  });

  if (erro?.status === 404) return <NaoEncontrado base={base} texto="Curso não encontrado" />;
  if (erro)
    return (
      <p role="alert" className={`${cartao} text-red-600`}>
        {erro.message}
      </p>
    );
  if (!k) return <Carregando />;

  // Próxima aula: a primeira não concluída que dá para abrir
  const proxima = k.lessons.find((l) => !l.completed && !l.locked) ?? k.lessons[0];
  const comecou = (k.completedCount ?? 0) > 0;

  return (
    <>
      <Voltar para={base} texto="Educação financeira" />
      <article className={`mt-2 overflow-hidden ${cartao} !p-0`}>
        {k.coverUrl ? (
          <img src={k.coverUrl} alt="" className="aspect-[21/9] w-full object-cover" />
        ) : (
          <div aria-hidden="true" className="flex aspect-[21/9] w-full items-center justify-center bg-gradient-to-br from-primary to-primary-light text-6xl text-white/70">
            <FaGraduationCap />
          </div>
        )}
        <div className="p-5 sm:p-8">
          {k.preview && <AvisoPrevia />}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs font-bold text-primary-dark">
              <FaGraduationCap aria-hidden="true" /> Curso grátis
            </span>
            {k.category && <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{k.category.name}</span>}
            {k.visibility === "REGISTERED" && <SeloCadastrados />}
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900 md:text-3xl">{k.title}</h1>
          {k.summary && <p className="mt-2 text-[15px] text-slate-600 md:text-base">{k.summary}</p>}
          <Assinatura autor={k.author} />

          {k.loggedIn && k.lessons.length > 0 && (
            <div className="mt-5">
              <Progresso feitas={k.completedCount ?? 0} total={k.lessons.length} />
            </div>
          )}

          {k.lessons.length > 0 && !k.locked && proxima && (
            <Link
              to={`${base}/cursos/${k.slug}/${proxima.slug}`}
              className={`mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-white shadow hover:bg-primary-dark sm:w-auto ${classeFoco}`}
            >
              <FaPlay aria-hidden="true" />
              {comecou ? "Continuar o curso" : "Começar o curso"}
            </Link>
          )}

          {k.locked && <ConviteCadastro oQue="este curso" />}

          {k.description && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <Markdown texto={k.description} base={base} />
            </div>
          )}
          <SobreAutor autor={k.author} />
        </div>
      </article>

      <section aria-labelledby="titulo-aulas" className={`mt-5 ${cartao} !p-4 sm:!p-5`}>
        <h2 id="titulo-aulas" className="px-1 font-heading text-lg font-bold text-slate-900">
          Aulas
        </h2>
        {k.lessons.length === 0 ? <p className="mt-2 px-1 text-slate-600">As aulas deste curso estão chegando.</p> : <div className="mt-2"><ListaAulas curso={k} base={base} /></div>}
      </section>
    </>
  );
}

export default CursoPagina;
