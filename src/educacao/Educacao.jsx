import EducacaoHome from "./EducacaoHome.jsx";
import ConteudoPagina from "./ConteudoPagina.jsx";
import CursoPagina from "./CursoPagina.jsx";
import AulaPagina from "./AulaPagina.jsx";

// Escolhe a tela da Educação financeira. A mesma no site (/educacao) e no app (/app/educacao).
function Educacao({ pagina, base }) {
  if (pagina === "conteudo") return <ConteudoPagina base={base} />;
  if (pagina === "curso") return <CursoPagina base={base} />;
  if (pagina === "aula") return <AulaPagina base={base} />;
  return <EducacaoHome base={base} soCursos={pagina === "cursos"} />;
}

export default Educacao;
