import { useState } from "react";
import Modal from "./Modal.jsx";
import Campo from "../../auth/Campo.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { mesAtual, nomeDoMes } from "../../lib/datas.js";

const botaoPrincipal =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60";
const botaoCancelar =
  "inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Desarquivar um orçamento mensal: volta a valer a partir do mês escolhido (o do arquivamento ou depois).
// Os meses entre o arquivamento e a volta ficam pausados.
function DesarquivarOrcamento({ orcamento, onFechar, onSalvo }) {
  const minimo = orcamento.archivedFromMonth;
  const [aPartir, setAPartir] = useState(mesAtual() > minimo ? mesAtual() : minimo);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api(`/budgets/${orcamento.id}/unarchive`, enviarJson("POST", { fromMonth: aPartir }));
      onSalvo(r, aPartir);
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  const pausa = aPartir && aPartir > minimo;
  return (
    <Modal titulo="Desarquivar orçamento" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        <Alerta>{erro}</Alerta>
        <p className="text-sm text-slate-600">
          “{orcamento.name}” foi arquivado a partir de {nomeDoMes(minimo)}. Escolha de que mês ele volta a valer.
        </p>
        <Campo label="Volta a valer a partir de" type="month" min={minimo} value={aPartir} onChange={(e) => setAPartir(e.target.value)} erro={erros.fromMonth} />
        <p className="text-sm text-slate-600">
          {pausa
            ? `De ${nomeDoMes(minimo)} até o mês antes da volta ele continua de fora (pausado). A meta continua a mesma de antes.`
            : "Ele volta sem pausa, como se nunca tivesse sido arquivado. A meta continua a mesma de antes."}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={botaoCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !aPartir} className={botaoPrincipal}>
            {salvando ? "Desarquivando..." : "Desarquivar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default DesarquivarOrcamento;
