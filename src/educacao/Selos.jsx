import { FaLock, FaCirclePlay, FaFileLines, FaGraduationCap, FaCircleCheck } from "react-icons/fa6";
import { NOMES_TIPO } from "./util.js";

// Selinhos dos cartões e páginas: tipo, "Para cadastrados" e "Concluído"
export function SeloTipo({ item }) {
  if (item.type === "course")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs font-bold text-primary-dark">
        <FaGraduationCap aria-hidden="true" /> Curso
      </span>
    );
  const Icone = item.kind === "TEXTO" ? FaFileLines : FaCirclePlay;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs font-bold text-primary-dark">
      <Icone aria-hidden="true" /> {NOMES_TIPO[item.kind] ?? "Artigo"}
    </span>
  );
}

export function SeloCadastrados({ claro = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${claro ? "bg-white/90 text-slate-800" : "bg-amber-100 text-amber-900"}`}>
      <FaLock aria-hidden="true" /> Para cadastrados
    </span>
  );
}

export function SeloConcluido() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
      <FaCircleCheck aria-hidden="true" /> Concluído
    </span>
  );
}
