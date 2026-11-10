import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import CampoSelect from "./CampoSelect.jsx";
import Alternador from "./Alternador.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { BANDEIRAS, CORES_CARTAO, COR_PADRAO } from "../../lib/cartoes.js";
import { botaoSecundario } from "./estilos.js";
import CampoLogo from "./CampoLogo.jsx";

const NOVA_CONTA = "__nova";

const tiposConta = [
  { valor: "BANK", texto: "Conta bancária" },
  { valor: "WALLET", texto: "Carteira" },
  { valor: "INVESTMENT", texto: "Investimento" },
];

// Janelinha por cima do formulário do cartão para criar a conta de pagamento sem sair dele
function NovaContaRapida({ onFechar, onCriada }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("BANK");
  const [saldo, setSaldo] = useState("0,00");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return setErros({ name: "Dê um nome para a conta." });
    setErros({});
    setErro("");
    setSalvando(true);
    try {
      const conta = await api("/accounts", enviarJson("POST", { name: nome.trim(), type: tipo, initialBalance: paraApi(saldo) || "0" }));
      onCriada(conta);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Nova conta" onFechar={onFechar}>
      <form onSubmit={criar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>
        <Campo label="Nome da conta" maxLength={60} autoComplete="off" placeholder="Ex.: Nubank conta" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} autoFocus />
        <Alternador legenda="Tipo" nome="tipo-conta-rapida" opcoes={tiposConta} valor={tipo} onMudar={setTipo} />
        <Campo
          label="Saldo atual (R$)"
          inputMode="numeric"
          autoComplete="off"
          value={saldo}
          onChange={(e) => setSaldo(mascarar(e.target.value, true))}
          erro={erros.initialBalance}
          dica="Para saldo negativo, digite o sinal de menos (-)."
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Cancelar
          </button>
          <BotaoEnviar texto="Criar e usar esta conta" carregando={salvando} textoCarregando="Criando..." />
        </div>
      </form>
    </Modal>
  );
}

// Texto do dia (1 a 31) -> número, ou null se vazio/errado
const paraDia = (texto) => {
  const n = Number(texto);
  return texto !== "" && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

// Criar ou editar um cartão de crédito (e arquivar/reativar)
function FormCartao({ cartao = null, onFechar, onSalvo }) {
  const editando = Boolean(cartao);
  const [nome, setNome] = useState(cartao?.name ?? "");
  const [bandeira, setBandeira] = useState(cartao?.brand ?? "MASTERCARD");
  const [limite, setLimite] = useState(paraCampo(cartao?.creditLimit));
  const [fechamento, setFechamento] = useState(cartao?.closingDay?.toString() ?? "");
  const [vencimento, setVencimento] = useState(cartao?.dueDay?.toString() ?? "");
  const [cor, setCor] = useState(cartao?.color ?? COR_PADRAO);
  const [logo, setLogo] = useState(cartao?.bankLogo ?? null);
  const [contaPagamento, setContaPagamento] = useState(cartao?.paymentAccount?.id ?? "");
  const [contas, setContas] = useState(null);
  const [criandoConta, setCriandoConta] = useState(false);

  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [arquivando, setArquivando] = useState(false);

  useEffect(() => {
    api("/accounts")
      .then((lista) => setContas(lista.filter((c) => c.type !== "CREDIT_CARD")))
      .catch((e) => setErro(e.message));
  }, []);

  function escolherConta(valor) {
    if (valor === NOVA_CONTA) {
      setCriandoConta(true); // o select continua na opção anterior até a conta ser criada
      return;
    }
    setContaPagamento(valor);
  }

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!nome.trim()) novosErros.name = "Dê um nome para o cartão.";
    if (!paraApi(limite)) novosErros.creditLimit = "Digite o limite do cartão.";
    if (!paraDia(fechamento)) novosErros.closingDay = "Use um dia de 1 a 31.";
    if (!paraDia(vencimento)) novosErros.dueDay = "Use um dia de 1 a 31.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      name: nome.trim(),
      brand: bandeira,
      creditLimit: paraApi(limite),
      closingDay: paraDia(fechamento),
      dueDay: paraDia(vencimento),
      color: cor,
      paymentAccountId: contaPagamento || null,
      bankLogo: logo,
    };
    setSalvando(true);
    try {
      const salvo = editando ? await api(`/cards/${cartao.id}`, enviarJson("PATCH", corpo)) : await api("/cards", enviarJson("POST", corpo));
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function alternarArquivo() {
    setArquivando(true);
    try {
      const salvo = await api(`/cards/${cartao.id}`, enviarJson("PATCH", { archived: !cartao.archived }));
      onSalvo(salvo);
    } catch (falha) {
      setErro(falha.message);
      setArquivando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar cartão" : "Novo cartão de crédito"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <Campo label="Nome do cartão" maxLength={60} autoComplete="off" placeholder="Ex.: Nubank" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} />

        <div className="grid grid-cols-2 gap-3">
          <CampoSelect label="Bandeira" value={bandeira} onChange={(e) => setBandeira(e.target.value)} erro={erros.brand}>
            {Object.entries(BANDEIRAS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </CampoSelect>
          <Campo
            label="Limite (R$)"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={limite}
            onChange={(e) => setLimite(mascarar(e.target.value))}
            erro={erros.creditLimit}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Dia de fechamento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="Ex.: 3"
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
            placeholder="Ex.: 10"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            erro={erros.dueDay}
          />
        </div>

        <CampoSelect
          label="Conta de pagamento da fatura (opcional)"
          value={contaPagamento}
          onChange={(e) => escolherConta(e.target.value)}
          erro={erros.paymentAccountId}
        >
          <option value="">Nenhuma por enquanto</option>
          {contas?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NOVA_CONTA}>+ Criar nova conta</option>
        </CampoSelect>

        <CampoLogo valor={logo} onMudar={setLogo} tipo="CREDIT_CARD" erro={erros.bankLogo} />

        <fieldset>
          <legend className="mb-2 block font-medium text-slate-800">Cor</legend>
          <div className="grid grid-cols-5 gap-2">
            {CORES_CARTAO.map((o) => (
              <label key={o.valor} className="flex justify-center">
                <input type="radio" name="cor-cartao" value={o.valor} checked={cor === o.valor} onChange={() => setCor(o.valor)} className="peer sr-only" aria-label={o.nome} />
                <span
                  className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${
                    cor === o.valor ? "border-slate-900" : "border-transparent"
                  }`}
                >
                  <span aria-hidden="true" className="h-9 w-9 rounded-xl" style={{ backgroundColor: o.valor }} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Criar cartão"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

        {editando && (
          <div className="flex justify-center">
            <button type="button" onClick={alternarArquivo} disabled={arquivando} className={botaoSecundario}>
              {arquivando ? "Aguarde..." : cartao.archived ? "Reativar cartão" : "Arquivar cartão"}
            </button>
          </div>
        )}
      </form>

      {/* Fora do <form> do cartão: formulários não podem ficar um dentro do outro */}
      {criandoConta && (
        <NovaContaRapida
          onFechar={() => setCriandoConta(false)}
          onCriada={(conta) => {
            setContas((lista) => [...(lista ?? []), conta]);
            setContaPagamento(conta.id);
            setCriandoConta(false);
          }}
        />
      )}
    </Modal>
  );
}

export default FormCartao;
