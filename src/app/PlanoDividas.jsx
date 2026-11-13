import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft, FaCalendarCheck, FaPercent, FaHourglassHalf, FaTriangleExclamation, FaLightbulb } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import Alternador from "./componentes/Alternador.jsx";
import Campo from "../auth/Campo.jsx";
import { cartao } from "./componentes/estilos.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../lib/dinheiro.js";
import { mesCurto } from "../lib/graficos.js";
import { mesAnoCurto, mesPorExtenso, textoMeses, textoTaxa } from "../lib/dividas.js";

const EXPLICACAO = {
  AVALANCHE: "Avalanche: o dinheiro extra vai primeiro para a dívida com os maiores juros. Você paga menos juros no total.",
  SNOWBALL: "Bola de neve: o dinheiro extra vai primeiro para a menor dívida. Você quita uma logo e ganha ânimo para seguir.",
};

// Saldo total devedor mês a mês (no máximo ~24 barras; em planos longos mostramos meses salteados)
function GraficoSaldo({ plano }) {
  const passo = Math.max(1, Math.ceil(plano.schedule.length / 24));
  const pontos = [{ month: null, totalBalance: plano.debts.reduce((s, d) => s + Number(d.currentBalance), 0) }, ...plano.schedule.filter((_, i) => i % passo === passo - 1 || i === plano.schedule.length - 1)];
  const maior = Math.max(1, ...pontos.map((p) => Number(p.totalBalance)));
  const rotular = (i) => pontos.length <= 8 || i % Math.ceil(pontos.length / 6) === 0 || i === pontos.length - 1;
  return (
    <section aria-labelledby="titulo-grafico" className={`${cartao} mt-6`}>
      <h2 id="titulo-grafico" className="font-heading text-lg font-bold text-slate-900">
        Saldo devedor ao longo do plano
      </h2>
      <p className="mt-1 text-sm text-slate-500">Total que falta pagar no fim de cada mês{passo > 1 ? ` (a cada ${passo} meses)` : ""}.</p>
      <ul className="mt-4 flex gap-0.5 sm:gap-1">
        {pontos.map((p, i) => (
          <li key={p.month ?? "hoje"} className="flex min-w-0 flex-1 flex-col items-center">
            <span className="sr-only">
              {p.month ? mesPorExtenso(p.month) : "Hoje"}: {formatarReais(p.totalBalance)}
            </span>
            <div aria-hidden="true" className="flex h-28 w-full items-end justify-center">
              <div className="w-3/4 max-w-6 rounded-t bg-red-500" style={{ height: `${Math.max((Number(p.totalBalance) / maior) * 100, Number(p.totalBalance) > 0 ? 3 : 0)}%` }} />
            </div>
            <span aria-hidden="true" className="mt-1 h-4 whitespace-nowrap text-[11px] capitalize text-slate-500">
              {rotular(i) ? (p.month ? mesCurto(p.month) : "hoje") : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Plano de quitação: orçamento mensal + método → quando fica livre das dívidas, juros e a ordem de quitação
function PlanoDividas() {
  const [orcamento, setOrcamento] = useState("");
  const [metodo, setMetodo] = useState("AVALANCHE");
  const [plano, setPlano] = useState(null);
  const [erro, setErro] = useState("");
  const [erroOrcamento, setErroOrcamento] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [minimos, setMinimos] = useState(null);

  const calcular = useCallback(async (valor, m) => {
    setCarregando(true);
    setErro("");
    setErroOrcamento("");
    try {
      const q = new URLSearchParams({ method: m });
      if (valor) q.set("monthlyBudget", valor);
      const r = await api(`/debts/plan?${q}`);
      setPlano(r);
      if (!valor && r.monthlyBudget && Number(r.monthlyBudget) > 0) setOrcamento(paraCampo(r.monthlyBudget));
    } catch (falha) {
      setPlano(null);
      if (falha.status === 400 && falha.detalhes?.monthlyBudget) setErroOrcamento(falha.detalhes.monthlyBudget[0]);
      else setErro(falha.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Começa com a soma dos mínimos como orçamento
  useEffect(() => {
    let ativo = true;
    api("/debts?status=ACTIVE")
      .then((r) => {
        if (!ativo) return;
        setMinimos(r.totals.minimumPayments);
        const inicial = Number(r.totals.minimumPayments) > 0 ? r.totals.minimumPayments : "";
        if (inicial) setOrcamento(paraCampo(inicial));
        calcular(inicial, "AVALANCHE");
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [calcular]);

  function enviar(e) {
    e.preventDefault();
    const v = paraApi(orcamento);
    if (!v || Number(v) <= 0) {
      setErroOrcamento("Informe quanto você pode pagar por mês nas dívidas.");
      return;
    }
    calcular(v, metodo);
  }

  function trocarMetodo(m) {
    setMetodo(m);
    calcular(paraApi(orcamento), m);
  }

  const comp = plano?.comparison;
  const economia = comp && Number(comp.interestSavedByAvalanche);

  return (
    <AppLayout semBotaoNovo>
      <Link to="/app/dividas" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
        <FaArrowLeft aria-hidden="true" />
        Dívidas
      </Link>
      <div className="mt-1 flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Plano de quitação</h1>
        <BotaoAjuda artigo="dividas" assunto="plano de quitação" />
      </div>

      <Alerta className="mt-2">{erro}</Alerta>

      <form onSubmit={enviar} noValidate className={`${cartao} mt-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <Campo
            label="Quanto você pode pagar por mês nas dívidas (R$)"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={orcamento}
            onChange={(e) => setOrcamento(mascarar(e.target.value))}
            erro={erroOrcamento}
            className="min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={carregando}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-primary px-5 font-bold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            {carregando ? "Calculando..." : "Calcular"}
          </button>
        </div>
        {minimos !== null && Number(minimos) > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            Soma dos mínimos: <span className="whitespace-nowrap">{formatarReais(minimos)}</span>. O que passar disso acelera a quitação.
          </p>
        )}
        <Alternador
          legenda="Método"
          nome="metodo-plano"
          opcoes={[
            { valor: "AVALANCHE", texto: "Avalanche" },
            { valor: "SNOWBALL", texto: "Bola de neve" },
          ]}
          valor={metodo}
          onMudar={trocarMetodo}
          className="mt-4"
        />
        <p className="mt-2 text-sm text-slate-600">{EXPLICACAO[metodo]}</p>
      </form>

      {plano?.empty && (
        <section className={`${cartao} mt-6 text-center`}>
          <p className="text-slate-600">Nenhuma dívida ativa com saldo para planejar.</p>
          <Link to="/app/dividas" className="mt-3 inline-flex min-h-11 items-center rounded-full px-5 font-bold text-primary hover:bg-soft">
            Cadastrar dívidas
          </Link>
        </section>
      )}

      {plano && !plano.empty && (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-3 sm:gap-4">
            {[
              { Icone: FaCalendarCheck, rotulo: "Livre de dívidas", valor: mesPorExtenso(plano.debtFreeMonth), cor: "text-emerald-700" },
              { Icone: FaPercent, rotulo: "Juros totais", valor: formatarReais(plano.totalInterest), cor: "text-red-700" },
              { Icone: FaHourglassHalf, rotulo: "Tempo", valor: textoMeses(plano.months), cor: "text-slate-900" },
            ].map((i) => (
              <div key={i.rotulo} className="min-w-0 rounded-2xl bg-white px-3 py-3 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:px-5">
                <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
                  <i.Icone aria-hidden="true" /> {i.rotulo}
                </dt>
                <dd className={`mt-1 whitespace-nowrap text-sm font-bold sm:text-lg ${i.cor}`}>{i.valor}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-slate-500">
            Total pago: <span className="whitespace-nowrap font-semibold text-slate-700">{formatarReais(plano.totalPaid)}</span> · começando em {mesPorExtenso(plano.startMonth)}.
          </p>

          {comp?.AVALANCHE && comp?.SNOWBALL && (
            <section className="mt-4 flex items-start gap-3 rounded-3xl bg-blue-50 p-4 text-sm text-blue-900">
              <FaLightbulb aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-blue-600" />
              <p>
                {economia > 0 ? (
                  <>
                    <strong>Avalanche economiza <span className="whitespace-nowrap">{formatarReais(economia)}</span></strong> em juros
                    {comp.monthsSavedByAvalanche > 0 ? ` e termina ${textoMeses(comp.monthsSavedByAvalanche)} antes` : ""} em relação à bola de neve.
                  </>
                ) : (
                  <>Os dois métodos dão praticamente o mesmo resultado com as suas dívidas. Escolha o que for mais fácil de seguir.</>
                )}{" "}
                Avalanche: <span className="whitespace-nowrap">{formatarReais(comp.AVALANCHE.totalInterest)}</span> em {textoMeses(comp.AVALANCHE.months)}. Bola de neve:{" "}
                <span className="whitespace-nowrap">{formatarReais(comp.SNOWBALL.totalInterest)}</span> em {textoMeses(comp.SNOWBALL.months)}.
              </p>
            </section>
          )}

          {plano.warnings?.length > 0 && (
            <section className="mt-4 space-y-2 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900">
              {plano.warnings.map((w) => (
                <p key={w} className="flex items-start gap-2">
                  <FaTriangleExclamation aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  {w}
                </p>
              ))}
            </section>
          )}

          <section aria-labelledby="titulo-ordem" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
            <h2 id="titulo-ordem" className="px-2 font-heading text-lg font-bold text-slate-900">
              Ordem de quitação
            </h2>
            <ol className="mt-1 divide-y divide-slate-100">
              {plano.debts.map((d) => (
                <li key={d.id}>
                  <Link to={`/app/dividas/${d.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft font-bold text-primary">
                      {d.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-900">{d.name}</span>
                      <span className="block truncate text-sm text-slate-500">
                        <span className="whitespace-nowrap">{formatarReais(d.currentBalance)}</span> · {textoTaxa(d.interestRateMonthly)} · juros{" "}
                        <span className="whitespace-nowrap">{formatarReais(d.interestPaid)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block whitespace-nowrap text-sm font-bold capitalize text-emerald-700">{mesAnoCurto(d.payoffDate)}</span>
                      <span className="block whitespace-nowrap text-xs text-slate-500">{textoMeses(d.payoffMonth)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          {plano.schedule.length > 0 && <GraficoSaldo plano={plano} />}

          <p className="mt-4 text-xs text-slate-500">
            Simulação com juros compostos todo mês sobre o saldo de hoje e o mesmo orçamento em todos os meses. Taxas, multas e novos gastos mudam o resultado: atualize os saldos de vez em quando.
          </p>
        </>
      )}
    </AppLayout>
  );
}

export default PlanoDividas;
