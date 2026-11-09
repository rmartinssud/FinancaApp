import { iniciais, corDaPessoa } from "../../lib/pessoas.js";

// Bolinha com as iniciais da pessoa (cor fixa por pessoa). Sem foto na v1.
function Avatar({ pessoa, tamanho = "h-5 w-5 text-[10px]", className = "" }) {
  if (!pessoa) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${tamanho} ${className}`}
      style={{ backgroundColor: corDaPessoa(pessoa.id) }}
    >
      {iniciais(pessoa.name)}
    </span>
  );
}

// "· (R) Robson" no fim da linha de um lançamento: quem lançou
export function QuemLancou({ pessoa }) {
  if (!pessoa) return null;
  const nome = pessoa.name.trim().split(/\s+/)[0];
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {" · "}
      <Avatar pessoa={pessoa} />
      <span className="sr-only">lançado por </span>
      {nome}
    </span>
  );
}

export default Avatar;
