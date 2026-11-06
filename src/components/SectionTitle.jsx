// Palavra destacada: texto ciano com uma barra azul translúcida por trás
// (feita com o pseudo-elemento before:). Pode ser usada sozinha em qualquer texto.
export function Destaque({ children, claro = false }) {
  return (
    <span
      className={`relative inline-block before:absolute before:inset-x-0 before:bottom-[0.15em] before:h-[0.3em] before:bg-sky-600/20 ${claro ? "text-sky-200" : "text-accent-strong"}`}
    >
      <span className="relative">{children}</span>
    </span>
  );
}

// Título de seção com a "palavra destacada" (componente Destaque acima).
//
// Exemplo: <SectionTitle antes="Proteger sua" destaque="família" depois="das adversidades" />
function SectionTitle({
  antes = "",
  destaque = "",
  depois = "",
  subtitulo,
  centralizado = false,
  claro = false, // true = texto branco (para fundos escuros)
  className = "",
}) {
  return (
    <div className={`${centralizado ? "mx-auto text-center" : ""} ${className}`}>
      {subtitulo && (
        <p className={`mb-3 text-sm font-bold uppercase tracking-widest ${claro ? "text-sky-200" : "text-primary"}`}>
          {subtitulo}
        </p>
      )}
      <h2
        className={`font-heading text-4xl font-bold leading-tight md:text-5xl ${claro ? "text-white" : "text-slate-900"}`}
      >
        {antes}{" "}
        {destaque && <Destaque claro={claro}>{destaque}</Destaque>}{" "}
        {depois}
      </h2>
    </div>
  );
}

export default SectionTitle;
