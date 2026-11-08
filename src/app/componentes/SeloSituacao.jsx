import { SITUACOES } from "../../lib/cartoes.js";

// Selo da situação da fatura (Aberta, Fechada, Paga, Vencida)
function SeloSituacao({ situacao }) {
  const s = SITUACOES[situacao] ?? SITUACOES.OPEN;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.classe}`}>{s.texto}</span>;
}

export default SeloSituacao;
