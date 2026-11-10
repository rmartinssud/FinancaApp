import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaChevronRight } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import Alternador from "./componentes/Alternador.jsx";
import Interruptor from "./componentes/Interruptor.jsx";
import GraficoRosca from "./componentes/GraficoRosca.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import LogoConta from "./componentes/LogoConta.jsx";
import { BarrasReceitasDespesas, BarrasHorizontais } from "./componentes/GraficoBarras.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { mesAtual, nomeDoMes, somarMes } from "../lib/datas.js";

const ABAS = [
  { valor: "EXPENSE", texto: "Despesas", classeAtiva: "bg-red-600 text-white shadow" },
  { valor: "INCOME", texto: "Receitas", classeAtiva: "bg-emerald-700 text-white shadow" },
];
const PERIODOS = [
  { valor: 1, texto: "Mês" },
  { valor: 3, texto: "3 meses" },
  { valor: 6, texto: "6 meses" },
  { valor: 12, texto: "12 meses" },
];
const MAX_FATIAS = 7;
const COR_OUTRAS = "#cbd5e1";

// Fatias do gráfico: as maiores e o resto em "Outras"
function fatiasDe(lista) {
  const fatias = lista.map((c) => ({ chave: c.categoryId ?? "sem", nome: c.name, cor: c.color, valor: Number(c.total), item: c }));
  if (fatias.length <= MAX_FATIAS) return fatias;
  const resto = fatias.slice(MAX_FATIAS - 1);
  return [...fatias.slice(0, MAX_FATIAS - 1), { chave: "__outras", nome: "Outras", cor: COR_OUTRAS, valor: resto.reduce((s, f) => s + f.valor, 0) }];
}

