import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowTrendUp, FaArrowTrendDown, FaScaleBalanced, FaShieldHalved } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import { LinhaConta, Saldo } from "./componentes/ListaContas.jsx";
import { ConteudoOrcamento } from "./componentes/CartaoOrcamento.jsx";
import { ConteudoObjetivo } from "./componentes/CartaoObjetivo.jsx";
import { ConteudoDivida } from "./componentes/CartaoDivida.jsx";
import DespesasPorCategoria from "./componentes/DespesasPorCategoria.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { Destaque } from "../components/SectionTitle.jsx";
import { api, formatarReais } from "../lib/api.js";
import { mesAtual } from "../lib/datas.js";

// Cartão pequeno com um total do mês (Receitas, Despesas ou Saldo)
function CartaoTotal({ titulo, valor, Icone, cor, destaque = false }) {
  return (
    <section
      className={
        destaque
          ? "min-w-0 rounded-3xl bg-gradient-to-br from-primary to-primary-light p-4 text-white sm:p-5 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.35)]"
          : "min-w-0 rounded-3xl bg-white p-4 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:p-5"
      }
    >
      <div className="flex items-center gap-2">
        <Icone aria-hidden="true" className={destaque ? "text-sky-200" : cor} />
        <h2 className={`text-xs font-bold uppercase tracking-wider sm:text-sm sm:tracking-widest ${destaque ? "text-sky-100" : "text-slate-500"}`}>{titulo}</h2>
      </div>
      <p className={`mt-2 whitespace-nowrap font-heading font-bold ${destaque ? "text-xl md:text-2xl" : `text-base sm:text-2xl ${cor}`}`}>{valor === undefined ? "..." : formatarReais(valor)}</p>
    </section>
  );
}

// Rodapé de "Suas contas": total e, se houver, quanto está em investimentos (calculados pela API:
// contas com "Ignorar nos totais" ficam de fora; as escondidas do Resumo continuam somando)
function TotaisContas({ totais, temInvestimentos }) {
  return (
    <dl className="mt-2 space-y-1 border-t border-slate-100 pt-3 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-slate-600">Total</dt>
        <dd>
          <Saldo valor={totais.total} />
        </dd>
      </div>
      {temInvestimentos && (
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Investimentos</dt>
          <dd>
            <Saldo valor={totais.investments} />
          </dd>
        </div>
      )}
    </dl>
  );
}

