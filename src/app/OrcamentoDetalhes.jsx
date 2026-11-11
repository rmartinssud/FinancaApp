import { useCallback, useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaPen,
  FaBullseye,
  FaRightLeft,
  FaCopy,
  FaBoxArchive,
  FaBoxOpen,
  FaTrashCan,
  FaLightbulb,
  FaCreditCard,
} from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import Modal from "./componentes/Modal.jsx";
import FormOrcamento from "./componentes/FormOrcamento.jsx";
import DesarquivarOrcamento from "./componentes/DesarquivarOrcamento.jsx";
import FormLancamento from "./componentes/FormLancamento.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import { BarraOrcamento, ConteudoOrcamento, IconeOrcamento, SeloOrcamento } from "./componentes/CartaoOrcamento.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import Campo from "../auth/Campo.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../lib/dinheiro.js";
import { dataLocal, mesAtual, nomeDoMes, somarMes } from "../lib/datas.js";
import { corDaBarra, dataBr, textoPercentual, textoSaldo, NOMES_META } from "../lib/orcamentos.js";

const formatoMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const mesCurto = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return formatoMesCurto.format(new Date(Date.UTC(a, m - 1, 15))).replace(".", "");
};

const botaoAcao =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";
const botaoPrincipal =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60";
const botaoCancelar =
  "inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Campo de dinheiro simples (R$ com máscara)
function CampoValor({ label, valor, onMudar, erro }) {
  return <Campo label={label} inputMode="numeric" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => onMudar(mascarar(e.target.value))} erro={erro} />;
}

