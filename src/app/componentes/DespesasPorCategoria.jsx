import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronUp, FaChevronDown, FaArrowUpRightFromSquare, FaChartPie, FaListUl, FaTags, FaChartLine, FaEllipsisVertical } from "react-icons/fa6";
import GraficoRosca from "./GraficoRosca.jsx";
import EvolucaoCategoria from "./EvolucaoCategoria.jsx";
import IconeCategoria from "./IconeCategoria.jsx";
import Modal from "./Modal.jsx";
import FormOrcamento from "./FormOrcamento.jsx";
import { ConteudoOrcamento } from "./CartaoOrcamento.jsx";
import { cartao, botaoIcone } from "./estilos.js";
import { FormCategoria } from "../Categorias.jsx";
import { api, formatarReais } from "../../lib/api.js";

const MAX_FATIAS = 6; // no gráfico: as 6 maiores; o resto vira "Outras"
const MAX_LINHAS = 6; // na lista do modo Gráfico: as 6 maiores + "Ver todas"
const COR_OUTRAS = "#cbd5e1";
const CHAVE_OUTRAS = "__outras";

const chaveDe = (c) => c.categoryId ?? "sem";

// Lançamentos (aba Despesas) do mês, opcionalmente só de uma categoria ("none" = sem categoria)
function linkLancamentos(mes, categoryId) {
  const base = `/app/lancamentos?mes=${mes}&aba=EXPENSE`;
  if (categoryId === undefined) return base;
  return `${base}&categoria=${encodeURIComponent(categoryId ?? "none")}`;
}

// Preferências do cartão (modo e linhas escondidas pelo ^), guardadas no navegador por usuário
function lerPreferencias(chave) {
  try {
    return { modo: "grafico", recolhido: false, ...JSON.parse(localStorage.getItem(chave) ?? "{}") };
  } catch {
    return { modo: "grafico", recolhido: false };
  }
}

function usePreferencias(userId) {
  const chave = `financas:inicio:despesasCategoria:${userId ?? "anonimo"}`;
  const [estado, setEstado] = useState(() => ({ chave, ...lerPreferencias(chave) }));
  // Trocou de usuário (ou o /me chegou depois): lê as preferências dele
  const atuais = estado.chave === chave ? estado : { chave, ...lerPreferencias(chave) };
  const mudar = useCallback(
    (parcial) => {
      setEstado((anterior) => {
        const base = anterior.chave === chave ? anterior : { chave, ...lerPreferencias(chave) };
        const novo = { ...base, ...parcial };
        try {
          localStorage.setItem(chave, JSON.stringify({ modo: novo.modo, recolhido: novo.recolhido }));
        } catch {
          // navegador sem localStorage (modo privado): vale só nesta tela
        }
        return novo;
      });
    },
    [chave],
  );
  return [atuais, mudar];
}

// Orçamento mensal de despesa que filtra exatamente esta categoria (e nenhuma conta)
function orcamentoDaCategoria(orcamentos, categoryId) {
  if (!categoryId || !orcamentos) return null;
  return (
    orcamentos.find(
      (b) => !b.isGroup && b.period === "MONTHLY" && b.categoryIds.length === 1 && b.categoryIds[0] === categoryId && b.accountIds.length === 0,
    ) ?? null
  );
}

// Cor do botão de orçamento: sem orçamento (cinza), ok (índigo), alerta (âmbar), estourado (vermelho)
function classeBotaoOrcamento(orcamento) {
  if (!orcamento) return "text-slate-400 hover:bg-slate-100 hover:text-slate-600";
  if (orcamento.progress.status === "OVER") return "bg-red-100 text-red-600 hover:bg-red-200";
  if (orcamento.progress.status === "ALERT") return "bg-amber-100 text-amber-600 hover:bg-amber-200";
  return "bg-soft text-primary hover:bg-primary/15";
}

