import { useId, useRef, useState } from "react";
import { FaPaperclip, FaFilePdf, FaImage, FaXmark } from "react-icons/fa6";
import { ACEITOS, problemaDoArquivo, tamanhoEmTexto, urlDoAnexo } from "../../lib/anexos.js";

const MAX_ANEXOS = 10;

// Um anexo (salvo ou ainda para enviar)
function ItemAnexo({ nome, tamanho, pdf, href, onRemover, rotuloRemover, pendente }) {
  const Icone = pdf ? FaFilePdf : FaImage;
  const conteudo = (
    <>
      <Icone aria-hidden="true" className={`shrink-0 ${pdf ? "text-red-600" : "text-primary"}`} />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{pendente ? "a enviar" : tamanhoEmTexto(tamanho)}</span>
    </>
  );
  return (
    <li className="flex items-center gap-1">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-sm font-medium text-slate-800 underline-offset-2 hover:bg-soft hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          {conteudo}
        </a>
      ) : (
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-sm font-medium text-slate-800">{conteudo}</span>
      )}
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          aria-label={rotuloRemover}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <FaXmark aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

// Anexos do lançamento: os já salvos (abrir / remover) e os novos (enviados ao salvar).
export function ListaAnexos({ anexos, onRemover }) {
  if (!anexos.length) return null;
  return (
    <ul className="space-y-0.5">
      {anexos.map((a) => (
        <ItemAnexo
          key={a.id}
          nome={a.originalName}
          tamanho={a.size}
          pdf={a.mime === "application/pdf"}
          href={urlDoAnexo(a.id)}
          onRemover={onRemover ? () => onRemover(a) : null}
          rotuloRemover={`Remover anexo ${a.originalName}`}
        />
      ))}
    </ul>
  );
}

function CampoAnexos({ salvos, novos, onAdicionar, onRemoverNovo, onRemoverSalvo }) {
  const idEntrada = useId();
  const entrada = useRef(null);
  const [erro, setErro] = useState("");
  const total = salvos.length + novos.length;

  function escolher(e) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = "";
    const problemas = arquivos.map(problemaDoArquivo).filter(Boolean);
    const bons = arquivos.filter((a) => !problemaDoArquivo(a)).slice(0, Math.max(0, MAX_ANEXOS - total));
    if (arquivos.length - problemas.length > bons.length) problemas.push(`Até ${MAX_ANEXOS} anexos por lançamento.`);
    setErro(problemas.join(" "));
    if (bons.length) onAdicionar(bons);
  }

  return (
    <div className="border-b border-slate-100 px-5 py-3">
      <div className="flex min-h-11 items-center gap-4">
        <FaPaperclip aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={idEntrada}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full font-medium text-slate-800 focus-within:ring-4 focus-within:ring-primary/30"
          >
            Adicionar anexo
            <input id={idEntrada} ref={entrada} type="file" accept={ACEITOS} multiple onChange={escolher} className="sr-only" />
          </label>
          <span className="block text-sm text-slate-500">Foto ou PDF, até 3 MB cada</span>
        </div>
      </div>
      {(salvos.length > 0 || novos.length > 0) && (
        <ul className="ml-10 mt-1 space-y-0.5">
          {salvos.map((a) => (
            <ItemAnexo
              key={a.id}
              nome={a.originalName}
              tamanho={a.size}
              pdf={a.mime === "application/pdf"}
              href={urlDoAnexo(a.id)}
              onRemover={onRemoverSalvo ? () => onRemoverSalvo(a) : null}
              rotuloRemover={`Remover anexo ${a.originalName}`}
            />
          ))}
          {novos.map((arquivo, i) => (
            <ItemAnexo
              key={`${arquivo.name}-${i}`}
              nome={arquivo.name}
              pdf={arquivo.type === "application/pdf"}
              pendente
              onRemover={() => onRemoverNovo(i)}
              rotuloRemover={`Tirar ${arquivo.name}`}
            />
          ))}
        </ul>
      )}
      {erro && <p className="ml-10 mt-1 text-sm text-red-600">{erro}</p>}
    </div>
  );
}

export default CampoAnexos;
