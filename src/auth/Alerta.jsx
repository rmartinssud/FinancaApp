import { FaCircleExclamation, FaCircleCheck, FaCircleInfo } from "react-icons/fa6";

// Caixa de aviso (erro, sucesso ou informação). role="alert" faz o leitor de tela anunciar.
const estilos = {
  erro: { classe: "border-red-200 bg-red-50 text-red-800", Icone: FaCircleExclamation },
  sucesso: { classe: "border-emerald-200 bg-emerald-50 text-emerald-800", Icone: FaCircleCheck },
  info: { classe: "border-primary/20 bg-soft text-primary-dark", Icone: FaCircleInfo },
};

function Alerta({ tipo = "erro", children, className = "" }) {
  if (!children) return null;
  const { classe, Icone } = estilos[tipo];
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`flex gap-3 rounded-2xl border p-4 text-sm ${classe} ${className}`}>
      <Icone aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
      <div>{children}</div>
    </div>
  );
}

export default Alerta;
