import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaPlus, FaScaleBalanced } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import BotaoApagar from "./componentes/BotaoApagar.jsx";
import FormAjusteSaldo from "./componentes/FormAjusteSaldo.jsx";
import { LinhaConta, Saldo } from "./componentes/ListaContas.jsx";
import { TIPOS_CONTA } from "../lib/contas.js";
import { cartao, botaoSecundario } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../lib/dinheiro.js";

// Tipos que aparecem aqui (cartões de crédito ficam na tela "Cartões de crédito")
const tiposConta = Object.entries(TIPOS_CONTA).filter(([valor]) => valor !== "CREDIT_CARD");

// Janela para criar ou editar uma conta
function FormConta({ conta, onFechar, onSalvo, onAjustar }) {
  const editando = Boolean(conta);
  const [nome, setNome] = useState(conta?.name ?? "");
  const [tipo, setTipo] = useState(conta?.type ?? "BANK");
  const [saldoInicial, setSaldoInicial] = useState(paraCampo(conta?.initialBalance ?? "0"));
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState("");

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!nome.trim()) novosErros.name = "Dê um nome para a conta.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = { name: nome.trim(), type: tipo, initialBalance: paraApi(saldoInicial) || "0" };

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
        falha.status === 409
          ? "Esta é a única conta da família, por isso não pode ser apagada. Crie outra conta antes de apagar esta."
          : falha.message,
      );
      setApagando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar conta" : "Nova conta"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <Campo label="Nome" maxLength={60} autoComplete="off" placeholder="Ex.: Nubank" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} />

        <CampoSelect label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} erro={erros.type}>
          {tiposConta.map(([valor, { nome: texto }]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </CampoSelect>

        <Campo
          label="Saldo inicial (R$)"
          inputMode="numeric"
          autoComplete="off"
          value={saldoInicial}
          onChange={(e) => setSaldoInicial(mascarar(e.target.value, true))}
          erro={erros.initialBalance}
          dica="Para saldo negativo, digite o sinal de menos (-)."
        />

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Criar conta"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

        {editando && (
          <div className="rounded-2xl bg-soft p-4">
            <p className="text-sm text-slate-700">
              Saldo no app: <strong>{formatarReais(conta.currentBalance)}</strong>. Não bate com o {conta.type === "WALLET" ? "que você tem" : "banco"}?
            </p>
            <button type="button" onClick={() => onAjustar(conta)} className={`${botaoSecundario} mt-3 w-full bg-white`}>
              <FaScaleBalanced aria-hidden="true" />
              Ajustar saldo
            </button>
          </div>
        )}

        {editando && (
          <div className="flex flex-col items-center gap-3">
            <Alerta className="w-full">{erroApagar}</Alerta>
            <BotaoApagar
              texto="Apagar conta"
              pergunta="Apagar esta conta? Todos os lançamentos e transferências dela também serão apagados. Isso não pode ser desfeito."
              onConfirmar={apagar}
              carregando={apagando}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}

// Lista de contas (carteira e banco) com saldo atual. Cartões ficam em "Cartões de crédito".
function Contas() {
  const { erroMe, podeEditar } = useMe();
  const [contas, setContas] = useState(null);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState(null);
  const [ajuste, setAjuste] = useState(null);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(() => {
    api("/accounts")
      .then((lista) => setContas(lista.filter((c) => c.type !== "CREDIT_CARD")))
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const total = (contas ?? []).reduce((soma, c) => soma + Number(c.currentBalance), 0);

  return (
    <AppLayout onLancamentoSalvo={carregar}>
      <Alerta>{erroMe || erro}</Alerta>
      <Alerta tipo="sucesso" className="mb-4">
        {aviso}
      </Alerta>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold text-slate-900 md:text-4xl">Contas</h1>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEdicao("nova")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-white shadow transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <FaPlus aria-hidden="true" />
            Nova conta
          </button>
        )}
      </div>
      <p className="mt-2 text-slate-600">
        Saldo somado: <Saldo valor={total.toFixed(2)} />
      </p>

      <section aria-label="Lista de contas" className={`mt-6 ${cartao}`}>
        {contas === null && !erro && <p role="status" className="text-slate-500">Carregando contas...</p>}
        <ul className="divide-y divide-slate-100">
          {contas?.map((c) => (
            <li key={c.id}>
              {podeEditar ? (
                <button
                  type="button"
                  onClick={() => setEdicao(c)}
                  aria-label={`Editar conta ${c.name}, saldo ${formatarReais(c.currentBalance)}`}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                >
                  <LinhaConta conta={c} />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-3">
                  <LinhaConta conta={c} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 px-2 text-sm text-slate-600">
        Cartões de crédito ficam em{" "}
        <Link to="/app/cartoes" className="font-bold text-primary underline-offset-4 hover:underline">
          Cartões de crédito
        </Link>
        .
      </p>
      {edicao && (
        <FormConta
          conta={edicao === "nova" ? null : edicao}
          onFechar={() => setEdicao(null)}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
          onAjustar={(c) => {
            setEdicao(null);
            setAviso("");
            setAjuste(c);
          }}
        />
      )}
      {ajuste && (
        <FormAjusteSaldo
          conta={ajuste}
          onFechar={() => setAjuste(null)}
          onSalvo={() => {
            setAviso(`Saldo de ${ajuste.name} ajustado. O ajuste aparece em Lançamentos como “Ajuste de saldo”.`);
            setAjuste(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Contas;
