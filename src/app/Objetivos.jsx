import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaPlus, FaBullseye } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import Alternador from "./componentes/Alternador.jsx";
import FormObjetivo from "./componentes/FormObjetivo.jsx";
import { ConteudoObjetivo } from "./componentes/CartaoObjetivo.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";

// Totais do topo (dos objetivos da aba)
function Resumo({ objetivos }) {
  const guardado = objetivos.reduce((s, g) => s + Number(g.progress.saved), 0);
  const meta = objetivos.reduce((s, g) => s + Number(g.targetAmount), 0);
  const itens = [
    { rotulo: "Guardado", valor: guardado, cor: "text-emerald-700" },
    { rotulo: "Metas", valor: meta, cor: "text-slate-900" },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 rounded-2xl bg-white px-3 py-3 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:px-5">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{i.rotulo}</dt>
          <dd className={`mt-1 whitespace-nowrap text-sm font-bold sm:text-lg ${i.cor}`}>{formatarReais(i.valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Tela de Objetivos: abas Ativos/Concluídos (e Arquivados, quando houver) e cards com a barra de progresso
function Objetivos() {
  const { erroMe, podeEditar } = useMe();
  const navigate = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const aba = ["COMPLETED", "ARCHIVED"].includes(busca.get("aba")) ? busca.get("aba") : "ACTIVE";
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    api(`/goals?status=${aba}`)
      .then((r) => setDados({ ...r, aba }))
      .catch((e) => setErro(e.message));
  }, [aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atual = dados?.aba === aba ? dados : null;
  const abas = [
    { valor: "ACTIVE", texto: "Ativos" },
    { valor: "COMPLETED", texto: "Concluídos" },
    ...(dados?.counts.ARCHIVED || aba === "ARCHIVED" ? [{ valor: "ARCHIVED", texto: "Arquivados" }] : []),
  ];

  return (
    <AppLayout semBotaoNovo>
      <Alerta>{erroMe || erro}</Alerta>

      <div className="flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Objetivos</h1>
        <BotaoAjuda artigo="objetivos" assunto="objetivos" />
      </div>

      <Alternador legenda="Situação dos objetivos" nome="aba-objetivos" esconderLegenda opcoes={abas} valor={aba} onMudar={(v) => setBusca({ aba: v }, { replace: true })} className="mt-4 max-w-md" />

      {atual && atual.goals.length > 0 && aba === "ACTIVE" && <Resumo objetivos={atual.goals} />}

      {!atual && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando objetivos...
        </p>
      )}

      {atual && atual.goals.length === 0 && (
        <section className={`${cartao} mt-6 text-center`}>
          <FaBullseye aria-hidden="true" className="mx-auto text-4xl text-primary" />
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-900">
            {aba === "ACTIVE" ? "Nenhum objetivo ativo" : aba === "COMPLETED" ? "Nenhum objetivo concluído ainda" : "Nenhum objetivo arquivado"}
          </h2>
          {aba === "ACTIVE" && (
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Junte dinheiro para uma viagem, a reserva de emergência ou um carro novo. Diga quanto quer guardar e até quando, e o app mostra quanto guardar por mês.
            </p>
          )}
          {podeEditar && aba === "ACTIVE" && (
            <button
              type="button"
              onClick={() => setForm(true)}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <FaPlus aria-hidden="true" />
              Criar objetivo
            </button>
          )}
        </section>
      )}

      {atual && atual.goals.length > 0 && (
        <section aria-label="Lista de objetivos" className={`${cartao} mt-6 !p-3 sm:!p-5`}>
          <ul className="divide-y divide-slate-100">
            {atual.goals.map((g) => (
              <li key={g.id} className="py-1">
                <Link
                  to={`/app/objetivos/${g.id}`}
                  aria-label={`${g.name}: ver detalhes`}
                  className="block rounded-2xl px-2 py-2.5 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <ConteudoObjetivo objetivo={g} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeEditar && (
        <button
          type="button"
          onClick={() => setForm(true)}
          aria-label="Novo objetivo"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-white shadow-[0_12px_30px_-6px_rgba(70,79,163,0.7)] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 lg:bottom-8 lg:right-8"
        >
          <FaPlus aria-hidden="true" />
        </button>
      )}

      {form && (
        <FormObjetivo
          onFechar={() => setForm(false)}
          onSalvo={(salvo) => {
            setForm(false);
            navigate(`/app/objetivos/${salvo.id}`);
          }}
        />
      )}
    </AppLayout>
  );
}

export default Objetivos;
