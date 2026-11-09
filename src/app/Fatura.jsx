import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaArrowsUpDown, FaClockRotateLeft, FaPlus, FaReceipt } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import CartaoVisual from "./componentes/CartaoVisual.jsx";
import SeloSituacao from "./componentes/SeloSituacao.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import Modal from "./componentes/Modal.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import FormDespesaCartao from "./componentes/FormDespesaCartao.jsx";
import FormLancamento from "./componentes/FormLancamento.jsx";
import { cartao as estiloCartao, botaoIcone, botaoSecundario } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import { QuemLancou } from "./componentes/Avatar.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../lib/dinheiro.js";
import { hoje, nomeDoMes } from "../lib/datas.js";
import { dataCurta, textoParcela } from "../lib/cartoes.js";

// Janela "Pagar fatura": escolhe a conta (já vem a conta ligada ao cartão), a data e o valor
function PagarFatura({ cartao, fatura, onFechar, onPago }) {
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState(cartao.paymentAccount?.id ?? "");
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(paraCampo(fatura.remaining));
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api("/accounts")
      .then((lista) => {
        const comuns = lista.filter((c) => c.type !== "CREDIT_CARD");
        setContas(comuns);
        setContaId((atual) => atual || comuns[0]?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  async function pagar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!contaId) novosErros.accountId = "Escolha a conta.";
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!data) novosErros.date = "Escolha a data.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;
    setSalvando(true);
    try {
      await api(`/cards/${cartao.id}/invoices/${fatura.month}/pay`, enviarJson("POST", { accountId: contaId, date: data, amount: quantia }));
      onPago();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Pagar fatura" onFechar={onFechar}>
      <form onSubmit={pagar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>
        <p className="text-slate-700">
          Fatura de <strong className="first-letter:uppercase">{nomeDoMes(fatura.month)}</strong> do {cartao.name}, vence em {dataCurta(fatura.dueDate)}.
        </p>
        <CampoSelect label="Pagar com a conta" value={contaId} onChange={(e) => setContaId(e.target.value)} erro={erros.accountId}>
          {contas.length === 0 && <option value="">Carregando...</option>}
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({formatarReais(c.currentBalance)})
            </option>
          ))}
        </CampoSelect>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor (R$)" inputMode="numeric" autoComplete="off" value={valor} onChange={(e) => setValor(mascarar(e.target.value))} erro={erros.amount} />
          <Campo label="Data do pagamento" type="date" value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />
        </div>
        <Alerta tipo="info">O valor sai do saldo da conta. Não conta como despesa de novo: as compras já contaram no mês da fatura.</Alerta>
        <BotaoEnviar texto="Confirmar pagamento" carregando={salvando} textoCarregando="Pagando..." className="w-full" />
      </form>
    </Modal>
  );
}

