import { useEffect } from "react";

// Título, descrição e Open Graph da página no navegador.
// Em produção o Nginx já manda essas tags no HTML (para o Google e o WhatsApp, sem JavaScript);
// aqui atualizamos ao navegar dentro do app. Ao sair da página, volta ao que era.
function definirMeta(seletor, criar, valor) {
  let el = document.head.querySelector(seletor);
  const anterior = el ? el.getAttribute("content") ?? el.getAttribute("href") : null;
  if (!el) {
    el = criar();
    document.head.appendChild(el);
  }
  el.setAttribute(el.tagName === "LINK" ? "href" : "content", valor);
  return () => {
    if (anterior === null) el.remove();
    else el.setAttribute(el.tagName === "LINK" ? "href" : "content", anterior);
  };
}

const meta = (atributo, nome) => () => {
  const el = document.createElement("meta");
  el.setAttribute(atributo, nome);
  return el;
};

export function useSeo({ titulo, descricao, indexar = true, imagem, canonico }) {
  useEffect(() => {
    if (!titulo) return undefined;
    const tituloAnterior = document.title;
    document.title = titulo;
    const desfazer = [];
    if (descricao) {
      desfazer.push(definirMeta('meta[name="description"]', meta("name", "description"), descricao));
      desfazer.push(definirMeta('meta[property="og:description"]', meta("property", "og:description"), descricao));
    }
    desfazer.push(definirMeta('meta[property="og:title"]', meta("property", "og:title"), titulo));
    desfazer.push(definirMeta('meta[name="robots"]', meta("name", "robots"), indexar ? "index, follow" : "noindex, follow"));
    if (imagem) desfazer.push(definirMeta('meta[property="og:image"]', meta("property", "og:image"), new URL(imagem, window.location.origin).href));
    if (canonico)
      desfazer.push(
        definirMeta(
          'link[rel="canonical"]',
          () => {
            const l = document.createElement("link");
            l.setAttribute("rel", "canonical");
            return l;
          },
          new URL(canonico, window.location.origin).href,
        ),
      );
    return () => {
      document.title = tituloAnterior;
      desfazer.reverse().forEach((f) => f());
    };
  }, [titulo, descricao, indexar, imagem, canonico]);
}
