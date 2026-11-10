import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaPlus } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import FormAjusteSaldo from "./componentes/FormAjusteSaldo.jsx";
import FormConta from "./componentes/FormConta.jsx";
import { LinhaConta, Saldo } from "./componentes/ListaContas.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";

// Lista de contas (carteira, banco e investimentos) com saldo atual. Cartões ficam em "Cartões de crédito".
function Contas() {
  const { erroMe, podeEditar } = useMe();
  const [contas, setContas] = useState(null);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState(null);
  const [ajuste, setAjuste] = useState(null);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(() => {
    api("/accounts")
      .then((lista) => setContas(lista.filter((c) => c.type !== "CREDIT_CARD")))
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Contas com "Ignorar nos totais" ficam fora das somas
  const soma = (lista) => lista.filter((c) => !c.ignoreInTotals).reduce((t, c) => t + Number(c.currentBalance), 0);
  const total = soma(contas ?? []);
  const investimentos = (contas ?? []).filter((c) => c.type === "INVESTMENT");
  const grupos = [
    { titulo: "Contas", lista: (contas ?? []).filter((c) => c.type !== "INVESTMENT") },
    { titulo: "Investimentos", lista: investimentos },
  ].filter((g) => g.lista.length);

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>
      <Alerta tipo="sucesso" className="mb-4">
        {aviso}
      </Alerta>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Contas</h1>
          <BotaoAjuda artigo="contas" assunto="contas" />
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEdicao("nova")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white shadow transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <FaPlus aria-hidden="true" />
            Nova conta
          </button>
        )}
      </div>
      <p className="mt-2 text-slate-600">
        Saldo somado: <Saldo valor={total.toFixed(2)} />
        {investimentos.length > 0 && (
          <span className="block text-sm sm:ml-3 sm:inline">
            Investimentos: <Saldo valor={soma(investimentos).toFixed(2)} />
          </span>
        )}
      </p>

      <section aria-label="Lista de contas" className={`mt-6 ${cartao}`}>
        {contas === null && !erro && <p role="status" className="text-slate-500">Carregando contas...</p>}
        {grupos.map((g) => (
          <div key={g.titulo} className="mb-4 last:mb-0">
            {grupos.length > 1 && <h2 className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.titulo}</h2>}
        <ul className="divide-y divide-slate-100">
          {g.lista.map((c) => (
            <li key={c.id}>
              {podeEditar ? (
                <button
                  type="button"
                  onClick={() => setEdicao(c)}
                  aria-label={`Editar conta ${c.name}, saldo ${formatarReais(c.currentBalance)}`}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <LinhaConta conta={c} />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-3">
                  <LinhaConta conta={c} />
                </div>
              )}
            </li>
          ))}
        </ul>
          </div>
        ))}
      </section>

      <p className="mt-4 px-2 text-sm text-slate-600">
        Cartões de crédito ficam em{" "}
        <Link to="/app/cartoes" className="font-bold text-primary underline-offset-4 hover:underline">
          Cartões de crédito
        </Link>
        .
      </p>
      {edicao && (
        <FormConta
          conta={edicao === "nova" ? null : edicao}
          onFechar={() => setEdicao(null)}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
          onAjustar={(c) => {
            setEdicao(null);
            setAviso("");
            setAjuste(c);
          }}
        />
      )}
      {ajuste && (
        <FormAjusteSaldo
          conta={ajuste}
          onFechar={() => setAjuste(null)}
          onSalvo={() => {
            setAviso(`Saldo de ${ajuste.name} ajustado. O ajuste aparece em Lançamentos como “Ajuste de saldo”.`);
            setAjuste(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Contas;