// Uma linha de compra da fatura
function LinhaCompra({ l, mostrarQuem }) {
  const parcela = textoParcela(l);
  return (
    <>
      <IconeCategoria categoria={l.category} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">
          {l.description}
          {parcela && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">{parcela}</span>}
        </span>
        <span className="block truncate text-sm text-slate-500">
          {dataCurta(l.date)} · {l.category?.name ?? "Sem categoria"}
          {mostrarQuem && <QuemLancou pessoa={l.createdBy} />}
        </span>
      </span>
      <span className="shrink-0 font-bold text-slate-900">{formatarReais(l.amount)}</span>
    </>
  );
}

// Fatura de um cartão por mês: compras, total, vencimento e "Pagar fatura"
function Fatura() {
  const { id } = useParams();
  const [busca, setBusca] = useSearchParams();
  const { erroMe, podeEditar, compartilhado } = useMe();
  const [cartao, setCartao] = useState(null);
  const [fatura, setFatura] = useState(null);
  const [erro, setErro] = useState("");
  const [pagando, setPagando] = useState(false);
  const [compra, setCompra] = useState(null); // "nova", "andamento" (parcelado de antes do app) ou purchaseId
  const [pagamento, setPagamento] = useState(null);

  const mes = busca.get("mes") ?? "atual";

  const carregar = useCallback(() => {
    setErro("");
    Promise.all([api(`/cards/${id}`), api(`/cards/${id}/invoices/${mes}`)])
      .then(([c, f]) => {
        setCartao(c);
        setFatura(f);
      })
      .catch((e) => setErro(e.message));
  }, [id, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudarMes = (novo) => setBusca({ mes: novo }, { replace: true });
  const faturaDoMes = fatura && (mes === "atual" || fatura.month === mes) ? fatura : null;
  const classeLinha = "flex w-full items-center gap-3 rounded-2xl px-2 py-3";
  const aPagar = faturaDoMes && Number(faturaDoMes.remaining) > 0;

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>

      <div className="flex items-center gap-2">
        <Link to="/app/cartoes" className={botaoIcone} aria-label="Voltar para cartões">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate font-heading text-3xl font-bold text-slate-900 md:text-4xl">{cartao ? `Fatura ${cartao.name}` : "Fatura"}</h1>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          {cartao && <CartaoVisual cartao={cartao} />}
          {faturaDoMes && <SeletorMes mes={faturaDoMes.month} onMudar={mudarMes} />}

          {/* Resumo da fatura */}
          {faturaDoMes && (
            <section aria-label="Resumo da fatura" className={estiloCartao}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Total da fatura</h2>
                <SeloSituacao situacao={faturaDoMes.status} />
              </div>
              <p className="mt-2 font-heading text-3xl font-bold text-slate-900 [overflow-wrap:anywhere]">{formatarReais(faturaDoMes.total)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Fecha em</dt>
                  <dd className="font-bold text-slate-900">{dataCurta(faturaDoMes.closingDate)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Vence em</dt>
                  <dd className="font-bold text-slate-900">{dataCurta(faturaDoMes.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Pago</dt>
                  <dd className="font-bold text-emerald-700">{formatarReais(faturaDoMes.paid)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Falta pagar</dt>
                  <dd className={`font-bold ${aPagar ? "text-red-600" : "text-slate-900"}`}>{formatarReais(faturaDoMes.remaining)}</dd>
                </div>
              </dl>
              {podeEditar && aPagar && (
                <button
                  type="button"
                  onClick={() => setPagando(true)}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 font-bold text-white transition hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                >
                  Pagar fatura
                </button>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section aria-labelledby="titulo-compras" className={estiloCartao}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="titulo-compras" className="font-heading text-xl font-bold text-slate-900">
                Compras
              </h2>
              {podeEditar && cartao && !cartao.archived && (
                <button type="button" onClick={() => setCompra("nova")} className={botaoSecundario}>
                  <FaPlus aria-hidden="true" />
                  Compra
                </button>
              )}
            </div>
            {!faturaDoMes && !erro && <p role="status" className="mt-4 text-slate-500">Carregando fatura...</p>}
            {faturaDoMes?.purchases.length === 0 && (
              <div className="mt-6 text-center">
                <FaReceipt aria-hidden="true" className="mx-auto text-3xl text-primary-light" />
                <p className="mt-3 text-slate-600">Nenhuma compra nesta fatura.</p>
              </div>
            )}
            <ul className="mt-2 divide-y divide-slate-100">
              {faturaDoMes?.purchases.map((l) => (
                <li key={l.id}>
                  {podeEditar ? (
                    <button
                      type="button"
                      onClick={() => setCompra(l.purchaseId)}
                      aria-label={`Editar compra ${l.description}, ${formatarReais(l.amount)}`}
                      className={`${classeLinha} transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30`}
                    >
                      <LinhaCompra l={l} mostrarQuem={compartilhado} />
                    </button>
                  ) : (
                    <div className={classeLinha}>
                      <LinhaCompra l={l} mostrarQuem={compartilhado} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {podeEditar && cartao && !cartao.archived && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setCompra("andamento")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-primary transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <FaClockRotateLeft aria-hidden="true" />
                  Lançar compra em andamento
                </button>
              </div>
            )}
          </section>

          {faturaDoMes?.payments.length > 0 && (
            <section aria-labelledby="titulo-pagamentos" className={estiloCartao}>
              <h2 id="titulo-pagamentos" className="font-heading text-xl font-bold text-slate-900">
                Pagamentos
              </h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {faturaDoMes.payments.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!podeEditar}
                      onClick={() => setPagamento(p)}
                      className={`${classeLinha} transition enabled:hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30`}
                    >
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-lg text-amber-600">
                        <FaArrowsUpDown />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-bold text-slate-900">Pago com {p.account.name}</span>
                        <span className="block text-sm text-slate-500">{dataCurta(p.date)}</span>
                      </span>
                      <span className="shrink-0 font-bold text-emerald-700">{formatarReais(p.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {pagando && cartao && faturaDoMes && (
        <PagarFatura
          cartao={cartao}
          fatura={faturaDoMes}
          onFechar={() => setPagando(false)}
          onPago={() => {
            setPagando(false);
            carregar();
          }}
        />
      )}
      {compra && (
        <FormDespesaCartao
          purchaseId={compra === "nova" || compra === "andamento" ? null : compra}
          cartaoInicial={id}
          parcelasIniciais={compra === "andamento" ? 2 : 1}
          emAndamentoInicial={compra === "andamento"}
          onFechar={() => setCompra(null)}
          onSalvo={() => {
            setCompra(null);
            carregar();
          }}
        />
      )}
      {pagamento && (
        <FormLancamento
          lancamento={pagamento}
          onFechar={() => setPagamento(null)}
          onSalvo={() => {
            setPagamento(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Fatura;
