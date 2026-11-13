import { useEffect, useId, useState } from "react";
import {
  FaTableCellsLarge,
  FaBarsStaggered,
  FaLayerGroup,
  FaUserTie,
  FaSackDollar,
  FaPercent,
  FaMoneyBill,
  FaCalendarDays,
  FaBuildingColumns,
  FaAlignLeft,
  FaCircleInfo,
  FaBoxArchive,
  FaRotateLeft,
} from "react-icons/fa6";
import FolhaCheia from "./FolhaCheia.jsx";
import Interruptor from "./Interruptor.jsx";
import BotaoApagar from "./BotaoApagar.jsx";
import { classeCampo, Linha, SelectLimpo } from "./LinhasForm.jsx";
import { IconeDivida } from "./CartaoDivida.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { TIPOS_DIVIDA } from "../../lib/dividas.js";

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

// "2.5" → "2,5" (campo) e "2,5" → "2.5" (API)
const taxaParaCampo = (t) => (t === undefined || t === null || Number(t) === 0 ? "" : String(t).replace(".", ","));
const taxaParaApi = (t) => (t.trim() ? t.trim().replace(",", ".") : "0");

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

// Cadastrar ou editar uma dívida (tela cheia). Editando: arquivar/reativar e apagar ficam no fim.
function FormDivida({ divida = null, temPagamentos = false, onFechar, onSalvo, onApagada, onSituacao }) {
  const base = useId();
  const id = (s) => `${base}-${s}`;
  const formId = id("form");
  const editando = Boolean(divida);

  const [nome, setNome] = useState(divida?.name ?? "");
  const [tipo, setTipo] = useState(divida?.type ?? "CARTAO");
  const [credor, setCredor] = useState(divida?.creditor ?? "");
  const [saldo, setSaldo] = useState(paraCampo(divida?.currentBalance ?? ""));
  const [taxa, setTaxa] = useState(taxaParaCampo(divida?.interestRateMonthly));
  const [minimo, setMinimo] = useState(divida && Number(divida.minimumPayment) > 0 ? paraCampo(divida.minimumPayment) : "");
  const [dia, setDia] = useState(divida?.dueDay ? String(divida.dueDay) : "");
  const [conta, setConta] = useState(divida?.accountId ?? "");
  const [obs, setObs] = useState(divida?.notes ?? "");
  const [noInicio, setNoInicio] = useState(divida?.showOnHome ?? true);
  const [contas, setContas] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    api("/accounts")
      .then((lista) => ativo && setContas(lista))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!nome.trim()) novos.name = "Dê um nome para a dívida.";
    if (!paraApi(saldo) || Number(paraApi(saldo)) <= 0) novos.currentBalance = "Informe quanto você deve hoje.";
    if (taxa.trim() && !/^\d{1,3}([.,]\d{1,4})?$/.test(taxa.trim())) novos.interestRateMonthly = "Use só números, ex.: 2,5";
    setErros(novos);
    setErro("");
    if (Object.keys(novos).length) return;

    const corpo = {
      name: nome.trim(),
      type: tipo,
      creditor: credor.trim() || null,
      currentBalance: paraApi(saldo),
      interestRateMonthly: taxaParaApi(taxa),
      minimumPayment: paraApi(minimo) || "0",
      dueDay: dia ? Number(dia) : null,
      notes: obs.trim() || null,
      accountId: conta || null,
      showOnHome: noInicio,
    };
    setSalvando(true);
    try {
      const salvo = editando ? await api(`/debts/${divida.id}`, enviarJson("PUT", corpo)) : await api("/debts", enviarJson("POST", corpo));
      onSalvo(salvo);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function mudarSituacao(status) {
    setOcupado(true);
    try {
      const r = await api(`/debts/${divida.id}/status`, enviarJson("POST", { status }));
      onSituacao?.(r);
    } catch (falha) {
      setErro(falha.message);
      setOcupado(false);
    }
  }

  async function apagar(comLancamentos) {
    setOcupado(true);
    try {
      await api(`/debts/${divida.id}${comLancamentos ? "?removeTransactions=true" : ""}`, { method: "DELETE" });
      onApagada?.();
    } catch (falha) {
      setErro(falha.message);
      setOcupado(false);
    }
  }

  return (
    <FolhaCheia titulo={editando ? "Editar dívida" : "Nova dívida"} formId={formId} onFechar={onFechar} salvando={salvando}>
      <form id={formId} onSubmit={salvar} noValidate>
        {erro && (
          <div className="px-5 pt-4">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        <Linha Icone={FaBarsStaggered} idCampo={id("nome")} erro={erros.name} acao={<IconeDivida tipo={tipo} tamanho="h-9 w-9 text-base" />}>
          <input
            id={id("nome")}
            aria-label="Nome da dívida"
            placeholder="Nome, ex.: Cartão Nubank"
            maxLength={60}
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={erros.name ? "true" : undefined}
            aria-describedby={erros.name ? `${id("nome")}-erro` : undefined}
            className={classeCampo}
          />
        </Linha>

        <Linha Icone={FaLayerGroup} rotulo="Tipo" idCampo={id("tipo")} erro={erros.type}>
          <SelectLimpo id={id("tipo")} erro={erros.type} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DIVIDA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <LinhaValor Icone={FaSackDollar} rotulo="Saldo devedor hoje" id={id("saldo")} valor={saldo} onMudar={setSaldo} erro={erros.currentBalance} destaque />

        <Linha Icone={FaPercent} rotulo="Juros ao mês (% a.m.)" idCampo={id("taxa")} erro={erros.interestRateMonthly}>
          <input
            id={id("taxa")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0 (sem juros)"
            maxLength={8}
            value={taxa}
            onChange={(e) => setTaxa(e.target.value.replace(/[^\d,.]/g, ""))}
            aria-invalid={erros.interestRateMonthly ? "true" : undefined}
            aria-describedby={erros.interestRateMonthly ? `${id("taxa")}-erro` : undefined}
            className={classeCampo}
          />
          <span aria-hidden="true" className="ml-1 shrink-0 font-bold text-slate-500">
            %
          </span>
        </Linha>

        <LinhaValor Icone={FaMoneyBill} rotulo="Parcela ou pagamento mínimo por mês" id={id("minimo")} valor={minimo} onMudar={setMinimo} erro={erros.minimumPayment} />

        <Linha Icone={FaCalendarDays} rotulo="Dia do vencimento (opcional)" idCampo={id("dia")} erro={erros.dueDay}>
          <SelectLimpo id={id("dia")} erro={erros.dueDay} value={dia} onChange={(e) => setDia(e.target.value)}>
            <option value="">Sem dia fixo</option>
            {DIAS.map((d) => (
              <option key={d} value={d}>
                Dia {d}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaUserTie} rotulo="Credor (opcional)" idCampo={id("credor")} erro={erros.creditor}>
          <input id={id("credor")} placeholder="Banco, loja ou pessoa" maxLength={60} autoComplete="off" value={credor} onChange={(e) => setCredor(e.target.value)} className={classeCampo} />
        </Linha>

        <Linha Icone={FaBuildingColumns} rotulo="Conta ou cartão relacionado (opcional)" idCampo={id("conta")} erro={erros.accountId}>
          <SelectLimpo id={id("conta")} erro={erros.accountId} value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Nenhum</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectLimpo>
        </Linha>

        <Linha Icone={FaAlignLeft} rotulo="Observações (opcional)" idCampo={id("obs")} erro={erros.notes}>
          <textarea
            id={id("obs")}
            rows={2}
            maxLength={500}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: renegociado em 24x, contrato nº..."
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
            Use a taxa <strong>ao mês</strong> do contrato ou da fatura (CET mensal). Só tem a taxa ao ano? Divida por 12 para ter uma ideia (ex.: 36% a.a. ≈ 3% a.m.).
            {editando && temPagamentos && " O saldo devedor é o de hoje: os pagamentos já registrados continuam no histórico."}
          </p>
        </div>
      </form>

      {editando && (
        <div className="mx-5 mt-6 space-y-3 border-t border-slate-100 pt-5">
          {divida.status === "ARCHIVED" ? (
            <button
              type="button"
              onClick={() => mudarSituacao("ACTIVE")}
              disabled={ocupado}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-bold text-primary transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <FaRotateLeft aria-hidden="true" /> Reativar dívida
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mudarSituacao("ARCHIVED")}
              disabled={ocupado}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              <FaBoxArchive aria-hidden="true" /> Arquivar dívida
            </button>
          )}
          <BotaoApagar
            texto="Apagar dívida"
            carregando={ocupado}
            pergunta={
              temPagamentos
                ? "A dívida e o histórico de pagamentos serão apagados. As despesas dos pagamentos em Lançamentos podem ficar (o saldo das contas não muda) ou ser apagadas junto."
                : "A dívida será apagada."
            }
            opcoes={
              temPagamentos
                ? [
                    { rotulo: "Apagar e manter lançamentos", valor: false },
                    { rotulo: "Apagar tudo", valor: true },
                  ]
                : null
            }
            onConfirmar={(v) => apagar(Boolean(v))}
          />
        </div>
      )}
    </FolhaCheia>
  );
}

export default FormDivida;
