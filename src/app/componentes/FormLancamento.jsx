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
  FaPaperclip,
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
import BotaoApagar from "./BotaoApagar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { FormCategoria } from "../Categorias.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes } from "../../lib/datas.js";

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

// ─────────────────────────────────────────────
// Peças do formulário em linhas (ícone à esquerda, campo à direita)
// ─────────────────────────────────────────────

const classeCampo =
  "w-full min-w-0 bg-transparent py-1 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400";

function EmBreve() {
  return <span className="ml-2 shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">Em breve</span>;
}

// Uma linha do formulário. rotulo: texto pequeno em cima (como no app de referência).
function Linha({ Icone, rotulo, idCampo, erro, children, acao, apagada = false }) {
  return (
    <div className={`border-b border-slate-100 px-5 py-3 ${apagada ? "opacity-70" : ""}`}>
      {rotulo && (
        <label htmlFor={idCampo} className="mb-1 ml-10 block text-sm text-slate-500">
          {rotulo}
        </label>
      )}
      <div className="flex min-h-11 items-center gap-4">
        <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        {acao}
      </div>
      {erro && (
        <p id={`${idCampo}-erro`} className="ml-10 mt-1 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

// Lista de opções sem borda, com a setinha à direita
function SelectLimpo({ id, erro, children, ...props }) {
  return (
    <div className="relative w-full">
      <select
        id={id}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${classeCampo} appearance-none rounded-lg pr-8 focus-visible:ring-4 focus-visible:ring-primary/20`}
        {...props}
      >
        {children}
      </select>
      <FaChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
    </div>
  );
}

// Interruptor de algo que ainda não existe (aparece desligado, com "Em breve")
function InterruptorEmBreve({ Icone, texto }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-400" />
      <Interruptor
        texto={
          <>
            {texto}
            <EmBreve />
          </>
        }
        ligado={false}
        desabilitado
        className="min-w-0 flex-1"
      />
    </div>
  );
}

// Linha de algo que ainda não existe (sem interruptor)
function LinhaEmBreve({ Icone, texto, children }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2 text-slate-400" aria-disabled="true">
      <Icone aria-hidden="true" className="w-6 shrink-0 text-xl" />
      <span className="min-w-0 flex-1 font-medium">
        {texto}
        <EmBreve />
      </span>
      {children}
    </div>
  );
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

function FormReceitaDespesa({ lancamento, tipo, onFechar, onSalvo }) {
  const editando = Boolean(lancamento);
  const ids = useId();
  const id = (nome) => `${ids}-${nome}`;
  const formId = id("form");
  const cores = CORES[tipo];
  const receita = tipo === "INCOME";

  const [descricao, setDescricao] = useState(lancamento?.description ?? "");
  const [valor, setValor] = useState(paraCampo(lancamento?.amount));
  const [repeticao, setRepeticao] = useState("NONE"); // NONE | MULTI | FIXED
  const [modoMulti, setModoMulti] = useState("INSTALLMENT"); // INSTALLMENT (parcelar) | REPEAT (repetir)
  const [vezes, setVezes] = useState("2");
  const [data, setData] = useState(lancamento ? dataLocal(lancamento.date) : hoje());
  const [efetivada, setEfetivada] = useState((lancamento?.status ?? "CONFIRMED") === "CONFIRMED");
  const [categoriaId, setCategoriaId] = useState(lancamento?.category?.id ?? "");
  const [contaId, setContaId] = useState(lancamento?.account.id ?? "");
  const [notas, setNotas] = useState(lancamento?.notes ?? "");
  const [maisInfo, setMaisInfo] = useState(Boolean(lancamento?.notes));

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  // Carrega contas e categorias; num lançamento novo, a primeira conta já vem escolhida
  useEffect(() => {
    Promise.all([api("/accounts"), api("/categories")])
      .then(([listaContas, listaCategorias]) => {
        setContas(listaContas);
        setCategorias(listaCategorias);
        setContaId((atual) => atual || contasComuns(listaContas)[0]?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  const categoriasDoTipo = categorias.filter((c) => c.type === tipo);
  // Num lançamento antigo feito direto num cartão, o cartão continua aparecendo na lista
  const opcoesConta = contas.filter((c) => c.type !== "CREDIT_CARD" || c.id === lancamento?.account.id);

  // Depois de criar uma categoria pelo "+", ela já vem escolhida
  async function categoriaCriada() {
    setNovaCategoria(false);
    try {
      const lista = await api("/categories");
      const nova = lista.find((c) => c.type === tipo && !categorias.some((x) => x.id === c.id));
      setCategorias(lista);
      if (nova) setCategoriaId(nova.id);
    } catch (e) {
      setErro(e.message);
    }
  }

  const numVezes = Number(vezes);
  const centavos = Math.round(Number(paraApi(valor) || 0) * 100);
  let resumoRepeticao = "";
  if (repeticao === "MULTI" && numVezes >= 2 && numVezes <= 48 && centavos > 0) {
    resumoRepeticao =
      modoMulti === "INSTALLMENT"
        ? `${numVezes}x de ${reaisDeCentavos(Math.floor(centavos / numVezes))}${centavos % numVezes ? " (os centavos que sobram vão na 1ª)" : ""}, um por mês.`
        : `${numVezes} meses de ${reaisDeCentavos(centavos)} (total ${reaisDeCentavos(centavos * numVezes)}).`;
  }
  if (repeticao === "FIXED") resumoRepeticao = "Cria este mês e os próximos 11, todo mês no mesmo dia. Os próximos ficam pendentes.";

  async function salvar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!data) novosErros.date = "Escolha a data.";
    if (!contaId) novosErros.accountId = "Escolha a conta.";
    if (repeticao === "MULTI" && !(Number.isInteger(numVezes) && numVezes >= 2 && numVezes <= 48)) novosErros.times = "De 2 a 48 vezes.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      type: tipo,
      amount: quantia,
      description: descricao.trim(),
      date: data,
      accountId: contaId,
      categoryId: categoriaId || null,
      status: efetivada ? "CONFIRMED" : "PENDING",
      notes: notas.trim() || null,
    };
    if (!editando && repeticao === "MULTI") Object.assign(corpo, { recurrence: modoMulti, times: numVezes });
    if (!editando && repeticao === "FIXED") corpo.recurrence = "FIXED";

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

  // Lançamento que faz parte de uma repetição (só ao editar)
  const textoGrupo =
    lancamento?.recurrence === "FIXED"
      ? `${titulos[tipo]} fixa mensal`
      : lancamento?.installmentTotal
        ? `${lancamento.recurrence === "REPEAT" ? "Repetição" : "Parcela"} ${lancamento.installmentNumber}/${lancamento.installmentTotal}`
        : "";

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

        {editando ? (
          textoGrupo && (
            <Linha Icone={FaRepeat} rotulo="Repetição" idCampo={id("repeticao")}>
              <p id={id("repeticao")} className="text-slate-700">
                {textoGrupo} · alterar ou apagar mexe só neste lançamento.
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
          <SelectLimpo id={id("categoria")} erro={erros.categoryId} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categoriasDoTipo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaLayerGroup} rotulo={<>Subcategoria<EmBreve /></>} idCampo={id("subcategoria")} apagada>
          <SelectLimpo id={id("subcategoria")} disabled value="">
            <option value="">Nenhuma</option>
          </SelectLimpo>
        </Linha>

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

        <LinhaEmBreve Icone={FaTags} texto="Tags">
          <FaChevronRight aria-hidden="true" className="text-sm" />
        </LinhaEmBreve>

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
          <InterruptorEmBreve Icone={FaLayerGroup} texto="Multicategorias" />
          <LinhaEmBreve Icone={FaCalendarPlus} texto="Data lançamento">
            <span className="text-sm">Hoje</span>
          </LinhaEmBreve>
          <LinhaEmBreve Icone={FaPercent} texto="Encargos / Desconto" />
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
          <LinhaEmBreve Icone={FaPaperclip} texto="Adicionar anexo" />
          <LinhaEmBreve Icone={FaRegCircleCheck} texto="Não efetivar automaticamente" />
          <InterruptorEmBreve Icone={FaChartColumn} texto="Ignorar em Estatísticas e Gráficos" />
          <InterruptorEmBreve Icone={FaPercent} texto="Ignorar em Orçamentos" />
          <InterruptorEmBreve Icone={FaPiggyBank} texto="Ignorar em Economia mensal" />
          <InterruptorEmBreve Icone={FaEyeSlash} texto="Ignorar nos totais" />
        </div>

        {editando && (
          <div className="flex justify-center pt-6">
            <BotaoApagar texto="Apagar lançamento" pergunta="Apagar este lançamento? Isso não pode ser desfeito." onConfirmar={apagar} carregando={apagando} />
          </div>
        )}
      </form>

      {novaCategoria && <FormCategoria tipoInicial={tipo} onFechar={() => setNovaCategoria(false)} onSalvo={categoriaCriada} />}
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
