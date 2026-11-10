import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaCreditCard, FaArrowsUpDown, FaScaleBalanced, FaCircleCheck, FaTriangleExclamation, FaLayerGroup } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import SeloSituacao from "./componentes/SeloSituacao.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import AbrirLancamento from "./componentes/AbrirLancamento.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, formatarReais } from "../lib/api.js";
import { mesAtual, nomeDoDia, hoje, diasDoMes } from "../lib/datas.js";
import { COR_PADRAO, textoParcela } from "../lib/cartoes.js";
import { nomeCategoria } from "../lib/categorias.js";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANA_LONGA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Valor bem curto para caber no quadradinho do dia: 350 → "350", 1250 → "1,3k"
function curto(v) {
  const n = Math.abs(Number(v));
  if (n >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 10000 ? 0 : 1 })}k`;
  return Math.round(n).toLocaleString("pt-BR");
}

// Um quadradinho do mês
function Dia({ dia, info, escolhido, ehHoje, onEscolher }) {
  const numero = Number(dia.slice(8, 10));
  const temReceita = info && Number(info.income) > 0;
  const temDespesa = info && Number(info.expense) > 0;
  const partes = [
    nomeDoDia(dia),
    temReceita && `receitas ${formatarReais(info.income)}`,
    temDespesa && `despesas ${formatarReais(info.expense)}`,
    info?.pending > 0 && `${info.pending} pendente${info.pending > 1 ? "s" : ""}`,
    info?.overdue > 0 && `${info.overdue} vencido${info.overdue > 1 ? "s" : ""}`,
    Number(info?.invoices) > 0 && "vencimento de fatura",
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => onEscolher(dia)}
      aria-pressed={escolhido}
      aria-label={partes.join(", ")}
      className={`relative flex min-h-[3.75rem] w-full min-w-0 flex-col items-stretch rounded-xl border p-0.5 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
        escolhido ? "border-primary bg-soft" : info?.overdue ? "border-red-300 bg-red-50" : "border-slate-100 bg-white hover:bg-soft"
      }`}
    >
      <span className="flex items-center justify-between">
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${ehHoje ? "bg-primary text-white" : "text-slate-700"}`}
        >
          {numero}
        </span>
        <span className="flex items-center gap-0.5 pr-0.5">
          {Number(info?.invoices) > 0 && <FaCreditCard aria-hidden="true" className="text-[9px] text-primary" />}
          {info?.overdue > 0 ? (
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-600" />
          ) : (
            info?.pending > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </span>
      </span>
      <span aria-hidden="true" className="mt-auto block text-right text-[10px] font-bold leading-tight">
        {temReceita && <span className="block truncate text-emerald-700">+{curto(info.income)}</span>}
        {temDespesa && <span className="block truncate text-red-600">−{curto(info.expense)}</span>}
      </span>
    </button>
  );
}

