import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowTrendUp, FaArrowTrendDown, FaScaleBalanced, FaShieldHalved } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import { LinhaConta, Saldo } from "./componentes/ListaContas.jsx";
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
  const { me, erroMe } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    setErro("");
    api(`/summary?month=${mes}`)
      .then(setResumo)
      .catch((e) => setErro(e.message));
  }, [mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const primeiroNome = me?.user.name.split(" ")[0];
  const totais = resumo?.month === mes ? resumo.totals : undefined;
  const saldoNegativo = Number(totais?.balance) < 0;
  const totalDespesas = Number(totais?.expense ?? 0);

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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Despesas por categoria: barras simples (os gráficos chegam na Fase 5) */}
        <section aria-labelledby="titulo-categorias" className={cartao}>
          <h2 id="titulo-categorias" className="font-heading text-xl font-bold text-slate-900">
            Despesas por categoria
          </h2>
          {totais && resumo.byCategory.length === 0 && <p className="mt-4 text-slate-500">Nenhuma despesa neste mês.</p>}
          <ul className="mt-4 space-y-4">
            {totais &&
              resumo.byCategory.map((c) => {
                const parte = totalDespesas > 0 ? (Number(c.total) / totalDespesas) * 100 : 0;
                return (
                  <li key={c.categoryId ?? "sem"}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-bold text-slate-900">{formatarReais(c.total)}</span>
                        <span className="ml-2 text-xs text-slate-500">{Math.round(parte)}%</span>
                      </span>
                    </div>
                    <div aria-hidden="true" className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(parte, 2)}%`, backgroundColor: c.color }} />
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>

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
