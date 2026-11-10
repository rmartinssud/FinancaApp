// Máscara de dinheiro em reais para campos de valor.
// O usuário digita só números e eles entram pela direita, como numa maquininha:
// "1" -> "0,01", "125" -> "1,25", "1250" -> "12,50".

// Texto da API ("12.50" ou "-3.00") -> texto do campo ("12,50" ou "-3,00")
export function paraCampo(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const negativo = String(valor).trim().startsWith("-");
  const centavos = Math.round(Math.abs(Number(valor)) * 100);
  if (centavos === 0) return "0,00";
  return mascarar(`${negativo ? "-" : ""}${centavos}`, negativo);
}

// O que foi digitado -> texto formatado do campo
export function mascarar(digitado, permitirNegativo = false) {
  const negativo = permitirNegativo && String(digitado).includes("-");
  const digitos = String(digitado).replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
  if (!digitos) return negativo ? "-" : "";
  const cheio = digitos.padStart(3, "0");
  const inteiro = cheio.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${inteiro},${cheio.slice(-2)}`;
}

// Texto do campo ("1.234,50") -> texto para a API ("1234.50"). Vazio vira "".
export function paraApi(campo) {
  const negativo = String(campo).startsWith("-");
  const digitos = String(campo).replace(/\D/g, "");
  if (!digitos) return "";
  const cheio = digitos.padStart(3, "0");
  const inteiro = String(Number(cheio.slice(0, -2)));
  return `${negativo ? "-" : ""}${inteiro}.${cheio.slice(-2)}`;
}

// Centavos de um campo de dinheiro ("1.234,50" → 123450)
export const centavosDe = (campo) => Math.round(Number(paraApi(campo) || 0) * 100);
