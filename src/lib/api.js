// Chama a nossa API enviando o cookie de login (credentials: "include")
export async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opcoes.headers },
    ...opcoes,
  });

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(dados?.error ?? "Não foi possível falar com o servidor.");
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

// Formata dinheiro em reais: "1234.5" -> "R$ 1.234,50"
export function formatarReais(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
}
