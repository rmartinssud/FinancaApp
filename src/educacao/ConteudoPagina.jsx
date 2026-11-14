import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaGraduationCap } from "react-icons/fa6";
import { api } from "../lib/api.js";
import { cartao } from "../app/componentes/estilos.js";
import Markdown from "../ajuda/Markdown.jsx";
import VideoYoutube from "./VideoYoutube.jsx";
import ConviteCadastro from "./ConviteCadastro.jsx";
import { SeloCadastrados, SeloTipo } from "./Selos.jsx";
import { Assinatura, AvisoPrevia, BotaoConcluir, Carregando, Materiais, NaoEncontrado, SobreAutor, Voltar } from "./Partes.jsx";
import { useSeo } from "./useSeo.js";
import { classeFoco } from "./util.js";

// Corpo de um artigo/vídeo/aula (usado também na página da aula do curso)
export function CorpoConteudo({ c, base, onConcluido, rodape }) {
  return (
    <article className={`mt-2 ${cartao}`}>
      {c.preview && <AvisoPrevia />}
      <div className="flex flex-wrap items-center gap-2">
        <SeloTipo item={c} />
        {c.category && (
          <Link to={`${base}?categoria=${c.category.slug}`} className={`rounded text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-primary ${classeFoco}`}>
            {c.category.name}
          </Link>
        )}
        {c.visibility === "REGISTERED" && <SeloCadastrados />}
      </div>
      <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900 md:text-3xl">{c.title}</h1>
      {c.summary && <p className="mt-2 text-[15px] text-slate-600 md:text-base">{c.summary}</p>}
      <Assinatura autor={c.author} data={c.publishedAt} minutos={c.locked ? 0 : c.readingMinutes} />

      {c.locked ? (
        <>
          {c.coverUrl && <img src={c.coverUrl} alt="" className="mt-5 aspect-video w-full rounded-2xl object-cover opacity-70" />}
          <ConviteCadastro oQue={c.kind === "VIDEO" ? "este vídeo" : "este conteúdo"} materiais={c.materialsCount} />
        </>
      ) : (
        <>
          {c.video && (
            <div className="mt-5">
              <VideoYoutube id={c.video.id} titulo={c.title} />
            </div>
          )}
          {!c.video && c.coverUrl && c.type !== "course" && <img src={c.coverUrl} alt="" className="mt-5 aspect-video w-full rounded-2xl object-cover" />}
          {c.body && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <Markdown texto={c.body} base={base} />
            </div>
          )}
          <Materiais materiais={c.materials} />
          {c.loggedIn && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <BotaoConcluir conteudoId={c.id} concluido={Boolean(c.completed)} onMudou={onConcluido} />
            </div>
          )}
          <SobreAutor autor={c.author} />
        </>
      )}
      {rodape}
    </article>
  );
}

// Página de um artigo/vídeo: /educacao/:slug (ou /app/educacao/:slug)
function ConteudoPagina({ base }) {
  const { slug } = useParams();
  const [c, setC] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    setC(null);
    setErro(null);
    window.scrollTo(0, 0);
    api(`/educacao/conteudos/${encodeURIComponent(slug)}`)
      .then((d) => ativo && setC(d))
      .catch((e) => ativo && setErro(e));
    return () => {
      ativo = false;
    };
  }, [slug]);

  useSeo({
    titulo: c ? `${c.seoTitle || c.title} · Famicash` : null,
    descricao: c ? c.seoDescription || c.summary : null,
    indexar: c?.visibility === "PUBLIC" && !c?.preview,
    imagem: c?.coverUrl,
    canonico: c ? `/educacao/${c.slug}` : null,
  });

  if (erro?.status === 404) return <NaoEncontrado base={base} />;
  if (erro)
    return (
      <p role="alert" className={`${cartao} text-red-600`}>
        {erro.message}
      </p>
    );
  if (!c) return <Carregando />;

  return (
    <>
      <Voltar para={base} texto="Educação financeira" />
      <CorpoConteudo c={c} base={base} onConcluido={(completed) => setC({ ...c, completed })} />
      {c.courses?.length > 0 && (
        <section aria-labelledby="titulo-cursos-do-conteudo" className={`mt-5 ${cartao} !p-4 sm:!p-5`}>
          <h2 id="titulo-cursos-do-conteudo" className="px-1 font-heading text-lg font-bold text-slate-900">
            Faz parte do curso
          </h2>
          <ul className="mt-2 space-y-1">
            {c.courses.map((k) => (
              <li key={k.slug}>
                <Link to={`${base}/cursos/${k.slug}`} className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 font-bold text-primary hover:bg-soft ${classeFoco}`}>
                  <FaGraduationCap aria-hidden="true" />
                  {k.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default ConteudoPagina;
