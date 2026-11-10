import { useEffect, useId, useMemo, useState } from "react";
import {
  FaBarsStaggered,
  FaChevronDown,
  FaChevronRight,
  FaCalendarDays,
  FaCircleDollarToSlot,
  FaPercent,
  FaShapes,
  FaBuildingColumns,
  FaLayerGroup,
  FaRegBell,
  FaHourglassHalf,
  FaEyeSlash,
  FaTableCellsLarge,
  FaCreditCard,
  FaCircleInfo,
  FaLightbulb,
} from "react-icons/fa6";
import FolhaCheia from "./FolhaCheia.jsx";
import Modal from "./Modal.jsx";
import Alternador from "./Alternador.jsx";
import Interruptor from "./Interruptor.jsx";
import SeletorIcone from "./SeletorIcone.jsx";
import IconeCategoria from "./IconeCategoria.jsx";
import LogoConta from "./LogoConta.jsx";
import { classeCampo, Linha, SelectLimpo } from "./LinhasForm.jsx";
import { IconeOrcamento } from "./CartaoOrcamento.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { CORES_CATEGORIA } from "../../lib/icones.js";
import { hoje, mesAtual, nomeDoMes } from "../../lib/datas.js";
import { NOMES_META } from "../../lib/orcamentos.js";
import { comSubcategorias } from "../../lib/categorias.js";

// Linha com interruptor (ícone à esquerda), igual ao formulário de conta
function LinhaInterruptor({ Icone, texto, descricao, ligado, onMudar }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
      <Interruptor texto={texto} descricao={descricao} ligado={ligado} onMudar={onMudar} className="min-w-0 flex-1" />
    </div>
  );
}

