import AppLayout from "./AppLayout.jsx";
import EducacaoTelas from "../educacao/Educacao.jsx";

// Educação financeira dentro do app (/app/educacao/...): os mesmos conteúdos do site, com o menu do app
function Educacao({ pagina }) {
  return (
    <AppLayout semBotaoNovo>
      <div className={pagina === "conteudo" ? "mx-auto max-w-3xl" : ""}>
        <EducacaoTelas pagina={pagina} base="/app/educacao" />
      </div>
    </AppLayout>
  );
}

export default Educacao;
