// ─────────────────────────────────────────────
// Números de telefone do WhatsApp (formato E.164 sem o "+", ex.: 5521999998888).
//
// Brasil: o WhatsApp às vezes manda o número de celular SEM o 9 da frente
// (contas antigas: 552199998888 em vez de 5521999998888). Por isso comparamos as duas formas.
// ─────────────────────────────────────────────

// "+55 (21) 99999-8888", "21 99999-8888" ou "5521999998888" → "5521999998888".
// Sem código do país (10 ou 11 dígitos): assume Brasil (+55). null = número inválido.
export function normalizarTelefone(entrada: string): string | null {
  const texto = entrada.trim();
  let digitos = texto.replace(/\D/g, "");
  if (!digitos) return null;
  if (texto.startsWith("00")) digitos = digitos.slice(2); // 0055...
  else if (!texto.startsWith("+") && (digitos.length === 10 || digitos.length === 11)) {
    // DDD + número, sem o 0 da operadora
    digitos = `55${digitos}`;
  } else if (!texto.startsWith("+") && digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) {
    digitos = `55${digitos.slice(1)}`; // 021...
  }
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.startsWith("55")) {
    // Brasil: 55 + DDD (2) + 8 ou 9 dígitos
    if (digitos.length !== 12 && digitos.length !== 13) return null;
    const ddd = Number(digitos.slice(2, 4));
    if (ddd < 11 || ddd > 99) return null;
    // Celular com 9 dígitos tem que começar com 9
    if (digitos.length === 13 && digitos[4] !== "9") return null;
  }
  return digitos;
}

// As formas em que o mesmo número pode aparecer (com e sem o 9 do celular no Brasil)
export function variantesDoTelefone(numero: string): string[] {
  const d = numero.replace(/\D/g, "");
  const lista = new Set([d]);
  if (d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (local.length === 9 && local.startsWith("9")) lista.add(`55${ddd}${local.slice(1)}`);
    if (local.length === 8 && /^[6-9]/.test(local)) lista.add(`55${ddd}9${local}`);
  }
  return [...lista];
}

export function mesmoTelefone(a: string, b: string) {
  const vb = new Set(variantesDoTelefone(b));
  return variantesDoTelefone(a).some((v) => vb.has(v));
}

// "5521999998888" → "+55 21 99999-8888" (para mostrar)
export function formatarTelefone(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const local = d.slice(4);
    const meio = local.length - 4;
    return `+55 ${d.slice(2, 4)} ${local.slice(0, meio)}-${local.slice(meio)}`;
  }
  return `+${d}`;
}
