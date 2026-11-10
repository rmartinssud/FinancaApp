import { useEffect, useMemo, useState } from "react";
import { FaFileCsv, FaPrint, FaChevronDown, FaArrowTrendUp, FaArrowTrendDown, FaScaleBalanced, FaCreditCard, FaLayerGroup } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import Alternador from "./componentes/Alternador.jsx";
import Interruptor from "./componentes/Interruptor.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import AbrirLancamento from "./componentes/AbrirLancamento.jsx";
import { cartao, botaoSecundario } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { hoje, mesAtual, nomeDoMes } from "../lib/datas.js";
import { comSubcategorias, nomeCategoria } from "../lib/categorias.js";
import { textoParcela } from "../lib/cartoes.js";
import { mesCurto, percentual } from "../lib/graficos.js";

const TIPOS = [
  { valor: "ALL", texto: "Tudo" },
  { valor: "EXPENSE", texto: "Despesas", classeAtiva: "bg-red-600 text-white shadow" },
  { valor: "INCOME", texto: "Receitas", classeAtiva: "bg-emerald-700 text-white shadow" },
];
const PERIODOS = [
  { valor: "MES", texto: "Mês" },
  { valor: "INTERVALO", texto: "Intervalo de datas" },
];
const AGRUPAR = [
  { valor: "category", texto: "Categoria" },
  { valor: "subcategory", texto: "Subcategoria" },
  { valor: "account", texto: "Conta / cartão" },
  { valor: "tag", texto: "Tag" },
  { valor: "person", texto: "Pessoa" },
  { valor: "month", texto: "Mês" },
];
const SITUACOES = { ALL: "Todos", CONFIRMED: "Efetivados", PENDING: "Pendentes" };
const POR_PAGINA = 100;

const diaBr = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const nomeDoGrupo = (g, agrupar) => (agrupar === "month" && g.key ? nomeDoMes(g.key) : g.name);

