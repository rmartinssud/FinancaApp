import { Link } from "react-router-dom";
import { FaLightbulb } from "react-icons/fa6";

// Renderizador mínimo de Markdown para os artigos da Ajuda.
// Gera elementos React (nunca HTML cru), então não precisa sanitizar.
// Suporta: ## e ### títulos, parágrafos, listas (- e 1.), citações/dicas (>),
// **negrito**, *itálico*, `código` e [links](artigo:slug | /caminho | https://...).

const RE_INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function Inline({ texto, base }) {
  const partes = texto.split(RE_INLINE).filter((p) => p !== "");
  return partes.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i} className="font-bold text-slate-900">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return (
        <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-800">
          {p.slice(1, -1)}
        </code>
      );
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, rotulo, destino] = link;
      const classe = "font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 rounded";
      if (destino.startsWith("artigo:"))
        return (
          <Link key={i} to={destino.slice(7) ? `${base}/${destino.slice(7)}` : base} className={classe}>
            {rotulo}
          </Link>
        );
      if (destino.startsWith("/"))
        return (
          <Link key={i} to={destino} className={classe}>
            {rotulo}
          </Link>
        );
      if (/^https?:\/\//.test(destino))
        return (
          <a key={i} href={destino} target="_blank" rel="noopener noreferrer" className={classe}>
            {rotulo}
          </a>
        );
      return <span key={i}>{rotulo}</span>;
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

function Item({ item, base }) {
  return (
    <li>
      <Inline texto={item.texto} base={base} />
      {item.sub.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-slate-400">
          {item.sub.map((t, k) => (
            <li key={k}>
              <Inline texto={t} base={base} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Divide o texto em blocos (título, parágrafo, lista, dica)
function blocos(md) {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const saida = [];
  let atual = null;
  const fechar = () => {
    if (atual) saida.push(atual);
    atual = null;
  };
  for (const bruta of linhas) {
    const linha = bruta.trimEnd();
    if (!linha.trim()) {
      fechar();
      continue;
    }
    const titulo = linha.match(/^(#{2,3})\s+(.*)$/);
    if (titulo) {
      fechar();
      saida.push({ tipo: titulo[1].length === 2 ? "h2" : "h3", texto: titulo[2] });
      continue;
    }
    // Subitem (recuado) dentro de um item de lista
    const sub = bruta.match(/^\s{2,}[-*]\s+(.*)$/);
    if (sub && atual && (atual.tipo === "ul" || atual.tipo === "ol")) {
      atual.itens[atual.itens.length - 1].sub.push(sub[1]);
      continue;
    }
    const ul = linha.match(/^\s*[-*]\s+(.*)$/);
    const ol = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tipo = ul ? "ul" : "ol";
      if (!atual || atual.tipo !== tipo) {
        fechar();
        atual = { tipo, itens: [] };
      }
      atual.itens.push({ texto: (ul ?? ol)[1], sub: [] });
      continue;
    }
    const citacao = linha.match(/^>\s?(.*)$/);
    if (citacao) {
      if (!atual || atual.tipo !== "dica") {
        fechar();
        atual = { tipo: "dica", linhas: [] };
      }
      atual.linhas.push(citacao[1]);
      continue;
    }
    // Linha que continua um item de lista (recuada)
    if (atual && (atual.tipo === "ul" || atual.tipo === "ol") && /^\s{2,}\S/.test(bruta)) {
      const ultimo = atual.itens[atual.itens.length - 1];
      if (ultimo.sub.length) ultimo.sub[ultimo.sub.length - 1] += " " + linha.trim();
      else ultimo.texto += " " + linha.trim();
      continue;
    }
    if (!atual || atual.tipo !== "p") {
      fechar();
      atual = { tipo: "p", linhas: [] };
    }
    atual.linhas.push(linha.trim());
  }
  fechar();
  return saida;
}

function Markdown({ texto, base = "/app/ajuda" }) {
  return (
    <div className="text-[15px] leading-relaxed text-slate-700">
      {blocos(texto).map((b, i) => {
        switch (b.tipo) {
          case "h2":
            return (
              <h2 key={i} className="mt-7 font-heading text-lg font-bold text-slate-900 first:mt-0 sm:text-xl">
                <Inline texto={b.texto} base={base} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-5 text-base font-bold text-slate-900">
                <Inline texto={b.texto} base={base} />
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 marker:text-primary-light">
                {b.itens.map((item, j) => (
                  <Item key={j} item={item} base={base} />
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="mt-3 list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-primary">
                {b.itens.map((item, j) => (
                  <Item key={j} item={item} base={base} />
                ))}
              </ol>
            );
          case "dica":
            return (
              <div key={i} className="mt-4 flex gap-3 rounded-2xl border border-primary/20 bg-soft p-4 text-sm text-primary-dark">
                <FaLightbulb aria-hidden="true" className="mt-0.5 shrink-0 text-base text-primary" />
                <div className="space-y-1">
                  {b.linhas.map((t, j) => (
                    <p key={j}>
                      <Inline texto={t} base={base} />
                    </p>
                  ))}
                </div>
              </div>
            );
          default:
            return (
              <p key={i} className="mt-3 first:mt-0">
                <Inline texto={b.linhas.join(" ")} base={base} />
              </p>
            );
        }
      })}
    </div>
  );
}

export default Markdown;
