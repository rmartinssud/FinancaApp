import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  FaBarsStaggered,
  FaChevronDown,
  FaCircleDollarToSlot,
  FaMoneyBill1,
  FaHashtag,
  FaRegCircleQuestion,
  FaFileLines,
  FaRegStar,
  FaRegBell,
  FaTableCellsLarge,
  FaChartColumn,
  FaEyeSlash,
  FaCircleInfo,
  FaEllipsisVertical,
  FaScaleBalanced,
  FaTrashCan,
} from "react-icons/fa6";
import FolhaCheia from "./FolhaCheia.jsx";
import Modal from "./Modal.jsx";
import Interruptor from "./Interruptor.jsx";
import LogoConta from "./LogoConta.jsx";
import { classeCampo, EmBreve, Linha } from "./LinhasForm.jsx";
import { botaoIcone } from "./estilos.js";
import Alerta from "../../auth/Alerta.jsx";
import { TIPOS_CONTA } from "../../lib/contas.js";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";

// A lista de logos com busca só é baixada quando a pessoa abre o seletor
const SeletorLogoBanco = lazy(() => import("./SeletorLogoBanco.jsx"));

// Tipos que aparecem em "Categoria" (cartão de crédito tem formulário próprio)
const CATEGORIAS = ["OTHER", "WALLET", "BANK", "INVESTMENT"];

// Valor em reais alinhado à direita: "R$ 0,00", vermelho com "-" quando negativo
function CampoDinheiro({ id, rotulo, valor, onMudar, permitirNegativo = false, erro }) {
  const negativo = valor.startsWith("-");
  const cor = negativo ? "text-red-600" : valor && valor !== "0,00" ? "text-slate-900" : "text-slate-400";
  return (
    <>
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-base text-slate-800">
        {rotulo}
      </label>
      <span className={`flex shrink-0 items-baseline whitespace-nowrap font-semibold ${cor}`}>
        <span aria-hidden="true" className="mr-1 text-sm">
          {negativo ? "-R$" : "R$"}
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={negativo ? valor.slice(1) : valor}
          onChange={(e) => {
            // O "-" pode ser digitado em qualquer lugar; digitar "-" de novo tira o sinal
            const texto = e.target.value;
            const trocouSinal = permitirNegativo && texto.includes("-");
            const novo = mascarar(texto.replace(/-/g, ""));
            onMudar(trocouSinal !== negativo ? `-${novo}` : novo);
          }}
          aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className="w-28 bg-transparent text-right text-lg placeholder:text-slate-400 focus:outline-none"
        />
      </span>
    </>
  );
}

// Linha com interruptor (ícone à esquerda)
function LinhaInterruptor({ Icone, texto, ligado, onMudar, desabilitado = false }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
      <Icone aria-hidden="true" className={`w-6 shrink-0 text-xl ${desabilitado ? "text-slate-400" : "text-slate-500"}`} />
      <Interruptor texto={texto} ligado={ligado} onMudar={onMudar} desabilitado={desabilitado} corLigado="bg-blue-600" className="min-w-0 flex-1" />
    </div>
  );
}

// Menu ⋮ do topo (só na edição): Ajustar saldo e Apagar conta
function MenuConta({ onAjustar, onApagar }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (!ref.current?.contains(e.target)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const item = "flex w-full items-center gap-3 px-4 py-3 text-left font-medium transition hover:bg-soft focus:outline-none focus-visible:bg-soft";
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setAberto((v) => !v)} className={botaoIcone} aria-label="Mais opções" aria-haspopup="menu" aria-expanded={aberto}>
        <FaEllipsisVertical aria-hidden="true" className="text-xl text-slate-600" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
          <button type="button" role="menuitem" className={`${item} text-slate-800`} onClick={() => { setAberto(false); onAjustar(); }}>
            <FaScaleBalanced aria-hidden="true" className="text-slate-500" />
            Ajustar saldo
          </button>
          <button type="button" role="menuitem" className={`${item} text-red-700`} onClick={() => { setAberto(false); onApagar(); }}>
            <FaTrashCan aria-hidden="true" />
            Apagar conta
          </button>
        </div>
      )}
    </div>
  );
}

