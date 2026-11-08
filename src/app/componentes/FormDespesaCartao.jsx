import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal.jsx";
import CampoSelect from "./CampoSelect.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Interruptor from "./Interruptor.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes } from "../../lib/datas.js";
import { faturaAtual, mesDaFatura, mesesEntre, somarMesesNaData, vencimentoCurto } from "../../lib/cartoes.js";

const PARCELAS = Array.from({ length: 24 }, (_, i) => i + 1);

// Valor de cada parcela (igual ao servidor: os centavos que sobram vão na 1ª)
function valorParcela(total, parcelas) {
  const centavos = Math.round(Number(total || 0) * 100);
  const base = Math.floor(centavos / parcelas);
  return { primeira: (base + (centavos - base * parcelas)) / 100, demais: base / 100 };
}

// Compra já em andamento: reconstrói a compra original a partir das parcelas que existem
// (a 1ª lançada é a parcela N; as anteriores foram pagas antes de usar o app)
function compraOriginal(parcelasSalvas, cartao) {
  const [primeira] = parcelasSalvas;
  const n = primeira.installmentNumber ?? 1;
  const centavos = parcelasSalvas.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
  if (n <= 1) return { total: centavos / 100, data: dataLocal(primeira.date), parcelaAtual: null };
  // Parcelas anteriores têm o mesmo valor das demais (a sobra de centavos fica só na 1ª, que não foi lançada)
  const base = Math.round(Number(parcelasSalvas.at(-1).amount) * 100);
  // Dia original: o maior dia entre as parcelas (31/07 vira 30/09, mas volta a 31 em outubro)
  const dia = Math.max(...parcelasSalvas.map((p) => Number(dataLocal(p.date).slice(8, 10))));
  // Parcela que cai na fatura atual hoje (se o tempo passou, é uma parcela mais adiante)
  const atual = cartao?.closingDay ? faturaAtual(cartao) : primeira.invoiceMonth;
  const parcelaAtual = Math.min(Math.max(n + mesesEntre(primeira.invoiceMonth, atual), 2), primeira.installmentTotal);
  return { total: (centavos + base * (n - 1)) / 100, data: somarMesesNaData(dataLocal(primeira.date), -(n - 1), dia), parcelaAtual };
}

// Compra no cartão de crédito: à vista ou parcelada (até 24x).
// purchaseId = null cria; com purchaseId edita a compra inteira (todas as parcelas).
// cartaoInicial: já vem escolhido (ex.: aberto pela tela da fatura).
// emAndamentoInicial: abre com "Compra já em andamento" ligado (parcelados de antes do app).
function FormDespesaCartao({ purchaseId = null, cartaoInicial = "", parcelasIniciais = 1, emAndamentoInicial = false, onFechar, onSalvo }) {
  const editando = Boolean(purchaseId);
  const [carregando, setCarregando] = useState(true);
  const [cartoes, setCartoes] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const [cartaoId, setCartaoId] = useState(cartaoInicial);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [data, setData] = useState(hoje());
  const [parcelas, setParcelas] = useState(parcelasIniciais);
  // Compra parcelada que começou antes de usar o app: só lança da parcela atual em diante
  const [emAndamento, setEmAndamento] = useState(emAndamentoInicial && parcelasIniciais > 1);
  const [parcelaAtual, setParcelaAtual] = useState(2);

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
          const original = compraOriginal(compra.installments, listaCartoes.find((c) => c.id === primeira.account.id));
          setCartaoId(primeira.account.id);
          setValor(paraCampo(original.total.toFixed(2)));
          setDescricao(primeira.description);
          setCategoriaId(primeira.category?.id ?? "");
          setData(original.data);
          setParcelas(primeira.installmentTotal ?? 1);
          setEmAndamento(Boolean(original.parcelaAtual));
          if (original.parcelaAtual) setParcelaAtual(original.parcelaAtual);
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
  // Compra em andamento só existe com 2x ou mais; a parcela atual vai de 2 até o total
  const andamento = emAndamento && parcelas > 1;
  const atual = Math.min(Math.max(parcelaAtual, 2), parcelas);
  const faturaDeHoje = cartao ? faturaAtual(cartao) : null;
  const faltam = parcelas - atual + 1;

  function mudarParcelas(n) {
    setParcelas(n);
    if (parcelaAtual > n) setParcelaAtual(n);
  }

  async function salvar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!cartaoId) novosErros.cardId = "Escolha o cartão.";
    if (!quantia || Number(quantia) <= 0) novosErros.amount = "Digite um valor maior que zero.";
    if (!descricao.trim()) novosErros.description = "Escreva uma descrição.";
    if (!data) novosErros.date = "Escolha a data da compra.";
    else if (andamento && data > hoje()) novosErros.date = "A data da compra não pode ser depois de hoje.";
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
      currentInstallment: andamento ? atual : 1,
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
          <Campo
            label="Data da compra"
            type="date"
            value={data}
            max={andamento ? hoje() : undefined}
            onChange={(e) => setData(e.target.value)}
            erro={erros.date}
          />
          <CampoSelect label="Parcelas" value={parcelas} onChange={(e) => mudarParcelas(Number(e.target.value))} erro={erros.installments}>
            {PARCELAS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista (1x)" : `${n}x`}
              </option>
            ))}
          </CampoSelect>
        </div>

        {parcelas > 1 && (
          <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <Interruptor texto="Compra já em andamento" ligado={andamento} onMudar={setEmAndamento} />
            {andamento && (
              <>
                <CampoSelect
                  label="Parcela desta fatura"
                  value={atual}
                  onChange={(e) => setParcelaAtual(Number(e.target.value))}
                  erro={erros.currentInstallment}
                >
                  {PARCELAS.slice(1, parcelas).map((n) => (
                    <option key={n} value={n}>
                      {n} de {parcelas}
                    </option>
                  ))}
                </CampoSelect>
                <p className="text-sm text-slate-500">
                  Use para compras parceladas que começaram antes de você usar o app. Informe o valor total da compra e a data em que ela foi feita. Lançamos
                  só as parcelas que ainda faltam, a partir da fatura atual.
                </p>
              </>
            )}
          </div>
        )}

        {/* Compra em andamento: o que vai ser lançado */}
        {andamento && faturaDeHoje && (
          <p className="rounded-2xl bg-soft p-4 text-sm text-primary-dark" aria-live="polite">
            {faltam > 1 ? "Serão lançadas" : "Será lançada"}{" "}
            <strong>
              {faltam} {faltam > 1 ? "parcelas" : "parcela"}
              {Number(quantia) > 0 && <> de {formatarReais(demais)}</>}
            </strong>{" "}
            ({faltam > 1 ? `${atual}/${parcelas} a ${parcelas}/${parcelas}` : `${atual}/${parcelas}`}), {faltam > 1 ? "a primeira na" : "na"} fatura que vence em{" "}
            <strong>{vencimentoCurto(faturaDeHoje, cartao.dueDay)}</strong>.
          </p>
        )}

        {/* Onde a compra vai cair */}
        {fatura && !andamento && (
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
