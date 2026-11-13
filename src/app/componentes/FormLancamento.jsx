import { useEffect, useId, useState } from "react";
import {
  FaArrowRight,
  FaAlignLeft,
  FaCircleDollarToSlot,
  FaRepeat,
  FaCalendarDays,
  FaCircleCheck,
  FaShapes,
  FaLayerGroup,
  FaBuildingColumns,
  FaTags,
  FaChevronDown,
  FaChevronRight,
  FaPlus,
  FaCalendarPlus,
  FaPercent,
  FaNoteSticky,
  FaRegCircleCheck,
  FaChartColumn,
  FaPiggyBank,
  FaEyeSlash,
  FaArrowsUpDown,
  FaWallet,
} from "react-icons/fa6";
import Modal from "./Modal.jsx";
import FolhaCheia from "./FolhaCheia.jsx";
import Alternador from "./Alternador.jsx";
import Interruptor from "./Interruptor.jsx";
import { classeCampo, Linha, SelectLimpo } from "./LinhasForm.jsx";
import SeletorTags, { ChipsTags } from "./SeletorTags.jsx";
import CamposDivisao from "./CamposDivisao.jsx";
import CampoAnexos from "./CampoAnexos.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { FormCategoria } from "../Categorias.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo, centavosDe } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes } from "../../lib/datas.js";
import { principais, filhasDe, comSubcategorias } from "../../lib/categorias.js";
import { enviarAnexo } from "../../lib/anexos.js";

// Cores do tipo (as mesmas da lista: despesa vermelha, receita verde, transferência âmbar)
const CORES = {
  EXPENSE: { salvar: "bg-red-600 hover:bg-red-700", interruptor: "bg-red-600", texto: "text-red-600" },
  INCOME: { salvar: "bg-emerald-700 hover:bg-emerald-800", interruptor: "bg-emerald-700", texto: "text-emerald-700" },
  TRANSFER: { salvar: "bg-amber-500 hover:bg-amber-600", interruptor: "bg-amber-500", texto: "text-amber-700" },
};

const titulos = { EXPENSE: "Despesa", INCOME: "Receita", TRANSFER: "Transferência" };

// Só contas e carteiras (cartões têm a "Despesa cartão")
const contasComuns = (lista) => lista.filter((c) => c.type !== "CREDIT_CARD");

