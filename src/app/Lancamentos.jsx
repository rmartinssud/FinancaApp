import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaReceipt, FaArrowsUpDown, FaArrowRight, FaCreditCard, FaScaleBalanced, FaCircleMinus, FaCirclePlus, FaListUl, FaXmark } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import SeletorMes from "./componentes/SeletorMes.jsx";
import FormLancamento from "./componentes/FormLancamento.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import LogoConta from "./componentes/LogoConta.jsx";
import { useMe } from "./useMe.js";
import { QuemLancou } from "./componentes/Avatar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { dataLocal, mesAtual, nomeDoDia } from "../lib/datas.js";
import { textoParcela, dataCurta, SITUACOES, COR_PADRAO } from "../lib/cartoes.js";

// Abas da barra de baixo (como no app de referência). "" = Extrato (tudo).
const ABAS = [
  { valor: "EXPENSE", texto: "Despesas", Icone: FaCircleMinus, ativa: "text-red-600", fundo: "bg-red-100" },
  { valor: "INCOME", texto: "Receitas", Icone: FaCirclePlus, ativa: "text-emerald-700", fundo: "bg-emerald-100" },
  { valor: "TRANSFER", texto: "Transfs", Icone: FaArrowsUpDown, ativa: "text-amber-700", fundo: "bg-amber-100" },
  { valor: "", texto: "Extrato", Icone: FaListUl, ativa: "text-primary", fundo: "bg-soft" },
];

// Texto do total no topo, conforme a aba
const ROTULO_TOTAL = { EXPENSE: "Total de despesas", INCOME: "Total de receitas", TRANSFER: "Total transferido", "": "Saldo do mês" };
const NOME_ABA = { EXPENSE: "Despesas", INCOME: "Receitas", TRANSFER: "Transferências", "": "Extrato" };
const VAZIO_ABA = { EXPENSE: "Nenhuma despesa neste mês", INCOME: "Nenhuma receita neste mês", TRANSFER: "Nenhuma transferência neste mês" };

// Como ler cada lançamento (para o leitor de tela e o rótulo do botão)
function tipoEmTexto(l) {
  if (l.isAdjustment) return "ajuste de saldo";
  if (l.isInvoicePayment) return "pagamento de fatura";
  if (l.type === "TRANSFER") return "transferência";
  return l.type === "INCOME" ? "receita" : "despesa";
}

// Selo pequeno ao lado da descrição (2/10 nas parcelas, "Fixa" na fixa mensal)
function Selo({ children }) {
  return <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">{children}</span>;
}

// Nome da conta com o logo do banco pequeno na frente (se tiver logo)
function ChipConta({ conta }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {conta.bankLogo && <LogoConta conta={conta} tamanho="xs" />}
      <span className="truncate">{conta.name}</span>
    </span>
  );
}

// Transferência (ou pagamento de fatura): ícone âmbar e "Conta A → Conta B"
function LinhaTransferencia({ l }) {
  return (
    <>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-lg text-amber-600">
        <FaArrowsUpDown />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">{l.description}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
          <ChipConta conta={l.account} />
          <FaArrowRight aria-label="para" className="shrink-0 text-xs text-amber-600" />
          {l.toAccount && <ChipConta conta={l.toAccount} />}
          {l.status === "PENDING" && <span className="shrink-0"> · pendente</span>}
        </span>
      </span>
      <span className="shrink-0 font-bold text-amber-700">
        <span className="sr-only">Transferência de </span>
        {formatarReais(l.amount)}
      </span>
    </>
  );
}

// Ajuste de saldo: visual neutro (não é receita nem despesa do mês)
function LinhaAjuste({ l }) {
  const entrou = l.type === "INCOME";
  return (
    <>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-600">
        <FaScaleBalanced />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">Ajuste de saldo</span>
        <span className="block truncate text-sm text-slate-500">{l.account.name} · não conta no mês</span>
      </span>
      <span className="shrink-0 font-bold text-slate-600">
        <span className="sr-only">{entrou ? "Ajuste para mais de" : "Ajuste para menos de"} </span>
        <span aria-hidden="true">{entrou ? "+ " : "− "}</span>
        {formatarReais(l.amount)}
      </span>
    </>
  );
}