// Uma linha da lista do dia
function LinhaLancamento({ l, podeEditar, onAbrir, onEfetivar, efetivando }) {
  const receita = l.type === "INCOME";
  const transferencia = l.type === "TRANSFER";
  const parcela = textoParcela(l);
  const pendente = l.status === "PENDING";
  const Icone = l.isAdjustment ? FaScaleBalanced : transferencia ? FaArrowsUpDown : null;
  const cor = l.isAdjustment ? "text-slate-600" : transferencia ? "text-amber-700" : receita ? "text-emerald-700" : "text-red-600";
  return (
    <li className={`flex items-center gap-2 py-2 ${l.overdue ? "rounded-xl bg-red-50 px-1" : ""}`}>
      <button
        type="button"
        onClick={() => onAbrir(l)}
        aria-label={`${podeEditar ? "Editar" : "Ver"} ${l.description}, ${formatarReais(l.amount)}${pendente ? ", pendente" : ""}${l.overdue ? ", vencido" : ""}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        {Icone ? (
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${l.isAdjustment ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-600"}`}>
            <Icone />
          </span>
        ) : l.splits?.length ? (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <FaLayerGroup />
          </span>
        ) : (
          <IconeCategoria categoria={l.category} tamanho="h-9 w-9 text-sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">
            {l.isAdjustment ? "Ajuste de saldo" : l.description}
            {parcela && <span className="ml-1 text-xs font-medium text-slate-500">{parcela}</span>}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {transferencia ? `${l.account.name} → ${l.toAccount?.name ?? ""}` : `${l.splits?.length ? "Multicategorias" : nomeCategoria(l.category)} · ${l.account.name}`}
            {l.overdue ? <strong className="text-red-600"> · vencido</strong> : pendente && " · pendente"}
          </span>
        </span>
        <span className={`shrink-0 whitespace-nowrap text-sm font-bold ${cor}`}>
          {!transferencia && !l.isAdjustment && (receita ? "+ " : "− ")}
          {formatarReais(l.amount)}
        </span>
      </button>
      {pendente && podeEditar && (
        <button
          type="button"
          onClick={() => onEfetivar(l)}
          disabled={efetivando}
          aria-label={`Efetivar ${l.description}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-emerald-600/40 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30 disabled:opacity-50"
        >
          <FaCircleCheck aria-hidden="true" />
          {efetivando ? "..." : "Efetivar"}
        </button>
      )}
    </li>
  );
}

// Calendário: o mês em grade; tocar no dia mostra os lançamentos dele
function Calendario() {
  const { erroMe, podeEditar } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [diaEscolhido, setDiaEscolhido] = useState(hoje);
  const [aberto, setAberto] = useState(null);
  const [efetivando, setEfetivando] = useState(null);

  const carregar = useCallback(() => {
    setErro("");
    return api(`/calendar?month=${mes}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [mes]);

  useEffect(() => {
    setDados(null);
    carregar();
  }, [carregar]);

  // Ao trocar de mês, escolhe hoje (se estiver no mês) ou o dia 1
  useEffect(() => {
    setDiaEscolhido((atual) => (atual.startsWith(mes) ? atual : hoje().startsWith(mes) ? hoje() : `${mes}-01`));
  }, [mes]);

  const porDia = useMemo(() => new Map((dados?.days ?? []).map((d) => [d.date, d])), [dados]);
  const dias = diasDoMes(mes);
  const vazios = new Date(`${mes}-01T12:00:00Z`).getUTCDay();
  const doDia = (dados?.transactions ?? []).filter((t) => t.day === diaEscolhido);
  const faturasDoDia = (dados?.invoices ?? []).filter((f) => f.day === diaEscolhido);
  const infoDia = porDia.get(diaEscolhido);

  async function efetivar(l) {
    setEfetivando(l.id);
    setErro("");
    try {
      await api(`/transactions/${l.id}`, enviarJson("PATCH", { status: "CONFIRMED" }));
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEfetivando(null);
    }
  }

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>
      <div className="flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Calendário</h1>
        <BotaoAjuda artigo="calendario" assunto="calendário" />
      </div>

      <div className={`${cartao} mt-4 !p-3 sm:!p-6`}>
        <SeletorMes mes={mes} onMudar={setMes} className="mx-auto max-w-sm bg-soft" />

        {dados && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Receitas</dt>
              <dd className="whitespace-nowrap text-sm font-bold text-emerald-700">{formatarReais(dados.totals.income)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Despesas</dt>
              <dd className="whitespace-nowrap text-sm font-bold text-red-600">{formatarReais(dados.totals.expense)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo</dt>
              <dd className={`whitespace-nowrap text-sm font-bold ${Number(dados.totals.balance) < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatarReais(dados.totals.balance)}</dd>
            </div>
          </dl>
        )}
        {dados?.totals.overdueBefore > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            <FaTriangleExclamation aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              {dados.totals.overdueBefore === 1 ? "Há 1 pendente vencido" : `Há ${dados.totals.overdueBefore} pendentes vencidos`} de meses anteriores. Volte os meses para
              ver e efetivar.
            </span>
          </p>
        )}

        <div className="mt-3 grid grid-cols-7 gap-1">
          {SEMANA.map((d, i) => (
            <span key={`${d}-${i}`} aria-hidden="true" title={SEMANA_LONGA[i]} className="text-center text-xs font-bold text-slate-500">
              {d}
            </span>
          ))}
          {Array.from({ length: vazios }, (_, i) => (
            <span key={`vazio-${i}`} aria-hidden="true" />
          ))}
          {dias.map((dia) => (
            <Dia key={dia} dia={dia} info={porDia.get(dia)} escolhido={dia === diaEscolhido} ehHoje={dia === hoje()} onEscolher={setDiaEscolhido} />
          ))}
        </div>
        {!dados && !erro && (
          <p role="status" className="mt-3 text-sm text-slate-500">
            Carregando...
          </p>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" /> pendente
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" /> vencido
          </span>
          <span className="inline-flex items-center gap-1">
            <FaCreditCard aria-hidden="true" className="text-primary" /> fatura vence
          </span>
          <span>valores em reais (k = mil)</span>
        </p>
      </div>

      <section aria-labelledby="titulo-dia" className={`${cartao} mt-4`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="titulo-dia" className="min-w-0 truncate font-heading text-lg font-bold text-slate-900 first-letter:uppercase">
            {nomeDoDia(diaEscolhido)}
          </h2>
          {infoDia && (
            <p className="shrink-0 text-right text-xs">
              {Number(infoDia.income) > 0 && <span className="block whitespace-nowrap font-bold text-emerald-700">+ {formatarReais(infoDia.income)}</span>}
              {Number(infoDia.expense) > 0 && <span className="block whitespace-nowrap font-bold text-red-600">− {formatarReais(infoDia.expense)}</span>}
            </p>
          )}
        </div>

        {dados && doDia.length === 0 && faturasDoDia.length === 0 && <p className="mt-2 text-sm text-slate-500">Nada neste dia.</p>}

        <ul className="mt-2 divide-y divide-slate-100">
          {faturasDoDia.map((f) => (
            <li key={f.cardId} className={`py-1 ${f.overdue ? "rounded-xl bg-red-50 px-1" : ""}`}>
              <Link
                to={`/app/cartoes/${f.cardId}?mes=${f.month}`}
                aria-label={`Abrir fatura do ${f.cardName}, ${formatarReais(f.total)}`}
                className="flex items-center gap-3 rounded-xl px-1 py-1.5 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: f.color ?? COR_PADRAO }}>
                  <FaCreditCard />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">Fatura {f.cardName}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Vencimento da fatura</span>
                    <SeloSituacao situacao={f.status} />
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-sm font-bold text-red-600">− {formatarReais(f.total)}</span>
              </Link>
            </li>
          ))}
          {doDia.map((l) => (
            <LinhaLancamento key={l.id} l={l} podeEditar={podeEditar} onAbrir={setAberto} onEfetivar={efetivar} efetivando={efetivando === l.id} />
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-slate-500">
        Os totais do dia somam receitas e despesas, efetivadas e pendentes. As compras no cartão aparecem juntas, na fatura, no dia do vencimento. Transferências e
        ajustes de saldo aparecem na lista, mas não entram nos totais.
      </p>

      {aberto && (
        <AbrirLancamento
          lancamento={aberto}
          podeEditar={podeEditar}
          onFechar={() => setAberto(null)}
          onSalvo={() => {
            setAberto(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Calendario;
