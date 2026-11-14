import { useId, useRef, useState } from "react";
import { FaPaperclip, FaFilePdf, FaImage, FaFile, FaXmark, FaDownload } from "react-icons/fa6";
import { ACEITOS, LIMITE_ANEXO, abreNoNavegador, problemaDoArquivo, tamanhoEmTexto, tipoDoIcone, urlDoAnexo } from "../../lib/anexos.js";
import { deveOtimizar, otimizarImagem } from "../../lib/otimizarImagem.js";

const MAX_ANEXOS = 10;

// Arquivos novos que foram reduzidos aqui no navegador (para mostrar "otimizada")
const OTIMIZADOS = new WeakSet();

// Texto à direita de um anexo novo: tamanho final e o que vai acontecer
function situacaoDoNovo(arquivo) {
  const tamanho = tamanhoEmTexto(arquivo.size);
  if (OTIMIZADOS.has(arquivo)) return `${tamanho} · otimizada`;
  if (arquivo.size > LIMITE_ANEXO) return `${tamanho} · reduz no envio`;
  return `${tamanho} · a enviar`;
}

// Um anexo (salvo ou ainda para enviar).
// Foto comum (JPG/PNG/WEBP) e PDF abrem no navegador; HEIC (e outros) mostram ícone de arquivo e "Baixar",
// porque a maioria dos navegadores não mostra HEIC.
const ICONES = { pdf: [FaFilePdf, "text-red-600"], imagem: [FaImage, "text-primary"], arquivo: [FaFile, "text-slate-500"] };

function ItemAnexo({ nome, tamanho, mime, id, onRemover, rotuloRemover, pendente, arquivo }) {
  const [Icone, cor] = ICONES[tipoDoIcone(mime, nome)];
  const abre = abreNoNavegador(mime);
  const href = id ? urlDoAnexo(id) : null;
  const conteudo = (
    <>
      <Icone aria-hidden="true" className={`shrink-0 ${cor}`} />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{pendente ? situacaoDoNovo(arquivo) : tamanhoEmTexto(tamanho)}</span>
    </>
  );
  const classeLink =
    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-sm font-medium text-slate-800 underline-offset-2 hover:bg-soft hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";
  return (
    <li className="flex items-center gap-1">
      {href && abre ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classeLink}>
          {conteudo}
        </a>
      ) : (
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-sm font-medium text-slate-800">{conteudo}</span>
      )}
      {href && !abre && (
        <a
          href={urlDoAnexo(id, true)}
          download={nome}
          aria-label={`Baixar ${nome}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-bold text-primary transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <FaDownload aria-hidden="true" /> Baixar
        </a>
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
          mime={a.mime}
          id={a.id}
          onRemover={onRemover ? () => onRemover(a) : null}
          rotuloRemover={`Remover anexo ${a.originalName}`}
        />
      ))}
    </ul>
  );
}

// onOcupado(true/false): avisa o formulário enquanto otimiza as fotos (para não salvar no meio)
function CampoAnexos({ salvos, novos, onAdicionar, onRemoverNovo, onRemoverSalvo, onOcupado }) {
  const idEntrada = useId();
  const entrada = useRef(null);
  const [erro, setErro] = useState("");
  const [otimizando, setOtimizando] = useState(false);
  const [aviso, setAviso] = useState("");
  const total = salvos.length + novos.length;

  async function escolher(e) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = "";
    const problemas = arquivos.map(problemaDoArquivo).filter(Boolean);
    const bons = arquivos.filter((a) => !problemaDoArquivo(a)).slice(0, Math.max(0, MAX_ANEXOS - total));
    if (arquivos.length - problemas.length > bons.length) problemas.push(`Até ${MAX_ANEXOS} anexos por lançamento.`);
    setErro(problemas.join(" "));
    setAviso("");
    if (!bons.length) return;

    // Fotos grandes: reduz aqui antes de enviar (o servidor reduz o que ainda passar de 3 MB)
    if (!bons.some(deveOtimizar)) return onAdicionar(bons);
    setOtimizando(true);
    onOcupado?.(true);
    const prontos = [];
    const avisos = [];
    try {
      for (const arquivo of bons) {
        const r = await otimizarImagem(arquivo);
        if (r.otimizado) {
          OTIMIZADOS.add(r.arquivo);
          avisos.push(`“${r.arquivo.name}”: ${tamanhoEmTexto(r.tamanhoOriginal)} → ${tamanhoEmTexto(r.arquivo.size)}`);
        }
        prontos.push(r.arquivo);
      }
    } finally {
      setOtimizando(false);
      onOcupado?.(false);
    }
    if (avisos.length) setAviso(`Imagem otimizada: ${avisos.join("; ")}.`);
    onAdicionar(prontos);
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
          <span className="block text-sm text-slate-500">Foto ou PDF. Arquivos acima de 3 MB são reduzidos automaticamente.</span>
        </div>
      </div>
      {(salvos.length > 0 || novos.length > 0) && (
        <ul className="ml-10 mt-1 space-y-0.5">
          {salvos.map((a) => (
            <ItemAnexo
              key={a.id}
              nome={a.originalName}
              tamanho={a.size}
              mime={a.mime}
              id={a.id}
              onRemover={onRemoverSalvo ? () => onRemoverSalvo(a) : null}
              rotuloRemover={`Remover anexo ${a.originalName}`}
            />
          ))}
          {novos.map((arquivo, i) => (
            <ItemAnexo
              key={`${arquivo.name}-${i}`}
              nome={arquivo.name}
              mime={arquivo.type}
              arquivo={arquivo}
              pendente
              onRemover={() => onRemoverNovo(i)}
              rotuloRemover={`Tirar ${arquivo.name}`}
            />
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" className="ml-10 text-sm text-slate-600 empty:hidden">
        {otimizando ? "Otimizando imagem..." : aviso}
      </p>
      {erro && <p className="ml-10 mt-1 text-sm text-red-600">{erro}</p>}
    </div>
  );
}

export default CampoAnexos;