// Lista de caixinhas (contas, categorias, tags). escolhidos: array de ids
function ListaEscolha({ titulo, opcoes, escolhidos, onMudar }) {
  if (!opcoes.length) return null;
  const alternar = (id) => onMudar(escolhidos.includes(id) ? escolhidos.filter((x) => x !== id) : [...escolhidos, id]);
  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-center justify-between gap-2 font-medium text-slate-800">
        <span>{titulo}</span>
        {escolhidos.length > 0 && (
          <button type="button" onClick={() => onMudar([])} className="min-h-9 rounded-full px-3 text-sm font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            Limpar ({escolhidos.length})
          </button>
        )}
      </legend>
      <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 p-1">
        {opcoes.map((o) => (
          <label key={o.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-slate-800 hover:bg-soft ${o.nivel ? "pl-7" : ""}`}>
            <input type="checkbox" checked={escolhidos.includes(o.id)} onChange={() => alternar(o.id)} className="h-5 w-5 shrink-0 accent-primary" />
            <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Total({ titulo, Icone, valor, cor }) {
  return (
    <div className="min-w-0 rounded-2xl bg-soft p-2.5 print:border print:border-slate-300 print:bg-white">
      <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <Icone aria-hidden="true" className="shrink-0" />
        <span className="truncate">{titulo}</span>
      </dt>
      <dd className={`mt-1 whitespace-nowrap font-heading text-sm font-bold sm:text-base ${cor}`}>{formatarReais(valor)}</dd>
    </div>
  );
}

// Agrupamento: nome, barra do %, valor e %
function ListaGrupos({ titulo, grupos, agrupar, cor, corBarra }) {
  return (
    <section aria-label={titulo} className={`${cartao} mt-4 print:break-inside-avoid print:shadow-none`}>
      <h2 className="font-heading text-lg font-bold text-slate-900">{titulo}</h2>
      {grupos.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nada no período.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {grupos.map((g) => (
            <li key={g.key ?? "__sem"} className="py-2.5">
              <div className="flex items-center gap-3">
                {(agrupar === "category" || agrupar === "subcategory") && <IconeCategoria categoria={g} tamanho="h-8 w-8 text-sm" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 first-letter:uppercase">{nomeDoGrupo(g, agrupar)}</span>
                  <span className="block text-xs text-slate-500">
                    {g.count} {g.count === 1 ? "lançamento" : "lançamentos"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block whitespace-nowrap text-sm font-bold ${cor}`}>{formatarReais(g.total)}</span>
                  <span className="block text-xs text-slate-500">{percentual(g.percent)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${corBarra}`} style={{ width: `${Math.min(100, g.percent)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {agrupar === "tag" && grupos.length > 0 && <p className="mt-2 text-xs text-slate-500">Um lançamento com duas tags conta nas duas: a soma dos % pode passar de 100%.</p>}
    </section>
  );
}

// Relatórios: receitas e despesas de um período com filtros, agrupamento, lista, CSV e impressão (PDF)
function Relatorios() {
  const { erroMe, podeEditar, compartilhado } = useMe();
  const [modoPeriodo, setModoPeriodo] = useState("MES");
  const [mes, setMes] = useState(mesAtual);
  const [de, setDe] = useState(`${mesAtual()}-01`);
  const [ate, setAte] = useState(hoje);
  const [tipo, setTipo] = useState("ALL");
  const [situacao, setSituacao] = useState("ALL");
  const [agrupar, setAgrupar] = useState("category");
  const [contas, setContas] = useState([]);
  const [categoriasEscolhidas, setCategoriasEscolhidas] = useState([]);
  const [tagsEscolhidas, setTagsEscolhidas] = useState([]);
  const [pessoa, setPessoa] = useState("");
  const [dataCartao, setDataCartao] = useState("INVOICE");
  const [respeitarIgnorados, setRespeitarIgnorados] = useState(true);
  const [maisFiltros, setMaisFiltros] = useState(false);

  const [opcoes, setOpcoes] = useState({ contas: [], categorias: [], tags: [], pessoas: [] });
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [aberto, setAberto] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    Promise.all([api("/accounts"), api("/categories"), api("/tags")])
      .then(([listaContas, listaCategorias, listaTags]) =>
        setOpcoes((o) => ({ ...o, contas: listaContas, categorias: listaCategorias, tags: listaTags })),
      )
      .catch((e) => setErro(e.message));
  }, []);
  useEffect(() => {
    if (!compartilhado) return;
    api("/family")
      .then((f) => setOpcoes((o) => ({ ...o, pessoas: f.members })))
      .catch(() => {});
  }, [compartilhado]);

  const intervaloValido = modoPeriodo === "MES" || (de && ate && de <= ate);
  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    if (modoPeriodo === "MES") p.set("month", mes);
    else {
      p.set("from", de);
      p.set("to", ate);
    }
    p.set("type", tipo);
    p.set("status", situacao);
    p.set("groupBy", agrupar);
    p.set("cardDate", dataCartao);
    p.set("excludeIgnored", String(respeitarIgnorados));
    if (contas.length) p.set("accountIds", contas.join(","));
    if (categoriasEscolhidas.length) p.set("categoryIds", categoriasEscolhidas.join(","));
    if (tagsEscolhidas.length) p.set("tagIds", tagsEscolhidas.join(","));
    if (pessoa) p.set("createdById", pessoa);
    return p.toString();
  }, [modoPeriodo, mes, de, ate, tipo, situacao, agrupar, dataCartao, respeitarIgnorados, contas, categoriasEscolhidas, tagsEscolhidas, pessoa]);

  useEffect(() => {
    if (!intervaloValido) return undefined;
    let ativo = true;
    setDados(null);
    setErro("");
    setMostrar(POR_PAGINA);
    api(`/reports?${consulta}`)
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [consulta, intervaloValido, recarga]);

  async function baixarCsv() {
    setBaixando(true);
    setErro("");
    try {
      const resposta = await fetch(`/api/reports/csv?${consulta}`, { credentials: "include" });
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => null))?.error ?? "Não foi possível gerar o CSV.");
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${dados?.from ?? "periodo"}-a-${dados?.to ?? ""}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando(false);
    }
  }

  const opcoesContas = opcoes.contas.map((c) => ({ id: c.id, rotulo: c.type === "CREDIT_CARD" ? `${c.name} (cartão)` : c.name }));
  const opcoesCategorias = [
    { id: "none", rotulo: "Sem categoria" },
    ...comSubcategorias(opcoes.categorias.filter((c) => tipo === "ALL" || c.type === tipo)).map((c) => ({
      id: c.id,
      rotulo: tipo === "ALL" ? `${c.rotulo} · ${c.type === "INCOME" ? "receita" : "despesa"}` : c.rotulo,
      nivel: c.nivel,
    })),
  ];
  const opcoesTags = opcoes.tags.map((t) => ({ id: t.id, rotulo: t.name }));
  const qtdFiltros = contas.length + categoriasEscolhidas.length + tagsEscolhidas.length + (pessoa ? 1 : 0) + (dataCartao !== "INVOICE" ? 1 : 0) + (respeitarIgnorados ? 0 : 1);

  const periodoTexto = dados ? (modoPeriodo === "MES" ? nomeDoMes(mes) : `${diaBr(dados.from)} a ${diaBr(dados.to)}`) : "";
  const resumoFiltros = [
    TIPOS.find((t) => t.valor === tipo).texto,
    SITUACOES[situacao],
    contas.length && `${contas.length} conta(s)`,
    categoriasEscolhidas.length && `${categoriasEscolhidas.length} categoria(s)`,
    tagsEscolhidas.length && `${tagsEscolhidas.length} tag(s)`,
    pessoa && opcoes.pessoas.find((p) => p.userId === pessoa)?.name,
    `agrupado por ${AGRUPAR.find((a) => a.valor === agrupar).texto.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const itens = dados?.items ?? [];

  return (
    <AppLayout onLancamentoSalvo={() => setRecarga((n) => n + 1)}>
      <Alerta>{erroMe || erro}</Alerta>
      <div className="flex items-center gap-1 print:hidden">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Relatórios</h1>
        <BotaoAjuda artigo="relatorios" assunto="relatórios" />
      </div>

      {/* Cabeçalho só na impressão / PDF */}
      <div className="hidden print:block">
        <h1 className="font-heading text-xl font-bold text-slate-900">Relatório · {periodoTexto}</h1>
        <p className="text-xs text-slate-600">{resumoFiltros}</p>
      </div>

      <div className={`${cartao} mt-4 space-y-4 print:hidden`}>
        <Alternador legenda="Período" esconderLegenda nome="periodo" opcoes={PERIODOS} valor={modoPeriodo} onMudar={setModoPeriodo} />
        {modoPeriodo === "MES" ? (
          <SeletorMes mes={mes} onMudar={setMes} className="mx-auto max-w-sm bg-soft" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-800">
              De
              <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20" />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Até
              <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20" />
            </label>
            {!intervaloValido && <p className="col-span-2 text-sm text-red-600">A data inicial precisa vir antes da final.</p>}
          </div>
        )}
        <Alternador legenda="Tipo" esconderLegenda nome="tipo" opcoes={TIPOS} valor={tipo} onMudar={setTipo} />
        <div className="grid grid-cols-2 gap-3">
          <CampoSelect label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            {Object.entries(SITUACOES).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect label="Agrupar por" value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
            {AGRUPAR.filter((a) => a.valor !== "person" || compartilhado || agrupar === "person").map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.texto}
              </option>
            ))}
          </CampoSelect>
        </div>

        <button
          type="button"
          onClick={() => setMaisFiltros((v) => !v)}
          aria-expanded={maisFiltros}
          aria-controls="mais-filtros-relatorio"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-1 font-bold text-primary focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <span>
            Mais filtros{qtdFiltros > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white">{qtdFiltros}</span>}
          </span>
          <FaChevronDown aria-hidden="true" className={`text-sm transition-transform ${maisFiltros ? "rotate-180" : ""}`} />
        </button>
        <div id="mais-filtros-relatorio" hidden={!maisFiltros} className="space-y-4">
          <ListaEscolha titulo="Contas e cartões" opcoes={opcoesContas} escolhidos={contas} onMudar={setContas} />
          <ListaEscolha titulo="Categorias (as subcategorias entram junto)" opcoes={opcoesCategorias} escolhidos={categoriasEscolhidas} onMudar={setCategoriasEscolhidas} />
          <ListaEscolha titulo="Tags" opcoes={opcoesTags} escolhidos={tagsEscolhidas} onMudar={setTagsEscolhidas} />
          {opcoes.pessoas.length > 1 && (
            <CampoSelect label="Pessoa (quem lançou)" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Todas</option>
              {opcoes.pessoas.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </CampoSelect>
          )}
          <CampoSelect label="Compras no cartão entram pela" value={dataCartao} onChange={(e) => setDataCartao(e.target.value)}>
            <option value="INVOICE">Data de vencimento da fatura</option>
            <option value="PURCHASE">Data da compra</option>
          </CampoSelect>
          <Interruptor
            texto="Respeitar “Ignorar nos totais”"
            descricao={respeitarIgnorados ? "Lançamentos e contas marcados ficam de fora" : "Mostra tudo, até o que está marcado"}
            ligado={respeitarIgnorados}
            onMudar={setRespeitarIgnorados}
          />
        </div>
      </div>

      {!dados && !erro && intervaloValido && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando relatório...
        </p>
      )}

      {dados && (
        <>
          <section aria-label="Totais do período" className={`${cartao} mt-6 print:mt-3 print:p-0 print:shadow-none`}>
            <p className="text-sm text-slate-500 first-letter:uppercase print:hidden">{periodoTexto}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <Total titulo="Receitas" Icone={FaArrowTrendUp} valor={dados.totals.income} cor="text-emerald-700" />
              <Total titulo="Despesas" Icone={FaArrowTrendDown} valor={dados.totals.expense} cor="text-red-600" />
              <Total titulo="Saldo" Icone={FaScaleBalanced} valor={dados.totals.balance} cor={Number(dados.totals.balance) < 0 ? "text-red-600" : "text-emerald-700"} />
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              {dados.totals.count} {dados.totals.count === 1 ? "lançamento" : "lançamentos"}
              {dados.totals.pending > 0 && ` · ${dados.totals.pending} pendente${dados.totals.pending > 1 ? "s" : ""}`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={baixarCsv} disabled={baixando || !itens.length} className={`${botaoSecundario} disabled:opacity-50`}>
                <FaFileCsv aria-hidden="true" />
                {baixando ? "Gerando..." : "Exportar CSV"}
              </button>
              <button type="button" onClick={() => window.print()} disabled={!itens.length} className={`${botaoSecundario} disabled:opacity-50`}>
                <FaPrint aria-hidden="true" />
                Imprimir / PDF
              </button>
            </div>
          </section>

          {tipo !== "INCOME" && <ListaGrupos titulo="Despesas" grupos={dados.groups.expense} agrupar={agrupar} cor="text-red-600" corBarra="bg-red-500" />}
          {tipo !== "EXPENSE" && <ListaGrupos titulo="Receitas" grupos={dados.groups.income} agrupar={agrupar} cor="text-emerald-700" corBarra="bg-emerald-600" />}

          <section aria-labelledby="titulo-lista-relatorio" className={`${cartao} mt-4 print:shadow-none`}>
            <h2 id="titulo-lista-relatorio" className="font-heading text-lg font-bold text-slate-900">
              Lançamentos
            </h2>
            {itens.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum lançamento com esses filtros.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {itens.slice(0, mostrar).map((l) => {
                  const receita = l.type === "INCOME";
                  const parcela = textoParcela(l);
                  return (
                    <li key={l.id} className="print:break-inside-avoid">
                      <button
                        type="button"
                        onClick={() => setAberto(l)}
                        aria-label={`${podeEditar ? "Editar" : "Ver"} ${l.description}, ${formatarReais(l.reportAmount)}`}
                        className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                      >
                        <span className="w-11 shrink-0 text-center text-xs font-bold text-slate-500">{diaBr(l.reportDate).slice(0, 5)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-900">
                            {l.description}
                            {parcela && <span className="ml-1 text-xs font-medium text-slate-500">{parcela}</span>}
                          </span>
                          <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                            {l.isCardExpense && <FaCreditCard aria-hidden="true" className="shrink-0" />}
                            {l.splits?.length > 0 && <FaLayerGroup aria-hidden="true" className="shrink-0" />}
                            <span className="truncate">
                              {l.splits?.length ? `Multicategorias (${l.splits.length})` : nomeCategoria(l.category)} · {l.account.name}
                              {l.isCardExpense && dataCartao === "INVOICE" && ` · fatura ${mesCurto(l.invoiceMonth)}`}
                              {l.status === "PENDING" && " · pendente"}
                            </span>
                          </span>
                        </span>
                        <span className={`shrink-0 whitespace-nowrap text-sm font-bold ${receita ? "text-emerald-700" : "text-red-600"}`}>
                          {receita ? "+ " : "− "}
                          {formatarReais(l.reportAmount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {itens.length > mostrar && (
              <div className="mt-3 flex justify-center print:hidden">
                <button type="button" onClick={() => setMostrar((n) => n + POR_PAGINA)} className={botaoSecundario}>
                  Mostrar mais ({itens.length - mostrar})
                </button>
              </div>
            )}
            {itens.length > mostrar && <p className="mt-2 hidden text-xs text-slate-500 print:block">Mostrando {mostrar} de {itens.length}. Use “Mostrar mais” antes de imprimir, ou exporte o CSV.</p>}
          </section>

          <p className="mt-6 text-xs text-slate-500">
            Transferências, pagamentos de fatura e ajustes de saldo nunca entram. Com filtro de categoria, um lançamento com multicategorias conta só a parte dessas
            categorias.
          </p>
        </>
      )}

      {aberto && (
        <AbrirLancamento
          lancamento={aberto}
          podeEditar={podeEditar}
          onFechar={() => setAberto(null)}
          onSalvo={() => {
            setAberto(null);
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </AppLayout>
  );
}

export default Relatorios;
