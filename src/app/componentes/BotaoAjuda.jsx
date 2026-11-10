import { Link } from "react-router-dom";
import { FaCircleQuestion } from "react-icons/fa6";

// Botão "?" ao lado do título de uma tela: abre o artigo da Central de Ajuda sobre ela.
// claro: versão branca, para usar sobre fundo colorido (ex.: topo de Lançamentos).
function BotaoAjuda({ artigo, assunto, claro = false }) {
  return (
    <Link
      to={`/app/ajuda/${artigo}`}
      aria-label={`Ajuda sobre ${assunto}`}
      title="Ajuda"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition focus:outline-none focus-visible:ring-4 ${
        claro ? "text-white/85 hover:bg-white/15 hover:text-white focus-visible:ring-white/50" : "text-slate-400 hover:bg-soft hover:text-primary focus-visible:ring-primary/30"
      }`}
    >
      <FaCircleQuestion aria-hidden="true" />
    </Link>
  );
}

export default BotaoAjuda;
