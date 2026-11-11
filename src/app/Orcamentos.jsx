import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaPlus, FaChevronDown, FaLayerGroup, FaBullseye, FaWandMagicSparkles, FaBoxArchive } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import Alternador from "./componentes/Alternador.jsx";
import Modal from "./componentes/Modal.jsx";
import FormOrcamento from "./componentes/FormOrcamento.jsx";
import { ConteudoOrcamento } from "./componentes/CartaoOrcamento.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { mesAtual } from "../lib/datas.js";

const ABAS = [
  { valor: "EXPENSE", texto: "Despesas", classeAtiva: "bg-red-600 text-white shadow" },
  { valor: "INCOME", texto: "Receitas", classeAtiva: "bg-emerald-600 text-white shadow" },
];

const DICA_503020 =
  "50/30/20: crie três orçamentos mensais de despesa com meta em “% do total de receitas do mês” — Essenciais (50%), Estilo de vida (30%) e Prioridades (20%) — e depois junte os três aqui num agrupado. Assim você vê o total e cada parte.";

// Totais do topo (só orçamentos comuns, para o agrupado não contar duas vezes)
function Resumo({ resumo, receita }) {
  const saldo = Number(resumo.balance);
  const itens = [
    { rotulo: "Meta", valor: resumo.goal, cor: "text-slate-900" },
    { rotulo: receita ? "Recebido" : "Usado", valor: resumo.used, cor: receita ? "text-emerald-700" : "text-red-600" },
    { rotulo: receita ? "Falta" : "Saldo", valor: receita ? Math.max(saldo, 0) : saldo, cor: !receita && saldo < 0 ? "text-red-600" : "text-slate-900" },
  ];
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 rounded-2xl bg-white px-2.5 py-3 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:px-5">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{i.rotulo}</dt>
          <dd className={`mt-1 whitespace-nowrap text-[13px] font-bold sm:text-lg ${i.cor}`}>{formatarReais(i.valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Um orçamento na lista (toque abre os detalhes). Agrupado: botão para ver os componentes.
function ItemOrcamento({ orcamento, mes }) {
  const [aberto, setAberto] = useState(false);
  const link = `/app/orcamentos/${orcamento.id}?mes=${mes}`;
  return (
    <li className="py-1">
      <div className="flex items-start gap-1">
        <Link
          to={link}
          aria-label={`${orcamento.name}: ver detalhes`}
          className="block min-w-0 flex-1 rounded-2xl px-2 py-2.5 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <ConteudoOrcamento orcamento={orcamento} />
        </Link>
        {orcamento.isGroup && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-label={aberto ? `Esconder orçamentos de ${orcamento.name}` : `Ver orçamentos de ${orcamento.name}`}
            className="mt-2 inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <FaChevronDown aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {orcamento.isGroup && aberto && (
        <ul className="mb-2 ml-6 border-l-2 border-slate-100 pl-2">
          {orcamento.components.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">Nenhum orçamento vale neste mês.</li>}
          {orcamento.components.map((c) => (
            <li key={c.id}>
              <Link
                to={`/app/orcamentos/${c.id}?mes=${mes}`}
                aria-label={`${c.name}: ver detalhes`}
                className="block rounded-2xl px-2 py-2 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <ConteudoOrcamento orcamento={c} compacto />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Tela de Orçamentos: mês, abas Despesas/Receitas, resumo e lista
function Orcamentos() {
  const { erroMe, podeEditar } = useMe();
  const navigate = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const mes = busca.get("mes") ?? mesAtual();
  const aba = busca.get("aba") === "INCOME" ? "INCOME" : "EXPENSE";
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [escolha, setEscolha] = useState(false);
  const [form, setForm] = useState(null); // { agrupado, dica }

  const mudar = (novo) => setBusca({ mes, aba, ...novo }, { replace: true });

  const carregar = useCallback(() => {
    setErro("");
    api(`/budgets?month=${mes}&kind=${aba}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [mes, aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atual = dados?.month === mes && dados?.kind === aba ? dados : null;
  const receita = aba === "INCOME";
  const grupos = atual?.budgets.filter((b) => b.isGroup) ?? [];
  const comuns = atual?.budgets.filter((b) => !b.isGroup) ?? [];

  function novo() {
    if (receita) setForm({ agrupado: false });
    else setEscolha(true);
  }

  return (
    <AppLayout semBotaoNovo>
      <Alerta>{erroMe || erro}</Alerta>

      <div className="flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Orçamentos</h1>
        <BotaoAjuda artigo="orcamentos" assunto="orçamentos" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <SeletorMes mes={mes} onMudar={(m) => mudar({ mes: m })} />
        <Alternador legenda="Tipo de orçamento" nome="aba-orcamentos" esconderLegenda opcoes={ABAS} valor={aba} onMudar={(v) => mudar({ aba: v })} />
      </div>

      {atual && atual.budgets.length > 0 && <Resumo resumo={atual.summary} receita={receita} />}

      {!atual && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando orçamentos...
        </p>
      )}

      {/* Vazio: explicação curta */}
      {atual && atual.budgets.length === 0 && (
        <section className={`${cartao} mt-6 text-center`}>
          <FaBullseye aria-hidden="true" className="mx-auto text-4xl text-primary" />
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-900">{receita ? "Nenhuma receita planejada neste mês" : "Nenhum orçamento neste mês"}</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            {receita
              ? "Diga quanto espera receber (ex.: Salário) e acompanhe quanto já entrou. A meta de uma receita pode servir de base para orçamentos de despesa em %."
              : "Defina um limite de gastos por categoria, conta ou cartão e acompanhe quanto já usou. O app avisa quando chegar perto do limite."}
          </p>
          {podeEditar && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ agrupado: false })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <FaPlus aria-hidden="true" />
                Criar orçamento
              </button>
              {!receita && (
                <button
                  type="button"
                  onClick={() => setForm({ agrupado: true, dica: DICA_503020 })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 px-5 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <FaWandMagicSparkles aria-hidden="true" />
                  Criar 50/30/20
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {grupos.length > 0 && (
        <section aria-labelledby="titulo-agrupados" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
          <h2 id="titulo-agrupados" className="px-2 font-heading text-lg font-bold text-slate-900">
            Agrupados
          </h2>
          <ul className="divide-y divide-slate-100">
            {grupos.map((b) => (
              <ItemOrcamento key={b.id} orcamento={b} mes={mes} />
            ))}
          </ul>
        </section>
      )}

      {comuns.length > 0 && (
        <section aria-labelledby="titulo-lista" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
          <h2 id="titulo-lista" className={grupos.length ? "px-2 font-heading text-lg font-bold text-slate-900" : "sr-only"}>
            {receita ? "Receitas" : "Orçamentos"}
          </h2>
          <ul className="divide-y divide-slate-100">
            {comuns.map((b) => (
              <ItemOrcamento key={b.id} orcamento={b} mes={mes} />
            ))}
          </ul>
        </section>
      )}

      {/* Arquivados: ver, desarquivar ou excluir */}
      {atual?.archivedCount > 0 && (
        <div className="mt-6 flex justify-center">
          <Link
            to="/app/orcamentos/arquivados"
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <FaBoxArchive aria-hidden="true" /> Arquivados ({atual.archivedCount})
          </Link>
        </div>
      )}

      {/* Botão "+" (no lugar do novo lançamento) */}
      {podeEditar && (
        <button
          type="button"
          onClick={novo}
          aria-label={receita ? "Novo orçamento de receita" : "Novo orçamento"}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-white shadow-[0_12px_30px_-6px_rgba(70,79,163,0.7)] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 lg:bottom-8 lg:right-8"
        >
          <FaPlus aria-hidden="true" />
        </button>
      )}

      {escolha && (
        <Modal titulo="Novo" onFechar={() => setEscolha(false)}>
          <div className="space-y-2">
            {[
              { agrupado: false, Icone: FaBullseye, titulo: "Orçamento", texto: "Limite de gastos por categoria, conta ou cartão." },
              { agrupado: true, Icone: FaLayerGroup, titulo: "Agrupado", texto: "Junta orçamentos mensais (ex.: 50/30/20) e mostra a soma." },
            ].map((o) => (
              <button
                key={o.titulo}
                type="button"
                onClick={() => {
                  setEscolha(false);
                  setForm({ agrupado: o.agrupado });
                }}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-lg text-primary">
                  <o.Icone />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900">{o.titulo}</span>
                  <span className="block text-sm text-slate-600">{o.texto}</span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {form && (
        <FormOrcamento
          kind={aba}
          agrupado={form.agrupado}
          dica={form.dica}
          mes={mes}
          onFechar={() => setForm(null)}
          onSalvo={(salvo) => {
            setForm(null);
            // Personalizado que começa noutro mês: abre os detalhes; senão, recarrega a lista
            if (salvo?.period === "CUSTOM" && !(salvo.startDate.slice(0, 7) <= mes && salvo.endDate.slice(0, 7) >= mes)) {
              navigate(`/app/orcamentos/${salvo.id}?mes=${salvo.startDate.slice(0, 7)}`);
            } else carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Orcamentos;
