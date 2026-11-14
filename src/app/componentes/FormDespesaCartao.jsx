import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { FaChevronDown, FaChevronRight, FaTags } from "react-icons/fa6";
import Modal from "./Modal.jsx";
import CampoSelect from "./CampoSelect.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import Interruptor from "./Interruptor.jsx";
import SeletorFatura from "./SeletorFatura.jsx";
import SeletorTags, { ChipsTags } from "./SeletorTags.jsx";
import CampoAnexos from "./CampoAnexos.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { dataLocal, hoje, nomeDoMes, somarMes } from "../../lib/datas.js";
import { faturaAtual, faturaPermitida, mesDaFatura, mesesEntre, somarMesesNaData, vencimentoCurto } from "../../lib/cartoes.js";
import { principais, filhasDe } from "../../lib/categorias.js";
import { enviarAnexo } from "../../lib/anexos.js";

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
  if (n <= 1) return { total: centavos / 100, data: dataLocal(primeira.date), parcelaAtual: null, fatura: primeira.invoiceMonth };
  // Parcelas anteriores têm o mesmo valor das demais (a sobra de centavos fica só na 1ª, que não foi lançada)
  const base = Math.round(Number(parcelasSalvas.at(-1).amount) * 100);
  // Dia original: o maior dia entre as parcelas (31/07 vira 30/09, mas volta a 31 em outubro)
  const dia = Math.max(...parcelasSalvas.map((p) => Number(dataLocal(p.date).slice(8, 10))));
  // Parcela que cai na fatura atual hoje (se o tempo passou, é uma parcela mais adiante).
  // Se a 1ª parcela lançada está numa fatura DEPOIS da atual, a pessoa escolheu a fatura: mantém a parcela.
  const atual = cartao?.closingDay ? faturaAtual(cartao) : primeira.invoiceMonth;
  const passaram = Math.max(mesesEntre(primeira.invoiceMonth, atual), 0);
  const parcelaAtual = Math.min(Math.max(n + passaram, 2), primeira.installmentTotal);
  return {
    total: (centavos + base * (n - 1)) / 100,
    data: somarMesesNaData(dataLocal(primeira.date), -(n - 1), dia),
    parcelaAtual,
    // Fatura em que está a parcela atual (a mesma das parcelas já salvas)
    fatura: somarMes(primeira.invoiceMonth, parcelaAtual - n),
  };
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
  const [subcategoriaId, setSubcategoriaId] = useState("");
  // Campos extras (valem para todas as parcelas). Multicategorias e encargos/desconto não existem na compra no cartão.
  const ids = useId();
  const [tags, setTags] = useState([]);
  const [tagIds, setTagIds] = useState([]);
  const [escolhendoTags, setEscolhendoTags] = useState(false);
  const [notas, setNotas] = useState("");
  const [dataLancamento, setDataLancamento] = useState(editando ? "" : hoje());
  const [anexosSalvos, setAnexosSalvos] = useState([]);
  const [anexosNovos, setAnexosNovos] = useState([]);
  const [otimizandoAnexos, setOtimizandoAnexos] = useState(false);
  const [ignorar, setIgnorar] = useState({ ignoreInStatistics: false, ignoreInBudgets: false, ignoreInMonthlySavings: false });
  const [maisInfo, setMaisInfo] = useState(false);
  const [data, setData] = useState(hoje());
  const [parcelas, setParcelas] = useState(parcelasIniciais);
  // Compra parcelada que começou antes de usar o app: só lança da parcela atual em diante
  const [emAndamento, setEmAndamento] = useState(emAndamentoInicial && parcelasIniciais > 1);
  const [parcelaAtual, setParcelaAtual] = useState(2);
  // Fatura escolhida à mão (null = automática, acompanha a data e o cartão)
  const [faturaEscolhida, setFaturaEscolhida] = useState(null);

  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    const pedidos = [api("/cards"), api("/categories?type=EXPENSE"), api("/tags")];
    if (purchaseId) pedidos.push(api(`/card-expenses/${purchaseId}`));
    Promise.all(pedidos)
      .then(([listaCartoes, listaCategorias, listaTags, compra]) => {
        setCategorias(listaCategorias);
        setTags(listaTags);
        if (compra) {
          const [primeira] = compra.installments;
          const original = compraOriginal(compra.installments, listaCartoes.find((c) => c.id === primeira.account.id));
          setCartaoId(primeira.account.id);
          setValor(paraCampo(original.total.toFixed(2)));
          setDescricao(primeira.description);
          // Subcategoria: na API a categoria é a filha (com parentId); no formulário são dois campos
          setCategoriaId(primeira.category?.parentId ?? primeira.category?.id ?? "");
          setSubcategoriaId(primeira.category?.parentId ? primeira.category.id : "");
          setTagIds((primeira.tags ?? []).map((t) => t.id));
          setNotas(primeira.notes ?? "");
          setDataLancamento(primeira.launchDate ? dataLocal(primeira.launchDate) : "");
          setAnexosSalvos(compra.installments.flatMap((p) => p.attachments ?? []));
          const flags = {
            ignoreInStatistics: Boolean(primeira.ignoreInStatistics),
            ignoreInBudgets: Boolean(primeira.ignoreInBudgets),
            ignoreInMonthlySavings: Boolean(primeira.ignoreInMonthlySavings),
          };
          setIgnorar(flags);
          setMaisInfo(Boolean(primeira.notes || compra.installments.some((p) => p.attachments?.length) || Object.values(flags).some(Boolean)));
          setData(original.data);
          setParcelas(primeira.installmentTotal ?? 1);
          setEmAndamento(Boolean(original.parcelaAtual));
          if (original.parcelaAtual) setParcelaAtual(original.parcelaAtual);
          // Mantém a fatura em que a compra está (se for diferente da automática, vira escolha manual)
          const cartaoDaCompra = listaCartoes.find((c) => c.id === primeira.account.id);
          if (cartaoDaCompra?.closingDay) {
            const automatica = original.parcelaAtual
              ? faturaAtual(cartaoDaCompra)
              : mesDaFatura(original.data, cartaoDaCompra.closingDay, cartaoDaCompra.dueDay);
            if (original.fatura !== automatica && faturaPermitida(original.fatura, automatica)) setFaturaEscolhida(original.fatura);
          }
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
  const subcategorias = filhasDe(categorias, categoriaId);
  const tagsEscolhidas = tags.filter((t) => tagIds.includes(t.id));
  const mudarIgnorar = (campo) => (v) => setIgnorar((atual) => ({ ...atual, [campo]: v }));
  const fatura = cartao ? mesDaFatura(data, cartao.closingDay, cartao.dueDay) : null;
  const quantia = paraApi(valor);
  const { primeira, demais } = valorParcela(quantia, parcelas);
  // Compra em andamento só existe com 2x ou mais; a parcela atual vai de 2 até o total
  const andamento = emAndamento && parcelas > 1;
  const atual = Math.min(Math.max(parcelaAtual, 2), parcelas);
  const faturaDeHoje = cartao ? faturaAtual(cartao) : null;
  const faltam = parcelas - atual + 1;
  // Fatura da 1ª parcela lançada: automática (pela data, ou a atual na compra em andamento) ou a escolhida.
  // Se a data/cartão mudar e a escolhida ficar longe demais, volta para a automática.
  const faturaAutomatica = andamento ? faturaDeHoje : fatura;
  const faturaFinal = faturaPermitida(faturaEscolhida, faturaAutomatica) ? faturaEscolhida : faturaAutomatica;
  const faturaManual = Boolean(faturaFinal) && faturaFinal !== faturaAutomatica;

  function mudarParcelas(n) {
    setParcelas(n);
    if (parcelaAtual > n) setParcelaAtual(n);
  }

  async function salvar(e) {
    e.preventDefault();
    if (otimizandoAnexos) return; // espera terminar de otimizar as fotos
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
      categoryId: subcategoriaId || categoriaId || null,
      date: data,
      tagIds,
      notes: notas.trim() || null,
      launchDate: dataLancamento || null,
      ...ignorar,
      installments: Number(parcelas),
      currentInstallment: andamento ? atual : 1,
      // Só manda quando a pessoa escolheu outra fatura (senão o servidor calcula)
      invoiceMonth: faturaManual ? faturaFinal : null,
    };
    setSalvando(true);
    try {
      const salvo = editando
        ? await api(`/card-expenses/${purchaseId}`, enviarJson("PUT", corpo))
        : await api("/card-expenses", enviarJson("POST", corpo));
      // Anexos novos vão para a 1ª parcela lançada (depois que a compra existe)
      const falhas = [];
      for (const arquivo of anexosNovos) {
        try {
          await enviarAnexo(salvo.installments[0].id, arquivo);
        } catch (falha) {
          falhas.push(`${arquivo.name}: ${falha.message}`);
        }
      }
      if (falhas.length) window.alert(`A compra foi salva, mas alguns anexos não foram enviados:\n${falhas.join("\n")}`);
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function removerAnexoSalvo(anexo) {
    if (!window.confirm(`Remover o anexo “${anexo.originalName}”?`)) return;
    try {
      await api(`/attachments/${anexo.id}`, { method: "DELETE" });
      setAnexosSalvos((lista) => lista.filter((a) => a.id !== anexo.id));
    } catch (falha) {
      setErro(falha.message);
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

        <div className="grid grid-cols-2 gap-3">
          <CampoSelect
            label="Categoria"
            value={categoriaId}
            onChange={(e) => {
              setCategoriaId(e.target.value);
              setSubcategoriaId("");
            }}
            erro={erros.categoryId}
          >
            <option value="">Sem categoria</option>
            {principais(categorias, "EXPENSE").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect
            label="Subcategoria"
            value={subcategoriaId}
            disabled={subcategorias.length === 0}
            onChange={(e) => setSubcategoriaId(e.target.value)}
          >
            <option value="">{subcategorias.length ? "Nenhuma" : "Sem subcategorias"}</option>
            {subcategorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </CampoSelect>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setEscolhendoTags(true)}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-300 px-4 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            aria-label={`Tags: ${tagsEscolhidas.length ? tagsEscolhidas.map((t) => t.name).join(", ") : "nenhuma"}. Escolher tags`}
          >
            <FaTags aria-hidden="true" className="shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1">
              {tagsEscolhidas.length ? <ChipsTags tags={tagsEscolhidas} /> : <span className="text-slate-500">Tags (nenhuma)</span>}
            </span>
            <FaChevronRight aria-hidden="true" className="shrink-0 text-sm text-slate-500" />
          </button>
          {erros.tagIds && <p className="mt-2 text-sm text-red-600">{erros.tagIds}</p>}
        </div>

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
        {andamento && faturaFinal && (
          <div className="space-y-3 rounded-2xl bg-soft p-4 text-sm text-primary-dark">
            <p aria-live="polite">
              {faltam > 1 ? "Serão lançadas" : "Será lançada"}{" "}
              <strong>
                {faltam} {faltam > 1 ? "parcelas" : "parcela"}
                {Number(quantia) > 0 && <> de {formatarReais(demais)}</>}
              </strong>{" "}
              ({faltam > 1 ? `${atual}/${parcelas} a ${parcelas}/${parcelas}` : `${atual}/${parcelas}`}), {faltam > 1 ? "a primeira na" : "na"} fatura que vence em{" "}
              <strong>{vencimentoCurto(faturaFinal, cartao.dueDay)}</strong>.
            </p>
            <SeletorFatura
              rotulo={`Fatura da parcela ${atual}/${parcelas}`}
              mes={faturaFinal}
              automatica={faturaAutomatica}
              dueDay={cartao.dueDay}
              onMudar={setFaturaEscolhida}
              erro={erros.invoiceMonth}
            />
          </div>
        )}

        {/* Onde a compra vai cair */}
        {faturaFinal && !andamento && (
          <div className="space-y-3 rounded-2xl bg-soft p-4 text-sm text-primary-dark">
            {parcelas > 1 && Number(quantia) > 0 && (
              <p aria-live="polite">
                <strong>
                  {parcelas}x de {formatarReais(demais)}
                </strong>
                {primeira !== demais && <> (1ª de {formatarReais(primeira)})</>}. A última parcela fica na fatura de {nomeDoMes(somarMes(faturaFinal, parcelas - 1))}.
              </p>
            )}
            <SeletorFatura
              rotulo={parcelas > 1 ? "Fatura da 1ª parcela" : "Fatura"}
              mes={faturaFinal}
              automatica={faturaAutomatica}
              dueDay={cartao.dueDay}
              onMudar={setFaturaEscolhida}
              erro={erros.invoiceMonth}
            />
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setMaisInfo((v) => !v)}
            aria-expanded={maisInfo}
            aria-controls={`${ids}-mais`}
            className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-5 font-bold text-primary transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            Mais informações
            <FaChevronDown aria-hidden="true" className={`text-sm transition-transform ${maisInfo ? "rotate-180" : ""}`} />
          </button>
          <div id={`${ids}-mais`} hidden={!maisInfo} className="mt-3 space-y-4">
            <Campo label="Data lançamento" type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} erro={erros.launchDate} />
            <div>
              <label htmlFor={`${ids}-notas`} className="mb-2 block font-medium text-slate-800">
                Observações
              </label>
              <textarea
                id={`${ids}-notas`}
                rows={3}
                maxLength={1000}
                placeholder="Escreva um detalhe, se quiser"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
              />
              {erros.notes && <p className="mt-2 text-sm text-red-600">{erros.notes}</p>}
            </div>
            <div className="-mx-5 border-t border-slate-100">
              <CampoAnexos
                salvos={anexosSalvos}
                novos={anexosNovos}
                onAdicionar={(arquivos) => setAnexosNovos((lista) => [...lista, ...arquivos])}
                onRemoverNovo={(i) => setAnexosNovos((lista) => lista.filter((_, j) => j !== i))}
                onRemoverSalvo={removerAnexoSalvo}
                onOcupado={setOtimizandoAnexos}
              />
            </div>
            <Interruptor texto="Ignorar em Estatísticas e Gráficos" ligado={ignorar.ignoreInStatistics} onMudar={mudarIgnorar("ignoreInStatistics")} />
            <Interruptor texto="Ignorar em Orçamentos" ligado={ignorar.ignoreInBudgets} onMudar={mudarIgnorar("ignoreInBudgets")} />
            <Interruptor texto="Ignorar em Economia mensal" ligado={ignorar.ignoreInMonthlySavings} onMudar={mudarIgnorar("ignoreInMonthlySavings")} />
            {parcelas > 1 && <p className="text-sm text-slate-500">Tags, observações e as opções de ignorar valem para todas as parcelas. Os anexos ficam na 1ª parcela.</p>}
          </div>
        </div>

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
      {escolhendoTags && (
        <SeletorTags
          tags={tags}
          escolhidas={tagIds}
          onMudar={setTagIds}
          onCriada={(nova) => setTags((lista) => [...lista, nova].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}
          onFechar={() => setEscolhendoTags(false)}
        />
      )}
    </Modal>
  );
}

export default FormDespesaCartao;
