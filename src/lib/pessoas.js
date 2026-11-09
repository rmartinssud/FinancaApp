// "Robson Martins Dos Santos" → "RS"
export function iniciais(nome = "") {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export const primeiroNome = (nome = "") => nome.trim().split(/\s+/)[0] ?? "";

// Nome de cada papel no espaço
export const NOME_PAPEL = { OWNER: "Dono", ADMIN: "Membro", MEMBER: "Membro", VIEWER: "Somente leitura" };

// Cor fixa por pessoa (a mesma em todas as telas), tirada do id
const CORES = ["#464fa3", "#2ca9bc", "#ec4899", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#0891b2"];
export function corDaPessoa(id = "") {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
