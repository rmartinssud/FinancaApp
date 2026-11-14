import { useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft, FaCircleCheck, FaDownload, FaFileExcel, FaFilePdf, FaFileLines, FaFileZipper, FaRegCircle, FaFileImage, FaFileWord, FaFilePowerpoint } from "react-icons/fa6";
import { api, enviarJson } from "../lib/api.js";
import { tamanhoEmTexto } from "../lib/anexos.js";
import { cartao } from "../app/componentes/estilos.js";
import { classeFoco, dataLonga } from "./util.js";
import { iniciais } from "../lib/pessoas.js";

export function Voltar({ para, texto }) {
  return (
    <nav aria-label="Caminho">
      <Link to={para} className={`inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-primary hover:text-primary-dark ${classeFoco}`}>
        <FaArrowLeft aria-hidden="true" />
        {texto}
      </Link>
    </nav>
  );
}

export function Carregando() {
  return (
    <div className={`${cartao} flex items-center justify-center`} role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

export function NaoEncontrado({ base, texto = "Conteúdo não encontrado" }) {
  return (
    <div className={cartao}>
      <h1 className="font-heading text-xl font-bold text-slate-900">{texto}</h1>
      <p className="mt-2 text-slate-600">Esse endereço não existe mais ou ainda não foi publicado.</p>
      <Link to={base} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full font-bold text-primary ${classeFoco}`}>
        <FaArrowLeft aria-hidden="true" />
        Ver a Educação financeira
      </Link>
    </div>
  );
}

export function AvisoPrevia() {
  return (
    <p role="note" className="mb-3 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
      Prévia: só a equipe de conteúdo vê esta página enquanto ela não estiver publicada.
    </p>
  );
}

// Autor e data de publicação
export function Assinatura({ autor, data, minutos }) {
  if (!autor && !data) return null;
  return (
    <div className="mt-4 flex items-center gap-3">
      {autor &&
        (autor.photoUrl ? (
          <img src={autor.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light text-sm font-bold text-white">
            {iniciais(autor.name)}
          </span>
        ))}
      <p className="text-sm text-slate-600">
        {autor && <span className="block font-bold text-slate-900">{autor.name}</span>}
        <span>
          {data ? `Publicado em ${dataLonga(data)}` : ""}
          {data && minutos ? " · " : ""}
          {minutos ? `${minutos} min de leitura` : ""}
        </span>
      </p>
    </div>
  );
}

export function SobreAutor({ autor }) {
  if (!autor?.bio) return null;
  return (
    <aside aria-label="Sobre o autor" className="mt-6 rounded-2xl bg-soft p-4 text-sm text-slate-700">
      <p className="font-bold text-slate-900">Sobre {autor.name}</p>
      <p className="mt-1 whitespace-pre-line">{autor.bio}</p>
    </aside>
  );
}

function IconeMaterial({ mime }) {
  if (mime === "application/pdf") return <FaFilePdf className="text-red-600" />;
  if (/sheet|excel|csv/.test(mime)) return <FaFileExcel className="text-emerald-600" />;
  if (/word|opendocument\.text/.test(mime)) return <FaFileWord className="text-sky-700" />;
  if (/presentation|powerpoint/.test(mime)) return <FaFilePowerpoint className="text-orange-600" />;
  if (/zip/.test(mime)) return <FaFileZipper className="text-amber-600" />;
  if (/^image\//.test(mime)) return <FaFileImage className="text-primary" />;
  return <FaFileLines className="text-slate-500" />;
}

// Materiais para baixar (PDF, planilhas...)
export function Materiais({ materiais }) {
  if (!materiais?.length) return null;
  return (
    <section aria-labelledby="titulo-materiais" className="mt-6 border-t border-slate-100 pt-5">
      <h2 id="titulo-materiais" className="font-heading text-lg font-bold text-slate-900">
        Materiais para baixar
      </h2>
      <ul className="mt-2 space-y-2">
        {materiais.map((m) => (
          <li key={m.id}>
            <a href={m.url} download className={`flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-2 transition hover:border-primary/40 hover:bg-soft ${classeFoco}`}>
              <span aria-hidden="true" className="text-2xl">
                <IconeMaterial mime={m.mime} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-900">{m.title}</span>
                <span className="block truncate text-xs text-slate-500">
                  {m.originalName} · {tamanhoEmTexto(m.size)}
                </span>
              </span>
              <FaDownload aria-hidden="true" className="shrink-0 text-primary" />
              <span className="sr-only">Baixar</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Marcar como concluído (só logado)
export function BotaoConcluir({ conteudoId, concluido, onMudou }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  async function alternar() {
    setSalvando(true);
    setErro("");
    try {
      await api(`/educacao/progresso/${conteudoId}`, enviarJson("POST", { completed: !concluido }));
      onMudou?.(!concluido);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        disabled={salvando}
        aria-pressed={concluido}
        className={`inline-flex min-h-12 items-center gap-2 rounded-full px-5 font-bold transition disabled:opacity-60 ${classeFoco} ${
          concluido ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "border border-primary/30 text-primary hover:bg-primary hover:text-white"
        }`}
      >
        {concluido ? <FaCircleCheck aria-hidden="true" /> : <FaRegCircle aria-hidden="true" />}
        {concluido ? "Concluído" : "Marcar como concluído"}
      </button>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}
