import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";
import { api } from "../lib/api.js";
import { cartao } from "../app/componentes/estilos.js";
import { CorpoConteudo } from "./ConteudoPagina.jsx";
import { ListaAulas, Progresso } from "./CursoPagina.jsx";
import { Carregando, NaoEncontrado, Voltar } from "./Partes.jsx";
import { useSeo } from "./useSeo.js";
import { classeFoco } from "./util.js";

// Aula de um curso: /educacao/cursos/:slug/:aula
function AulaPagina({ base }) {
  const { slug, aula } = useParams();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    setD(null);
    setErro(null);
    window.scrollTo(0, 0);
    api(`/educacao/cursos/${encodeURIComponent(slug)}/aulas/${encodeURIComponent(aula)}`)
      .then((r) => ativo && setD(r))
      .catch((e) => ativo && setErro(e));
    return () => {
      ativo = false;
    };
  }, [slug, aula]);

  useSeo({
    titulo: d ? `${d.lesson.seoTitle || d.lesson.title} · ${d.course.title} · Famicash` : null,
    descricao: d ? d.lesson.seoDescription || d.lesson.summary || d.course.summary : null,
    indexar: d?.lesson.visibility === "PUBLIC" && !d?.course.preview,
    imagem: d?.lesson.coverUrl ?? d?.course.coverUrl,
    canonico: d ? `/educacao/cursos/${d.course.slug}/${d.lesson.slug}` : null,
  });

  if (erro?.status === 404) return <NaoEncontrado base={base} texto="Aula não encontrada" />;
  if (erro)
    return (
      <p role="alert" className={`${cartao} text-red-600`}>
        {erro.message}
      </p>
    );
  if (!d) return <Carregando />;

  const { course: k, lesson: l, previous: anterior, next: proxima } = d;

  // Concluiu a aula: atualiza a lista e o progresso sem recarregar
  function concluiu(completed) {
    const lessons = k.lessons.map((x) => (x.id === l.id ? { ...x, completed } : x));
    setD({ ...d, lesson: { ...l, completed }, course: { ...k, lessons, completedCount: lessons.filter((x) => x.completed).length } });
  }

  const navegacao = (
    <nav aria-label="Aulas do curso" className="mt-6 grid gap-2 border-t border-slate-100 pt-5 sm:grid-cols-2">
      {anterior ? (
        <Link to={`${base}/cursos/${k.slug}/${anterior.slug}`} className={`flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-2 hover:bg-soft ${classeFoco}`}>
          <FaArrowLeft aria-hidden="true" className="shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">Aula anterior</span>
            <span className="block truncate font-bold text-slate-900">{anterior.title}</span>
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {proxima ? (
        <Link to={`${base}/cursos/${k.slug}/${proxima.slug}`} className={`flex min-h-14 items-center justify-end gap-3 rounded-2xl bg-primary px-4 py-2 text-right text-white shadow hover:bg-primary-dark ${classeFoco}`}>
          <span className="min-w-0">
            <span className="block text-xs text-white/80">Próxima aula</span>
            <span className="block truncate font-bold">{proxima.title}</span>
          </span>
          <FaArrowRight aria-hidden="true" className="shrink-0" />
        </Link>
      ) : (
        <Link to={`${base}/cursos/${k.slug}`} className={`flex min-h-14 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 font-bold text-white shadow hover:bg-emerald-700 ${classeFoco}`}>
          Fim do curso: voltar para o curso
        </Link>
      )}
    </nav>
  );

  return (
    <>
      <Voltar para={`${base}/cursos/${k.slug}`} texto={k.title} />
      <p className="mt-1 text-sm font-bold text-slate-500">
        Aula {l.position} de {k.lessons.length}
      </p>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-5">
        <CorpoConteudo c={{ ...l, loggedIn: d.loggedIn, preview: k.preview }} base={base} onConcluido={concluiu} rodape={navegacao} />
        <aside aria-label="Todas as aulas" className={`mt-5 ${cartao} !p-4 lg:sticky lg:top-6 lg:mt-2`}>
          {d.loggedIn && (
            <div className="mb-4 px-1">
              <Progresso feitas={k.completedCount ?? 0} total={k.lessons.length} />
            </div>
          )}
          <ListaAulas curso={k} base={base} atual={l.slug} />
        </aside>
      </div>
    </>
  );
}

export default AulaPagina;
