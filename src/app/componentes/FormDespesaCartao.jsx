import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal.jsx";
import CampoSelect from "./CampoSelect.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes } from "../../lib/datas.js";
import { mesDaFatura, vencimentoCurto } from "../../lib/cartoes.js";

const PARCELAS = Array.from({ length: 24 }, (_, i) => i + 1);

// Valor de cada parcela (igual ao servidor: os centavos que sobram vão na 1ª)
function valorParcela(total, parcelas) {
  const centavos = Math.round(Number(total || 0) * 100);
  const base = Math.floor(centavos / parcelas);
  return { primeira: (base + (centavos - base * parcelas)) / 100, demais: base / 100 };
}

// Compra no cartão de crédito: à vista ou parcelada (até 24x).
// purchaseId = null cria; com purchaseId edita a compra inteira (todas as parcelas).
// cartaoInicial: já vem escolhido (ex.: aberto pela tela da fatura).
function FormDespesaCartao({ purchaseId = null, cartaoInicial = "", onFechar, onSalvo }) {
  const editando = Boolean(purchaseId);
  const [carregando, setCarregando] = useState(true);
  const [cartoes, setCartoes] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const [cartaoId, setCartaoId] = useState(cartaoInicial);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [data, setData] = useState(hoje());
  const [parcelas, setParcelas] = useState(1);

  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    const pedidos = [api("/cards"), api("/categories?type=EXPENSE")];
    if (purchaseId) pedidos.push(api(`/card-expenses/${purchaseId}`));
    Promise.all(pedidos)
      .then(([listaCartoes, listaCategorias, compra]) => {
        setCategorias(listaCategorias);
        if (compra) {
          const [primeira] = compra.installments;
          const total = compra.installments.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0) / 100;
          setCartaoId(primeira.account.id);
          setValor(paraCampo(total.toFixed(2)));
          setDescricao(primeira.description);
          setCategoriaId(primeira.category?.id ?? "");
          setData(dataLocal(primeira.date));
          setParcelas(primeira.installmentTotal ?? 1);
          // Cartão arquivado continua na lista para a compra antiga
          if (!listaCartoes.some((c) => c.id === primeira.account.id)) {
            listaCartoes = [...listaCartoes, { id: primeira.account.id, name: `${primeira.account.name} (arquivado)` }];
          }
        } else {
          setCartaoId((atual) => atual || listaCartoes[0]?.id || "");
        }
        setCartoes(listaCartoes);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [purchaseId]);

  const cartao = cartoes.find((c) => c.id === cartaoId);
  const fatura = cartao ? mesDaFatura(data, cartao.closingDay, cartao.dueDay) : null;
  const quantia = paraApi(valor);
  const { primeira, demais } = valorParcela(quantia, parcelas);

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!cartaoId) novosErros.cardId = "Escolha o cartão.";
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!data) novosErros.date = "Escolha a data da compra.";
    setErros(novosErros);
    setErro("");
    if (Object.keys(novosErros).length) return;

    const corpo = {
      cardId: cartaoId,
      amount: quantia,
      description: descricao.trim(),
      categoryId: categoriaId || null,
      date: data,
      installments: Number(parcelas),
    };
    setSalvando(true);
    try {
      const salvo = editando
        ? await api(`/card-expenses/${purchaseId}`, enviarJson("PUT", corpo))
        : await api("/card-expenses", enviarJson("POST", corpo));
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
      await api(`/card-expenses/${purchaseId}`, { method: "DELETE" });
      onSalvo(null);
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  const titulo = editando ? "Editar despesa no cartão" : "Nova despesa no cartão";

  // Ainda não há cartão: leva para o cadastro
  if (!carregando && cartoes.length === 0 && !erro) {
    return (
      <Modal titulo={titulo} onFechar={onFechar}>
        <div className="space-y-5 text-center">
          <p className="text-slate-700">Você ainda não tem cartão de crédito cadastrado. Cadastre o primeiro para lançar compras no cartão.</p>
          <Link
            to="/app/cartoes?novo=1"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-bold text-white hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Cadastrar cartão
          </Link>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <CampoSelect label="Cartão" value={cartaoId} onChange={(e) => setCartaoId(e.target.value)} erro={erros.cardId}>
          {carregando && <option value="">Carregando...</option>}
          {cartoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </CampoSelect>

        <Campo
          label="Valor total (R$)"
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
          placeholder="Ex.: Farmácia"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          erro={erros.description}
        />

        <CampoSelect label="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} erro={erros.categoryId}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </CampoSelect>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Data da compra" type="date" value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />
          <CampoSelect label="Parcelas" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} erro={erros.installments}>
            {PARCELAS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista (1x)" : `${n}x`}
              </option>
            ))}
          </CampoSelect>
        </div>

        {/* Onde a compra vai cair */}
        {fatura && (
          <p className="rounded-2xl bg-soft p-4 text-sm text-primary-dark" aria-live="polite">
            {parcelas > 1 && Number(quantia) > 0 && (
              <>
                <strong>
                  {parcelas}x de {formatarReais(demais)}
                </strong>
                {primeira !== demais && <> (1ª de {formatarReais(primeira)})</>}
                .{" "}
              </>
            )}
            {parcelas > 1 ? "A 1ª parcela entra" : "Entra"} na fatura de <strong className="first-letter:uppercase">{nomeDoMes(fatura)}</strong>, que vence em{" "}
            {vencimentoCurto(fatura, cartao.dueDay)}.
          </p>
        )}

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Salvar compra"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

        {editando && (
          <div className="flex justify-center">
            <BotaoApagar
              texto={parcelas > 1 ? "Apagar compra (todas as parcelas)" : "Apagar compra"}
              pergunta="Apagar esta compra? Todas as parcelas saem das faturas. Isso não pode ser desfeito."
              onConfirmar={apagar}
              carregando={apagando}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}

export default FormDespesaCartao;
