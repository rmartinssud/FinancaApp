import { useCallback, useEffect, useMemo, useState } from "react";
import { FaReceipt } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import FormLancamento from "./componentes/FormLancamento.jsx";
import BotaoFlutuante from "./componentes/BotaoFlutuante.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { dataLocal, mesAtual, nomeDoDia } from "../lib/datas.js";

const filtros = [
  { valor: "", texto: "Todos" },
  { valor: "INCOME", texto: "Receitas" },
  { valor: "EXPENSE", texto: "Despesas" },
];

// Conteúdo de uma linha da lista (ícone, descrição, conta e valor)
function ConteudoLinha({ l }) {
  const receita = l.type === "INCOME";
  return (
    <>
      <IconeCategoria categoria={l.category} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">{l.description}</span>
        <span className="block truncate text-sm text-slate-500">
          {l.category?.name ?? "Sem categoria"} · {l.account.name}
          {l.status === "PENDING" && " · pendente"}
        </span>
      </span>
      <span className={`shrink-0 font-bold ${receita ? "text-emerald-700" : "text-red-600"}`}>
        <span className="sr-only">{receita ? "Receita de" : "Despesa de"} </span>
        <span aria-hidden="true">{receita ? "+ " : "− "}</span>
        {formatarReais(l.amount)}
      </span>
    </>
  );
}

// Lista de lançamentos do mês, agrupada por dia
function Lancamentos() {
  const { erroMe, podeEditar } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [tipo, setTipo] = useState("");
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  // null = janela fechada; "novo" = criando; objeto = editando
  const [edicao, setEdicao] = useState(null);

  const carregar = useCallback(() => {
    setErro("");
    const filtroTipo = tipo ? `&type=${tipo}` : "";
    api(`/transactions?month=${mes}${filtroTipo}`)
      .then(setLista)
      .catch((e) => setErro(e.message));
  }, [mes, tipo]);

  useEffect(() => {
    setLista(null);
    carregar();
  }, [carregar]);

  // A API já devolve do mais recente para o mais antigo; só juntamos por dia (em Brasília)
  const dias = useMemo(() => {
    const grupos = new Map();
    for (const l of lista ?? []) {
      const dia = dataLocal(l.date);
      if (!grupos.has(dia)) grupos.set(dia, []);
      grupos.get(dia).push(l);
    }
    return [...grupos.entries()];
  }, [lista]);

  const classeLinha = "flex w-full items-center gap-3 rounded-2xl px-2 py-3";

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>

      <h1 className="font-heading text-3xl font-bold text-slate-900 md:text-4xl">Lançamentos</h1>

      <SeletorMes mes={mes} onMudar={setMes} className="mt-5 max-w-sm" />

      {/* Filtro por tipo */}
      <div role="group" aria-label="Filtrar por tipo" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {filtros.map((f) => (
          <button
            key={f.valor}
            type="button"
            aria-pressed={tipo === f.valor}
            onClick={() => setTipo(f.valor)}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-5 font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
              tipo === f.valor ? "bg-primary text-white shadow" : "bg-white text-slate-700 hover:text-primary"
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {lista === null && !erro && (
        <p role="status" className="mt-8 text-slate-500">
          Carregando lançamentos...
        </p>
      )}

      {/* Nada no mês */}
      {lista?.length === 0 && (
        <div className="mt-8 rounded-3xl bg-white p-8 text-center shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)]">
          <FaReceipt aria-hidden="true" className="mx-auto text-4xl text-primary-light" />
          <p className="mt-4 font-heading text-xl font-bold text-slate-900">Nenhum lançamento neste mês</p>
          <p className="mt-2 text-slate-600">
            {podeEditar ? "Toque em “Lançamento” para registrar uma receita ou despesa." : "Quando alguém da família lançar, aparece aqui."}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {dias.map(([dia, itens]) => (
          <section key={dia} aria-label={nomeDoDia(dia)}>
            <h2 className="px-2 text-sm font-bold uppercase tracking-wider text-slate-500">{nomeDoDia(dia)}</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded-3xl bg-white p-2 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)]">
              {itens.map((l) => (
                <li key={l.id}>
                  {podeEditar ? (
                    <button
                      type="button"
                      onClick={() => setEdicao(l)}
                      aria-label={`Editar ${l.type === "INCOME" ? "receita" : "despesa"} ${l.description}, ${formatarReais(l.amount)}`}
                      className={`${classeLinha} transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30`}
                    >
                      <ConteudoLinha l={l} />
                    </button>
                  ) : (
                    <div className={classeLinha}>
                      <ConteudoLinha l={l} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {podeEditar && <BotaoFlutuante texto="Lançamento" onClick={() => setEdicao("novo")} />}
      {edicao && (
        <FormLancamento
          lancamento={edicao === "novo" ? null : edicao}
          onFechar={() => setEdicao(null)}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Lancamentos;
