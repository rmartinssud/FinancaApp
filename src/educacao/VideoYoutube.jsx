import { useState } from "react";
import { FaPlay } from "react-icons/fa6";
import { classeFoco } from "./util.js";

// Vídeo do YouTube "leve": mostra só a miniatura e carrega o player (youtube-nocookie) quando a pessoa toca.
// Assim a página abre rápido e o YouTube não coloca cookies antes do play.
function VideoYoutube({ id, titulo }) {
  const [tocando, setTocando] = useState(false);
  if (!id) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 shadow-lg">
      {tocando ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={titulo ? `Vídeo: ${titulo}` : "Vídeo do YouTube"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setTocando(true)} className={`group absolute inset-0 h-full w-full ${classeFoco}`} aria-label={`Assistir ao vídeo${titulo ? `: ${titulo}` : ""}`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-2xl text-primary shadow-xl transition group-hover:scale-105">
            <FaPlay className="ml-1" />
          </span>
        </button>
      )}
    </div>
  );
}

export default VideoYoutube;
