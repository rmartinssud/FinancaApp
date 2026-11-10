import { useEffect, useId, useState } from "react";
import {
  FaBarsStaggered,
  FaChevronDown,
  FaBullseye,
  FaPiggyBank,
  FaCalendarDays,
  FaBuildingColumns,
  FaAlignLeft,
  FaTableCellsLarge,
  FaCircleInfo,
} from "react-icons/fa6";
import FolhaCheia from "./FolhaCheia.jsx";
import Modal from "./Modal.jsx";
import Interruptor from "./Interruptor.jsx";
import SeletorIcone from "./SeletorIcone.jsx";
import IconeCategoria from "./IconeCategoria.jsx";
import { classeCampo, Linha, SelectLimpo } from "./LinhasForm.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { CORES_CATEGORIA } from "../../lib/icones.js";
import { hoje } from "../../lib/datas.js";

// Janela de cor + ícone do objetivo
function EscolhaVisual({ cor, icone, onMudar, onFechar }) {
  return (
    <Modal titulo="Cor e ícone" onFechar={onFechar}>
      <fieldset>
        <legend className="mb-2 block font-medium text-slate-800">Cor</legend>
        <div className="grid grid-cols-5 gap-2">
          {CORES_CATEGORIA.map((c) => (
            <label key={c.cor} className="flex justify-center">
              <input type="radio" name="cor-objetivo" checked={cor === c.cor} onChange={() => onMudar({ cor: c.cor, icone })} className="peer sr-only" aria-label={c.nome} />
              <span className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${cor === c.cor ? "border-slate-900" : "border-transparent"}`}>
                <span aria-hidden="true" className="h-9 w-9 rounded-xl" style={{ backgroundColor: c.cor }} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5">
        <SeletorIcone valor={icone} onMudar={(novo) => onMudar({ cor, icone: novo })} cor={cor} nome="icone-objetivo" />
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-bold text-white hover:bg-primary-dark">
          Pronto
        </button>
      </div>
    </Modal>
  );
}

// Campo de dinheiro numa linha (R$ + máscara)
function LinhaValor({ Icone, rotulo, id, valor, onMudar, erro, destaque = false }) {
  return (
    <Linha Icone={Icone} rotulo={rotulo} idCampo={id} erro={erro}>
      <span aria-hidden="true" className="mr-1 text-lg font-bold text-primary">
        R$
      </span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        value={valor}
        onChange={(e) => onMudar(mascarar(e.target.value))}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${classeCampo} ${destaque ? "text-xl font-bold text-primary" : ""}`}
      />
    </Linha>
  );
}

// Criar ou editar um objetivo
function FormObjetivo({ objetivo = null, onFechar, onSalvo }) {
  const base = useId();
  const id = (s) => `${base}-${s}`;
  const formId = id("form");
  const editando = Boolean(objetivo);

  const [nome, setNome] = useState(objetivo?.name ?? "");
  const [cor, setCor] = useState(objetivo?.color ?? "#2ca9bc");
  const [icone, setIcone] = useState(objetivo?.icon ?? "piggy");
  const [meta, setMeta] = useState(paraCampo(objetivo?.targetAmount ?? ""));
  const [inicial, setInicial] = useState(objetivo && Number(objetivo.initialAmount) > 0 ? paraCampo(objetivo.initialAmount) : "");
  const [data, setData] = useState(objetivo?.targetDate ?? "");
  const [conta, setConta] = useState(objetivo?.accountId ?? "");
  const [descricao, setDescricao] = useState(objetivo?.description ?? "");
  const [noInicio, setNoInicio] = useState(objetivo?.showOnHome ?? true);
  const [contas, setContas] = useState([]);
  const [janela, setJanela] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    api("/accounts")
      .then((lista) => ativo && setContas(lista.filter((c) => c.type !== "CREDIT_CARD")))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!nome.trim()) novos.name = "Dê um nome para o objetivo.";
    if (!paraApi(meta) || Number(paraApi(meta)) <= 0) novos.targetAmount = "Informe o valor da meta.";
    setErros(novos);
    setErro("");
    if (Object.keys(novos).length) return;

    const corpo = {
      name: nome.trim(),
      color: cor,
      icon: icone,
      targetAmount: paraApi(meta),
      initialAmount: paraApi(inicial) || "0",
      targetDate: data || null,
      description: descricao.trim() || null,
      accountId: conta || null,
      showOnHome: noInicio,
    };
    setSalvando(true);
    try {
      const salvo = editando ? await api(`/goals/${objetivo.id}`, enviarJson("PUT", corpo)) : await api("/goals", enviarJson("POST", corpo));
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <FolhaCheia titulo={editando ? "Editar objetivo" : "Novo objetivo"} formId={formId} onFechar={onFechar} salvando={salvando}>
      <form id={formId} onSubmit={salvar} noValidate>
        {erro && (
          <div className="px-5 pt-4">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        {/* Nome + cor/ícone */}
        <Linha
          Icone={FaBarsStaggered}
          idCampo={id("nome")}
          erro={erros.name}
          acao={
            <button
              type="button"
              onClick={() => setJanela(true)}
              aria-label="Escolher cor e ícone"
              className="flex shrink-0 items-center gap-1 rounded-full p-1 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <IconeCategoria categoria={{ color: cor, icon: icone }} tamanho="h-9 w-9 text-base" />
              <FaChevronDown aria-hidden="true" className="text-sm text-slate-500" />
            </button>
          }
        >
          <input
            id={id("nome")}
            aria-label="Nome do objetivo"
            placeholder="Nome, ex.: Reserva de emergência"
            maxLength={60}
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={erros.name ? "true" : undefined}
            aria-describedby={erros.name ? `${id("nome")}-erro` : undefined}
            className={classeCampo}
          />
        </Linha>

        <LinhaValor Icone={FaBullseye} rotulo="Valor da meta" id={id("meta")} valor={meta} onMudar={setMeta} erro={erros.targetAmount} destaque />
        <LinhaValor Icone={FaPiggyBank} rotulo="Já guardado (opcional)" id={id("inicial")} valor={inicial} onMudar={setInicial} erro={erros.initialAmount} />

        <Linha Icone={FaCalendarDays} rotulo="Data alvo (opcional)" idCampo={id("data")} erro={erros.targetDate}>
          <input id={id("data")} type="date" min={editando ? undefined : hoje()} value={data} onChange={(e) => setData(e.target.value)} className={classeCampo} />
          {data && (
            <button type="button" onClick={() => setData("")} className="ml-2 shrink-0 rounded-full px-3 py-1 text-sm font-bold text-primary hover:bg-soft">
              Limpar
            </button>
          )}
        </Linha>

        <Linha Icone={FaBuildingColumns} rotulo="Conta onde o dinheiro fica (opcional)" idCampo={id("conta")} erro={erros.accountId}>
          <SelectLimpo id={id("conta")} erro={erros.accountId} value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Nenhuma</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaAlignLeft} rotulo="Descrição (opcional)" idCampo={id("descricao")} erro={erros.description}>
          <textarea
            id={id("descricao")}
            rows={2}
            maxLength={500}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: 6 meses de despesas da casa"
            className={`${classeCampo} resize-none text-base`}
          />
        </Linha>

        <div className="flex min-h-[60px] items-center gap-4 border-b border-slate-100 px-5 py-2">
          <FaTableCellsLarge aria-hidden="true" className="w-6 shrink-0 text-xl text-slate-500" />
          <Interruptor texto="Exibir no Início" ligado={noInicio} onMudar={setNoInicio} className="min-w-0 flex-1" />
        </div>

        <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
          <FaCircleInfo aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-blue-600" />
          <p>
            Com uma <strong>data alvo</strong>, o app calcula quanto guardar por mês e se você está no ritmo. A <strong>conta</strong> é opcional: com ela, cada depósito pode virar também uma
            transferência real para essa conta.
          </p>
        </div>
      </form>

      {janela && (
        <EscolhaVisual
          cor={cor}
          icone={icone}
          onMudar={({ cor: c, icone: i }) => {
            setCor(c);
            setIcone(i);
          }}
          onFechar={() => setJanela(false)}
        />
      )}
    </FolhaCheia>
  );
}

export default FormObjetivo;
