// Envia um objeto como JSON. Ex.: api("/accounts", enviarJson("POST", { name: "Nubank" }))
export function enviarJson(method, corpo) {
  return { method, body: JSON.stringify(corpo) };
}

// Chama a nossa API enviando o cookie de login (credentials: "include")
export async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opcoes.headers },
    ...opcoes,
  });

  // DELETE responde 204 (sem corpo): nesse caso "dados" fica null
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(dados?.error ?? "Não foi possível falar com o servidor.");
    erro.status = resposta.status;
    // Erros de validação (400) trazem os erros por campo: { campo: ["mensagem"] }
    erro.detalhes = dados?.detalhes ?? {};
    throw erro;
  }
  return dados;
}

// Formata dinheiro em reais: "1234.5" -> "R$ 1.234,50"
const formatoReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatarReais(valor) {
  return formatoReais.format(Number(valor));
}

// Primeira mensagem de erro de cada campo: { amount: ["..."] } -> { amount: "..." }
export function errosPorCampo(erro) {
  return Object.fromEntries(Object.entries(erro?.detalhes ?? {}).map(([campo, msgs]) => [campo, msgs?.[0]]));
}
