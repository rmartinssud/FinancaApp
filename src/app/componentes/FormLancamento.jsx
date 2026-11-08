import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Alternador from "./Alternador.jsx";
import CampoSelect from "./CampoSelect.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje } from "../../lib/datas.js";

const tiposLancamento = [
  { valor: "EXPENSE", texto: "Despesa", classeAtiva: "bg-red-600 text-white shadow" },
  { valor: "INCOME", texto: "Receita", classeAtiva: "bg-emerald-700 text-white shadow" },
];

// Formulário de lançamento (receita ou despesa) dentro de uma janela.
// lancamento = null cria um novo; um objeto da API edita (e permite apagar).
function FormLancamento({ lancamento = null, onFechar, onSalvo }) {
  const editando = Boolean(lancamento);

  const [tipo, setTipo] = useState(lancamento?.type ?? "EXPENSE");
  const [valor, setValor] = useState(paraCampo(lancamento?.amount));
  const [descricao, setDescricao] = useState(lancamento?.description ?? "");
  const [data, setData] = useState(lancamento ? dataLocal(lancamento.date) : hoje());
  const [contaId, setContaId] = useState(lancamento?.account.id ?? "");
  const [categoriaId, setCategoriaId] = useState(lancamento?.category?.id ?? "");

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
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
        setContaId((atual) => atual || listaContas[0]?.id || "");
      })
      .catch((e) => setErro(e.message));
  }, []);

  const categoriasDoTipo = categorias.filter((c) => c.type === tipo);

  function mudarTipo(novo) {
    setTipo(novo);
    // A categoria escolhida pode não servir para o outro tipo
    const categoria = categorias.find((c) => c.id === categoriaId);
    if (categoria && categoria.type !== novo) setCategoriaId("");
  }

  async function salvar(e) {
    e.preventDefault();
    const quantia = paraApi(valor);
    const novosErros = {};
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!data) novosErros.date = "Escolha a data.";
    if (!contaId) novosErros.accountId = "Escolha a conta.";
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

  return (
    <Modal titulo={editando ? "Editar lançamento" : "Novo lançamento"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <Alternador legenda="Tipo" esconderLegenda nome="tipo-lancamento" opcoes={tiposLancamento} valor={tipo} onMudar={mudarTipo} />

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

        <Campo
          label="Descrição"
          maxLength={120}
          autoComplete="off"
          placeholder="Ex.: Supermercado"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          erro={erros.description}
        />

        <Campo label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />

        <CampoSelect label="Conta" value={contaId} onChange={(e) => setContaId(e.target.value)} erro={erros.accountId}>
          {contas.length === 0 && <option value="">Carregando...</option>}
          {contas.map((c) => (
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

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Salvar lançamento"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

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
