import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrashCan, FaMoneyBillWave, FaRoute, FaTrophy, FaReceipt } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import FormDivida from "./componentes/FormDivida.jsx";
import FormPagamentoDivida from "./componentes/FormPagamentoDivida.jsx";
import { BarraDivida, IconeDivida, SeloDivida } from "./componentes/CartaoDivida.jsx";
import { cartao, botaoIcone } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { dataBr } from "../lib/orcamentos.js";
import { textoTaxa, tipoDivida } from "../lib/dividas.js";

const botaoAcao =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50";
const botaoCancelar =
  "inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Detalhes de uma dívida: saldo, quanto já foi pago, dados do contrato e histórico de pagamentos
function DividaDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { erroMe, podeEditar } = useMe();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [janela, setJanela] = useState(null); // { tipo, pagamento? }
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    api(`/debts/${id}`)
      .then(setDados)
      .catch((e) => setErro(e.status === 404 ? "Dívida não encontrada." : e.message));
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const d = dados?.debt.id === id ? dados.debt : null;
  const ativa = d?.status === "ACTIVE";
  const voltar = `/app/dividas${d && !ativa ? `?aba=${d.status}` : ""}`;
  const fechar = () => setJanela(null);

  async function desfazerPagamento(p) {
    setOcupado(true);
    try {
      await api(`/debts/${id}/payments/${p.id}`, { method: "DELETE" });
      setJanela(null);
      setAviso("");
      carregar();
    } catch (falha) {
      setErro(falha.message);
      setJanela(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <AppLayout semBotaoNovo>
      <Link to={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
        <FaArrowLeft aria-hidden="true" />
        Dívidas
      </Link>

      <Alerta className="mt-2">{erroMe || erro}</Alerta>
      <Alerta tipo="sucesso" className="mt-2">
        {aviso}
      </Alerta>
      {!d && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando...
        </p>
      )}

      {d && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <IconeDivida tipo={d.type} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-2xl font-bold text-slate-900 md:text-4xl">{d.name}</h1>
              <p className="truncate text-sm text-slate-500">
                {tipoDivida(d.type).nome}
                {d.creditor && ` · ${d.creditor}`}
              </p>
            </div>
            <BotaoAjuda artigo="dividas" assunto="dívidas" />
          </div>

          {d.status === "PAID" && (
            <section className="mt-4 flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-900">
              <FaTrophy aria-hidden="true" className="shrink-0 text-2xl text-emerald-600" />
              <p className="min-w-0 flex-1 text-sm">
                <strong className="block">Dívida quitada!</strong>
                {d.paidAt ? `Saldo zerado em ${new Date(d.paidAt).toLocaleDateString("pt-BR")}.` : "O saldo devedor chegou a zero."}
              </p>
            </section>
          )}

          <section aria-label="Saldo devedor" className={`${cartao} mt-4`}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-slate-600">
                <span className="block text-sm">Saldo devedor</span>
                <span className="block whitespace-nowrap font-heading text-2xl font-bold text-slate-900 sm:text-3xl">{formatarReais(d.currentBalance)}</span>
              </p>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="whitespace-nowrap text-lg font-bold text-emerald-700">{Number(d.percentPaid).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% pago</span>
                <SeloDivida status={d.status} />
              </div>
            </div>
            <div className="mt-3">
              <BarraDivida divida={d} altura="h-3" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
              {[
                ["Já pago", formatarReais(d.paidAmount)],
                ["Saldo de referência", formatarReais(d.originalBalance)],
                ["Juros", textoTaxa(d.interestRateMonthly)],
                ["Mínimo por mês", formatarReais(d.minimumPayment)],
                ...(d.dueDay ? [["Vencimento", `Dia ${d.dueDay}`]] : []),
                ...(d.account ? [["Conta relacionada", d.account.name]] : []),
              ].map(([r, v]) => (
                <div key={r} className="min-w-0">
                  <dt className="text-slate-500">{r}</dt>
                  <dd className="truncate whitespace-nowrap font-bold text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {d.notes && <p className="mt-3 text-sm text-slate-700">{d.notes}</p>}
          </section>

          {podeEditar && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ativa && (
                <button type="button" className={`${botaoAcao} !border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700`} onClick={() => setJanela({ tipo: "pagar" })}>
                  <FaMoneyBillWave aria-hidden="true" /> Registrar pagamento
                </button>
              )}
              <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "editar" })}>
                <FaPen aria-hidden="true" /> Editar
              </button>
            </div>
          )}
          {ativa && (
            <Link to="/app/dividas/plano" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
              <FaRoute aria-hidden="true" /> Ver no plano de quitação
            </Link>
          )}

          <section aria-labelledby="titulo-pagamentos" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
            <h2 id="titulo-pagamentos" className="px-2 font-heading text-lg font-bold text-slate-900">
              Pagamentos
            </h2>
            {dados.payments.length === 0 && <p className="px-2 py-3 text-slate-500">Nenhum pagamento registrado ainda.</p>}
            <ul className="divide-y divide-slate-100">
              {dados.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <FaReceipt />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-slate-900">{p.notes || "Pagamento"}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {dataBr(p.date)} · {p.account.name}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-bold text-emerald-700">{formatarReais(p.amount)}</span>
                  {podeEditar && (
                    <button
                      type="button"
                      className={`${botaoIcone} !text-slate-500`}
                      aria-label={`Desfazer pagamento de ${formatarReais(p.amount)} em ${dataBr(p.date)}`}
                      onClick={() => setJanela({ tipo: "desfazer", pagamento: p })}
                    >
                      <FaTrashCan aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {dados.payments.length > 0 && <p className="px-2 pt-2 text-xs text-slate-500">Cada pagamento é uma despesa em Lançamentos. Editar o valor lá muda o saldo devedor aqui.</p>}
          </section>
        </>
      )}

      {d && janela?.tipo === "pagar" && (
        <FormPagamentoDivida
          divida={d}
          onFechar={fechar}
          onSalvo={(r) => {
            setJanela(null);
            setAviso(r.paidOff ? "Parabéns! Esta dívida foi quitada." : "Pagamento registrado e lançado como despesa.");
            carregar();
          }}
        />
      )}
      {d && janela?.tipo === "editar" && (
        <FormDivida
          divida={d}
          temPagamentos={dados.payments.length > 0}
          onFechar={fechar}
          onSalvo={() => {
            setJanela(null);
            carregar();
          }}
          onSituacao={() => {
            setJanela(null);
            carregar();
          }}
          onApagada={() => navigate("/app/dividas", { replace: true })}
        />
      )}
      {janela?.tipo === "desfazer" && (
        <Modal titulo="Desfazer pagamento?" onFechar={fechar}>
          <p className="text-slate-700">
            O pagamento de <span className="whitespace-nowrap font-bold">{formatarReais(janela.pagamento.amount)}</span> em {dataBr(janela.pagamento.date)} sai do histórico, a despesa em Lançamentos é apagada e o
            saldo devedor volta a subir.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => desfazerPagamento(janela.pagamento)}
              disabled={ocupado}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
            >
              <FaTrashCan aria-hidden="true" />
              {ocupado ? "Desfazendo..." : "Sim, desfazer"}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

export default DividaDetalhes;
