import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Campo from "../../auth/Campo.jsx";
import CampoSelect from "./CampoSelect.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi, paraCampo } from "../../lib/dinheiro.js";
import { hoje } from "../../lib/datas.js";

// Registrar um pagamento de dívida: vira uma despesa em Lançamentos (categoria "Dívidas") e baixa o saldo devedor
function FormPagamentoDivida({ divida, onFechar, onSalvo }) {
  const saldo = Number(divida.currentBalance);
  const sugestao = Number(divida.minimumPayment) > 0 ? Math.min(Number(divida.minimumPayment), saldo) : "";
  const [valor, setValor] = useState(sugestao ? paraCampo(String(sugestao.toFixed(2))) : "");
  const [data, setData] = useState(hoje());
  const [conta, setConta] = useState("");
  const [obs, setObs] = useState("");
  const [contas, setContas] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    api("/accounts")
      .then((lista) => {
        if (!ativo) return;
        const validas = lista.filter((c) => c.type !== "CREDIT_CARD" && !c.archivedAt);
        setContas(validas);
        setConta((validas.find((c) => c.isDefault) ?? validas[0])?.id ?? "");
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!paraApi(valor) || Number(paraApi(valor)) <= 0) novos.amount = "Informe o valor pago.";
    else if (Number(paraApi(valor)) > saldo) novos.amount = `O saldo devedor é ${formatarReais(saldo)}.`;
    if (!conta) novos.accountId = "Escolha de qual conta saiu o dinheiro.";
    setErros(novos);
    setErro("");
    if (Object.keys(novos).length) return;
    setSalvando(true);
    try {
      const r = await api(`/debts/${divida.id}/payments`, enviarJson("POST", { amount: paraApi(valor), date: data || hoje(), accountId: conta, notes: obs.trim() || null }));
      onSalvo(r);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Registrar pagamento" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <Campo label="Valor pago (R$)" inputMode="numeric" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(mascarar(e.target.value))} erro={erros.amount} />
        <p className="-mt-2 text-sm text-slate-500">
          Saldo devedor: <span className="whitespace-nowrap">{formatarReais(saldo)}</span>
        </p>
        <Campo label="Data do pagamento" type="date" max={hoje()} value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />
        <CampoSelect label="Saiu da conta" value={conta} onChange={(e) => setConta(e.target.value)} erro={erros.accountId}>
          <option value="">Escolha...</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </CampoSelect>
        <Campo label="Observação (opcional)" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} erro={erros.notes} />
        <p className="rounded-2xl bg-soft p-4 text-sm text-slate-700">
          O pagamento vira uma <strong>despesa</strong> em Lançamentos (categoria “Dívidas”) e sai do saldo da conta. Apagar essa despesa desfaz o pagamento e o saldo devedor volta.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default FormPagamentoDivida;
