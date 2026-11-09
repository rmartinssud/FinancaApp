import { useEffect, useState } from "react";
import { FaArrowRight } from "react-icons/fa6";
import Modal from "./Modal.jsx";
import Alternador from "./Alternador.jsx";
import CampoSelect from "./CampoSelect.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes } from "../../lib/datas.js";

const tiposLancamento = [
  { valor: "EXPENSE", texto: "Despesa", classeAtiva: "bg-red-600 text-white shadow" },
  { valor: "INCOME", texto: "Receita", classeAtiva: "bg-emerald-700 text-white shadow" },
  { valor: "TRANSFER", texto: "Transferência", classeAtiva: "bg-amber-500 text-white shadow" },
];

const titulos = { EXPENSE: "despesa", INCOME: "receita", TRANSFER: "transferência" };

// Exemplo de descrição de acordo com o tipo
const exemplos = { EXPENSE: "Ex.: Supermercado", INCOME: "Ex.: Salário", TRANSFER: "Ex.: Reserva do mês" };

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

// Formulário de lançamento (receita, despesa ou transferência) dentro de uma janela.
// lancamento = null cria um novo (tipoInicial escolhe o tipo); um objeto da API edita (e permite apagar).
function FormLancamento({ lancamento = null, tipoInicial = "EXPENSE", onFechar, onSalvo }) {
  if (lancamento?.isAdjustment) return <AjusteSaldo lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
  if (lancamento?.isInvoicePayment) return <PagamentoFatura lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
  return <FormComum lancamento={lancamento} tipoInicial={tipoInicial} onFechar={onFechar} onSalvo={onSalvo} />;
}

function FormComum({ lancamento, tipoInicial, onFechar, onSalvo }) {
  const editando = Boolean(lancamento);

  const [tipo, setTipo] = useState(lancamento?.type ?? tipoInicial);
  const [valor, setValor] = useState(paraCampo(lancamento?.amount));
  const [descricao, setDescricao] = useState(lancamento?.description ?? "");
  const [data, setData] = useState(lancamento ? dataLocal(lancamento.date) : hoje());
  const [contaId, setContaId] = useState(lancamento?.account.id ?? "");
  const [destinoId, setDestinoId] = useState(lancamento?.toAccount?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(lancamento?.category?.id ?? "");
  const [situacao, setSituacao] = useState(lancamento?.status ?? "CONFIRMED");

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  const transferencia = tipo === "TRANSFER";

  // Carrega contas e categorias; num lançamento novo, a primeira conta já vem escolhida
  useEffect(() => {
    Promise.all([api("/accounts"), api("/categories")])
      .then(([listaContas, listaCategorias]) => {
        setContas(listaContas);
        setCategorias(listaCategorias);
        const comuns = contasComuns(listaContas);
        setContaId((atual) => atual || comuns[0]?.id || "");
        setDestinoId((atual) => atual || comuns[1]?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  const categoriasDoTipo = categorias.filter((c) => c.type === tipo);
  // Num lançamento antigo feito direto num cartão, o cartão continua aparecendo na lista
  const opcoesConta = contas.filter((c) => c.type !== "CREDIT_CARD" || c.id === lancamento?.account.id);
  const opcoesTransferencia = contasComuns(contas);

  function mudarTipo(novo) {
    setTipo(novo);
    // A categoria escolhida pode não servir para o outro tipo
    const categoria = categorias.find((c) => c.id === categoriaId);
    if (categoria && categoria.type !== novo) setCategoriaId("");
    if (novo === "TRANSFER" && destinoId === contaId) {
      setDestinoId(opcoesTransferencia.find((c) => c.id !== contaId)?.id ?? "");
    }
  }

  async function salvar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!transferencia && !descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!data) novosErros.date = "Escolha a data.";
    if (!contaId) novosErros.accountId = transferencia ? "Escolha a conta de origem." : "Escolha a conta.";
    if (transferencia) {
      if (!destinoId) novosErros.toAccountId = "Escolha a conta de destino.";
      else if (destinoId === contaId) novosErros.toAccountId = "Escolha uma conta diferente da de origem.";
    }
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      type: tipo,
      amount: quantia,
      description: descricao.trim(),
      date: data,
      accountId: contaId,
      toAccountId: transferencia ? destinoId : null,
      categoryId: transferencia ? null : categoriaId || null,
      status: situacao,
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

  const situacoes = [
    { valor: "CONFIRMED", texto: tipo === "INCOME" ? "Recebido" : transferencia ? "Feita" : "Pago" },
    { valor: "PENDING", texto: "Pendente" },
  ];

  const semContasParaTransferir = transferencia && contas.length > 0 && opcoesTransferencia.length < 2;

  return (
    <Modal titulo={editando ? `Editar ${titulos[tipo]}` : `Nova ${titulos[tipo]}`} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <Alternador legenda="Tipo" esconderLegenda nome="tipo-lancamento" opcoes={tiposLancamento} valor={tipo} onMudar={mudarTipo} />

        {semContasParaTransferir && (
          <Alerta tipo="info">Para transferir, você precisa de pelo menos duas contas. Cadastre outra em Contas.</Alerta>
        )}

        <Campo
          label="Valor (R$)"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={valor}
          onChange={(e) => setValor(mascarar(e.target.value))}
          erro={erros.amount}
          className="[&_input]:text-2xl [&_input]:font-bold"
        />

        {transferencia ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoSelect label="De (origem)" value={contaId} onChange={(e) => setContaId(e.target.value)} erro={erros.accountId}>
              {contas.length === 0 && <option value="">Carregando...</option>}
              {opcoesTransferencia.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </CampoSelect>
            <CampoSelect label="Para (destino)" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} erro={erros.toAccountId}>
              <option value="">Escolha a conta</option>
              {opcoesTransferencia
                .filter((c) => c.id !== contaId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </CampoSelect>
          </div>
        ) : null}

        <Campo
          label={transferencia ? "Descrição (opcional)" : "Descrição"}
          maxLength={120}
          autoComplete="off"
          placeholder={exemplos[tipo]}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          erro={erros.description}
        />

        <Campo label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />

        {!transferencia && (
          <>
            <CampoSelect label="Conta" value={contaId} onChange={(e) => setContaId(e.target.value)} erro={erros.accountId}>
              {contas.length === 0 && <option value="">Carregando...</option>}
              {opcoesConta.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </CampoSelect>

            <CampoSelect label="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} erro={erros.categoryId}>
              <option value="">Sem categoria</option>
              {categoriasDoTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </CampoSelect>
          </>
        )}

        <Alternador legenda="Situação" nome="situacao-lancamento" opcoes={situacoes} valor={situacao} onMudar={setSituacao} />

        <BotaoEnviar
          texto={editando ? "Salvar alterações" : transferencia ? "Salvar transferência" : "Salvar lançamento"}
          carregando={salvando}
          textoCarregando="Salvando..."
          className="w-full"
        />

        {editando && (
          <div className="flex justify-center">
            <BotaoApagar texto="Apagar lançamento" pergunta="Apagar este lançamento? Isso não pode ser desfeito." onConfirmar={apagar} carregando={apagando} />
          </div>
        )}
      </form>
    </Modal>
  );
}

export default FormLancamento;
