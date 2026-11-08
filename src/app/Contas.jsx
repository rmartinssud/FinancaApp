import { useCallback, useEffect, useState } from "react";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import BotaoApagar from "./componentes/BotaoApagar.jsx";
import BotaoFlutuante from "./componentes/BotaoFlutuante.jsx";
import { LinhaConta, Saldo } from "./componentes/ListaContas.jsx";
import { TIPOS_CONTA } from "../lib/contas.js";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../lib/dinheiro.js";

// Texto do dia (1 a 31) -> número, ou null se vazio
const paraDia = (texto) => (texto === "" ? null : Number(texto));

// Janela para criar ou editar uma conta
function FormConta({ conta, onFechar, onSalvo }) {
  const editando = Boolean(conta);
  const [nome, setNome] = useState(conta?.name ?? "");
  const [tipo, setTipo] = useState(conta?.type ?? "BANK");
  const [saldoInicial, setSaldoInicial] = useState(paraCampo(conta?.initialBalance ?? "0"));
  const [limite, setLimite] = useState(paraCampo(conta?.creditLimit));
  const [fechamento, setFechamento] = useState(conta?.closingDay?.toString() ?? "");
  const [vencimento, setVencimento] = useState(conta?.dueDay?.toString() ?? "");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState("");

  const cartaoCredito = tipo === "CREDIT_CARD";

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!nome.trim()) novosErros.name = "Dê um nome para a conta.";
    if (cartaoCredito) {
      for (const [campo, texto] of [["closingDay", fechamento], ["dueDay", vencimento]]) {
        const dia = Number(texto);
        if (texto !== "" && (!Number.isInteger(dia) || dia < 1 || dia > 31)) novosErros[campo] = "Use um dia de 1 a 31.";
      }
    }
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = { name: nome.trim(), type: tipo, initialBalance: paraApi(saldoInicial) || "0" };
    if (cartaoCredito) {
      corpo.creditLimit = paraApi(limite) || null;
      corpo.closingDay = paraDia(fechamento);
      corpo.dueDay = paraDia(vencimento);
    }

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
          {Object.entries(TIPOS_CONTA).map(([valor, { nome: texto }]) => (
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

        {/* Campos que só aparecem para cartão de crédito */}
        {cartaoCredito && (
          <fieldset className="space-y-5 rounded-2xl bg-soft p-4">
            <legend className="sr-only">Dados do cartão</legend>
            <Campo
              label="Limite (R$)"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0,00"
              value={limite}
              onChange={(e) => setLimite(mascarar(e.target.value))}
              erro={erros.creditLimit}
            />
            <div className="grid grid-cols-2 gap-3">
              <Campo
                label="Dia de fechamento"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={fechamento}
                onChange={(e) => setFechamento(e.target.value)}
                erro={erros.closingDay}
              />
              <Campo
                label="Dia de vencimento"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                erro={erros.dueDay}
              />
            </div>
          </fieldset>
        )}

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Criar conta"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

        {editando && (
          <div className="flex flex-col items-center gap-3">
            <Alerta className="w-full">{erroApagar}</Alerta>
            <BotaoApagar
              texto="Apagar conta"
              pergunta="Apagar esta conta? Todos os lançamentos dela também serão apagados. Isso não pode ser desfeito."
              onConfirmar={apagar}
              carregando={apagando}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}

// Detalhe embaixo do nome: tipo e, no cartão, limite e dias
function detalheConta(c) {
  if (c.type !== "CREDIT_CARD") return TIPOS_CONTA[c.type]?.nome;
  const partes = ["Cartão"];
  if (c.creditLimit) partes.push(`limite ${formatarReais(c.creditLimit)}`);
  if (c.closingDay) partes.push(`fecha dia ${c.closingDay}`);
  if (c.dueDay) partes.push(`vence dia ${c.dueDay}`);
  return partes.join(" · ");
}

// Lista de contas (carteira, banco, cartão) com saldo atual
function Contas() {
  const { erroMe, podeEditar } = useMe();
  const [contas, setContas] = useState(null);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState(null);

  const carregar = useCallback(() => {
    api("/accounts")
      .then(setContas)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const total = (contas ?? []).reduce((soma, c) => soma + Number(c.currentBalance), 0);

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>

      <h1 className="font-heading text-3xl font-bold text-slate-900 md:text-4xl">Contas</h1>
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
                  <LinhaConta conta={c} detalhe={detalheConta(c)} />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-3">
                  <LinhaConta conta={c} detalhe={detalheConta(c)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {podeEditar && <BotaoFlutuante texto="Conta" onClick={() => setEdicao("nova")} />}
      {edicao && (
        <FormConta
          conta={edicao === "nova" ? null : edicao}
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

export default Contas;
