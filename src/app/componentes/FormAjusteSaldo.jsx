import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo, formatarReais } from "../../lib/api.js";
import { mascarar, paraApi } from "../../lib/dinheiro.js";

// "1234.56" -> 123456 (centavos inteiros, para comparar sem erro de arredondamento)
const emCentavos = (texto) => Math.round(Number(texto) * 100);

// Acerta o saldo da conta com o que aparece no banco (ou na carteira) hoje.
// O app lança a diferença como "Ajuste de saldo", com a data de hoje, que não conta como receita nem despesa do mês.
function FormAjusteSaldo({ conta, onFechar, onSalvo }) {
  // Busca o saldo de novo ao abrir: alguém da família pode ter lançado algo agora há pouco
  const [saldoApp, setSaldoApp] = useState(conta.currentBalance);
  const [real, setReal] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api("/accounts")
      .then((lista) => {
        const atual = lista.find((c) => c.id === conta.id);
        if (atual) setSaldoApp(atual.currentBalance);
      })
      .catch(() => {}); // fica com o saldo que já tínhamos
  }, [conta.id]);

  const carteira = conta.type === "WALLET";
  const digitado = paraApi(real);
  const valido = digitado !== "" && digitado !== "-";
  const diferenca = valido ? emCentavos(digitado) - emCentavos(saldoApp) : null;

  async function confirmar(e) {
    e.preventDefault();
    setErro("");
    if (!valido) {
      setErros({ balance: carteira ? "Digite quanto você tem na carteira hoje." : "Digite o saldo que aparece no banco hoje." });
      return;
    }
    setErros({});
    if (diferenca === 0) return;

    setSalvando(true);
    try {
      await api(`/accounts/${conta.id}/adjust`, enviarJson("POST", { balance: digitado }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Ajustar saldo" onFechar={onFechar}>
      <form onSubmit={confirmar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        <p className="text-slate-700">
          Conta <strong>{conta.name}</strong>. O app mostra <strong>{formatarReais(saldoApp)}</strong>.
        </p>

        <Campo
          label={carteira ? "Quanto você tem na carteira hoje (R$)" : "Saldo que aparece no banco hoje (R$)"}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0,00"
          value={real}
          onChange={(e) => setReal(mascarar(e.target.value, true))}
          erro={erros.balance}
          dica="Para saldo negativo, digite o sinal de menos (-)."
          className="[&_input]:text-2xl [&_input]:font-bold"
          autoFocus
        />

        {diferenca === 0 && <Alerta tipo="sucesso">O saldo do app já bate com o {carteira ? "que você tem" : "banco"}. Não precisa ajustar.</Alerta>}
        {diferenca !== null && diferenca !== 0 && (
          <Alerta tipo="info">
            O app mostra {formatarReais(saldoApp)}. Vamos lançar um ajuste de{" "}
            <strong>
              {diferenca > 0 ? "+ " : "− "}
              {formatarReais(Math.abs(diferenca) / 100)}
            </strong>
            . Ele entra com a data de hoje e não conta como receita nem despesa do mês.
          </Alerta>
        )}

        {diferenca === 0 ? (
          <BotaoEnviar type="button" texto="Fechar" variante="light" onClick={onFechar} className="w-full" />
        ) : (
          <BotaoEnviar texto="Confirmar ajuste" carregando={salvando} textoCarregando="Ajustando..." className="w-full" />
        )}

        <p className="text-sm text-slate-500">
          Antes de ajustar, vale conferir o saldo inicial da conta e se algum lançamento ficou como pendente: pendentes não mexem no saldo.
        </p>
      </form>
    </Modal>
  );
}

export default FormAjusteSaldo;
