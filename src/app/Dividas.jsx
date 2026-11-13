import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaPlus, FaFileInvoiceDollar, FaRoute, FaChevronRight } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import Alternador from "./componentes/Alternador.jsx";
import FormDivida from "./componentes/FormDivida.jsx";
import { ConteudoDivida } from "./componentes/CartaoDivida.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";

// Totais do topo (dívidas ativas)
function Resumo({ totais }) {
  const itens = [
    { rotulo: "Total devido", valor: totais.currentBalance, cor: "text-red-700" },
    { rotulo: "Mínimos por mês", valor: totais.minimumPayments, cor: "text-slate-900" },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 rounded-2xl bg-white px-3 py-3 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:px-5">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{i.rotulo}</dt>
          <dd className={`mt-1 whitespace-nowrap text-sm font-bold sm:text-lg ${i.cor}`}>{formatarReais(i.valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Tela de Dívidas: abas Ativas/Quitadas (e Arquivadas, quando houver), totais e cards com o quanto já foi pago
function Dividas() {
  const { erroMe, podeEditar } = useMe();
  const navigate = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const aba = ["PAID", "ARCHIVED"].includes(busca.get("aba")) ? busca.get("aba") : "ACTIVE";
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    api(`/debts?status=${aba}`)
      .then((r) => setDados({ ...r, aba }))
      .catch((e) => setErro(e.message));
  }, [aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atual = dados?.aba === aba ? dados : null;
  const abas = [
    { valor: "ACTIVE", texto: "Ativas" },
    { valor: "PAID", texto: "Quitadas" },
    ...(dados?.counts.ARCHIVED || aba === "ARCHIVED" ? [{ valor: "ARCHIVED", texto: "Arquivadas" }] : []),
  ];

  return (
    <AppLayout semBotaoNovo>
      <Alerta>{erroMe || erro}</Alerta>

      <div className="flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Dívidas</h1>
        <BotaoAjuda artigo="dividas" assunto="dívidas" />
      </div>

      <Alternador legenda="Situação das dívidas" nome="aba-dividas" esconderLegenda opcoes={abas} valor={aba} onMudar={(v) => setBusca({ aba: v }, { replace: true })} className="mt-4 max-w-md" />

      {atual && aba === "ACTIVE" && atual.debts.length > 0 && (
        <>
          <Resumo totais={atual.totals} />
          <Link
            to="/app/dividas/plano"
            className="mt-4 flex min-h-14 items-center gap-3 rounded-3xl bg-primary px-5 py-3 text-white shadow-[0_12px_30px_-10px_rgba(70,79,163,0.7)] transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <FaRoute aria-hidden="true" className="shrink-0 text-xl" />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Plano de quitação</span>
              <span className="block truncate text-sm text-white/85">Descubra quando você fica livre das dívidas</span>
            </span>
            <FaChevronRight aria-hidden="true" className="shrink-0" />
          </Link>
        </>
      )}

      {!atual && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando dívidas...
        </p>
      )}

      {atual && atual.debts.length === 0 && (
        <section className={`${cartao} mt-6 text-center`}>
          <FaFileInvoiceDollar aria-hidden="true" className="mx-auto text-4xl text-primary" />
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-900">
            {aba === "ACTIVE" ? "Nenhuma dívida ativa" : aba === "PAID" ? "Nenhuma dívida quitada ainda" : "Nenhuma dívida arquivada"}
          </h2>
          {aba === "ACTIVE" && (
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Cadastre cartão, empréstimo, financiamento ou cheque especial com o saldo, os juros e o mínimo. O app monta um plano para você sair das dívidas pagando menos juros.
            </p>
          )}
          {podeEditar && aba === "ACTIVE" && (
            <button
              type="button"
              onClick={() => setForm(true)}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <FaPlus aria-hidden="true" />
              Cadastrar dívida
            </button>
          )}
        </section>
      )}

      {atual && atual.debts.length > 0 && (
        <section aria-label="Lista de dívidas" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
          <ul className="divide-y divide-slate-100">
            {atual.debts.map((d) => (
              <li key={d.id} className="py-1">
                <Link
                  to={`/app/dividas/${d.id}`}
                  aria-label={`${d.name}: ver detalhes`}
                  className="block rounded-2xl px-2 py-2.5 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <ConteudoDivida divida={d} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeEditar && (
        <button
          type="button"
          onClick={() => setForm(true)}
          aria-label="Nova dívida"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-white shadow-[0_12px_30px_-6px_rgba(70,79,163,0.7)] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 lg:bottom-8 lg:right-8"
        >
          <FaPlus aria-hidden="true" />
        </button>
      )}

      {form && (
        <FormDivida
          onFechar={() => setForm(false)}
          onSalvo={(salva) => {
            setForm(false);
            navigate(`/app/dividas/${salva.id}`);
          }}
        />
      )}
    </AppLayout>
  );
}

export default Dividas;