// Painel do mês: totais, despesas por categoria e saldo das contas
function Inicio() {
  const { me, erroMe, podeEditar } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [resumo, setResumo] = useState(null);
  const [orcamentos, setOrcamentos] = useState(null);
  const [objetivos, setObjetivos] = useState(null);
  const [dividas, setDividas] = useState(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    setErro("");
    api(`/summary?month=${mes}`)
      .then(setResumo)
      .catch((e) => setErro(e.message));
    // Orçamentos marcados "Exibir no Início" (até 4); sem nenhum, o cartão não aparece
    api(`/budgets?month=${mes}&home=true`)
      .then(setOrcamentos)
      .catch(() => setOrcamentos(null));
    // Objetivos ativos marcados "Exibir no Início" (até 3); sem nenhum, o cartão não aparece
    api("/goals?home=true")
      .then(setObjetivos)
      .catch(() => setObjetivos(null));
    // Dívidas ativas marcadas "Exibir no Início" (até 3); sem nenhuma, o cartão não aparece
    api("/debts?home=true")
      .then(setDividas)
      .catch(() => setDividas(null));
  }, [mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const primeiroNome = me?.user.name.split(" ")[0];
  const totais = resumo?.month === mes ? resumo.totals : undefined;
  const saldoNegativo = Number(totais?.balance) < 0;

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>

      <section aria-labelledby="saudacao">
        <h1 id="saudacao" className="font-heading text-2xl font-bold text-slate-900 md:text-5xl">
          Olá, <Destaque>{primeiroNome ?? "..."}</Destaque>
        </h1>
        <p className="mt-2 text-slate-600">{me ? me.household.name : "Resumo das finanças da sua família."}</p>
      </section>

      <SeletorMes mes={mes} onMudar={setMes} className="mt-6 max-w-sm" />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6">
        <CartaoTotal titulo="Receitas" valor={totais?.income} Icone={FaArrowTrendUp} cor="text-emerald-700" />
        <CartaoTotal titulo="Despesas" valor={totais?.expense} Icone={FaArrowTrendDown} cor="text-red-600" />
        <div className="col-span-2 sm:col-span-1">
          <CartaoTotal titulo="Saldo do mês" valor={totais?.balance} Icone={FaScaleBalanced} destaque />
          {saldoNegativo && <p className="mt-2 px-2 text-sm text-red-700">Você gastou mais do que recebeu neste mês.</p>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Despesas por categoria: gráfico de rosca (ou a lista de antes), com orçamento e evolução de cada categoria */}
        <DespesasPorCategoria resumo={resumo} mes={mes} userId={me?.user.id} podeEditar={podeEditar} onAlterado={carregar} />

        {/* Saldo atual de cada conta */}
        <section aria-labelledby="titulo-contas" className={cartao}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-contas" className="font-heading text-xl font-bold text-slate-900">
              Suas contas
            </h2>
            <Link to="/app/contas" className="inline-flex min-h-11 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
              Ver todas
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {resumo?.accounts
              .filter((conta) => conta.type !== "CREDIT_CARD" && conta.showOnSummary !== false)
              .map((conta) => (
              <li key={conta.id} className="flex items-center gap-3 py-3">
                <LinhaConta conta={conta} />
              </li>
            ))}
          </ul>
          {/* Patrimônio: soma das contas (investimentos inclusive), menos as marcadas "Ignorar nos totais" */}
          {resumo?.accountsTotals && (
            <TotaisContas totais={resumo.accountsTotals} temInvestimentos={resumo.accounts.some((c) => c.type === "INVESTMENT" && !c.ignoreInTotals)} />
          )}
        </section>
      </div>

      {/* Orçamentos do mês (os marcados "Exibir no Início") */}
      {orcamentos?.month === mes && orcamentos.budgets.length > 0 && (
        <section aria-labelledby="titulo-orcamentos" className={`${cartao} mt-6`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-orcamentos" className="font-heading text-xl font-bold text-slate-900">
              Orçamentos do mês
            </h2>
            <Link
              to={`/app/orcamentos?mes=${mes}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              Ver todos
            </Link>
          </div>
          <ul className="mt-2 grid gap-x-6 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
            {orcamentos.budgets.map((b) => (
              <li key={b.id}>
                <Link
                  to={`/app/orcamentos/${b.id}?mes=${mes}`}
                  aria-label={`${b.name}: ver detalhes`}
                  className="block rounded-2xl py-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 lg:px-2"
                >
                  <ConteudoOrcamento orcamento={b} compacto />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Objetivos ativos (os marcados "Exibir no Início", até 3) */}
      {objetivos?.goals.length > 0 && (
        <section aria-labelledby="titulo-objetivos" className={`${cartao} mt-6`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-objetivos" className="font-heading text-xl font-bold text-slate-900">
              Objetivos
            </h2>
            <Link
              to="/app/objetivos"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              {objetivos.total > objetivos.goals.length ? `Ver todos (${objetivos.total})` : "Ver todos"}
            </Link>
          </div>
          <ul className="mt-2 grid gap-x-6 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-y-0">
            {objetivos.goals.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/app/objetivos/${g.id}`}
                  aria-label={`${g.name}: ver detalhes`}
                  className="block rounded-2xl py-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 lg:px-2"
                >
                  <ConteudoObjetivo objetivo={g} compacto />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Dívidas ativas (as marcadas "Exibir no Início", até 3) */}
      {dividas?.debts.length > 0 && (
        <section aria-labelledby="titulo-dividas" className={`${cartao} mt-6`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="titulo-dividas" className="font-heading text-xl font-bold text-slate-900">
                Dívidas
              </h2>
              <p className="text-sm text-slate-600">
                Você deve <strong className="whitespace-nowrap text-slate-900">{formatarReais(dividas.totals.currentBalance)}</strong>
              </p>
            </div>
            <Link
              to="/app/dividas"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              {dividas.total > dividas.debts.length ? `Ver todas (${dividas.total})` : "Ver todas"}
            </Link>
          </div>
          <ul className="mt-2 grid gap-x-6 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-y-0">
            {dividas.debts.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/app/dividas/${d.id}`}
                  aria-label={`${d.name}: ver detalhes`}
                  className="block rounded-2xl py-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 lg:px-2"
                >
                  <ConteudoDivida divida={d} />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/app/dividas/plano"
            className="mt-2 inline-flex min-h-11 items-center rounded-full pr-3 text-sm font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            Ver plano de quitação
          </Link>
        </section>
      )}

      {/* Lembrete de segurança quando o 2FA está desligado */}
      {me && !me.user.twoFactorEnabled && (
        <section className="mt-6 flex flex-col items-start gap-4 rounded-3xl bg-white p-6 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:flex-row sm:items-center">
          <FaShieldHalved aria-hidden="true" className="text-3xl text-accent" />
          <p className="flex-1 text-slate-700">
            <strong>Proteja sua conta:</strong> ative a verificação em duas etapas com um app autenticador.
          </p>
          <Link
            to="/app/seguranca"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-white hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Ativar agora
          </Link>
        </section>
      )}

    </AppLayout>
  );
}

export default Inicio;
