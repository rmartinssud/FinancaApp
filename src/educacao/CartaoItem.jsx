import { Link } from "react-router-dom";
import { FaGraduationCap, FaFileLines } from "react-icons/fa6";
import { SeloCadastrados, SeloConcluido, SeloTipo } from "./Selos.jsx";
import { classeFoco } from "./util.js";

// Cartão de artigo/vídeo ou de curso nas listas da Educação financeira
function CartaoItem({ item, base, grande = false }) {
  const para = item.type === "course" ? `${base}/cursos/${item.slug}` : `${base}/${item.slug}`;
  const progresso = item.type === "course" && item.completedCount !== undefined && item.lessonsCount > 0 ? Math.round((item.completedCount / item.lessonsCount) * 100) : null;
  const Icone = item.type === "course" ? FaGraduationCap : FaFileLines;

  return (
    <Link
      to={para}
      className={`group flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-12px_rgba(70,79,163,0.35)] motion-reduce:transition-none ${classeFoco}`}
    >
      <div className={`relative w-full overflow-hidden bg-gradient-to-br from-primary to-primary-light ${grande ? "aspect-[16/9]" : "aspect-[16/9]"}`}>
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" />
        ) : (
          <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-5xl text-white/70">
            <Icone />
          </span>
        )}
        {item.locked && (
          <span className="absolute left-3 top-3">
            <SeloCadastrados claro />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeloTipo item={item} />
          {item.category && <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.category.name}</span>}
          {item.type !== "course" && item.completed && <SeloConcluido />}
        </div>
        <h3 className={`mt-2 font-heading font-bold text-slate-900 group-hover:text-primary-dark ${grande ? "text-xl" : "text-lg"}`}>{item.title}</h3>
        {item.summary && <p className="mt-1 line-clamp-3 text-[15px] text-slate-600">{item.summary}</p>}
        <div className="mt-auto pt-3 text-sm text-slate-500">
          {item.type === "course" ? (
            <>
              <span>
                {item.lessonsCount} {item.lessonsCount === 1 ? "aula" : "aulas"}
              </span>
              {progresso !== null && (
                <span className="mt-2 block">
                  <span className="sr-only">Progresso: </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-soft" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${progresso}%` }} />
                  </span>
                  <span className="mt-1 block text-xs">
                    {item.completedCount} de {item.lessonsCount} concluídas
                  </span>
                </span>
              )}
            </>
          ) : (
            <span>
              {item.author?.name ? `${item.author.name}` : ""}
              {item.author?.name && item.readingMinutes ? " · " : ""}
              {item.readingMinutes ? `${item.readingMinutes} min de leitura` : ""}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default CartaoItem;
