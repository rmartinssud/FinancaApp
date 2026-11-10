import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Interruptor from "./Interruptor.jsx";
import Campo from "../../auth/Campo.jsx";
import CampoSelect from "./CampoSelect.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi } from "../../lib/dinheiro.js";
import { hoje } from "../../lib/datas.js";

// Depositar ou retirar de um objetivo. Com conta vinculada, pode virar também uma transferência real.
function FormMovimentoObjetivo({ objetivo, tipo, onFechar, onSalvo }) {
  const deposito = tipo === "DEPOSIT";
  const conta = objetivo.account;
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [obs, setObs] = useState("");
  const [transferir, setTransferir] = useState(false);
  const [outra, setOutra] = useState("");
  const [contas, setContas] = useState([]);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!conta) return;
    let ativo = true;
    api("/accounts")
      .then((lista) => ativo && setContas(lista.filter((c) => c.type !== "CREDIT_CARD" && c.id !== conta.id)))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [conta]);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (!paraApi(valor) || Number(paraApi(valor)) <= 0) novos.amount = "Informe o valor.";
    if (transferir && !outra) novos.accountId = deposito ? "Escolha de qual conta o dinheiro sai." : "Escolha para qual conta o dinheiro vai.";
    setErros(novos);
    setErro("");
    if (Object.keys(novos).length) return;
    setSalvando(true);
    try {
      const r = await api(
        `/goals/${objetivo.id}/entries`,
        enviarJson("POST", { kind: tipo, amount: paraApi(valor), date: data || hoje(), notes: obs.trim() || null, transfer: transferir, accountId: transferir ? outra : null }),
      );
      onSalvo(r);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={deposito ? "Depositar" : "Retirar"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <Campo label="Valor (R$)" inputMode="numeric" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(mascarar(e.target.value))} erro={erros.amount} />
        {!deposito && <p className="-mt-2 text-sm text-slate-500">Guardado agora: <span className="whitespace-nowrap">{formatarReais(objetivo.progress.saved)}</span></p>}
        <Campo label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} erro={erros.date} />
        <Campo label="Observação (opcional)" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} erro={erros.notes} />

        {conta ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <Interruptor
              texto="Registrar também como transferência"
              descricao={deposito ? `Move o dinheiro de outra conta para ${conta.name}.` : `Move o dinheiro de ${conta.name} para outra conta.`}
              ligado={transferir}
              onMudar={setTransferir}
            />
            {transferir && (
              <CampoSelect label={deposito ? "Sai da conta" : "Vai para a conta"} value={outra} onChange={(e) => setOutra(e.target.value)} erro={erros.accountId} className="mt-4">
                <option value="">Escolha...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CampoSelect>
            )}
            <p className="mt-3 text-sm text-slate-600">
              {transferir
                ? "Os saldos das duas contas mudam e a transferência aparece em Lançamentos. Ela não conta como receita nem despesa."
                : "Desligado: só anota no objetivo. Saldos, receitas e despesas não mudam (use se o dinheiro já está na conta)."}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-soft p-4 text-sm text-slate-700">
            Isto só anota no objetivo: saldos, receitas e despesas não mudam. Para mover dinheiro de verdade junto, vincule uma conta ao objetivo em Editar.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 font-bold text-white transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60 ${
              deposito ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {salvando ? "Salvando..." : deposito ? "Depositar" : "Retirar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default FormMovimentoObjetivo;
