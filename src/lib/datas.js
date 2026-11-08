// Datas e meses sempre no fuso de Brasília (o servidor usa o mesmo fuso)
const FUSO = "America/Sao_Paulo";

const formatoISO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

// Data "AAAA-MM-DD" em Brasília de uma data qualquer (Date ou texto ISO)
export function dataLocal(data = new Date()) {
  return formatoISO.format(new Date(data));
}

// Hoje em Brasília, ex.: "2026-11-07"
export const hoje = () => dataLocal();

// Mês atual em Brasília, ex.: "2026-11"
export const mesAtual = () => hoje().slice(0, 7);

// Soma (ou subtrai) meses: somarMes("2026-01", -1) -> "2025-12"
export function somarMes(mes, quantidade) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + quantidade, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "2026-11" -> "novembro de 2026"
const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
export function nomeDoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return formatoMes.format(new Date(Date.UTC(ano, m - 1, 15)));
}

// "2026-11-07" -> "sábado, 7 de novembro" (ou "Hoje" / "Ontem")
const formatoDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export function nomeDoDia(dia) {
  if (dia === hoje()) return "Hoje";
  const [ano, m, d] = dia.split("-").map(Number);
  const ontem = dataLocal(Date.now() - 24 * 60 * 60 * 1000);
  if (dia === ontem) return "Ontem";
  return formatoDia.format(new Date(Date.UTC(ano, m - 1, d, 12)));
}
