// "Crie sua conta para ver": guardamos a página de onde a pessoa veio (?voltar=/educacao/...)
// para levá-la de volta depois do cadastro (confirmação do email) ou do login, inclusive com Google.
// Vale por 1 dia e só aceita caminhos do próprio site.
const CHAVE = "voltarPara";
const VALIDADE = 24 * 60 * 60 * 1000;

export function caminhoSeguro(caminho) {
  return typeof caminho === "string" && caminho.startsWith("/") && !caminho.startsWith("//") && !caminho.startsWith("/\\") ? caminho : null;
}

// Lê ?voltar= da URL e guarda. Devolve o caminho (ou null).
export function guardarVoltar(params) {
  const caminho = caminhoSeguro(params.get("voltar"));
  if (caminho) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ caminho, ate: Date.now() + VALIDADE }));
    } catch {
      // navegador sem localStorage: segue sem voltar
    }
  }
  return caminho;
}

// Pega (e apaga) o caminho guardado, se ainda valer
export function usarVoltar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    localStorage.removeItem(CHAVE);
    const { caminho, ate } = JSON.parse(bruto);
    return Date.now() < ate ? caminhoSeguro(caminho) : null;
  } catch {
    return null;
  }
}