// Pagamento de fatura: não se edita, só dá para desfazer (apagar)
function PagamentoFatura({ lancamento, onFechar, onSalvo }) {
  const [erro, setErro] = useState("");
  const [apagando, setApagando] = useState(false);

  async function desfazer() {
    setApagando(true);
    try {
      await api(`/transactions/${lancamento.id}`, { method: "DELETE" });
      onSalvo(null);
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  return (
    <Modal titulo="Pagamento de fatura" onFechar={onFechar}>
      <div className="space-y-5">
        <Alerta>{erro}</Alerta>
        <p className="font-heading text-3xl font-bold text-slate-900">{formatarReais(lancamento.amount)}</p>
        <p className="flex flex-wrap items-center gap-2 text-slate-700">
          <strong>{lancamento.account.name}</strong>
          <FaArrowRight aria-label="para" className="text-amber-600" />
          <strong>{lancamento.toAccount?.name}</strong>
        </p>
        <p className="text-slate-600">
          Fatura de <span className="first-letter:uppercase">{nomeDoMes(lancamento.invoiceMonth)}</span>, paga em{" "}
          {new Date(lancamento.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
        <Alerta tipo="info">Para corrigir o valor ou a conta, desfaça o pagamento e pague a fatura de novo.</Alerta>
        <div className="flex justify-center">
          <BotaoApagar
            texto="Desfazer pagamento"
            pergunta="Desfazer este pagamento? O valor volta para a conta e a fatura fica em aberto."
            onConfirmar={desfazer}
            carregando={apagando}
          />
        </div>
      </div>
    </Modal>
  );
}

// Ajuste de saldo (feito em Contas → "Ajustar saldo"): não se edita, só dá para apagar
function AjusteSaldo({ lancamento, onFechar, onSalvo }) {
  const [erro, setErro] = useState("");
  const [apagando, setApagando] = useState(false);
  const entrou = lancamento.type === "INCOME";

  async function apagar() {
    setApagando(true);
    try {
      await api(`/transactions/${lancamento.id}`, { method: "DELETE" });
      onSalvo(null);
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  return (
    <Modal titulo="Ajuste de saldo" onFechar={onFechar}>
      <div className="space-y-5">
        <Alerta>{erro}</Alerta>
        <p className="font-heading text-3xl font-bold text-slate-900">
          {entrou ? "+ " : "− "}
          {formatarReais(lancamento.amount)}
        </p>
        <p className="text-slate-700">
          Na conta <strong>{lancamento.account.name}</strong>, em{" "}
          {new Date(lancamento.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
        <Alerta tipo="info">
          O ajuste acerta o saldo da conta com o do banco e não conta como receita nem despesa do mês. Para corrigir, apague e ajuste o saldo de
          novo em Contas.
        </Alerta>
        <div className="flex justify-center">
          <BotaoApagar
            texto="Apagar ajuste"
            pergunta="Apagar este ajuste? O saldo da conta volta a ser o de antes do ajuste."
            onConfirmar={apagar}
            carregando={apagando}
          />
        </div>
      </div>
    </Modal>
  );
}

// Formulário de lançamento.
// lancamento = null cria um novo (tipoInicial escolhe o tipo); um objeto da API edita (e permite apagar).
function FormLancamento({ lancamento = null, tipoInicial = "EXPENSE", onFechar, onSalvo }) {
  if (lancamento?.isAdjustment) return <AjusteSaldo lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
  if (lancamento?.isInvoicePayment) return <PagamentoFatura lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
  const tipo = lancamento?.type ?? tipoInicial;
  if (tipo === "TRANSFER") return <FormTransferencia lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
  return <FormReceitaDespesa lancamento={lancamento} tipo={tipo} onFechar={onFechar} onSalvo={onSalvo} />;
}

// "1.234,56" a partir de um número de centavos
const reaisDeCentavos = (c) => formatarReais((c / 100).toFixed(2));

// ─────────────────────────────────────────────
// Receita ou despesa (Nova Receita / Nova Despesa)
// ─────────────────────────────────────────────

const REPETICOES = [
  { valor: "NONE", texto: "Não recorrente" },
  { valor: "MULTI", texto: "Parcelar ou repetir" },
  { valor: "FIXED", texto: "Fixa mensal" },
];

// Linha com interruptor (Multicategorias, Ignorar em..., Não efetivar automaticamente)
function LinhaInterruptor({ Icone, texto, descricao, ligado, onMudar, cor }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
      <Interruptor texto={texto} descricao={descricao} ligado={ligado} onMudar={onMudar} corLigado={cor} className="min-w-0 flex-1" />
    </div>
  );
}

const classeDinheiroPequeno =
  "h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-right text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";

// Linhas da multicategoria vindas da API (para editar)
const linhasDaApi = (splits) => (splits ?? []).map((s) => ({ categoryId: s.category?.id ?? "", valor: paraCampo(s.amount) }));

function FormReceitaDespesa({ lancamento, tipo, onFechar, onSalvo }) {
  const editando = Boolean(lancamento);
  const ids = useId();
  const id = (nome) => `${ids}-${nome}`;
  const formId = id("form");
  const cores = CORES[tipo];
  const receita = tipo === "INCOME";

  // Subcategoria: na API a categoria do lançamento é a filha (com parent); no formulário são dois campos
  const categoriaApi = lancamento?.category;
  const [descricao, setDescricao] = useState(lancamento?.description ?? "");
  // Valor digitado (antes de encargos e desconto)
  const [valor, setValor] = useState(paraCampo(lancamento?.baseAmount ?? lancamento?.amount));
  const [repeticao, setRepeticao] = useState("NONE"); // NONE | MULTI | FIXED
  const [modoMulti, setModoMulti] = useState("INSTALLMENT"); // INSTALLMENT (parcelar) | REPEAT (repetir)
  const [vezes, setVezes] = useState("2");
  const [data, setData] = useState(lancamento ? dataLocal(lancamento.date) : hoje());
  const [efetivada, setEfetivada] = useState((lancamento?.status ?? "CONFIRMED") === "CONFIRMED");
  const [categoriaId, setCategoriaId] = useState(categoriaApi?.parentId ?? categoriaApi?.id ?? "");
  const [subcategoriaId, setSubcategoriaId] = useState(categoriaApi?.parentId ? categoriaApi.id : "");
  const [contaId, setContaId] = useState(lancamento?.account.id ?? "");
  const [tagIds, setTagIds] = useState(() => (lancamento?.tags ?? []).map((t) => t.id));
  const [notas, setNotas] = useState(lancamento?.notes ?? "");
  // Mais informações
  const [multi, setMulti] = useState(Boolean(lancamento?.splits?.length));
  const [linhasDivisao, setLinhasDivisao] = useState(() =>
    lancamento?.splits?.length ? linhasDaApi(lancamento.splits) : [{ categoryId: "", valor: "" }, { categoryId: "", valor: "" }],
  );
  const [dataLancamento, setDataLancamento] = useState(lancamento ? (lancamento.launchDate ? dataLocal(lancamento.launchDate) : "") : hoje());
  const [encargos, setEncargos] = useState(paraCampo(lancamento?.fees));
  const [desconto, setDesconto] = useState(paraCampo(lancamento?.discount));
  const [verEncargos, setVerEncargos] = useState(Boolean(lancamento?.fees || lancamento?.discount));
  const [anexosSalvos, setAnexosSalvos] = useState(lancamento?.attachments ?? []);
  const [anexosNovos, setAnexosNovos] = useState([]);
  const [naoEfetivar, setNaoEfetivar] = useState(lancamento?.noAutoConfirm ?? false);
  const [ignorar, setIgnorar] = useState({
    ignoreInStatistics: lancamento?.ignoreInStatistics ?? false,
    ignoreInBudgets: lancamento?.ignoreInBudgets ?? false,
    ignoreInMonthlySavings: lancamento?.ignoreInMonthlySavings ?? false,
    ignoreInTotals: lancamento?.ignoreInTotals ?? false,
  });
  const algumExtra =
    Boolean(lancamento?.notes || lancamento?.splits?.length || lancamento?.fees || lancamento?.discount || lancamento?.attachments?.length || lancamento?.noAutoConfirm) ||
    Object.values(ignorar).some(Boolean);
  const [maisInfo, setMaisInfo] = useState(algumExtra);

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tags, setTags] = useState([]);
  const [escolhendoTags, setEscolhendoTags] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  // Carrega contas, categorias e tags; num lançamento novo, a conta padrão (ou a primeira) já vem escolhida
  useEffect(() => {
    Promise.all([api("/accounts"), api("/categories"), api("/tags")])
      .then(([listaContas, listaCategorias, listaTags]) => {
        setContas(listaContas);
        setCategorias(listaCategorias);
        setTags(listaTags);
        const comuns = contasComuns(listaContas);
        setContaId((atual) => atual || (comuns.find((c) => c.isDefault) ?? comuns[0])?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  const categoriasDoTipo = principais(categorias, tipo);
  const subcategorias = filhasDe(categorias, categoriaId);
  const opcoesDivisao = comSubcategorias(categorias, tipo);
  // Num lançamento antigo feito direto num cartão, o cartão continua aparecendo na lista
  const opcoesConta = contas.filter((c) => c.type !== "CREDIT_CARD" || c.id === lancamento?.account.id);
  const tagsEscolhidas = tags.filter((t) => tagIds.includes(t.id));

  // Depois de criar uma categoria pelo "+", ela já vem escolhida
  async function categoriaCriada() {
    setNovaCategoria(false);
    try {
      const lista = await api("/categories");
      const nova = lista.find((c) => c.type === tipo && !categorias.some((x) => x.id === c.id));
      setCategorias(lista);
      if (nova && !nova.parentId) {
        setCategoriaId(nova.id);
        setSubcategoriaId("");
      }
    } catch (e) {
      setErro(e.message);
    }
  }

  const numVezes = Number(vezes);
  const centavos = centavosDe(valor);
  const centavosEncargos = centavosDe(encargos);
  const centavosDesconto = centavosDe(desconto);
  // Valor final: valor + encargos − desconto (é o que conta em saldos, resumo e orçamentos)
  const centavosFinal = centavos + centavosEncargos - centavosDesconto;
  const parcelado = !editando && repeticao === "MULTI" && modoMulti === "INSTALLMENT";

  let resumoRepeticao = "";
  if (repeticao === "MULTI" && numVezes >= 2 && numVezes <= 48 && centavos > 0) {
    resumoRepeticao =
      modoMulti === "INSTALLMENT"
        ? `${numVezes}x de ${reaisDeCentavos(Math.floor(centavos / numVezes))}${centavos % numVezes ? " (os centavos que sobram vão na 1ª)" : ""}, um por mês.`
        : `${numVezes} meses de ${reaisDeCentavos(centavosFinal)} (total ${reaisDeCentavos(centavosFinal * numVezes)}).`;
  }
  if (repeticao === "FIXED") resumoRepeticao = "Cria este mês e os próximos 11, todo mês no mesmo dia. Os próximos ficam pendentes.";

  async function salvar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    else if (centavosFinal <= 0) novosErros.discount = "O desconto não pode ser maior ou igual ao valor com encargos.";
    if (!data) novosErros.date = "Escolha a data.";
    if (!contaId) novosErros.accountId = "Escolha a conta.";
    if (repeticao === "MULTI" && !(Number.isInteger(numVezes) && numVezes >= 2 && numVezes <= 48)) novosErros.times = "De 2 a 48 vezes.";
    if (parcelado && (multi || centavosEncargos || centavosDesconto)) {
      novosErros.times = "Parcelado não aceita multicategorias, encargos nem desconto.";
    }
    if (multi) {
      const escolhidas = linhasDivisao.map((l) => l.categoryId);
      if (linhasDivisao.length < 2) novosErros.splits = "Escolha pelo menos 2 categorias.";
      else if (escolhidas.some((c) => !c)) novosErros.splits = "Escolha a categoria de cada linha.";
      else if (new Set(escolhidas).size !== escolhidas.length) novosErros.splits = "Não repita a mesma categoria.";
      else if (linhasDivisao.some((l) => centavosDe(l.valor) <= 0)) novosErros.splits = "Cada categoria precisa de um valor maior que zero.";
      else if (linhasDivisao.reduce((s, l) => s + centavosDe(l.valor), 0) !== centavosFinal) {
        novosErros.splits = `A soma das categorias precisa ser igual ao valor final (${reaisDeCentavos(centavosFinal)}).`;
      }
    }
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) {
      if (novosErros.splits || novosErros.discount) setMaisInfo(true);
      return;
    }

    const corpo = {
      type: tipo,
      amount: quantia,
      description: descricao.trim(),
      date: data,
      accountId: contaId,
      categoryId: multi ? null : subcategoriaId || categoriaId || null,
      status: efetivada ? "CONFIRMED" : "PENDING",
      notes: notas.trim() || null,
      splits: multi ? linhasDivisao.map((l) => ({ categoryId: l.categoryId, amount: paraApi(l.valor) })) : null,
      tagIds,
      launchDate: dataLancamento || null,
      fees: centavosEncargos ? paraApi(encargos) : null,
      discount: centavosDesconto ? paraApi(desconto) : null,
      noAutoConfirm: naoEfetivar,
      ...ignorar,
    };
    if (!editando && repeticao === "MULTI") Object.assign(corpo, { recurrence: modoMulti, times: numVezes });
    if (!editando && repeticao === "FIXED") corpo.recurrence = "FIXED";

    setSalvando(true);
    let salvo;
    try {
      salvo = editando
        ? await api(`/transactions/${lancamento.id}`, enviarJson("PATCH", corpo))
        : await api("/transactions", enviarJson("POST", corpo));
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
      return;
    }
    // Anexos novos vão depois que o lançamento existe (na repetição, ficam no 1º)
    const falhas = [];
    for (const arquivo of anexosNovos) {
      try {
        await enviarAnexo(salvo.id, arquivo);
      } catch (falha) {
        falhas.push(`${arquivo.name}: ${falha.message}`);
      }
    }
    if (falhas.length) window.alert(`O lançamento foi salvo, mas alguns anexos não foram enviados:\n${falhas.join("\n")}`);
    onSalvo(salvo);
  }

  async function removerAnexoSalvo(anexo) {
    if (!window.confirm(`Remover o anexo “${anexo.originalName}”?`)) return;
    try {
      await api(`/attachments/${anexo.id}`, { method: "DELETE" });
      setAnexosSalvos((lista) => lista.filter((a) => a.id !== anexo.id));
    } catch (falha) {
      setErro(falha.message);
    }
  }

  async function apagar(escopo) {
    setApagando(true);
    try {
      const sufixo = escopo === "futuros" ? "?escopo=futuros" : "";
      await api(`/transactions/${lancamento.id}${sufixo}`, { method: "DELETE" });
      onSalvo(null);
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  // Lançamento que faz parte de uma repetição (só ao editar)
  const textoGrupo =
    lancamento?.recurrence === "FIXED"
      ? `${titulos[tipo]} fixa mensal`
      : lancamento?.installmentTotal
        ? `${lancamento.recurrence === "REPEAT" ? "Repetição" : "Parcela"} ${lancamento.installmentNumber}/${lancamento.installmentTotal}`
        : "";

  const ligarMulti = (ligado) => {
    setMulti(ligado);
    // Ao ligar, a 1ª linha já vem com a categoria escolhida e o valor todo
    if (ligado && !linhasDivisao.some((l) => l.categoryId || l.valor)) {
      setLinhasDivisao([
        { categoryId: subcategoriaId || categoriaId || "", valor: centavosFinal > 0 ? mascarar(String(centavosFinal)) : "" },
        { categoryId: "", valor: "" },
      ]);
    }
  };
  const mudarIgnorar = (campo) => (v) => setIgnorar((atual) => ({ ...atual, [campo]: v }));

  return (
    <FolhaCheia
      titulo={editando ? `Editar ${titulos[tipo].toLowerCase()}` : `Nova ${titulos[tipo]}`}
      formId={formId}
      onFechar={onFechar}
      salvando={salvando}
      corSalvar={cores.salvar}
    >
      <form id={formId} onSubmit={salvar} noValidate>
        {erro && (
          <div className="px-5 pt-4">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        <Linha Icone={FaAlignLeft} idCampo={id("descricao")} erro={erros.description}>
          <input
            id={id("descricao")}
            aria-label="Descrição"
            placeholder="Descrição"
            maxLength={120}
            autoComplete="off"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            aria-invalid={erros.description ? "true" : undefined}
            aria-describedby={erros.description ? `${id("descricao")}-erro` : undefined}
            className={classeCampo}
          />
        </Linha>

        <Linha Icone={FaCircleDollarToSlot} idCampo={id("valor")} erro={erros.amount}>
          <span aria-hidden="true" className={`mr-1 text-2xl font-bold ${cores.texto}`}>
            R$
          </span>
          <input
            id={id("valor")}
            aria-label="Valor em reais"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(mascarar(e.target.value))}
            aria-invalid={erros.amount ? "true" : undefined}
            aria-describedby={erros.amount ? `${id("valor")}-erro` : undefined}
            className={`${classeCampo} text-2xl font-bold ${cores.texto}`}
          />
        </Linha>
        {(centavosEncargos > 0 || centavosDesconto > 0) && (
          <p className="border-b border-slate-100 px-5 py-2 pl-[3.75rem] text-sm text-slate-600">
            Valor final: <strong className="whitespace-nowrap text-slate-900">{reaisDeCentavos(Math.max(0, centavosFinal))}</strong>
          </p>
        )}

        {editando ? (
          textoGrupo && (
            <Linha Icone={FaRepeat} rotulo="Repetição" idCampo={id("repeticao")}>
              <p id={id("repeticao")} className="text-slate-700">
                {textoGrupo} · alterar mexe só neste lançamento.
              </p>
            </Linha>
          )
        ) : (
          <Linha Icone={FaRepeat} rotulo="Repetição" idCampo={id("repeticao")}>
            <SelectLimpo id={id("repeticao")} value={repeticao} onChange={(e) => setRepeticao(e.target.value)}>
              {REPETICOES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.texto}
                </option>
              ))}
            </SelectLimpo>
          </Linha>
        )}

        {!editando && repeticao === "MULTI" && (
          <div className="space-y-3 border-b border-slate-100 bg-soft/50 px-5 py-4 pl-[3.75rem]">
            <Alternador
              legenda="Como repetir"
              esconderLegenda
              nome={id("modo")}
              opcoes={[
                { valor: "INSTALLMENT", texto: "Parcelar" },
                { valor: "REPEAT", texto: "Repetir" },
              ]}
              valor={modoMulti}
              onMudar={setModoMulti}
            />
            <div className="flex items-center gap-3">
              <label htmlFor={id("vezes")} className="font-medium text-slate-800">
                Quantas vezes
              </label>
              <input
                id={id("vezes")}
                type="number"
                inputMode="numeric"
                min={2}
                max={48}
                value={vezes}
                onChange={(e) => setVezes(e.target.value)}
                aria-invalid={erros.times ? "true" : undefined}
                className="h-11 w-20 rounded-xl border border-slate-300 bg-white px-3 text-center text-lg text-slate-900 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
              />
              <span className="text-sm text-slate-500">de 2 a 48</span>
            </div>
            {erros.times && <p className="text-sm text-red-600">{erros.times}</p>}
            {resumoRepeticao && <p className="text-sm text-slate-600">{resumoRepeticao}</p>}
          </div>
        )}
        {!editando && repeticao === "FIXED" && <p className="border-b border-slate-100 bg-soft/50 px-5 py-3 pl-[3.75rem] text-sm text-slate-600">{resumoRepeticao}</p>}

        <Linha Icone={FaCalendarDays} rotulo="Data (vencimento)" idCampo={id("data")} erro={erros.date}>
          <input id={id("data")} type="date" value={data} onChange={(e) => setData(e.target.value)} className={classeCampo} />
        </Linha>

        <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
          <FaCircleCheck aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
          <Interruptor
            texto="Efetivada"
            descricao={efetivada ? (receita ? "Já recebida" : "Já paga") : "Pendente"}
            ligado={efetivada}
            onMudar={setEfetivada}
            corLigado={cores.interruptor}
            className="min-w-0 flex-1"
          />
        </div>

        {multi ? (
          <Linha Icone={FaShapes} rotulo="Categoria" idCampo={id("categoria")}>
            <button
              id={id("categoria")}
              type="button"
              onClick={() => setMaisInfo(true)}
              className="min-h-11 text-left text-lg text-slate-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              Várias categorias ({linhasDivisao.length}) · veja em Multicategorias
            </button>
          </Linha>
        ) : (
          <>
            <Linha
              Icone={FaShapes}
              rotulo="Categoria"
              idCampo={id("categoria")}
              erro={erros.categoryId}
              acao={
                <button
                  type="button"
                  onClick={() => setNovaCategoria(true)}
                  aria-label="Criar categoria"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-slate-600 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <FaPlus aria-hidden="true" />
                </button>
              }
            >
              <SelectLimpo
                id={id("categoria")}
                erro={erros.categoryId}
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value);
                  setSubcategoriaId("");
                }}
              >
                <option value="">Sem categoria</option>
                {categoriasDoTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectLimpo>
            </Linha>

            <Linha Icone={FaLayerGroup} rotulo="Subcategoria" idCampo={id("subcategoria")} apagada={subcategorias.length === 0}>
              <SelectLimpo
                id={id("subcategoria")}
                disabled={subcategorias.length === 0}
                value={subcategoriaId}
                onChange={(e) => setSubcategoriaId(e.target.value)}
              >
                <option value="">{subcategorias.length ? "Nenhuma" : "Esta categoria não tem subcategorias"}</option>
                {subcategorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectLimpo>
            </Linha>
          </>
        )}

        <Linha Icone={FaBuildingColumns} rotulo="Conta" idCampo={id("conta")} erro={erros.accountId}>
          <SelectLimpo id={id("conta")} erro={erros.accountId} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.length === 0 && <option value="">Carregando...</option>}
            {opcoesConta.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <div className="border-b border-slate-100 px-5 py-2">
          <button
            type="button"
            onClick={() => setEscolhendoTags(true)}
            className="flex min-h-11 w-full items-center gap-4 rounded-xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            aria-label={`Tags: ${tagsEscolhidas.length ? tagsEscolhidas.map((t) => t.name).join(", ") : "nenhuma"}. Escolher tags`}
          >
            <FaTags aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-500">Tags</span>
              <ChipsTags tags={tagsEscolhidas} />
            </span>
            <FaChevronRight aria-hidden="true" className="shrink-0 text-sm text-slate-500" />
          </button>
          {erros.tagIds && <p className="ml-10 mt-1 text-sm text-red-600">{erros.tagIds}</p>}
        </div>

        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={() => setMaisInfo((v) => !v)}
            aria-expanded={maisInfo}
            aria-controls={id("mais")}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-bold transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${cores.texto}`}
          >
            Mais informações
            <FaChevronDown aria-hidden="true" className={`text-sm transition-transform ${maisInfo ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div id={id("mais")} hidden={!maisInfo}>
          <LinhaInterruptor
            Icone={FaLayerGroup}
            texto="Multicategorias"
            descricao={multi ? "Divida o valor entre categorias" : "Uma categoria só"}
            ligado={multi}
            onMudar={ligarMulti}
            cor={cores.interruptor}
          />
          {multi && <CamposDivisao linhas={linhasDivisao} onMudar={setLinhasDivisao} opcoes={opcoesDivisao} totalCentavos={centavosFinal} erro={erros.splits} />}

          <Linha Icone={FaCalendarPlus} rotulo="Data lançamento" idCampo={id("data-lancamento")} erro={erros.launchDate}>
            <input
              id={id("data-lancamento")}
              type="date"
              value={dataLancamento}
              onChange={(e) => setDataLancamento(e.target.value)}
              className={classeCampo}
            />
          </Linha>

          <div className="border-b border-slate-100 px-5 py-2">
            <button
              type="button"
              onClick={() => setVerEncargos((v) => !v)}
              aria-expanded={verEncargos}
              aria-controls={id("encargos")}
              className="flex min-h-11 w-full items-center gap-4 rounded-xl text-left font-medium text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <FaPercent aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
              <span className="min-w-0 flex-1">
                Encargos / Desconto
                {(centavosEncargos > 0 || centavosDesconto > 0) && (
                  <span className="block whitespace-nowrap text-sm text-slate-500">
                    {centavosEncargos > 0 && `+ ${reaisDeCentavos(centavosEncargos)}`}
                    {centavosEncargos > 0 && centavosDesconto > 0 && " · "}
                    {centavosDesconto > 0 && `− ${reaisDeCentavos(centavosDesconto)}`}
                  </span>
                )}
              </span>
              <FaChevronDown aria-hidden="true" className={`shrink-0 text-sm text-slate-500 transition-transform ${verEncargos ? "rotate-180" : ""}`} />
            </button>
            <div id={id("encargos")} hidden={!verEncargos} className="ml-10 space-y-2 pb-2 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={id("encargos-valor")} className="mb-1 block text-sm text-slate-500">
                    Encargos (juros/multa)
                  </label>
                  <input
                    id={id("encargos-valor")}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0,00"
                    value={encargos}
                    onChange={(e) => setEncargos(mascarar(e.target.value))}
                    className={classeDinheiroPequeno}
                  />
                </div>
                <div>
                  <label htmlFor={id("desconto-valor")} className="mb-1 block text-sm text-slate-500">
                    Desconto
                  </label>
                  <input
                    id={id("desconto-valor")}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0,00"
                    value={desconto}
                    onChange={(e) => setDesconto(mascarar(e.target.value))}
                    aria-invalid={erros.discount ? "true" : undefined}
                    className={classeDinheiroPequeno}
                  />
                </div>
              </div>
              <dl className="space-y-0.5 text-sm text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt>Valor</dt>
                  <dd className="whitespace-nowrap">{reaisDeCentavos(centavos)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>+ Encargos</dt>
                  <dd className="whitespace-nowrap">{reaisDeCentavos(centavosEncargos)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>− Desconto</dt>
                  <dd className="whitespace-nowrap">{reaisDeCentavos(centavosDesconto)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-slate-200 pt-1 font-bold text-slate-900">
                  <dt>Valor final</dt>
                  <dd className="whitespace-nowrap">{reaisDeCentavos(centavosFinal)}</dd>
                </div>
              </dl>
              {erros.discount && <p className="text-sm text-red-600">{erros.discount}</p>}
            </div>
          </div>

          <Linha Icone={FaNoteSticky} rotulo="Observações" idCampo={id("notas")} erro={erros.notes}>
            <textarea
              id={id("notas")}
              rows={3}
              maxLength={1000}
              placeholder="Escreva um detalhe, se quiser"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={`${classeCampo} resize-y text-base`}
            />
          </Linha>

          <CampoAnexos
            salvos={anexosSalvos}
            novos={anexosNovos}
            onAdicionar={(arquivos) => setAnexosNovos((lista) => [...lista, ...arquivos])}
            onRemoverNovo={(i) => setAnexosNovos((lista) => lista.filter((_, j) => j !== i))}
            onRemoverSalvo={removerAnexoSalvo}
          />

          <LinhaInterruptor
            Icone={FaRegCircleCheck}
            texto="Não efetivar automaticamente"
            descricao="Ligado: fica pendente até você confirmar, mesmo depois da data."
            ligado={naoEfetivar}
            onMudar={setNaoEfetivar}
            cor={cores.interruptor}
          />
          <LinhaInterruptor
            Icone={FaChartColumn}
            texto="Ignorar em Estatísticas e Gráficos"
            ligado={ignorar.ignoreInStatistics}
            onMudar={mudarIgnorar("ignoreInStatistics")}
            cor={cores.interruptor}
          />
          <LinhaInterruptor Icone={FaPercent} texto="Ignorar em Orçamentos" ligado={ignorar.ignoreInBudgets} onMudar={mudarIgnorar("ignoreInBudgets")} cor={cores.interruptor} />
          <LinhaInterruptor
            Icone={FaPiggyBank}
            texto="Ignorar em Economia mensal"
            ligado={ignorar.ignoreInMonthlySavings}
            onMudar={mudarIgnorar("ignoreInMonthlySavings")}
            cor={cores.interruptor}
          />
          <LinhaInterruptor
            Icone={FaEyeSlash}
            texto="Ignorar nos totais"
            descricao="Fica fora das receitas/despesas do mês; o saldo da conta continua considerando."
            ligado={ignorar.ignoreInTotals}
            onMudar={mudarIgnorar("ignoreInTotals")}
            cor={cores.interruptor}
          />
        </div>

        {editando && (
          <div className="flex justify-center pt-6">
            {lancamento.groupId ? (
              <BotaoApagar
                texto="Apagar lançamento"
                pergunta="Este lançamento se repete. Apagar só este ou este e os próximos? Os anexos vão junto e isso não pode ser desfeito."
                opcoes={[
                  { rotulo: "Só este", valor: "este" },
                  { rotulo: "Este e os próximos", valor: "futuros" },
                ]}
                onConfirmar={apagar}
                carregando={apagando}
              />
            ) : (
              <BotaoApagar texto="Apagar lançamento" pergunta="Apagar este lançamento (e os anexos dele)? Isso não pode ser desfeito." onConfirmar={apagar} carregando={apagando} />
            )}
          </div>
        )}
      </form>

      {novaCategoria && <FormCategoria tipoInicial={tipo} onFechar={() => setNovaCategoria(false)} onSalvo={categoriaCriada} />}
      {escolhendoTags && (
        <SeletorTags
          tags={tags}
          escolhidas={tagIds}
          onMudar={setTagIds}
          onCriada={(nova) => setTags((lista) => [...lista, nova].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}
          onFechar={() => setEscolhendoTags(false)}
        />
      )}
    </FolhaCheia>
  );
}

// ─────────────────────────────────────────────
// Transferência entre contas (mesmo visual, campos próprios)
// ─────────────────────────────────────────────

function FormTransferencia({ lancamento, onFechar, onSalvo }) {
  const editando = Boolean(lancamento);
  const ids = useId();
  const id = (nome) => `${ids}-${nome}`;
  const formId = id("form");
  const cores = CORES.TRANSFER;

  const [valor, setValor] = useState(paraCampo(lancamento?.amount));
  const [descricao, setDescricao] = useState(lancamento?.description ?? "");
  const [data, setData] = useState(lancamento ? dataLocal(lancamento.date) : hoje());
  const [contaId, setContaId] = useState(lancamento?.account.id ?? "");
  const [destinoId, setDestinoId] = useState(lancamento?.toAccount?.id ?? "");
  const [efetivada, setEfetivada] = useState((lancamento?.status ?? "CONFIRMED") === "CONFIRMED");
  const [notas, setNotas] = useState(lancamento?.notes ?? "");

  const [contas, setContas] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    api("/accounts")
      .then((lista) => {
        const comuns = contasComuns(lista);
        setContas(comuns);
        setContaId((atual) => atual || comuns[0]?.id || "");
        setDestinoId((atual) => atual || comuns[1]?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  async function salvar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!data) novosErros.date = "Escolha a data.";
    if (!contaId) novosErros.accountId = "Escolha a conta de origem.";
    if (!destinoId) novosErros.toAccountId = "Escolha a conta de destino.";
    else if (destinoId === contaId) novosErros.toAccountId = "Escolha uma conta diferente da de origem.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      type: "TRANSFER",
      amount: quantia,
      description: descricao.trim(),
      date: data,
      accountId: contaId,
      toAccountId: destinoId,
      categoryId: null,
      status: efetivada ? "CONFIRMED" : "PENDING",
      notes: notas.trim() || null,
    };
    setSalvando(true);
    try {
      const salvo = editando
        ? await api(`/transactions/${lancamento.id}`, enviarJson("PATCH", corpo))
        : await api("/transactions", enviarJson("POST", corpo));
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function apagar() {
    setApagando(true);
    try {
      await api(`/transactions/${lancamento.id}`, { method: "DELETE" });
      onSalvo(null);
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  const poucasContas = contas.length > 0 && contas.length < 2;

  return (
    <FolhaCheia
      titulo={editando ? "Editar transferência" : "Nova Transferência"}
      formId={formId}
      onFechar={onFechar}
      salvando={salvando}
      corSalvar={cores.salvar}
    >
      <form id={formId} onSubmit={salvar} noValidate>
        {(erro || poucasContas) && (
          <div className="space-y-3 px-5 pt-4">
            <Alerta>{erro}</Alerta>
            {poucasContas && <Alerta tipo="info">Para transferir, você precisa de pelo menos duas contas. Cadastre outra em Contas.</Alerta>}
          </div>
        )}

        <Linha Icone={FaCircleDollarToSlot} idCampo={id("valor")} erro={erros.amount}>
          <span aria-hidden="true" className={`mr-1 text-2xl font-bold ${cores.texto}`}>
            R$
          </span>
          <input
            id={id("valor")}
            aria-label="Valor em reais"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(mascarar(e.target.value))}
            aria-invalid={erros.amount ? "true" : undefined}
            className={`${classeCampo} text-2xl font-bold ${cores.texto}`}
          />
        </Linha>

        <Linha Icone={FaWallet} rotulo="De (origem)" idCampo={id("origem")} erro={erros.accountId}>
          <SelectLimpo id={id("origem")} erro={erros.accountId} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.length === 0 && <option value="">Carregando...</option>}
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaArrowsUpDown} rotulo="Para (destino)" idCampo={id("destino")} erro={erros.toAccountId}>
          <SelectLimpo id={id("destino")} erro={erros.toAccountId} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Escolha a conta</option>
            {contas
              .filter((c) => c.id !== contaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaAlignLeft} idCampo={id("descricao")} erro={erros.description}>
          <input
            id={id("descricao")}
            aria-label="Descrição (opcional)"
            placeholder="Descrição (opcional)"
            maxLength={120}
            autoComplete="off"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={classeCampo}
          />
        </Linha>

        <Linha Icone={FaCalendarDays} rotulo="Data" idCampo={id("data")} erro={erros.date}>
          <input id={id("data")} type="date" value={data} onChange={(e) => setData(e.target.value)} className={classeCampo} />
        </Linha>

        <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
          <FaCircleCheck aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
          <Interruptor
            texto="Efetivada"
            descricao={efetivada ? "Já feita" : "Pendente"}
            ligado={efetivada}
            onMudar={setEfetivada}
            corLigado={cores.interruptor}
            className="min-w-0 flex-1"
          />
        </div>

        <Linha Icone={FaNoteSticky} rotulo="Observações" idCampo={id("notas")} erro={erros.notes}>
          <textarea
            id={id("notas")}
            rows={2}
            maxLength={1000}
            placeholder="Escreva um detalhe, se quiser"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={`${classeCampo} resize-y text-base`}
          />
        </Linha>

        {editando && (
          <div className="flex justify-center pt-6">
            <BotaoApagar texto="Apagar transferência" pergunta="Apagar esta transferência? Isso não pode ser desfeito." onConfirmar={apagar} carregando={apagando} />
          </div>
        )}
      </form>
    </FolhaCheia>
  );
}

export default FormLancamento;
