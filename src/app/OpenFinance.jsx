import { Link } from "react-router-dom";
import { FaBuildingColumns } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import { cartao } from "./componentes/estilos.js";

// Open Finance: ainda não existe. Página simples avisando que vem aí.
function OpenFinance() {
  return (
    <AppLayout semBotaoNovo>
      <h1 className="flex items-center gap-3 font-heading text-2xl font-bold text-slate-900 md:text-4xl">
        Open Finance
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">Breve</span>
      </h1>
      <section className={`${cartao} mt-6 text-center`}>
        <FaBuildingColumns aria-hidden="true" className="mx-auto text-4xl text-primary-light" />
        <h2 className="mt-4 font-heading text-xl font-bold text-slate-900">Em breve: suas contas do banco ligadas automaticamente</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Com o Open Finance, você vai poder conectar as contas e cartões do seu banco ao Famicash, com a sua autorização, e os lançamentos vão chegar sozinhos, sem digitar nada.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">Enquanto isso, lance pelo app ou pelo WhatsApp: é rápido.</p>
        <Link to="/app/ajuda/open-finance" className="mt-6 inline-flex min-h-11 items-center font-bold text-primary underline">
          Saiba mais na Ajuda
        </Link>
      </section>
    </AppLayout>
  );
}

export default OpenFinance;
