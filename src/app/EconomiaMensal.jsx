import { useEffect, useState } from "react";
import { FaPiggyBank, FaArrowTrendUp, FaArrowTrendDown, FaScaleBalanced } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import Interruptor from "./componentes/Interruptor.jsx";
import { BarrasComSinal } from "./componentes/GraficoBarras.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { mesAtual, nomeDoMes } from "../lib/datas.js";
import { percentual } from "../lib/graficos.js";

const corDoValor = (v) => (Number(v) < 0 ? "text-red-600" : "text-emerald-700");

function Destaque({ titulo, Icone, valor, detalhe }) {
  return (
    <div className="min-w-0 rounded-2xl bg-soft p-3">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Icone aria-hidden="true" />
        {titulo}
      </dt>
      <dd className={`mt-1 whitespace-nowrap font-heading text-base font-bold sm:text-lg ${valor === null ? "text-slate-400" : corDoValor(valor)}`}>
        {valor === null ? "–" : formatarReais(valor)}
      </dd>
      {detalhe && <dd className="truncate text-xs text-slate-500 first-letter:uppercase">{detalhe}</dd>}
    </div>
  );
}

// Economia mensal: receitas − despesas de cada mês, % da receita, média, melhor e pior mês
function EconomiaMensal() {
  const { erroMe } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [pendentes, setPendentes] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro("");
    api(`/savings?month=${mes}&months=12&includePending=${pendentes}`)
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [mes, pendentes]);

  const atual = dados?.months.at(-1);
  const linhas = [...(dados?.months ?? [])].reverse();

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>
      <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Economia mensal</h1>

      <div className={`${cartao} mt-4 space-y-4`}>
        <SeletorMes mes={mes} onMudar={setMes} className="mx-auto max-w-sm bg-soft" />
        <Interruptor texto="Incluir pendentes" descricao={pendentes ? "Efetivados e pendentes" : "Só efetivados"} ligado={pendentes} onMudar={setPendentes} />

        {!dados && !erro && (
          <p role="status" className="text-slate-500">
            Carregando...
          </p>
        )}
        {atual && (
          <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-light p-4 text-white sm:p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-100">
              <FaPiggyBank aria-hidden="true" />
              Economia em <span className="normal-case">{nomeDoMes(mes)}</span>
            </p>
            <p className="mt-2 whitespace-nowrap font-heading text-xl font-bold md:text-2xl">{formatarReais(atual.savings)}</p>
            <p className="mt-1 text-sm text-white/85">
              {atual.percent === null ? "Sem receitas no mês" : `${percentual(atual.percent)} da receita`} ·{" "}
              <span className="whitespace-nowrap">receitas {formatarReais(atual.income)}</span> ·{" "}
              <span className="whitespace-nowrap">despesas {formatarReais(atual.expense)}</span>
            </p>
          </div>
        )}
      </div>

      {dados && (
        <>
          <section aria-labelledby="titulo-grafico-economia" className={`${cartao} mt-6`}>
            <h2 id="titulo-grafico-economia" className="font-heading text-xl font-bold text-slate-900">
              Últimos 12 meses
            </h2>
            <BarrasComSinal
              meses={dados.months.map((m) => ({ month: m.month, valor: Number(m.savings) }))}
              destaque={mes}
              media={Number(dados.average)}
              legenda="Economia por mês"
            />
            <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Destaque titulo="Média" Icone={FaScaleBalanced} valor={dados.average} detalhe={dados.averagePercent === null ? "" : `${percentual(dados.averagePercent)} da receita`} />
              <Destaque titulo="Total" Icone={FaPiggyBank} valor={dados.total} detalhe="meses com lançamentos" />
              <Destaque titulo="Melhor mês" Icone={FaArrowTrendUp} valor={dados.best?.savings ?? null} detalhe={dados.best ? nomeDoMes(dados.best.month) : ""} />
              <Destaque titulo="Pior mês" Icone={FaArrowTrendDown} valor={dados.worst?.savings ?? null} detalhe={dados.worst ? nomeDoMes(dados.worst.month) : ""} />
            </dl>
          </section>

          <section aria-labelledby="titulo-meses-economia" className={`${cartao} mt-6`}>
            <h2 id="titulo-meses-economia" className="font-heading text-xl font-bold text-slate-900">
              Mês a mês
            </h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {linhas.map((m) => (
                <li key={m.month} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800 first-letter:uppercase">{nomeDoMes(m.month)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {m.hasData ? (
                        <>
                          <span className="whitespace-nowrap">+ {formatarReais(m.income)}</span> · <span className="whitespace-nowrap">− {formatarReais(m.expense)}</span>
                        </>
                      ) : (
                        "Sem lançamentos"
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block whitespace-nowrap font-bold ${m.hasData ? corDoValor(m.savings) : "text-slate-400"}`}>{formatarReais(m.savings)}</span>
                    <span className="block text-xs text-slate-500">{percentual(m.percent)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Economia = receitas − despesas do mês. Transferências, pagamentos de fatura, ajustes de saldo, contas com “Ignorar nos totais” e lançamentos com
        “Ignorar em Economia mensal” ficam de fora. Compras no cartão contam no mês da fatura.
      </p>
    </AppLayout>
  );
}

export default EconomiaMensal;