// Menu ⋮ de uma categoria (fecha com Esc, toque fora ou ao escolher)
function MenuCategoria({ nome, itens }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const idMenu = useId();

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (!ref.current?.contains(e.target)) setAberto(false);
    };
    const tecla = (e) => {
      if (e.key === "Escape") {
        setAberto(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const classeItem = "flex min-h-11 w-full items-center px-4 text-left text-sm font-medium text-slate-800 hover:bg-soft focus:bg-soft focus:outline-none";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={`Mais opções de ${nome}`}
        onClick={() => setAberto((a) => !a)}
        className={`${botaoIcone} h-10 w-10 text-slate-500`}
      >
        <FaEllipsisVertical aria-hidden="true" />
      </button>
      {aberto && (
        <ul
          id={idMenu}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-xl"
        >
          {itens.map((item) => (
            <li key={item.texto} role="none">
              {item.para ? (
                <Link role="menuitem" to={item.para} className={classeItem} onClick={() => setAberto(false)}>
                  {item.texto}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={classeItem}
                  onClick={() => {
                    setAberto(false);
                    item.acao();
                  }}
                >
                  {item.texto}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Modo "Lista": exatamente a lista de antes (barras simples)
function ModoLista({ categorias, total }) {
  return (
    <ul className="mt-4 space-y-4">
      {categorias.map((c) => {
        const parte = total > 0 ? (Number(c.total) / total) * 100 : 0;
        return (
          <li key={chaveDe(c)}>
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
  );
}

// Cartão "Despesas por categoria" do Início: modo Gráfico (rosca + linhas com ações) ou Lista.
// Os valores vêm do mesmo /api/summary de antes (resumo.byCategory e totals.expense).
function DespesasPorCategoria({ resumo, mes, userId, podeEditar, onAlterado }) {
  const [prefs, mudarPrefs] = usePreferencias(userId);
  // Seleção vale só para o mês em que foi feita
  const [selecao, setSelecao] = useState({ mes, chave: null });
  const [verTodas, setVerTodas] = useState(false);
  const [orcamentos, setOrcamentos] = useState(null);
  const [versaoOrcamentos, setVersaoOrcamentos] = useState(0);
  // Janelas: { tipo: "evolucao" | "orcamento" | "novoOrcamento" | "categoria", categoria, orcamento? }
  const [janela, setJanela] = useState(null);
  const idLinhas = useId();

  const pronto = resumo?.month === mes;
  const categorias = pronto ? resumo.byCategory : [];
  const total = Number(pronto ? resumo.totals.expense : 0);
  const vazio = pronto && categorias.length === 0;
  const selecionada = selecao.mes === mes ? selecao.chave : null;
  // O ^ do topo só existe no modo Gráfico com despesas (no modo Lista a lista é o conteúdo todo)
  const modoGrafico = prefs.modo !== "lista" && pronto && !vazio;

  // Orçamentos de despesa do mês (para o botão de etiqueta de cada categoria)
  useEffect(() => {
    let ativo = true;
    api(`/budgets?month=${mes}&kind=EXPENSE`)
      .then((d) => ativo && setOrcamentos({ mes, lista: d.budgets }))
      .catch(() => ativo && setOrcamentos(null));
    return () => {
      ativo = false;
    };
  }, [mes, versaoOrcamentos]);
  const listaOrcamentos = orcamentos?.mes === mes ? orcamentos.lista : null;

  // Fatias: as 6 maiores e "Outras" com o resto
  const principais = categorias.slice(0, MAX_FATIAS);
  const resto = categorias.slice(MAX_FATIAS);
  const fatias = [
    ...principais.map((c) => ({ chave: chaveDe(c), nome: c.name, cor: c.color, valor: Number(c.total) })),
    ...(resto.length ? [{ chave: CHAVE_OUTRAS, nome: "Outras", cor: COR_OUTRAS, valor: resto.reduce((s, c) => s + Number(c.total), 0) }] : []),
  ];
  const chavesDoResto = new Set(resto.map(chaveDe));
  const fatiaDe = (chave) => (chavesDoResto.has(chave) ? CHAVE_OUTRAS : chave);

  // Escolher de novo a mesma desmarca
  const escolher = (chave) => setSelecao((s) => ({ mes, chave: s.mes === mes && s.chave === chave ? null : chave }));

  // Centro da rosca: total do mês ou a categoria escolhida
  const pct = (valor) => (total > 0 ? Math.round((valor / total) * 100) : 0);
  let centro;
  let textoCentro;
  if (selecionada) {
    const c = selecionada === CHAVE_OUTRAS ? null : categorias.find((x) => chaveDe(x) === selecionada);
    const nome = c ? c.name : `Outras (${resto.length})`;
    const valor = c ? Number(c.total) : (fatias.find((f) => f.chave === CHAVE_OUTRAS)?.valor ?? 0);
    textoCentro = `${nome}: ${formatarReais(valor)}, ${pct(valor)}% das despesas`;
    centro = (
      <>
        <span className="block max-w-full truncate text-xs font-semibold text-slate-600 sm:text-sm">{nome}</span>
        <span className="mt-0.5 block whitespace-nowrap font-heading text-base font-bold text-slate-900 sm:text-lg">{formatarReais(valor)}</span>
        <span className="block text-xs font-bold text-slate-500">{pct(valor)}%</span>
      </>
    );
  } else {
    textoCentro = `Total de despesas: ${formatarReais(total)}`;
    centro = (
      <>
        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Total</span>
        <span className="mt-0.5 block whitespace-nowrap font-heading text-base font-bold text-slate-900 sm:text-lg">{formatarReais(total)}</span>
      </>
    );
  }

  const linhas = verTodas ? categorias : categorias.slice(0, MAX_LINHAS);
  const recarregarOrcamentos = () => setVersaoOrcamentos((v) => v + 1);

  // Abre o orçamento da categoria (ou o formulário para criar um)
  const abrirOrcamento = (c) => {
    const b = orcamentoDaCategoria(listaOrcamentos, c.categoryId);
    if (b) setJanela({ tipo: "orcamento", categoria: c, orcamento: b });
    else setJanela({ tipo: "novoOrcamento", categoria: c });
  };

  return (
    <section aria-labelledby="titulo-categorias" className={cartao}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-categorias" className="min-w-0 font-heading text-lg font-bold text-slate-900 sm:text-xl">
          Despesas por categoria
        </h2>
        <div className="-mr-2 flex shrink-0 items-center">
          {/* ^ esconde/mostra só as linhas das categorias embaixo da rosca (a rosca e o total ficam) */}
          {modoGrafico && (
            <button
              type="button"
              aria-expanded={!prefs.recolhido}
              aria-controls={idLinhas}
              aria-label={prefs.recolhido ? "Mostrar as categorias" : "Esconder as categorias"}
              onClick={() => mudarPrefs({ recolhido: !prefs.recolhido })}
              className={`${botaoIcone} h-10 w-10 text-slate-600`}
            >
              {prefs.recolhido ? <FaChevronDown aria-hidden="true" /> : <FaChevronUp aria-hidden="true" />}
            </button>
          )}
          <Link to={linkLancamentos(mes)} aria-label="Ver despesas do mês em Lançamentos" className={`${botaoIcone} h-10 w-10 text-slate-600`}>
            <FaArrowUpRightFromSquare aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div>
        {vazio && <p className="mt-4 text-slate-500">Nenhuma despesa neste mês.</p>}

        {pronto && !vazio && (
          <>
            {/* Gráfico | Lista */}
            <div className="mt-3 flex justify-end">
              <div role="group" aria-label="Modo de exibição" className="inline-flex gap-1 rounded-full bg-soft p-1">
                {[
                  { valor: "grafico", texto: "Gráfico", Icone: FaChartPie },
                  { valor: "lista", texto: "Lista", Icone: FaListUl },
                ].map(({ valor, texto, Icone }) => {
                  const ativo = prefs.modo === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => mudarPrefs({ modo: valor })}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                        ativo ? "bg-primary text-white shadow" : "text-slate-600 hover:text-primary"
                      }`}
                    >
                      <Icone aria-hidden="true" />
                      {texto}
                    </button>
                  );
                })}
              </div>
            </div>

            {prefs.modo === "lista" ? (
              <ModoLista categorias={categorias} total={total} />
            ) : (
              <>
                <div className="mt-3">
                  <GraficoRosca
                    fatias={fatias}
                    selecionada={selecionada ? fatiaDe(selecionada) : null}
                    onEscolher={escolher}
                    centro={centro}
                    rotulo={textoCentro}
                  />
                </div>

                <div id={idLinhas} hidden={prefs.recolhido}>
                  <ul className="mt-5 space-y-2">
                    {linhas.map((c) => {
                      const chave = chaveDe(c);
                      const marcada = selecionada === chave;
                      const orcamento = orcamentoDaCategoria(listaOrcamentos, c.categoryId);
                      // "Sem categoria" não tem orçamento nem edição; quem só visualiza não cria nem edita
                      const temOrcamentoPossivel = Boolean(c.categoryId) && (orcamento || podeEditar);
                      const itensMenu = [
                        { texto: "Ver lançamentos", para: linkLancamentos(mes, c.categoryId) },
                        ...(c.categoryId && podeEditar ? [{ texto: "Editar categoria", acao: () => setJanela({ tipo: "categoria", categoria: c }) }] : []),
                        ...(temOrcamentoPossivel ? [{ texto: orcamento ? "Ver orçamento" : "Criar orçamento", acao: () => abrirOrcamento(c) }] : []),
                      ];
                      return (
                        <li
                          key={chave}
                          className={`flex items-center gap-1 rounded-2xl py-1.5 pl-2 pr-1 transition-colors motion-reduce:transition-none ${
                            marcada ? "bg-soft ring-2 ring-primary/30" : "bg-slate-50"
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={marcada}
                            onClick={() => escolher(chave)}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                          >
                            <IconeCategoria categoria={c} tamanho="h-10 w-10 text-base !rounded-full" />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="truncate text-sm font-semibold text-slate-800 sm:text-base">{c.name}</span>
                                <span className="shrink-0 text-xs font-medium text-slate-500">{pct(Number(c.total))}%</span>
                              </span>
                              <span className="block whitespace-nowrap text-sm text-slate-600">{formatarReais(c.total)}</span>
                            </span>
                          </button>
                          {temOrcamentoPossivel && (
                            <button
                              type="button"
                              onClick={() => abrirOrcamento(c)}
                              aria-label={orcamento ? `Orçamento de ${c.name}` : `Criar orçamento para ${c.name}`}
                              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${classeBotaoOrcamento(orcamento)}`}
                            >
                              <FaTags aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setJanela({ tipo: "evolucao", categoria: c })}
                            aria-label={`Evolução de ${c.name}`}
                            className={`${botaoIcone} h-10 w-10 text-slate-500`}
                          >
                            <FaChartLine aria-hidden="true" />
                          </button>
                          <MenuCategoria nome={c.name} itens={itensMenu} />
                        </li>
                      );
                    })}
                  </ul>
                  {categorias.length > MAX_LINHAS && (
                    <button
                      type="button"
                      onClick={() => setVerTodas((v) => !v)}
                      aria-expanded={verTodas}
                      className="mt-3 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                    >
                      {verTodas ? "Ver menos" : `Ver todas (${categorias.length})`}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {janela?.tipo === "evolucao" && (
        <EvolucaoCategoria
          categoria={janela.categoria}
          mes={mes}
          linkLancamentos={linkLancamentos(mes, janela.categoria.categoryId)}
          onFechar={() => setJanela(null)}
        />
      )}

      {janela?.tipo === "orcamento" && (
        <Modal titulo="Orçamento" onFechar={() => setJanela(null)}>
          <ConteudoOrcamento orcamento={janela.orcamento} />
          <Link
            to={`/app/orcamentos/${janela.orcamento.id}?mes=${mes}`}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-white hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Ver detalhes
          </Link>
        </Modal>
      )}

      {janela?.tipo === "novoOrcamento" && (
        <FormOrcamento
          kind="EXPENSE"
          mes={mes}
          copia={false}
          modelo={{
            name: janela.categoria.name,
            color: janela.categoria.color,
            icon: janela.categoria.icon ?? "cart",
            period: "MONTHLY",
            startMonth: mes,
            goalType: "FIXED",
            categoryIds: [janela.categoria.categoryId],
            accountIds: [],
            componentIds: [],
            alertPercent: 80,
            showOnHome: false,
            includePending: true,
            includeIgnored: false,
            cardDateRef: "PURCHASE",
          }}
          onFechar={() => setJanela(null)}
          onSalvo={() => {
            setJanela(null);
            recarregarOrcamentos();
            onAlterado?.();
          }}
        />
      )}

      {janela?.tipo === "categoria" && (
        <FormCategoria
          categoria={{
            id: janela.categoria.categoryId,
            name: janela.categoria.name,
            type: janela.categoria.type ?? "EXPENSE",
            color: janela.categoria.color,
            icon: janela.categoria.icon ?? "cart",
          }}
          tipoInicial="EXPENSE"
          onFechar={() => setJanela(null)}
          onSalvo={() => {
            setJanela(null);
            recarregarOrcamentos();
            onAlterado?.();
          }}
        />
      )}
    </section>
  );
}

export default DespesasPorCategoria;
