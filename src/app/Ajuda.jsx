import AppLayout from "./AppLayout.jsx";
import CentralAjuda from "../ajuda/CentralAjuda.jsx";

// Central de Ajuda dentro do app (/app/ajuda e /app/ajuda/:slug)
function Ajuda() {
  return (
    <AppLayout semBotaoNovo>
      <div className="mx-auto max-w-3xl">
        <CentralAjuda base="/app/ajuda" />
      </div>
    </AppLayout>
  );
}

export default Ajuda;
