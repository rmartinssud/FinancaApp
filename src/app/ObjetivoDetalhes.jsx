import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaPen,
  FaCircleCheck,
  FaBoxArchive,
  FaTrashCan,
  FaArrowDown,
  FaArrowUp,
  FaRotateLeft,
  FaRightLeft,
  FaTrophy,
} from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import FormObjetivo from "./componentes/FormObjetivo.jsx";
import FormMovimentoObjetivo from "./componentes/FormMovimentoObjetivo.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import { BarraObjetivo, SeloObjetivo } from "./componentes/CartaoObjetivo.jsx";
import { cartao, botaoIcone } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, formatarReais } from "../lib/api.js";
import { nomeDoMes } from "../lib/datas.js";
import { mesCurto } from "../lib/graficos.js";
import { dataBr } from "../lib/orcamentos.js";
import { NOMES_SITUACAO, textoPercentualObjetivo } from "../lib/objetivos.js";

const botaoAcao =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50";
const botaoCancelar =
  "inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";
const botaoPerigo =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70";

// Barras do guardado no fim de cada mês (até 12 meses). A linha tracejada é a meta.
function Grafico({ historico, objetivo }) {
  const meta = Number(objetivo.targetAmount);
  const maior = Math.max(meta, 1, ...historico.map((h) => Number(h.saved)));
  const altura = (v) => `${Math.max((Math.max(Number(v), 0) / maior) * 100, Number(v) > 0 ? 3 : 0)}%`;
  const muitos = historico.length > 6;
  return (
    <section aria-labelledby="titulo-evolucao" className={`${cartao} mt-6`}>
      <h2 id="titulo-evolucao" className="font-heading text-lg font-bold text-slate-900">
        Evolução do guardado
      </h2>
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: objetivo.color }} /> Guardado no fim do mês
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-slate-400" /> Meta
        </span>
      </div>
      <div className="relative mt-3">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-300" style={{ bottom: `calc(${(meta / maior) * 7}rem + 1.25rem)` }} />
        <ul className="flex gap-1 sm:gap-2">
          {historico.map((h, i) => (
            <li key={h.month} className="flex min-w-0 flex-1 flex-col items-center">
              <span className="sr-only">
                {nomeDoMes(h.month)}: {formatarReais(h.saved)}
              </span>
              <div aria-hidden="true" className="flex h-28 w-full items-end justify-center">
                <div className="w-2/3 max-w-6 rounded-t" style={{ height: altura(h.saved), backgroundColor: objetivo.color }} />
              </div>
              <span aria-hidden="true" className="mt-1 h-4 text-[11px] capitalize text-slate-500">
                {!muitos || i % 2 === (historico.length - 1) % 2 ? mesCurto(h.month) : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Detalhes de um objetivo: progresso, ações, evolução e histórico de depósitos e retiradas
function ObjetivoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { erroMe, podeEditar } = useMe();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [janela, setJanela] = useState(null); // { tipo, entrada? }
  const [ocupado, setOcupado] = useState(false);
  const [apagarTransferencia, setApagarTransferencia] = useState(true);

  const carregar = useCallback(() => {
    setErro("");
    api(`/goals/${id}`)
      .then(setDados)
      .catch((e) => setErro(e.status === 404 ? "Objetivo não encontrado." : e.message));
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const g = dados?.goal.id === id ? dados.goal : null;
  const p = g?.progress;
  const ativo = g?.status === "ACTIVE";
  const voltar = `/app/objetivos${g && !ativo ? `?aba=${g.status}` : ""}`;
  const fechar = () => setJanela(null);

  async function mudarSituacao(status) {
    setOcupado(true);
    setAviso("");
    try {
      await api(`/goals/${id}/status`, enviarJson("POST", { status }));
      setJanela(null);
      if (status === "COMPLETED") setAviso("Objetivo concluído. Parabéns!");
      carregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    setOcupado(true);
    try {
      await api(`/goals/${id}`, { method: "DELETE" });
      navigate("/app/objetivos", { replace: true });
    } catch (falha) {
      setErro(falha.message);
      setOcupado(false);
      setJanela(null);
    }
  }

  async function apagarEntrada(entrada) {
    setOcupado(true);
    try {
      const manter = entrada.transfer && !apagarTransferencia ? "?keepTransfer=true" : "";
      await api(`/goals/${id}/entries/${entrada.id}${manter}`, { method: "DELETE" });
      setJanela(null);
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
        Objetivos
      </Link>

      <Alerta className="mt-2">{erroMe || erro}</Alerta>
      <Alerta tipo="sucesso" className="mt-2">
        {aviso}
      </Alerta>
      {!g && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando...
        </p>
      )}

      {g && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <IconeCategoria categoria={g} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-2xl font-bold text-slate-900 md:text-4xl">{g.name}</h1>
              <p className="truncate text-sm text-slate-500">
                {NOMES_SITUACAO[g.status]}
                {g.targetDate && ` · até ${dataBr(g.targetDate)}`}
                {g.account && ` · ${g.account.name}`}
              </p>
            </div>
          </div>
          {g.description && <p className="mt-3 text-slate-700">{g.description}</p>}

          {/* Chegou à meta: sugere concluir (não conclui sozinho) */}
          {ativo && p.reached && podeEditar && (
            <section className="mt-4 flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-900">
              <FaTrophy aria-hidden="true" className="shrink-0 text-2xl text-emerald-600" />
              <p className="min-w-0 flex-1 text-sm">
                <strong className="block">Você atingiu a meta!</strong>
                Marque como concluído para guardar na aba Concluídos.
              </p>
              <button
                type="button"
                onClick={() => mudarSituacao("COMPLETED")}
                disabled={ocupado}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
              >
                Concluir
              </button>
            </section>
          )}

          {/* Progresso */}
          <section aria-label="Progresso" className={`${cartao} mt-4`}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-slate-600">
                <span className="block whitespace-nowrap font-heading text-2xl font-bold text-slate-900 sm:text-3xl">{formatarReais(p.saved)}</span>
                <span className="whitespace-nowrap text-sm">de {formatarReais(g.targetAmount)}</span>
              </p>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="whitespace-nowrap text-lg font-bold" style={{ color: p.reached ? "#047857" : g.color }}>
                  {textoPercentualObjetivo(p)}
                </span>
                <SeloObjetivo objetivo={g} />
              </div>
            </div>
            <div className="mt-3">
              <BarraObjetivo objetivo={g} altura="h-3" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
              {[
                ["Falta", p.remaining],
                ...(p.perMonth !== null && !p.reached ? [[p.overdue ? "Para hoje" : "Por mês", p.perMonth]] : []),
                ["Depósitos", p.deposits],
                ["Retiradas", p.withdrawals],
              ].map(([r, v]) => (
                <div key={r} className="min-w-0">
                  <dt className="text-slate-500">{r}</dt>
                  <dd className="whitespace-nowrap font-bold text-slate-900">{formatarReais(v)}</dd>
                </div>
              ))}
            </dl>
            {p.monthsLeft > 0 && !p.reached && (
              <p className="mt-3 text-sm text-slate-600">
                {p.monthsLeft === 1 ? "Último mês" : `${p.monthsLeft} meses`} até {dataBr(g.targetDate)}, contando este.
              </p>
            )}
            {p.overdue && <p className="mt-3 text-sm font-medium text-red-700">A data alvo já passou. Mude a data em Editar ou deposite o que falta.</p>}
            {p.onTrack !== null && !p.reached && (
              <p className={`mt-1 text-sm ${p.onTrack ? "text-emerald-700" : "text-amber-800"}`}>
                Esperado até hoje: <span className="whitespace-nowrap font-bold">{formatarReais(p.expected)}</span>.{" "}
                {p.onTrack ? "Você está no ritmo." : <>Faltam <span className="whitespace-nowrap">{formatarReais(Number(p.expected) - Number(p.saved))}</span> para alcançar o ritmo.</>}
              </p>
            )}
            {Number(g.initialAmount) > 0 && <p className="mt-1 text-xs text-slate-500">Inclui {formatarReais(g.initialAmount)} já guardados ao criar.</p>}
          </section>

          {/* Ações */}
          {podeEditar && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ativo && (
                <>
                  <button type="button" className={`${botaoAcao} !border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700`} onClick={() => setJanela({ tipo: "DEPOSIT" })}>
                    <FaArrowDown aria-hidden="true" /> Depositar
                  </button>
                  <button type="button" className={botaoAcao} disabled={Number(p.saved) <= 0} onClick={() => setJanela({ tipo: "WITHDRAWAL" })}>
                    <FaArrowUp aria-hidden="true" /> Retirar
                  </button>
                </>
              )}
              <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "editar" })}>
                <FaPen aria-hidden="true" /> Editar
              </button>
              {ativo && (
                <button type="button" className={botaoAcao} disabled={ocupado} onClick={() => setJanela({ tipo: "concluir" })}>
                  <FaCircleCheck aria-hidden="true" /> Concluir
                </button>
              )}
              {g.status !== "ARCHIVED" && (
                <button type="button" className={botaoAcao} disabled={ocupado} onClick={() => setJanela({ tipo: "arquivar" })}>
                  <FaBoxArchive aria-hidden="true" /> Arquivar
                </button>
              )}
              {!ativo && (
                <button type="button" className={botaoAcao} disabled={ocupado} onClick={() => mudarSituacao("ACTIVE")}>
                  <FaRotateLeft aria-hidden="true" /> Reativar
                </button>
              )}
              <button type="button" className={`${botaoAcao} !text-red-700`} onClick={() => setJanela({ tipo: "excluir" })}>
                <FaTrashCan aria-hidden="true" /> Excluir
              </button>
            </div>
          )}

          {dados.history.length > 0 && <Grafico historico={dados.history} objetivo={g} />}

          {/* Histórico */}
          <section aria-labelledby="titulo-historico" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
            <h2 id="titulo-historico" className="px-2 font-heading text-lg font-bold text-slate-900">
              Depósitos e retiradas
            </h2>
            {dados.entries.length === 0 && <p className="px-2 py-3 text-slate-500">Nenhuma movimentação ainda.</p>}
            <ul className="divide-y divide-slate-100">
              {dados.entries.map((e) => {
                const deposito = e.kind === "DEPOSIT";
                return (
                  <li key={e.id} className="flex items-center gap-3 px-2 py-2.5">
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${deposito ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {deposito ? <FaArrowDown /> : <FaArrowUp />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-900">{e.notes || (deposito ? "Depósito" : "Retirada")}</span>
                      <span className="block truncate text-sm text-slate-500">
                        {dataBr(e.date)}
                        {e.transfer && (
                          <>
                            {" · "}
                            <FaRightLeft aria-hidden="true" className="inline" /> {e.transfer.from.name} → {e.transfer.to?.name}
                            {e.transfer.status === "PENDING" && " (pendente)"}
                          </>
                        )}
                      </span>
                    </span>
                    <span className={`shrink-0 whitespace-nowrap font-bold ${deposito ? "text-emerald-700" : "text-amber-700"}`}>
                      {deposito ? "+" : "−"} {formatarReais(e.amount)}
                    </span>
                    {podeEditar && (
                      <button
                        type="button"
                        className={`${botaoIcone} !text-slate-500`}
                        aria-label={`Editar ${deposito ? "depósito" : "retirada"} de ${formatarReais(e.amount)} em ${dataBr(e.date)}`}
                        onClick={() => setJanela({ tipo: "editarEntrada", entrada: e })}
                      >
                        <FaPen aria-hidden="true" />
                      </button>
                    )}
                    {podeEditar && (
                      <button
                        type="button"
                        className={`${botaoIcone} !text-slate-500`}
                        aria-label={`Apagar ${deposito ? "depósito" : "retirada"} de ${formatarReais(e.amount)} em ${dataBr(e.date)}`}
                        onClick={() => {
                          setApagarTransferencia(true);
                          setJanela({ tipo: "apagarEntrada", entrada: e });
                        }}
                      >
                        <FaTrashCan aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {g && (janela?.tipo === "DEPOSIT" || janela?.tipo === "WITHDRAWAL") && (
        <FormMovimentoObjetivo
          objetivo={g}
          tipo={janela.tipo}
          onFechar={fechar}
          onSalvo={() => {
            setJanela(null);
            setAviso("");
            carregar();
          }}
        />
      )}
      {g && janela?.tipo === "editarEntrada" && (
        <FormMovimentoObjetivo
          objetivo={g}
          entrada={janela.entrada}
          onFechar={fechar}
          onSalvo={() => {
            setJanela(null);
            setAviso("");
            carregar();
          }}
        />
      )}
      {g && janela?.tipo === "editar" && (
        <FormObjetivo
          objetivo={g}
          onFechar={fechar}
          onSalvo={() => {
            setJanela(null);
            carregar();
          }}
        />
      )}
      {g && janela?.tipo === "concluir" && (
        <Modal titulo="Concluir objetivo?" onFechar={fechar}>
          <p className="text-slate-700">
            {p.reached ? "Você atingiu a meta." : `Ainda faltam ${formatarReais(p.remaining)} para a meta.`} O objetivo vai para a aba Concluídos e sai do Início. Dá para reativar depois.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={() => mudarSituacao("COMPLETED")} disabled={ocupado} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 font-bold text-white hover:bg-emerald-700 disabled:opacity-70">
              <FaCircleCheck aria-hidden="true" /> Concluir
            </button>
          </div>
        </Modal>
      )}
      {g && janela?.tipo === "arquivar" && (
        <Modal titulo="Arquivar objetivo?" onFechar={fechar}>
          <p className="text-slate-700">O objetivo sai das listas e do Início, mas o histórico fica guardado na aba Arquivados. Dá para reativar depois.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={() => mudarSituacao("ARCHIVED")} disabled={ocupado} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white hover:bg-primary-dark disabled:opacity-70">
              <FaBoxArchive aria-hidden="true" /> Arquivar
            </button>
          </div>
        </Modal>
      )}
      {g && janela?.tipo === "excluir" && (
        <Modal titulo="Excluir objetivo?" onFechar={fechar}>
          <p className="text-slate-700">
            O objetivo e todo o histórico de depósitos e retiradas serão apagados. As transferências entre contas feitas junto continuam em Lançamentos. Para guardar o histórico, use “Arquivar”.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={excluir} disabled={ocupado} className={botaoPerigo}>
              <FaTrashCan aria-hidden="true" />
              {ocupado ? "Excluindo..." : "Sim, excluir"}
            </button>
          </div>
        </Modal>
      )}
      {janela?.tipo === "apagarEntrada" && (
        <Modal titulo={janela.entrada.kind === "DEPOSIT" ? "Apagar depósito?" : "Apagar retirada?"} onFechar={fechar}>
          <p className="text-slate-700">
            <span className="whitespace-nowrap font-bold">{formatarReais(janela.entrada.amount)}</span> em {dataBr(janela.entrada.date)} sai do histórico do objetivo.
          </p>
          {janela.entrada.transfer && (
            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={apagarTransferencia} onChange={(e) => setApagarTransferencia(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
              <span className="text-slate-800">
                Apagar também a transferência ({janela.entrada.transfer.from.name} → {janela.entrada.transfer.to?.name}) em Lançamentos. Os saldos das contas voltam ao que eram.
              </span>
            </label>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={() => apagarEntrada(janela.entrada)} disabled={ocupado} className={botaoPerigo}>
              <FaTrashCan aria-hidden="true" />
              {ocupado ? "Apagando..." : "Sim, apagar"}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

export default ObjetivoDetalhes;