// Formulário de conta em tela cheia (Nova conta / Editando conta), no mesmo visual de Nova despesa.
// conta = null cria; um objeto da API edita.
function FormConta({ conta, onFechar, onSalvo, onAjustar }) {
  const editando = Boolean(conta);
  const ids = useId();
  const id = (nome) => `${ids}-${nome}`;
  const formId = id("form");

  const [nome, setNome] = useState(conta?.name ?? "");
  const [tipo, setTipo] = useState(conta?.type ?? "BANK");
  const [saldoInicial, setSaldoInicial] = useState(paraCampo(conta?.initialBalance ?? "0"));
  const [cheque, setCheque] = useState(paraCampo(conta?.overdraftLimit ?? "0"));
  const [logo, setLogo] = useState(conta?.bankLogo ?? null);
  const [numero, setNumero] = useState(conta?.accountNumber ?? "");
  const [notas, setNotas] = useState(conta?.notes ?? "");
  const [padrao, setPadrao] = useState(conta?.isDefault ?? false);
  const [noResumo, setNoResumo] = useState(conta?.showOnSummary ?? true);
  const [ignorar, setIgnorar] = useState(conta?.ignoreInTotals ?? false);
  const [ajuda, setAjuda] = useState(false);
  const [seletorLogo, setSeletorLogo] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState("");

  // Num tipo antigo que não está na lista (não deveria acontecer), ele continua aparecendo
  const opcoes = CATEGORIAS.includes(tipo) ? CATEGORIAS : [...CATEGORIAS, tipo];
  const infoTipo = TIPOS_CONTA[tipo] ?? TIPOS_CONTA.OTHER;

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!nome.trim()) novosErros.name = "Dê um nome para a conta.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      name: nome.trim(),
      type: tipo,
      initialBalance: paraApi(saldoInicial) || "0",
      bankLogo: logo,
      accountNumber: numero.trim() || null,
      notes: notas.trim() || null,
      isDefault: padrao,
      showOnSummary: noResumo,
      ignoreInTotals: ignorar,
    };
    // Cheque especial só em conta corrente (zero = sem cheque especial)
    if (tipo === "BANK") corpo.overdraftLimit = paraApi(cheque) || null;

    setSalvando(true);
    try {
      if (editando) await api(`/accounts/${conta.id}`, enviarJson("PATCH", corpo));
      else await api("/accounts", enviarJson("POST", corpo));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function apagar() {
    setApagando(true);
    setErroApagar("");
    try {
      await api(`/accounts/${conta.id}`, { method: "DELETE" });
      onSalvo();
    } catch (falha) {
      // 409: a família precisa ficar com pelo menos uma conta
      setErroApagar(
        falha.status === 409 ? "Esta é a única conta da família, por isso não pode ser apagada. Crie outra conta antes de apagar esta." : falha.message,
      );
      setApagando(false);
    }
  }

  return (
    <FolhaCheia
      titulo={editando ? "Editando conta" : "Nova conta"}
      formId={formId}
      onFechar={onFechar}
      salvando={salvando}
      corSalvar="bg-blue-600 hover:bg-blue-700"
      extraTopo={editando ? <MenuConta onAjustar={() => onAjustar(conta)} onApagar={() => setConfirmarApagar(true)} /> : null}
    >
      <form id={formId} onSubmit={salvar} noValidate>
        {erro && (
          <div className="px-5 pt-4">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        {/* 1. Nome + logo do banco */}
        <Linha
          Icone={FaBarsStaggered}
          idCampo={id("nome")}
          erro={erros.name ?? erros.bankLogo}
          acao={
            <button
              type="button"
              onClick={() => setSeletorLogo(true)}
              aria-label="Selecionar imagem da conta"
              className="flex shrink-0 items-center gap-1 rounded-full p-1 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <LogoConta conta={{ type: tipo, bankLogo: logo }} className="!rounded-full" />
              <FaChevronDown aria-hidden="true" className="text-sm text-slate-500" />
            </button>
          }
        >
          <input
            id={id("nome")}
            aria-label="Nome da conta"
            placeholder="Nome da conta, ex.: Conta Santander"
            maxLength={60}
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={erros.name ? "true" : undefined}
            aria-describedby={erros.name ? `${id("nome")}-erro` : undefined}
            className={classeCampo}
          />
        </Linha>

        {/* 2. Saldo inicial (pode ser negativo) */}
        <Linha Icone={FaCircleDollarToSlot} idCampo={id("saldo")} erro={erros.initialBalance}>
          <CampoDinheiro id={id("saldo")} rotulo="Saldo inicial" valor={saldoInicial} onMudar={setSaldoInicial} permitirNegativo erro={erros.initialBalance} />
        </Linha>
        <p className="sr-only">Para saldo negativo, digite o sinal de menos.</p>

        {/* 3. Cheque especial (só conta corrente) */}
        {tipo === "BANK" && (
          <Linha Icone={FaMoneyBill1} idCampo={id("cheque")} erro={erros.overdraftLimit}>
            <CampoDinheiro id={id("cheque")} rotulo="Cheque especial" valor={cheque} onMudar={setCheque} erro={erros.overdraftLimit} />
          </Linha>
        )}

        {/* 4. Categoria = tipo da conta */}
        <div className="border-b border-slate-100 px-5 py-3">
          <label htmlFor={id("tipo")} className="mb-1 block text-sm text-slate-500">
            Categoria
          </label>
          <div className="flex min-h-11 items-center gap-3">
            <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${infoTipo.cor ?? "bg-slate-500"}`}>
              <infoTipo.Icone />
            </span>
            <div className="relative min-w-0 flex-1">
              <select
                id={id("tipo")}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                aria-invalid={erros.type ? "true" : undefined}
                className={`${classeCampo} appearance-none rounded-lg pr-8 focus-visible:ring-4 focus-visible:ring-primary/20`}
              >
                {opcoes.map((valor) => (
                  <option key={valor} value={valor}>
                    {TIPOS_CONTA[valor]?.nome ?? valor}
                  </option>
                ))}
              </select>
              <FaChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
            </div>
          </div>
          {erros.type && <p className="mt-1 text-sm text-red-600">{erros.type}</p>}
        </div>

        {/* 5. Número da conta */}
        <Linha
          Icone={FaHashtag}
          idCampo={id("numero")}
          erro={erros.accountNumber}
          acao={
            <button
              type="button"
              onClick={() => setAjuda((v) => !v)}
              aria-label="Para que serve o número da conta?"
              aria-expanded={ajuda}
              aria-controls={id("ajuda")}
              className={botaoIcone}
            >
              <FaRegCircleQuestion aria-hidden="true" className="text-lg text-slate-600" />
            </button>
          }
        >
          <input
            id={id("numero")}
            aria-label="Número da conta"
            placeholder="Número da conta"
            maxLength={40}
            autoComplete="off"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            aria-invalid={erros.accountNumber ? "true" : undefined}
            className={classeCampo}
          />
        </Linha>
        <p id={id("ajuda")} hidden={!ajuda} role="note" className="mx-5 mt-2 rounded-xl bg-slate-800 px-3 py-2 text-sm text-white">
          Só para você identificar a conta, ex.: ag. 1234 c/c 56789-0
        </p>

        {/* 6. Dados adicionais */}
        <Linha Icone={FaFileLines} idCampo={id("notas")} erro={erros.notes}>
          <textarea
            id={id("notas")}
            aria-label="Dados adicionais"
            placeholder="Dados adicionais"
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={`${classeCampo} resize-y`}
          />
        </Linha>

        {/* 7. Interruptores */}
        <LinhaInterruptor Icone={FaRegStar} texto="Conta padrão" ligado={padrao} onMudar={setPadrao} />
        <LinhaInterruptor
          Icone={FaRegBell}
          texto={
            <>
              Padrão para importação de notificações deste banco
              <EmBreve />
            </>
          }
          ligado={false}
          desabilitado
        />
        <LinhaInterruptor Icone={FaTableCellsLarge} texto="Exibir na tela de Resumo" ligado={noResumo} onMudar={setNoResumo} />
        <LinhaInterruptor
          Icone={FaChartColumn}
          texto="Conta para investimentos"
          ligado={tipo === "INVESTMENT"}
          onMudar={(ligado) => setTipo(ligado ? "INVESTMENT" : "BANK")}
        />
        <LinhaInterruptor Icone={FaEyeSlash} texto="Ignorar nos totais" ligado={ignorar} onMudar={setIgnorar} />

        {/* 8. Aviso (só na edição) */}
        {editando && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
            <FaCircleInfo aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-blue-600" />
            <p>Alteração do saldo inicial e do cheque especial vale para todo o histórico da conta.</p>
          </div>
        )}
      </form>

      {seletorLogo && (
        <Suspense fallback={null}>
          <SeletorLogoBanco
            valor={logo}
            onFechar={() => setSeletorLogo(false)}
            onEscolher={(slug) => {
              setLogo(slug);
              setSeletorLogo(false);
            }}
          />
        </Suspense>
      )}

      {confirmarApagar && (
        <Modal titulo="Apagar conta?" onFechar={() => setConfirmarApagar(false)}>
          <p className="text-slate-700">Todos os lançamentos e transferências desta conta também serão apagados. Isso não pode ser desfeito.</p>
          <Alerta className="mt-4">{erroApagar}</Alerta>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmarApagar(false)}
              className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apagar}
              disabled={apagando}
              aria-busy={apagando}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
            >
              <FaTrashCan aria-hidden="true" />
              {apagando ? "Apagando..." : "Sim, apagar"}
            </button>
          </div>
        </Modal>
      )}
    </FolhaCheia>
  );
}

export default FormConta;
