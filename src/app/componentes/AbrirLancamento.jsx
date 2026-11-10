import FormLancamento from "./FormLancamento.jsx";
import FormDespesaCartao from "./FormDespesaCartao.jsx";
import DetalhesLancamento from "./DetalhesLancamento.jsx";

// Abre um lançamento vindo da API (Relatórios, Calendário):
// quem pode editar vê o formulário certo (compra no cartão abre a despesa do cartão, com todas as parcelas);
// quem só visualiza (VIEWER) vê os detalhes.
function AbrirLancamento({ lancamento, podeEditar, onFechar, onSalvo }) {
  if (!podeEditar) return <DetalhesLancamento lancamento={lancamento} onFechar={onFechar} />;
  if (lancamento.isCardExpense && lancamento.purchaseId) {
    return <FormDespesaCartao purchaseId={lancamento.purchaseId} onFechar={onFechar} onSalvo={onSalvo} />;
  }
  return <FormLancamento lancamento={lancamento} onFechar={onFechar} onSalvo={onSalvo} />;
}

export default AbrirLancamento;