// Conteúdo de uma linha da lista (ícone, descrição, conta e valor)
function ConteudoLinha({ l, mostrarQuem }) {
  if (l.isAdjustment) return <LinhaAjuste l={l} />;
  if (l.type === "TRANSFER") return <LinhaTransferencia l={l} />;
  const receita = l.type === "INCOME";
  const parcela = textoParcela(l);
  return (
    <>
      <IconeCategoria categoria={l.category} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">
          {l.description}
          {parcela && <Selo>{parcela}</Selo>}
          {l.recurrence === "FIXED" && <Selo>Fixa</Selo>}
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate text-sm text-slate-500">
          <span className="truncate">{l.category?.name ?? "Sem categoria"} ·</span> <ChipConta conta={l.account} />
          {l.status === "PENDING" && " · pendente"}
          {mostrarQuem && <QuemLancou pessoa={l.createdBy} />}
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

// Fatura do cartão no mês (no lugar das compras uma a uma). Toque abre a fatura.
function LinhaFatura({ f }) {
  const situacao = SITUACOES[f.status];
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white"
        style={{ backgroundColor: f.color ?? COR_PADRAO }}
      >
        <FaCreditCard />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-bold text-slate-900">Fatura {f.cardName}</span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
          {f.dueDate && <span className="truncate">Vence {dataCurta(f.dueDate)}</span>}
          {situacao && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${situacao.classe}`}>{situacao.texto}</span>}
        </span>
      </span>
      <span className="shrink-0 font-bold text-red-600">
        <span className="sr-only">Total da fatura: </span>
        <span aria-hidden="true">− </span>
        {formatarReais(f.total)}
      </span>
    </>
  );
}

// Barra de filtros fixa embaixo da tela (Despesas · Receitas · Transfs · Extrato)
function BarraFiltros({ aba, onMudar }) {
  return (
    <nav
      aria-label="Filtrar lançamentos"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(70,79,163,0.25)] backdrop-blur lg:left-72"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {ABAS.map(({ valor, texto, Icone, ativa, fundo }) => {
          const atual = aba === valor;
          return (
            <li key={texto} className="flex">
              <button
                type="button"
                aria-pressed={atual}
                onClick={() => onMudar(valor)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/30 ${
                  atual ? ativa : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span aria-hidden="true" className={`flex h-7 w-14 items-center justify-center rounded-full text-lg transition ${atual ? fundo : ""}`}>
                  <Icone />
                </span>
                {texto}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

// Lista de lançamentos do mês, agrupada por dia.
// Aceita na URL (ex.: vindo do Início): ?mes=2026-11&aba=EXPENSE&categoria=<id ou "none" = sem categoria>
function Lancamentos() {
  const { erroMe, podeEditar, compartilhado } = useMe();
  const [busca, setBusca] = useSearchParams();
  const [mes, setMes] = useState(() => (MES_VALIDO.test(busca.get("mes") ?? "") ? busca.get("mes") : mesAtual()));
  const [aba, setAba] = useState(() => (ABAS.some((a) => a.valor === busca.get("aba")) ? busca.get("aba") : ""));
  // Filtro por categoria (mostra as compras no cartão uma a uma, como o filtro "Pessoa")
  const categoria = busca.get("categoria") ?? "";
  const [nomeCategoria, setNomeCategoria] = useState("");
  // Filtro "Pessoa" (só em espaço com mais de uma pessoa): mostra as compras no cartão uma a uma
  const [pessoa, setPessoa] = useState("");
  const [pessoas, setPessoas] = useState([]);
  const [lista, setLista] = useState(null);
  const [faturas, setFaturas] = useState([]);
  const [erro, setErro] = useState("");
  // null = janela fechada; objeto = editando
  const [edicao, setEdicao] = useState(null);

  const comFaturas = !pessoa && !categoria && (aba === "" || aba === "EXPENSE");

  // Nome da categoria do filtro (para o selo no topo)
  useEffect(() => {
    if (!categoria) return undefined;
    if (categoria === "none") {
      setNomeCategoria("Sem categoria");
      return undefined;
    }
    let ativo = true;
    api("/categories")
      .then((lista) => ativo && setNomeCategoria(lista.find((c) => c.id === categoria)?.name ?? "Categoria"))
      .catch(() => ativo && setNomeCategoria("Categoria"));
    return () => {
      ativo = false;
    };
  }, [categoria]);

  const limparCategoria = () => {
    const nova = new URLSearchParams(busca);
    nova.delete("categoria");
    setBusca(nova, { replace: true });
  };

  useEffect(() => {
    if (!compartilhado) return;
    api("/family")
      .then((f) => setPessoas(f.members))
      .catch(() => setPessoas([]));
  }, [compartilhado]);

  const carregar = useCallback(() => {
    setErro("");
    const filtroTipo =
      (aba ? `&type=${aba}` : "") +
      (pessoa ? `&createdById=${encodeURIComponent(pessoa)}` : "") +
      (categoria ? `&categoryId=${encodeURIComponent(categoria)}` : "");
    Promise.all([api(`/transactions?month=${mes}${filtroTipo}`), comFaturas ? api(`/transactions/invoices?month=${mes}`) : []])
      .then(([lancamentos, listaFaturas]) => {
        setLista(lancamentos);
        setFaturas(listaFaturas);
      })
      .catch((e) => setErro(e.message));
  }, [mes, aba, pessoa, categoria, comFaturas]);

  useEffect(() => {
    setLista(null);
    carregar();
  }, [carregar]);

  // Junta lançamentos e faturas por dia (em Brasília), do mais recente para o mais antigo.
  // A fatura entra no dia do vencimento.
  const dias = useMemo(() => {
    const itens = [
      ...(lista ?? []).map((l) => ({ chave: l.id, dia: dataLocal(l.date), lancamento: l })),
      ...faturas.map((f) => ({ chave: `fatura-${f.cardId}`, dia: f.dueDate ? dataLocal(f.dueDate) : `${f.month}-01`, fatura: f })),
    ].sort((a, b) => (a.dia === b.dia ? 0 : a.dia < b.dia ? 1 : -1));
    const grupos = new Map();
    for (const item of itens) {
      if (!grupos.has(item.dia)) grupos.set(item.dia, []);
      grupos.get(item.dia).push(item);
    }
    return [...grupos.entries()];
  }, [lista, faturas]);

  // Total da visão atual. Ajustes de saldo não contam (não são receita nem despesa).
  const total = useMemo(() => {
    const soma = (filtro) => (lista ?? []).filter((l) => !l.isAdjustment && filtro(l)).reduce((s, l) => s + Number(l.amount), 0);
    const somaFaturas = faturas.reduce((s, f) => s + Number(f.total), 0);
    const receitas = soma((l) => l.type === "INCOME");
    const despesas = soma((l) => l.type === "EXPENSE") + somaFaturas;
    if (aba === "EXPENSE") return despesas;
    if (aba === "INCOME") return receitas;
    if (aba === "TRANSFER") return soma((l) => l.type === "TRANSFER");
    return receitas - despesas;
  }, [lista, faturas, aba]);

  const vazio = lista?.length === 0 && faturas.length === 0;
  const classeLinha = "flex w-full items-center gap-3 rounded-2xl px-2 py-3";
  const classeBotao = `${classeLinha} transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30`;

  return (
    <AppLayout onLancamentoSalvo={carregar} barraInferior={<BarraFiltros aba={aba} onMudar={setAba} />}>
      <Alerta>{erroMe || erro}</Alerta>

      {/* Topo: título, total da visão e mês */}
      <header className="overflow-hidden rounded-3xl bg-primary text-white shadow-[0_20px_50px_-12px_rgba(70,79,163,0.45)]">
        <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h1 className="font-heading text-2xl font-bold md:text-4xl">Lançamentos</h1>
              <BotaoAjuda artigo="lancamentos" assunto="lançamentos" claro />
            </div>
            <p className="mt-1 text-sm text-white/80">{NOME_ABA[aba]}</p>
            {categoria && (
              <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-white/15 py-0.5 pl-3 pr-1 text-sm font-bold text-white">
                <span className="truncate">{nomeCategoria || "Categoria"}</span>
                <button
                  type="button"
                  onClick={limparCategoria}
                  aria-label={`Tirar o filtro de categoria ${nomeCategoria}`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  <FaXmark aria-hidden="true" />
                </button>
              </p>
            )}
            {pessoas.length > 1 && (
              <label className="mt-2 inline-flex items-center gap-2 text-sm text-white/90">
                <span>Pessoa</span>
                <select
                  value={pessoa}
                  onChange={(e) => setPessoa(e.target.value)}
                  className="min-h-9 max-w-40 rounded-full border border-white/30 bg-primary-dark/40 px-3 text-sm font-bold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  <option value="">Todas</option>
                  {pessoas.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name.trim().split(/\s+/)[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="min-w-0 text-right" aria-live="polite">
            <p className="text-xs uppercase tracking-wider text-white/75">{ROTULO_TOTAL[aba]}</p>
            <p className="whitespace-nowrap font-heading text-xl font-bold md:text-2xl">{lista === null ? "…" : formatarReais(total.toFixed(2))}</p>
          </div>
        </div>
        <div className="bg-primary-dark/40 px-3 py-2">
          <SeletorMes mes={mes} onMudar={setMes} className="mx-auto max-w-sm" />
        </div>
      </header>

      {lista === null && !erro && (
        <p role="status" className="mt-8 text-slate-500">
          Carregando lançamentos...
        </p>
      )}

      {/* Nada no mês */}
      {vazio && (
        <div className="mt-8 rounded-3xl bg-white p-8 text-center shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)]">
          <FaReceipt aria-hidden="true" className="mx-auto text-4xl text-primary-light" />
          <p className="mt-4 font-heading text-xl font-bold text-slate-900">{VAZIO_ABA[aba] ?? "Nenhum lançamento neste mês"}</p>
          <p className="mt-2 text-slate-600">
            {aba
              ? "Escolha outra aba embaixo ou outro mês."
              : podeEditar
                ? "Toque no botão + para registrar uma receita, despesa ou transferência."
                : "Quando alguém da família lançar, aparece aqui."}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {dias.map(([dia, itens]) => (
          <section key={dia} aria-label={nomeDoDia(dia)}>
            <h2 className="px-2 text-sm font-bold uppercase tracking-wider text-slate-500">{nomeDoDia(dia)}</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded-3xl bg-white p-2 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)]">
              {itens.map(({ chave, lancamento: l, fatura: f }) => (
                <li key={chave}>
                  {f ? (
                    <Link
                      to={`/app/cartoes/${f.cardId}?mes=${f.month}`}
                      aria-label={`Abrir fatura do ${f.cardName}, ${formatarReais(f.total)}`}
                      className={classeBotao}
                    >
                      <LinhaFatura f={f} />
                    </Link>
                  ) : podeEditar ? (
                    <button
                      type="button"
                      onClick={() => setEdicao(l)}
                      aria-label={`Editar ${tipoEmTexto(l)} ${l.description}, ${formatarReais(l.amount)}`}
                      className={classeBotao}
                    >
                      <ConteudoLinha l={l} mostrarQuem={compartilhado} />
                    </button>
                  ) : (
                    <div className={classeLinha}>
                      <ConteudoLinha l={l} mostrarQuem={compartilhado} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {edicao && (
        <FormLancamento
          lancamento={edicao}
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
