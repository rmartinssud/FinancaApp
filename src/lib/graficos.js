// Ajudas dos gráficos (meses curtos e valores compactos)

// "2026-11" -> "nov"
const formatoMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
export function mesCurto(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return formatoMesCurto.format(new Date(Date.UTC(ano, m - 1, 15))).replace(".", "");
}

// Valor curto em cima da barra: "R$ 1,2 mil"
const formatoCompacto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
export const compacto = (v) => formatoCompacto.format(v);

// "75,3%"
export const percentual = (p) => (p === null || p === undefined ? "–" : `${String(p).replace(".", ",")}%`);