// Alterar meta: só neste mês ou deste mês em diante
function AlterarMeta({ orcamento, mes, inicial, onFechar, onSalvo }) {
  const nome = useId();
  const [valor, setValor] = useState(paraCampo(inicial ?? orcamento.fixedGoal ?? ""));
  const [escopo, setEscopo] = useState(inicial ? "forward" : "month");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    if (!paraApi(valor)) return setErros({ amount: "Informe o valor da meta." });
    setSalvando(true);
    try {
      await api(`/budgets/${orcamento.id}/goal`, enviarJson("POST", { amount: paraApi(valor), month: mes, scope: escopo }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Alterar meta" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <CampoValor label="Nova meta (R$)" valor={valor} onMudar={setValor} erro={erros.amount} />
        <fieldset>
          <legend className="mb-2 font-medium text-slate-800">Vale para</legend>
          {[
            { v: "month", t: `Só em ${nomeDoMes(mes)}` },
            { v: "forward", t: `De ${nomeDoMes(mes)} em diante` },
          ].map((o) => (
            <label key={o.v} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="radio" name={nome} checked={escopo === o.v} onChange={() => setEscopo(o.v)} className="h-5 w-5 accent-primary" />
              <span className="text-slate-800">{o.t}</span>
            </label>
          ))}
          <p className="mt-1 text-sm text-slate-500">Os meses anteriores continuam com a meta que tinham.</p>
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={botaoPrincipal}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Transferir saldo deste orçamento para outro (só no mês)
function TransferirSaldo({ orcamento, mes, onFechar, onSalvo }) {
  const [opcoes, setOpcoes] = useState(null);
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const disponivel = Math.max(Number(orcamento.progress.balance), 0);

  useEffect(() => {
    api(`/budgets?month=${mes}&kind=EXPENSE`)
      .then((r) => setOpcoes(r.budgets.filter((b) => !b.isGroup && b.period === "MONTHLY" && b.id !== orcamento.id)))
      .catch((e) => setErro(e.message));
  }, [mes, orcamento.id]);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!destino) novos.toId = "Escolha o orçamento que vai receber.";
    if (!paraApi(valor)) novos.amount = "Informe o valor.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    setSalvando(true);
    try {
      await api("/budgets/transfer", enviarJson("POST", { fromId: orcamento.id, toId: destino, month: mes, amount: paraApi(valor) }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Transferir saldo" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <p className="text-sm text-slate-600">
          Passa parte da meta de <strong>{orcamento.name}</strong> para outro orçamento, só em {nomeDoMes(mes)}. Disponível:{" "}
          <strong className="whitespace-nowrap">{formatarReais(disponivel)}</strong>.
        </p>
        {opcoes && opcoes.length === 0 && <p className="text-sm text-slate-500">Não há outro orçamento mensal de despesa neste mês.</p>}
        <CampoSelect label="Para" value={destino} onChange={(e) => setDestino(e.target.value)} erro={erros.toId}>
          <option value="">Escolha...</option>
          {(opcoes ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} (saldo {formatarReais(b.progress.balance)})
            </option>
          ))}
        </CampoSelect>
        <CampoValor label="Valor (R$)" valor={valor} onMudar={setValor} erro={erros.amount} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || disponivel <= 0} className={botaoPrincipal}>
            {salvando ? "Transferindo..." : "Transferir"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Arquivar a partir de um mês (os anteriores continuam no histórico)
function Arquivar({ orcamento, mes, onFechar, onSalvo }) {
  const minimo = somarMes(orcamento.startMonth, 1);
  const [aPartir, setAPartir] = useState(mes > orcamento.startMonth ? mes : minimo);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api(`/budgets/${orcamento.id}/archive`, enviarJson("POST", { fromMonth: aPartir }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Arquivar orçamento" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <p className="text-sm text-slate-600">O orçamento some a partir do mês escolhido. Os meses anteriores continuam como estão.</p>
        <Campo label="Arquivar a partir de" type="month" min={minimo} value={aPartir} onChange={(e) => setAPartir(e.target.value)} erro={erros.fromMonth} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !aPartir} className={botaoPrincipal}>
            {salvando ? "Arquivando..." : "Arquivar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Barras dos últimos 6 meses: meta (clara) × usado (cor do orçamento)
function Grafico({ historico, orcamento }) {
  const maior = Math.max(1, ...historico.flatMap((h) => [Number(h.goal ?? 0), Number(h.used ?? 0)]));
  const altura = (v) => `${Math.max((Number(v ?? 0) / maior) * 100, v && Number(v) > 0 ? 3 : 0)}%`;
  return (
    <section aria-labelledby="titulo-grafico" className={`${cartao} mt-6`}>
      <h2 id="titulo-grafico" className="font-heading text-lg font-bold text-slate-900">
        Últimos 6 meses
      </h2>
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-slate-200" /> Meta
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: orcamento.color }} /> {orcamento.kind === "INCOME" ? "Recebido" : "Usado"}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-6 gap-1 sm:gap-3">
        {historico.map((h) => {
          const estourou = orcamento.kind === "EXPENSE" && h.active && Number(h.used) > Number(h.goal);
          return (
            <li key={h.month} className="flex min-w-0 flex-col items-center">
              <span className="sr-only">
                {nomeDoMes(h.month)}: {h.active ? `meta ${formatarReais(h.goal)}, usado ${formatarReais(h.used)}` : "orçamento não valia"}
              </span>
              <div aria-hidden="true" className="flex h-28 w-full items-end justify-center gap-0.5">
                <div className="w-1/3 max-w-4 rounded-t bg-slate-200" style={{ height: altura(h.goal) }} />
                <div className="w-1/3 max-w-4 rounded-t" style={{ height: altura(h.used), backgroundColor: estourou ? "#dc2626" : orcamento.color }} />
              </div>
              <span aria-hidden="true" className="mt-1 text-xs capitalize text-slate-500">
                {mesCurto(h.month)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Detalhes de um orçamento: progresso, ações, meta recomendada, gráfico e lançamentos que contaram
function OrcamentoDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { erroMe, podeEditar } = useMe();
  const [busca, setBusca] = useSearchParams();
  const mes = busca.get("mes") ?? mesAtual();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(null); // { tipo, valor? }
  const [lancamento, setLancamento] = useState(null);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    api(`/budgets/${id}?month=${mes}`)
      .then(setDados)
      .catch((e) => setErro(e.status === 404 ? "Orçamento não encontrado." : e.message));
  }, [id, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atual = dados?.month === mes && dados?.budget.id === id ? dados : null;
  const b = atual?.budget;
  const p = b?.progress;
  const mensal = b?.period === "MONTHLY";
  // Mensal: vale da vigência até antes do mês arquivado. Personalizado: o período todo.
  const valeNoMes =
    Boolean(b) && (!mensal || (b.startMonth <= mes && !b.pausedMonths?.includes(mes) && (!b.archivedFromMonth || mes < b.archivedFromMonth)));
  const metaFixaMensal = b && mensal && !b.isGroup && b.goalType === "FIXED";
  const podeTransferir = b && mensal && !b.isGroup && b.kind === "EXPENSE";
  const voltar = busca.get("de") === "arquivados" ? "/app/orcamentos/arquivados" : `/app/orcamentos?mes=${mes}&aba=${b?.kind ?? "EXPENSE"}`;
  const fechar = () => setJanela(null);
  const salvou = () => {
    setJanela(null);
    carregar();
  };

  async function excluir() {
    setApagando(true);
    try {
      await api(`/budgets/${id}`, { method: "DELETE" });
      navigate(voltar, { replace: true });
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
      setJanela(null);
    }
  }

  function abrirLancamento(l) {
    // Compra no cartão: abre a fatura do mês dela
    if (l.isCardExpense) navigate(`/app/cartoes/${l.account.id}?mes=${l.invoiceMonth}`);
    else if (podeEditar) setLancamento(l);
  }

  const saldo = b ? textoSaldo(b) : null;
  const receita = b?.kind === "INCOME";

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Link to={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
        <FaArrowLeft aria-hidden="true" />
        Orçamentos
      </Link>

      <Alerta className="mt-2">{erroMe || erro}</Alerta>
      {!atual && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando...
        </p>
      )}

      {b && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <IconeOrcamento orcamento={b} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-2xl font-bold text-slate-900 md:text-4xl">{b.name}</h1>
              <p className="truncate text-sm text-slate-500">
                {b.isGroup ? "Agrupado" : receita ? "Receita" : "Despesa"} ·{" "}
                {mensal ? `Mensal desde ${nomeDoMes(b.startMonth)}` : `${dataBr(b.startDate)} a ${dataBr(b.endDate)}`}
                {b.archivedFromMonth && ` · arquivado a partir de ${nomeDoMes(b.archivedFromMonth)}`}
              </p>
            </div>
          </div>

          {mensal && <SeletorMes mes={mes} onMudar={(m) => setBusca({ mes: m, ...(busca.get("de") ? { de: busca.get("de") } : {}) }, { replace: true })} className="mt-4 max-w-sm" />}

          {/* Progresso */}
          <section aria-label="Progresso" className={`${cartao} mt-4`}>
            {valeNoMes ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-slate-600">
                    <span className="block whitespace-nowrap font-heading text-2xl font-bold text-slate-900 sm:text-3xl">{formatarReais(p.used)}</span>
                    <span className="whitespace-nowrap text-sm">de {formatarReais(p.goal)}</span>
                    {b.goalType !== "FIXED" && !b.isGroup && <span className="block text-xs text-slate-500">{Number(b.percent).toLocaleString("pt-BR")}{NOMES_META[b.goalType].slice(1)}</span>}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-lg font-bold" style={{ color: corDaBarra(b) }}>
                      {textoPercentual(p)}
                    </span>
                    <SeloOrcamento status={p.status} />
                  </div>
                </div>
                <div className="mt-3">
                  <BarraOrcamento orcamento={b} altura="h-3" />
                </div>
                <p className={`mt-2 whitespace-nowrap font-medium ${saldo.cor}`}>{saldo.texto}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
                  {[
                    ["Meta", p.goal],
                    [receita ? "Recebido" : "Efetivado", p.confirmed],
                    ["Pendente", p.pending],
                    ["Saldo", p.balance],
                  ].map(([r, v]) => (
                    <div key={r} className="min-w-0">
                      <dt className="text-slate-500">{r}</dt>
                      <dd className={`whitespace-nowrap font-bold ${r === "Saldo" && Number(v) < 0 && !receita ? "text-red-600" : "text-slate-900"}`}>{formatarReais(v)}</dd>
                    </div>
                  ))}
                </dl>
                {!b.isGroup && !b.includePending && Number(p.pending) > 0 && <p className="mt-2 text-xs text-slate-500">Previsto desligado: os pendentes não entram no usado.</p>}
                {b.alertPercent !== null && !receita && <p className="mt-2 text-xs text-slate-500">Alerta ao chegar a {b.alertPercent}% da meta.</p>}
              </>
            ) : (
              <p className="text-slate-500">Este orçamento não vale em {nomeDoMes(mes)}.</p>
            )}
          </section>

          {/* Ações */}
          {podeEditar && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "editar" })}>
                <FaPen aria-hidden="true" /> Editar
              </button>
              {metaFixaMensal && valeNoMes && (
                <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "meta" })}>
                  <FaBullseye aria-hidden="true" /> Alterar meta
                </button>
              )}
              {podeTransferir && valeNoMes && (
                <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "transferir" })}>
                  <FaRightLeft aria-hidden="true" /> Transferir saldo
                </button>
              )}
              <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "copiar" })}>
                <FaCopy aria-hidden="true" /> Copiar
              </button>
              {mensal && !b.archivedFromMonth && (
                <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "arquivar" })}>
                  <FaBoxArchive aria-hidden="true" /> Arquivar
                </button>
              )}
              {mensal && b.archivedFromMonth && (
                <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "desarquivar" })}>
                  <FaBoxOpen aria-hidden="true" /> Desarquivar
                </button>
              )}
              <button type="button" className={`${botaoAcao} !text-red-700`} onClick={() => setJanela({ tipo: "excluir" })}>
                <FaTrashCan aria-hidden="true" /> Excluir
              </button>
            </div>
          )}

          {/* Meta recomendada */}
          {atual.recommended && metaFixaMensal && (
            <section className="mt-4 flex items-center gap-3 rounded-3xl bg-amber-50 p-4 text-amber-900">
              <FaLightbulb aria-hidden="true" className="shrink-0 text-xl text-amber-600" />
              <p className="min-w-0 flex-1 text-sm">
                <strong className="block">Meta recomendada: <span className="whitespace-nowrap">{formatarReais(atual.recommended.amount)}</span></strong>
                Média de <span className="whitespace-nowrap">{formatarReais(atual.recommended.average)}</span> nos últimos 3 meses.
              </p>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => setJanela({ tipo: "meta", valor: atual.recommended.amount })}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-amber-600 px-4 font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                >
                  Usar
                </button>
              )}
            </section>
          )}

          {/* Componentes do agrupado */}
          {b.isGroup && (
            <section aria-labelledby="titulo-componentes" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
              <h2 id="titulo-componentes" className="px-2 font-heading text-lg font-bold text-slate-900">
                Orçamentos do agrupado
              </h2>
              <ul className="divide-y divide-slate-100">
                {b.components.map((c) => (
                  <li key={c.id}>
                    <Link to={`/app/orcamentos/${c.id}?mes=${mes}`} className="block rounded-2xl px-2 py-2.5 hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
                      <ConteudoOrcamento orcamento={c} compacto />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {atual.history && <Grafico historico={atual.history} orcamento={b} />}

          {/* Lançamentos que contaram */}
          <section aria-labelledby="titulo-lancamentos" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
            <h2 id="titulo-lancamentos" className="px-2 font-heading text-lg font-bold text-slate-900">
              Lançamentos que contaram
            </h2>
            {atual.transactions.length === 0 && <p className="px-2 py-3 text-slate-500">Nenhum lançamento {mensal ? "neste mês" : "no período"}.</p>}
            <ul className="divide-y divide-slate-100">
              {atual.transactions.map((l) => {
                const clicavel = l.isCardExpense || podeEditar;
                const Elemento = clicavel ? "button" : "div";
                return (
                  <li key={l.id}>
                    <Elemento
                      {...(clicavel ? { type: "button", onClick: () => abrirLancamento(l) } : {})}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                    >
                      <IconeCategoria categoria={l.category} tamanho="h-10 w-10 text-base" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-slate-900">{l.description}</span>
                        <span className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
                          {l.isCardExpense && <FaCreditCard aria-hidden="true" className="shrink-0" />}
                          <span className="truncate">
                            {dataBr(dataLocal(l.date))} · {l.account.name}
                            {l.isCardExpense && ` · fatura ${mesCurto(l.invoiceMonth)}`}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block whitespace-nowrap font-bold ${receita ? "text-emerald-700" : "text-red-600"}`}>{formatarReais(l.budgetAmount ?? l.amount)}</span>
                        {l.partial && <span className="block whitespace-nowrap text-xs text-slate-500">parte de {formatarReais(l.amount)}</span>}
                        {l.status === "PENDING" && <span className="block text-xs font-bold text-amber-700">pendente</span>}
                      </span>
                    </Elemento>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {janela?.tipo === "editar" && <FormOrcamento orcamento={b} mes={mes} onFechar={fechar} onSalvo={salvou} />}
      {janela?.tipo === "copiar" && (
        <FormOrcamento
          modelo={b}
          mes={mes}
          onFechar={fechar}
          onSalvo={(novo) => {
            setJanela(null);
            navigate(`/app/orcamentos/${novo.id}?mes=${novo.period === "CUSTOM" ? novo.startDate.slice(0, 7) : mes}`);
          }}
        />
      )}
      {janela?.tipo === "meta" && <AlterarMeta orcamento={b} mes={mes} inicial={janela.valor} onFechar={fechar} onSalvo={salvou} />}
      {janela?.tipo === "transferir" && <TransferirSaldo orcamento={b} mes={mes} onFechar={fechar} onSalvo={salvou} />}
      {janela?.tipo === "arquivar" && <Arquivar orcamento={b} mes={mes} onFechar={fechar} onSalvo={() => navigate(voltar, { replace: true })} />}
      {janela?.tipo === "desarquivar" && (
        <DesarquivarOrcamento
          orcamento={b}
          onFechar={fechar}
          onSalvo={(r, aPartir) => {
            setJanela(null);
            setBusca({ mes: aPartir }, { replace: true }); // desarquivado: volta para a lista normal
            carregar();
          }}
        />
      )}
      {janela?.tipo === "excluir" && (
        <Modal titulo="Excluir orçamento?" onFechar={fechar}>
          <p className="text-slate-700">
            O orçamento e todo o histórico de metas dele serão apagados. Os lançamentos não mudam. Para manter os meses passados, use “Arquivar”.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={excluir}
              disabled={apagando}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
            >
              <FaTrashCan aria-hidden="true" />
              {apagando ? "Excluindo..." : "Sim, excluir"}
            </button>
          </div>
        </Modal>
      )}
      {lancamento && (
        <FormLancamento
          lancamento={lancamento}
          onFechar={() => setLancamento(null)}
          onSalvo={() => {
            setLancamento(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default OrcamentoDetalhes;