// Rosca + lista. Tocar numa categoria com subcategorias abre o detalhe delas.
function CartaoCategorias({ titulo, lista, total, onAbrir, voltar, carregando }) {
  const [selecionada, setSelecionada] = useState(null);
  const fatias = fatiasDe(lista);
  const escolhida = fatias.find((f) => f.chave === selecionada);
  const totalNum = Number(total);
  return (
    <section aria-label={titulo} className={cartao}>
      <div className="flex items-center gap-2">
        {voltar && (
          <button
            type="button"
            onClick={voltar}
            aria-label="Voltar para todas as categorias"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <FaArrowLeft aria-hidden="true" />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate font-heading text-xl font-bold text-slate-900">{titulo}</h2>
      </div>
      {carregando ? (
        <p role="status" className="mt-4 text-slate-500">
          Carregando...
        </p>
      ) : lista.length === 0 ? (
        <p className="mt-4 text-slate-500">Nada no período.</p>
      ) : (
        <>
          <div className="mt-4">
            <GraficoRosca
              fatias={fatias}
              selecionada={selecionada}
              onEscolher={(chave) => setSelecionada((atual) => (atual === chave ? null : chave))}
              centro={
                <>
                  <span className="max-w-full truncate text-xs text-slate-500">{escolhida ? escolhida.nome : "Total"}</span>
                  <span className="whitespace-nowrap font-heading text-sm font-bold text-slate-900 sm:text-base">
                    {formatarReais(escolhida ? escolhida.valor.toFixed(2) : total)}
                  </span>
                </>
              }
            />
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {lista.map((c) => {
              const pct = totalNum > 0 ? Math.round((Number(c.total) / totalNum) * 100) : 0;
              const abre = Boolean(onAbrir && c.hasChildren);
              const conteudo = (
                <>
                  <IconeCategoria categoria={c} tamanho="h-9 w-9 text-sm" />
                  <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-800">{c.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block whitespace-nowrap font-bold text-slate-900">{formatarReais(c.total)}</span>
                    <span className="block text-xs text-slate-500">{pct}%</span>
                  </span>
                  {abre && <FaChevronRight aria-hidden="true" className="shrink-0 text-xs text-slate-400" />}
                </>
              );
              const chave = c.categoryId ?? "sem";
              return (
                <li key={chave}>
                  <button
                    type="button"
                    onClick={() => (abre ? onAbrir(c) : setSelecionada((atual) => (atual === chave ? null : chave)))}
                    aria-label={abre ? `Ver subcategorias de ${c.name}, ${formatarReais(c.total)}` : `${c.name}, ${formatarReais(c.total)}, ${pct}%`}
                    className={`flex w-full items-center gap-3 rounded-2xl px-1 py-2 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                      selecionada === chave ? "bg-soft" : ""
                    }`}
                  >
                    {conteudo}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// Estatísticas e Gráficos: por categoria (e subcategoria), por conta/cartão, por tag e a evolução mensal
function Estatisticas() {
  const { erroMe } = useMe();
  const [mes, setMes] = useState(mesAtual);
  const [meses, setMeses] = useState(1);
  const [tipo, setTipo] = useState("EXPENSE");
  const [pendentes, setPendentes] = useState(false);
  const [mesesEvolucao, setMesesEvolucao] = useState(6);
  const [dados, setDados] = useState(null);
  const [categoriaAberta, setCategoriaAberta] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [evolucao, setEvolucao] = useState(null);
  const [erro, setErro] = useState("");

  const de = somarMes(mes, -(meses - 1));
  const filtro = `from=${de}&to=${mes}&type=${tipo}&includePending=${pendentes}`;

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro("");
    api(`/stats?${filtro}`)
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [filtro]);

  useEffect(() => {
    if (!categoriaAberta) return undefined;
    let ativo = true;
    setDetalhe(null);
    api(`/stats?${filtro}&categoryId=${encodeURIComponent(categoriaAberta.categoryId)}`)
      .then((d) => ativo && setDetalhe(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [filtro, categoriaAberta]);

  useEffect(() => {
    let ativo = true;
    setEvolucao(null);
    api(`/stats/evolution?month=${mes}&months=${mesesEvolucao}&includePending=${pendentes}`)
      .then((d) => ativo && setEvolucao(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [mes, mesesEvolucao, pendentes]);

  const total = Number(dados?.total ?? 0);
  const contas = useMemo(
    () =>
      (dados?.byAccount ?? []).map((c) => ({
        chave: c.accountId,
        nome: c.name,
        total: c.total,
        cor: c.color ?? "#464fa3",
        icone: <LogoConta conta={c} tamanho="sm" />,
      })),
    [dados],
  );
  const tags = useMemo(
    () =>
      (dados?.byTag ?? []).map((t) => ({
        chave: t.tagId ?? "sem",
        nome: t.name,
        total: t.total,
        cor: t.color,
        icone: <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />,
      })),
    [dados],
  );
  const temTag = (dados?.byTag ?? []).some((t) => t.tagId);
  const periodoTexto = meses === 1 ? nomeDoMes(mes) : `${nomeDoMes(de)} a ${nomeDoMes(mes)}`;
  const saldoEvolucao = (evolucao?.months ?? []).reduce((s, m) => s + Number(m.balance), 0);
  const despesa = tipo === "EXPENSE";

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>
      <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Estatísticas e Gráficos</h1>

      <div className={`${cartao} mt-4 space-y-4`}>
        <SeletorMes mes={mes} onMudar={setMes} className="mx-auto max-w-sm bg-soft" />
        <label className="flex items-center justify-between gap-3">
          <span className="font-medium text-slate-800">Período</span>
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="min-h-11 rounded-full border border-slate-300 bg-white px-4 text-base font-bold text-slate-800 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
          >
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.valor === 1 ? "Só este mês" : `Últimos ${p.texto} (até este)`}
              </option>
            ))}
          </select>
        </label>
        <Alternador legenda="Tipo" esconderLegenda nome="tipo-estatisticas" opcoes={ABAS} valor={tipo} onMudar={(t) => { setTipo(t); setCategoriaAberta(null); }} />
        <Interruptor texto="Incluir pendentes" descricao={pendentes ? "Efetivados e pendentes" : "Só efetivados"} ligado={pendentes} onMudar={setPendentes} />
        <p className="text-sm text-slate-500">
          <span className="first-letter:uppercase">{periodoTexto}</span> · total de {despesa ? "despesas" : "receitas"}:{" "}
          <strong className={`whitespace-nowrap ${despesa ? "text-red-600" : "text-emerald-700"}`}>{dados ? formatarReais(dados.total) : "…"}</strong>
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {categoriaAberta ? (
          <CartaoCategorias
            key={`sub-${categoriaAberta.categoryId}`}
            titulo={categoriaAberta.name}
            lista={detalhe?.bySubcategory ?? []}
            total={categoriaAberta.total}
            carregando={!detalhe}
            voltar={() => setCategoriaAberta(null)}
          />
        ) : (
          <CartaoCategorias
            key={`cat-${tipo}`}
            titulo="Por categoria"
            lista={dados?.byCategory ?? []}
            total={dados?.total ?? "0"}
            carregando={!dados}
            onAbrir={setCategoriaAberta}
          />
        )}

        <section aria-labelledby="titulo-contas-est" className={cartao}>
          <h2 id="titulo-contas-est" className="font-heading text-xl font-bold text-slate-900">
            Por conta e cartão
          </h2>
          {dados ? <BarrasHorizontais itens={contas} total={total} /> : <p className="mt-4 text-slate-500">Carregando...</p>}
        </section>

        <section aria-labelledby="titulo-tags-est" className={cartao}>
          <h2 id="titulo-tags-est" className="font-heading text-xl font-bold text-slate-900">
            Por tag
          </h2>
          {dados ? (
            temTag ? (
              <>
                <BarrasHorizontais itens={tags} total={total} />
                <p className="mt-3 text-xs text-slate-500">Um lançamento com duas tags conta nas duas.</p>
              </>
            ) : (
              <p className="mt-3 text-slate-500">Nenhum lançamento com tag no período.</p>
            )
          ) : (
            <p className="mt-4 text-slate-500">Carregando...</p>
          )}
        </section>

        <section aria-labelledby="titulo-evolucao-est" className={cartao}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-evolucao-est" className="font-heading text-xl font-bold text-slate-900">
              Receitas × despesas
            </h2>
            <Alternador
              legenda="Meses no gráfico"
              esconderLegenda
              nome="meses-evolucao"
              opcoes={[
                { valor: 6, texto: "6 meses" },
                { valor: 12, texto: "12 meses" },
              ]}
              valor={mesesEvolucao}
              onMudar={setMesesEvolucao}
              className="w-52"
            />
          </div>
          {evolucao ? (
            <>
              <BarrasReceitasDespesas meses={evolucao.months} destaque={mes} />
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-soft p-3">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Saldo de {nomeDoMes(mes).split(" ")[0]}</dt>
                  <dd className={`mt-1 whitespace-nowrap font-heading text-base font-bold ${Number(evolucao.months.at(-1)?.balance) < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {formatarReais(evolucao.months.at(-1)?.balance ?? 0)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Saldo em {mesesEvolucao} meses</dt>
                  <dd className={`mt-1 whitespace-nowrap font-heading text-base font-bold ${saldoEvolucao < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {formatarReais(saldoEvolucao.toFixed(2))}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-4 text-slate-500">Carregando...</p>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Transferências, pagamentos de fatura e ajustes de saldo não entram. Compras no cartão contam no mês da fatura. Lançamentos com “Ignorar em
        Estatísticas e Gráficos” ficam de fora.
      </p>
    </AppLayout>
  );
}

export default Estatisticas;