// Linha que abre uma lista (categorias, contas): mostra o resumo do que foi escolhido
function LinhaEscolha({ Icone, rotulo, resumo, onAbrir, erro, id }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3">
      <button
        type="button"
        onClick={onAbrir}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className="flex min-h-11 w-full items-center gap-4 rounded-xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-slate-500">{rotulo}</span>
          <span className="block truncate text-base text-slate-900">{resumo}</span>
        </span>
        <FaChevronRight aria-hidden="true" className="shrink-0 text-sm text-slate-400" />
      </button>
      {erro && (
        <p id={`${id}-erro`} className="ml-10 mt-1 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

// Janela com caixas de seleção (várias opções). Nenhuma marcada = todas.
function EscolhaMultipla({ titulo, opcoes, valor, onMudar, onFechar, textoTodas }) {
  const marcado = new Set(valor);
  const alternar = (id) => onMudar(marcado.has(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <p className="text-sm text-slate-600">Sem nenhuma marcada, entram {textoTodas}.</p>
      {opcoes.length === 0 && <p className="mt-4 text-slate-500">Nada para escolher ainda.</p>}
      <ul className="mt-3 divide-y divide-slate-100">
        {opcoes.map((o) => (
          <li key={o.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1.5">
              <input type="checkbox" checked={marcado.has(o.id)} onChange={() => alternar(o.id)} className="h-5 w-5 shrink-0 accent-primary" />
              {o.icone}
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{o.nome}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {valor.length > 0 && (
          <button type="button" onClick={() => onMudar([])} className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 hover:bg-soft">
            Limpar
          </button>
        )}
        <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-bold text-white hover:bg-primary-dark">
          Pronto
        </button>
      </div>
    </Modal>
  );
}

// Janela de cor + ícone do orçamento
function EscolhaVisual({ cor, icone, onMudar, onFechar }) {
  return (
    <Modal titulo="Cor e ícone" onFechar={onFechar}>
      <fieldset>
        <legend className="mb-2 block font-medium text-slate-800">Cor</legend>
        <div className="grid grid-cols-5 gap-2">
          {CORES_CATEGORIA.map((c) => (
            <label key={c.cor} className="flex justify-center">
              <input type="radio" name="cor-orcamento" checked={cor === c.cor} onChange={() => onMudar({ cor: c.cor, icone })} className="peer sr-only" aria-label={c.nome} />
              <span className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${cor === c.cor ? "border-slate-900" : "border-transparent"}`}>
                <span aria-hidden="true" className="h-9 w-9 rounded-xl" style={{ backgroundColor: c.cor }} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5">
        <SeletorIcone valor={icone} onMudar={(novo) => onMudar({ cor, icone: novo })} cor={cor} nome="icone-orcamento" />
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-bold text-white hover:bg-primary-dark">
          Pronto
        </button>
      </div>
    </Modal>
  );
}

// Resumo de uma lista escolhida: "Todas" / "Mercado" / "Mercado, Lazer e mais 2"
function resumoLista(ids, opcoes, todas) {
  const nomes = ids.map((id) => opcoes.find((o) => o.id === id)?.nome).filter(Boolean);
  if (nomes.length === 0) return todas;
  if (nomes.length <= 2) return nomes.join(", ");
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
}

// Formulário de orçamento em tela cheia (novo, editar ou copiar).
// orcamento: da API (edição); modelo: dados para preencher (copiar) sem id; kind/agrupado: novo.
// mes: mês da tela (vigência padrão e, na edição, de quando a meta nova passa a valer).
// copia = false: o modelo só preenche o formulário (ex.: orçamento da categoria, vindo do Início), sem "(cópia)" no nome.
function FormOrcamento({ orcamento = null, modelo = null, copia = true, kind = "EXPENSE", agrupado = false, mes = mesAtual(), dica = "", onFechar, onSalvo }) {
  const base = orcamento ?? modelo;
  const editando = Boolean(orcamento);
  const tipo = base?.kind ?? kind;
  const grupo = base?.isGroup ?? agrupado;
  const despesa = tipo === "EXPENSE";
  const ids = useId();
  const id = (nome) => `${ids}-${nome}`;
  const formId = id("form");

  const [nome, setNome] = useState(modelo && !orcamento && copia ? `${modelo.name} (cópia)` : (base?.name ?? ""));
  const [cor, setCor] = useState(base?.color ?? (despesa ? "#ef4444" : "#22c55e"));
  const [icone, setIcone] = useState(base?.icon ?? (grupo ? "chart" : despesa ? "cart" : "briefcase"));
  const [periodo, setPeriodo] = useState(base?.period ?? "MONTHLY");
  const [inicioMes, setInicioMes] = useState(base?.startMonth ?? mes);
  const [inicio, setInicio] = useState(base?.startDate ?? hoje());
  const [fim, setFim] = useState(base?.endDate ?? "");
  const [tipoMeta, setTipoMeta] = useState(base?.goalType ?? "FIXED");
  const [valor, setValor] = useState(paraCampo(base?.fixedGoal ?? base?.amount ?? ""));
  const [percentual, setPercentual] = useState(base?.percent ? String(Number(base.percent)).replace(".", ",") : "");
  const [baseReceita, setBaseReceita] = useState(base?.percentOfBudgetId ?? "");
  const [categorias, setCategorias] = useState(base?.categoryIds ?? []);
  const [contas, setContas] = useState(base?.accountIds ?? []);
  const [componentes, setComponentes] = useState(base?.componentIds ?? []);
  const [comAlerta, setComAlerta] = useState(base ? base.alertPercent !== null : despesa);
  const [alerta, setAlerta] = useState(String(base?.alertPercent ?? 80));
  const [noInicio, setNoInicio] = useState(base?.showOnHome ?? false);
  const [previsto, setPrevisto] = useState(base?.includePending ?? true);
  const [ignoradas, setIgnoradas] = useState(base?.includeIgnored ?? false);
  const [dataCartao, setDataCartao] = useState(base?.cardDateRef ?? "PURCHASE");

  const [janela, setJanela] = useState(null); // "visual" | "categorias" | "contas"
  const [opcoesCategorias, setOpcoesCategorias] = useState([]);
  const [opcoesContas, setOpcoesContas] = useState([]);
  const [orcamentosMes, setOrcamentosMes] = useState({ despesas: [], receitas: [] });
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Listas para os filtros, componentes e orçamento-base
  useEffect(() => {
    let ativo = true;
    const pedidos = [
      api(`/categories?type=${tipo}`),
      despesa ? api("/accounts") : Promise.resolve([]),
      despesa ? api(`/budgets?month=${mes}&kind=EXPENSE`) : Promise.resolve({ budgets: [] }),
      despesa ? api(`/budgets?month=${mes}&kind=INCOME`) : Promise.resolve({ budgets: [] }),
    ];
    Promise.all(pedidos)
      .then(([cats, cts, desp, rec]) => {
        if (!ativo) return;
        // Subcategorias aparecem como "Mercado › Feira" (escolher a principal já conta as filhas)
        setOpcoesCategorias(comSubcategorias(cats).map((c) => ({ id: c.id, nome: c.rotulo, icone: <IconeCategoria categoria={c} tamanho="h-8 w-8 text-sm" /> })));
        setOpcoesContas(
          cts
            .filter((c) => !c.archivedAt || contas.includes(c.id))
            .map((c) => ({ id: c.id, nome: c.type === "CREDIT_CARD" ? `${c.name} (cartão)` : c.name, icone: <LogoConta conta={c} tamanho="sm" /> })),
        );
        setOrcamentosMes({ despesas: desp.budgets, receitas: rec.budgets });
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
    // Carrega uma vez ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Componentes possíveis do agrupado: mensais de despesa (não agrupados)
  const possiveisComponentes = useMemo(
    () => orcamentosMes.despesas.filter((b) => !b.isGroup && b.period === "MONTHLY" && b.id !== orcamento?.id),
    [orcamentosMes, orcamento],
  );
  const basesReceita = orcamentosMes.receitas.filter((b) => !b.isGroup && b.period === "MONTHLY");
  const mensal = periodo === "MONTHLY";
  const podePercentual = despesa && mensal && !grupo;
  const metaFixaMensalEditada = editando && mensal && tipoMeta === "FIXED" && orcamento.period === "MONTHLY" && orcamento.fixedGoal !== null;

  // Previsão da meta em %: valor do mês em reais
  const previaPercentual = useMemo(() => {
    const pct = Number(String(percentual).replace(",", "."));
    if (!pct) return null;
    if (tipoMeta === "PERCENT_BUDGET") {
      const b = basesReceita.find((x) => x.id === baseReceita);
      return b ? (Number(b.progress.goal) * pct) / 100 : null;
    }
    return null;
  }, [percentual, tipoMeta, baseReceita, basesReceita]);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!nome.trim()) novos.name = "Dê um nome para o orçamento.";
    if (grupo && componentes.length === 0) novos.componentIds = "Escolha pelo menos um orçamento para agrupar.";
    if (!grupo && tipoMeta === "FIXED" && !paraApi(valor)) novos.amount = "Informe o valor da meta.";
    if (!grupo && tipoMeta !== "FIXED" && !percentual) novos.percent = "Informe o percentual.";
    if (!grupo && tipoMeta === "PERCENT_BUDGET" && !baseReceita) novos.percentOfBudgetId = "Escolha o orçamento de receita.";
    if (!mensal && !fim) novos.endDate = "Escolha a data de fim.";
    if (comAlerta && !(Number(alerta) >= 1 && Number(alerta) <= 100)) novos.alertPercent = "Use de 1% a 100%.";
    setErros(novos);
    setErro("");
    if (Object.keys(novos).length) return;

    const metaPercentual = podePercentual && tipoMeta !== "FIXED";
    const corpo = {
      kind: tipo,
      isGroup: grupo,
      name: nome.trim(),
      color: cor,
      icon: icone,
      period: grupo ? "MONTHLY" : periodo,
      startMonth: grupo || mensal ? inicioMes : null,
      startDate: !grupo && !mensal ? inicio : null,
      endDate: !grupo && !mensal ? fim : null,
      goalType: metaPercentual ? tipoMeta : "FIXED",
      amount: !grupo && !metaPercentual ? paraApi(valor) : null,
      percent: metaPercentual ? String(percentual).replace(",", ".") : null,
      percentOfBudgetId: metaPercentual && tipoMeta === "PERCENT_BUDGET" ? baseReceita : null,
      categoryIds: grupo ? [] : categorias,
      accountIds: grupo || !despesa ? [] : contas,
      componentIds: grupo ? componentes : [],
      includeIgnored: ignoradas,
      includePending: previsto,
      cardDateRef: dataCartao,
      alertPercent: despesa && comAlerta ? Number(alerta) : null,
      showOnHome: noInicio,
    };
    if (editando) corpo.goalFromMonth = mes;

    setSalvando(true);
    try {
      const salvo = editando ? await api(`/budgets/${orcamento.id}`, enviarJson("PUT", corpo)) : await api("/budgets", enviarJson("POST", corpo));
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  const titulo = `${editando ? "Editar" : "Novo"} ${grupo ? "agrupado" : despesa ? "orçamento de despesa" : "orçamento de receita"}`;
  const corSalvar = despesa ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <FolhaCheia titulo={titulo} formId={formId} onFechar={onFechar} salvando={salvando} corSalvar={corSalvar}>
      <form id={formId} onSubmit={salvar} noValidate>
        {(erro || dica) && (
          <div className="space-y-3 px-5 pt-4">
            <Alerta>{erro}</Alerta>
            {dica && (
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                <FaLightbulb aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-amber-600" />
                <p>{dica}</p>
              </div>
            )}
          </div>
        )}

        {/* Descrição + cor/ícone */}
        <Linha
          Icone={FaBarsStaggered}
          idCampo={id("nome")}
          erro={erros.name}
          acao={
            <button
              type="button"
              onClick={() => setJanela("visual")}
              aria-label="Escolher cor e ícone"
              className="flex shrink-0 items-center gap-1 rounded-full p-1 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <IconeOrcamento orcamento={{ color: cor, icon: icone }} tamanho="h-9 w-9 text-base" />
              <FaChevronDown aria-hidden="true" className="text-sm text-slate-500" />
            </button>
          }
        >
          <input
            id={id("nome")}
            aria-label="Descrição"
            placeholder={grupo ? "Descrição, ex.: 50/30/20" : despesa ? "Descrição, ex.: Mercado" : "Descrição, ex.: Salário"}
            maxLength={60}
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={erros.name ? "true" : undefined}
            aria-describedby={erros.name ? `${id("nome")}-erro` : undefined}
            className={classeCampo}
          />
        </Linha>

        {/* Período */}
        {!grupo && (
          <div className="border-b border-slate-100 px-5 py-3">
            <Alternador
              legenda="Período"
              nome={id("periodo")}
              esconderLegenda
              opcoes={[
                { valor: "MONTHLY", texto: "Mensal" },
                { valor: "CUSTOM", texto: "Personalizado" },
              ]}
              valor={periodo}
              onMudar={(v) => {
                setPeriodo(v);
                if (v === "CUSTOM") setTipoMeta("FIXED");
              }}
            />
          </div>
        )}
        {grupo || mensal ? (
          <Linha Icone={FaCalendarDays} rotulo="Vigência a partir de" idCampo={id("vigencia")} erro={erros.startMonth}>
            <input id={id("vigencia")} type="month" required value={inicioMes} onChange={(e) => setInicioMes(e.target.value || mes)} className={classeCampo} />
          </Linha>
        ) : (
          <>
            <Linha Icone={FaCalendarDays} rotulo="Início" idCampo={id("inicio")} erro={erros.startDate}>
              <input id={id("inicio")} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={classeCampo} />
            </Linha>
            <Linha Icone={FaCalendarDays} rotulo="Fim" idCampo={id("fim")} erro={erros.endDate}>
              <input id={id("fim")} type="date" min={inicio} value={fim} onChange={(e) => setFim(e.target.value)} className={classeCampo} />
            </Linha>
          </>
        )}

        {/* Meta */}
        {!grupo && podePercentual && (
          <Linha Icone={FaPercent} rotulo="Meta" idCampo={id("tipo-meta")} erro={erros.goalType}>
            <SelectLimpo id={id("tipo-meta")} value={tipoMeta} onChange={(e) => setTipoMeta(e.target.value)}>
              {Object.entries(NOMES_META).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </SelectLimpo>
          </Linha>
        )}
        {!grupo && (tipoMeta === "FIXED" || !podePercentual) && (
          <>
            <Linha Icone={FaCircleDollarToSlot} rotulo={despesa ? "Limite de gastos" : "Receita esperada"} idCampo={id("valor")} erro={erros.amount}>
              <span aria-hidden="true" className={`mr-1 text-lg font-bold ${despesa ? "text-red-600" : "text-emerald-700"}`}>
                R$
              </span>
              <input
                id={id("valor")}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(mascarar(e.target.value))}
                aria-invalid={erros.amount ? "true" : undefined}
                aria-describedby={erros.amount ? `${id("valor")}-erro` : undefined}
                className={`${classeCampo} text-xl font-bold ${despesa ? "text-red-600" : "text-emerald-700"}`}
              />
            </Linha>
            {metaFixaMensalEditada && (
              <p className="mx-5 mt-2 text-sm text-slate-500">
                Mudando o valor aqui, a meta nova vale de <span className="whitespace-nowrap">{nomeDoMes(mes)}</span> em diante. Para mudar só um mês, use “Alterar meta” nos detalhes.
              </p>
            )}
          </>
        )}
        {!grupo && podePercentual && tipoMeta !== "FIXED" && (
          <>
            <Linha Icone={FaPercent} rotulo="Percentual" idCampo={id("pct")} erro={erros.percent}>
              <input
                id={id("pct")}
                inputMode="decimal"
                autoComplete="off"
                placeholder="30"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))}
                className={`${classeCampo} w-24 flex-none font-bold`}
              />
              <span className="ml-1 text-lg font-bold text-slate-600">%</span>
            </Linha>
            {tipoMeta === "PERCENT_BUDGET" && (
              <Linha Icone={FaCircleDollarToSlot} rotulo="Da meta do orçamento de receita" idCampo={id("base")} erro={erros.percentOfBudgetId}>
                <SelectLimpo id={id("base")} value={baseReceita} onChange={(e) => setBaseReceita(e.target.value)}>
                  <option value="">Escolha...</option>
                  {basesReceita.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatarReais(b.progress.goal)})
                    </option>
                  ))}
                </SelectLimpo>
              </Linha>
            )}
            <p className="mx-5 mt-2 text-sm text-slate-500">
              {tipoMeta === "PERCENT_INCOME"
                ? "A meta muda todo mês: é o percentual do total de receitas confirmadas do mês."
                : basesReceita.length === 0
                  ? "Crie antes um orçamento mensal de receita (ex.: Salário) na aba Receitas."
                  : previaPercentual !== null
                    ? `Em ${nomeDoMes(mes)}, a meta fica em ${formatarReais(previaPercentual)}.`
                    : "A meta acompanha a meta do orçamento de receita escolhido."}
            </p>
          </>
        )}

        {/* Filtros */}
        {!grupo && (
          <>
            <LinhaEscolha
              id={id("cats")}
              Icone={FaShapes}
              rotulo="Categorias"
              resumo={resumoLista(categorias, opcoesCategorias, despesa ? "Todas as despesas" : "Todas as receitas")}
              onAbrir={() => setJanela("categorias")}
              erro={erros.categoryIds}
            />
            {despesa && (
              <LinhaEscolha
                id={id("contas")}
                Icone={FaBuildingColumns}
                rotulo="Contas e cartões"
                resumo={resumoLista(contas, opcoesContas, "Todas as contas e cartões")}
                onAbrir={() => setJanela("contas")}
                erro={erros.accountIds}
              />
            )}
          </>
        )}

        {/* Agrupado: orçamentos que fazem parte */}
        {grupo && (
          <fieldset className="border-b border-slate-100 px-5 py-3">
            <legend className="sr-only">Orçamentos agrupados</legend>
            <p className="flex items-center gap-4 text-sm text-slate-500">
              <FaLayerGroup aria-hidden="true" className="w-6 shrink-0 text-xl" />
              Orçamentos agrupados (mensais de despesa)
            </p>
            {possiveisComponentes.length === 0 && (
              <p className="ml-10 mt-2 text-sm text-slate-600">Crie antes os orçamentos que vão fazer parte (ex.: Essenciais, Prioridades e Estilo de vida).</p>
            )}
            <ul className="ml-10 mt-1">
              {possiveisComponentes.map((b) => (
                <li key={b.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={componentes.includes(b.id)}
                      onChange={() => setComponentes((v) => (v.includes(b.id) ? v.filter((x) => x !== b.id) : [...v, b.id]))}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <IconeOrcamento orcamento={b} tamanho="h-8 w-8 text-sm" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{b.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">{formatarReais(b.progress.goal)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {erros.componentIds && <p className="ml-10 mt-1 text-sm text-red-600">{erros.componentIds}</p>}
          </fieldset>
        )}

        {/* Data das compras no cartão */}
        {despesa && !grupo && (
          <Linha Icone={FaCreditCard} rotulo="Compras no cartão contam pela" idCampo={id("data-cartao")}>
            <SelectLimpo id={id("data-cartao")} value={dataCartao} onChange={(e) => setDataCartao(e.target.value)}>
              <option value="PURCHASE">Data da compra</option>
              <option value="INVOICE">Mês da fatura</option>
            </SelectLimpo>
          </Linha>
        )}

        {/* Alerta */}
        {despesa && (
          <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
            <FaRegBell aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
            <Interruptor texto="Alerta" descricao="Avisa quando o usado chegar a este percentual" ligado={comAlerta} onMudar={setComAlerta} className="min-w-0 flex-1" />
            {comAlerta && (
              <span className="flex shrink-0 items-center">
                <input
                  aria-label="Percentual do alerta"
                  inputMode="numeric"
                  value={alerta}
                  onChange={(e) => setAlerta(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  aria-invalid={erros.alertPercent ? "true" : undefined}
                  className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-right font-bold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                />
                <span className="ml-1 font-bold text-slate-600">%</span>
              </span>
            )}
          </div>
        )}
        {erros.alertPercent && <p className="mx-5 mt-1 text-sm text-red-600">{erros.alertPercent}</p>}

        {/* Interruptores */}
        {!grupo && (
          <LinhaInterruptor
            Icone={FaHourglassHalf}
            texto="Previsto"
            descricao="Lançamentos pendentes também contam"
            ligado={previsto}
            onMudar={setPrevisto}
          />
        )}
        {!grupo && <LinhaInterruptor Icone={FaEyeSlash} texto="Considerar contas ignoradas nos totais" ligado={ignoradas} onMudar={setIgnoradas} />}
        <LinhaInterruptor Icone={FaTableCellsLarge} texto="Exibir no Início" ligado={noInicio} onMudar={setNoInicio} />

        <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
          <FaCircleInfo aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-blue-600" />
          <p>
            {grupo
              ? "A meta e o usado do agrupado são a soma dos orçamentos escolhidos. Se um lançamento entra em dois deles, ele conta nos dois."
              : "Se um lançamento combina com dois orçamentos (ex.: mesma categoria), ele conta nos dois. Transferências e ajustes de saldo nunca contam."}
          </p>
        </div>
      </form>

      {janela === "visual" && (
        <EscolhaVisual
          cor={cor}
          icone={icone}
          onMudar={({ cor: c, icone: i }) => {
            setCor(c);
            setIcone(i);
          }}
          onFechar={() => setJanela(null)}
        />
      )}
      {janela === "categorias" && (
        <EscolhaMultipla
          titulo="Categorias"
          opcoes={opcoesCategorias}
          valor={categorias}
          onMudar={setCategorias}
          onFechar={() => setJanela(null)}
          textoTodas={despesa ? "todas as despesas" : "todas as receitas"}
        />
      )}
      {janela === "contas" && (
        <EscolhaMultipla titulo="Contas e cartões" opcoes={opcoesContas} valor={contas} onMudar={setContas} onFechar={() => setJanela(null)} textoTodas="todas as contas e cartões" />
      )}
    </FolhaCheia>
  );
}

export default FormOrcamento;
