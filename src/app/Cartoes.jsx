import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaPlus, FaPen, FaCreditCard } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import CartaoVisual from "./componentes/CartaoVisual.jsx";
import FormCartao from "./componentes/FormCartao.jsx";
import { cartao as estiloCartao, botaoIcone } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { nomeDoMes } from "../lib/datas.js";
import { dataCurta } from "../lib/cartoes.js";
import SeloSituacao from "./componentes/SeloSituacao.jsx";

// Um cartão da lista: desenho, limite usado e fatura atual
function ItemCartao({ c, podeEditar, onEditar }) {
  const limite = Number(c.creditLimit ?? 0);
  const usado = Number(c.usedLimit);
  const parte = limite > 0 ? Math.min((usado / limite) * 100, 100) : 0;
  const fatura = c.currentInvoice;

  return (
    <li className={`${estiloCartao} !p-4 sm:!p-5`}>
      <Link to={`/app/cartoes/${c.id}`} className="block rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30" aria-label={`Ver faturas do cartão ${c.name}`}>
        <CartaoVisual cartao={c} />
      </Link>

      {/* Limite usado / disponível */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-slate-600">
            Usado <strong className="text-slate-900">{formatarReais(c.usedLimit)}</strong>
          </span>
          <span className="text-slate-600">
            de <strong className="text-slate-900">{formatarReais(limite)}</strong>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Limite usado"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(parte)}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className={`h-full rounded-full ${parte >= 90 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.max(parte, usado > 0 ? 2 : 0)}%` }} />
        </div>
      </div>

      {/* Faturas */}
      {fatura ? (
        <div className="mt-4 space-y-2">
          {c.closedInvoice && (
            <Link
              to={`/app/cartoes/${c.id}?mes=${c.closedInvoice.month}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-amber-900">Fatura fechada · vence {dataCurta(c.closedInvoice.dueDate)}</span>
                <span className="block text-xs text-amber-800">Falta pagar</span>
              </span>
              <span className="shrink-0 font-bold text-amber-900">{formatarReais(c.closedInvoice.remaining)}</span>
            </Link>
          )}
          <Link
            to={`/app/cartoes/${c.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl bg-soft p-3 transition hover:bg-primary/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                Fatura de {nomeDoMes(fatura.month).split(" ")[0]}
                <SeloSituacao situacao={fatura.status} />
              </span>
              <span className="block text-xs text-slate-600">Vence {dataCurta(fatura.dueDate)}</span>
            </span>
            <span className="shrink-0 font-bold text-slate-900">{formatarReais(fatura.total)}</span>
          </Link>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Cadastre os dias de fechamento e vencimento para ver as faturas.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-slate-500">
          {c.paymentAccount ? (
            <>
              Paga com <strong className="text-slate-700">{c.paymentAccount.name}</strong>
            </>
          ) : (
            "Sem conta de pagamento"
          )}
        </p>
        {podeEditar && (
          <button type="button" onClick={() => onEditar(c)} className={botaoIcone} aria-label={`Editar cartão ${c.name}`}>
            <FaPen aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

// Tela "Cartões de crédito": lista, cadastro, edição e arquivados
function Cartoes() {
  const { erroMe, podeEditar } = useMe();
  const [busca, setBusca] = useSearchParams();
  const [arquivados, setArquivados] = useState(false);
  const [cartoes, setCartoes] = useState(null);
  const [erro, setErro] = useState("");
  // null = fechado; "novo" = criando; objeto = editando
  const [edicao, setEdicao] = useState(busca.get("novo") ? "novo" : null);

  const carregar = useCallback(() => {
    setErro("");
    api(`/cards${arquivados ? "?archived=true" : ""}`)
      .then(setCartoes)
      .catch((e) => setErro(e.message));
  }, [arquivados]);

  useEffect(() => {
    setCartoes(null);
    carregar();
  }, [carregar]);

  function fecharForm() {
    setEdicao(null);
    if (busca.get("novo")) setBusca({}, { replace: true });
  }

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold text-slate-900 md:text-4xl">Cartões de crédito</h1>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEdicao("novo")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white shadow transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <FaPlus aria-hidden="true" />
            Novo cartão
          </button>
        )}
      </div>

      <div role="group" aria-label="Mostrar" className="mt-4 flex gap-2">
        {[
          [false, "Ativos"],
          [true, "Arquivados"],
        ].map(([valor, texto]) => (
          <button
            key={texto}
            type="button"
            aria-pressed={arquivados === valor}
            onClick={() => setArquivados(valor)}
            className={`inline-flex min-h-11 items-center rounded-full px-5 font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
              arquivados === valor ? "bg-primary text-white shadow" : "bg-white text-slate-700 hover:text-primary"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {cartoes === null && !erro && (
        <p role="status" className="mt-8 text-slate-500">
          Carregando cartões...
        </p>
      )}

      {cartoes?.length === 0 && (
        <div className={`mt-6 text-center ${estiloCartao}`}>
          <FaCreditCard aria-hidden="true" className="mx-auto text-4xl text-primary-light" />
          <p className="mt-4 font-heading text-xl font-bold text-slate-900">{arquivados ? "Nenhum cartão arquivado" : "Nenhum cartão ainda"}</p>
          {!arquivados && (
            <p className="mt-2 text-slate-600">
              {podeEditar ? "Cadastre seu cartão para acompanhar o limite e as faturas." : "Quando alguém da família cadastrar, aparece aqui."}
            </p>
          )}
        </div>
      )}

      <ul className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cartoes?.map((c) => (
          <ItemCartao key={c.id} c={c} podeEditar={podeEditar} onEditar={setEdicao} />
        ))}
      </ul>

      {edicao && (
        <FormCartao
          cartao={edicao === "novo" ? null : edicao}
          onFechar={fecharForm}
          onSalvo={() => {
            fecharForm();
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Cartoes;
