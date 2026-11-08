import {
  FaCartShopping,
  FaHouse,
  FaCar,
  FaHeartPulse,
  FaFaceSmile,
  FaBook,
  FaReceipt,
  FaBriefcase,
  FaLaptop,
  FaPlus,
  FaTag,
} from "react-icons/fa6";

// Ícones das categorias. A API guarda só a chave (ex.: "cart");
// as 10 chaves são as das categorias padrão (server/src/services/onboarding.ts).
export const ICONES_CATEGORIA = {
  cart: { Icone: FaCartShopping, nome: "Carrinho de compras" },
  home: { Icone: FaHouse, nome: "Casa" },
  car: { Icone: FaCar, nome: "Carro" },
  heart: { Icone: FaHeartPulse, nome: "Saúde" },
  smile: { Icone: FaFaceSmile, nome: "Sorriso" },
  book: { Icone: FaBook, nome: "Livro" },
  receipt: { Icone: FaReceipt, nome: "Recibo" },
  briefcase: { Icone: FaBriefcase, nome: "Maleta" },
  laptop: { Icone: FaLaptop, nome: "Notebook" },
  plus: { Icone: FaPlus, nome: "Mais" },
};

// Ícone de uma chave; chaves desconhecidas usam uma etiqueta
export function iconeDaCategoria(chave) {
  return ICONES_CATEGORIA[chave]?.Icone ?? FaTag;
}

// Cores sugeridas para categorias (as mesmas das categorias padrão)
export const CORES_CATEGORIA = [
  { cor: "#22c55e", nome: "Verde" },
  { cor: "#464fa3", nome: "Índigo" },
  { cor: "#f59e0b", nome: "Laranja" },
  { cor: "#ef4444", nome: "Vermelho" },
  { cor: "#ec4899", nome: "Rosa" },
  { cor: "#8b5cf6", nome: "Roxo" },
  { cor: "#64748b", nome: "Cinza" },
  { cor: "#2ca9bc", nome: "Ciano" },
  { cor: "#0891b2", nome: "Azul-petróleo" },
  { cor: "#737dd9", nome: "Lilás" },
];
