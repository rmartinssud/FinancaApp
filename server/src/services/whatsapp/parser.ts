// ─────────────────────────────────────────────
// Leitura das mensagens de texto do WhatsApp (sem IA): regras fixas, em pt-BR.
//
// "gastei 45,90 mercado", "50 uber", "recebi 1200 salário", "paguei 120 luz ontem",
// "30 no cartão nubank ifood", "300 no cartão nubank em 3x tv", "R$ 1.234,56 aluguel 05/11".
//
// O parser só separa as partes (valor, data, tipo, cartão, parcelas e as palavras que sobram).
// Achar a categoria e a conta (pelos nomes do espaço) fica em casamento.ts.
// ─────────────────────────────────────────────

export type Comando = "saldo" | "resumo" | "ajuda" | "cancelar";

export type FormaPagamento = "dinheiro" | "pix" | "debito" | null;

export type LancamentoLido = {
  tipo: "INCOME" | "EXPENSE";
  // A mensagem disse se é receita ou despesa (verbo como "recebi" ou "gastei")
  tipoExplicito: boolean;
  valor: string; // "45.90"
  data: string; // "AAAA-MM-DD" (dia em Brasília)
  // Palavras que sobraram, como foram escritas (descrição, categoria, conta)
  palavras: string[];
  cartao: boolean; // falou "cartão" ou "crédito"
  forma: FormaPagamento;
  parcelas: number; // 1 = à vista
};

export type Leitura = { tipo: "comando"; comando: Comando } | { tipo: "lancamento"; lancamento: LancamentoLido } | { tipo: "desconhecido" };

// Sem acento e em minúsculas: "Salário" → "salario"
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const COMANDOS: Record<string, Comando> = {
  saldo: "saldo",
  saldos: "saldo",
  "meu saldo": "saldo",
  "ver saldo": "saldo",
  resumo: "resumo",
  "resumo do mes": "resumo",
  "meu resumo": "resumo",
  extrato: "resumo",
  ajuda: "ajuda",
  help: "ajuda",
  menu: "ajuda",
  comandos: "ajuda",
  "como funciona": "ajuda",
  oi: "ajuda",
  ola: "ajuda",
  "bom dia": "ajuda",
  "boa tarde": "ajuda",
  "boa noite": "ajuda",
  inicio: "ajuda",
  "?": "ajuda",
  cancelar: "cancelar",
  cancela: "cancelar",
};

const RECEITA = new Set(["recebi", "receber", "recebido", "recebida", "ganhei", "ganho", "entrou", "entrada", "receita", "vendi", "recebimento", "caiu", "depositaram"]);
const DESPESA = new Set(["gastei", "gasto", "gastos", "paguei", "pago", "paga", "pagar", "comprei", "compra", "compras", "despesa", "saiu", "saida", "torrei"]);
// Verbos no passado: "dia 28" depois de hoje vira o mês passado
const PASSADO = new Set(["recebi", "ganhei", "entrou", "vendi", "caiu", "depositaram", "gastei", "paguei", "comprei", "saiu", "torrei"]);
const CARTAO = new Set(["cartao", "credito", "cc"]);
const FORMAS: Record<string, FormaPagamento> = { dinheiro: "dinheiro", especie: "dinheiro", pix: "pix", debito: "debito" };
const VAZIAS = new Set([
  "no", "na", "nos", "nas", "de", "do", "da", "dos", "das", "com", "em", "pra", "para", "pro", "pelo", "pela",
  "o", "a", "os", "as", "um", "uma", "e", "foi", "valor", "via", "reais", "real", "conto", "contos", "pila", "r$", "rs",
  "hoje", "ontem", "anteontem", "eu", "me", "meu", "minha", "que", "ai", "aqui", "agora", "vista", "avista",
]);

// ── Valor ─────────────────────────────────────

// "45,90" → "45.90"; "1.200" → "1200.00"; "1.234,56" → "1234.56"; "45.9" → "45.90"; "R$45" → "45.00"
export function lerValor(token: string): string | null {
  let t = normalizar(token).replace(/^r\$/, "").replace(/^rs/, "").replace(/(reais|real|r\$)$/, "");
  t = t.replace(/[;:!?)]+$/, "").replace(/\.$/, "").replace(/,$/, "");
  if (!t || !/^\d/.test(t)) return null;
  let inteiro: string;
  let centavos = "";
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
    // 1.234,56 (milhar com ponto)
    const [a, b] = t.split(",");
    inteiro = a.replace(/\./g, "");
    centavos = b ?? "";
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) {
    // 1,234.56 (jeito americano)
    const [a, b] = t.split(".");
    inteiro = a.replace(/,/g, "");
    centavos = b ?? "";
  } else if (/^\d+([.,]\d{1,2})?$/.test(t)) {
    const [a, b] = t.split(/[.,]/);
    inteiro = a;
    centavos = b ?? "";
  } else {
    return null;
  }
  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  if (inteiro.length > 10) return null;
  const valor = `${inteiro}.${centavos.padEnd(2, "0")}`;
  return Number(valor) > 0 ? valor : null;
}

// ── Datas ─────────────────────────────────────

const UM_DIA = 24 * 60 * 60 * 1000;

function paraData(dia: string) {
  return new Date(`${dia}T12:00:00.000Z`);
}
function paraDia(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function somarDiasAoDia(dia: string, n: number) {
  return paraDia(new Date(paraData(dia).getTime() + n * UM_DIA));
}
function diaValido(ano: number, mes: number, dia: number) {
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}
const doisDigitos = (n: number) => String(n).padStart(2, "0");
const montarDia = (ano: number, mes: number, dia: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;

// "05/11", "5/11/2026", "05-11-26" → "AAAA-MM-DD". Sem ano: o deste ano (ou o do ano passado, se
// ficaria mais de 2 meses no futuro: "28/12" escrito em janeiro é o dezembro que passou).
export function lerDataBarra(token: string, hoje: string): string | null {
  const m = token.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : Number(hoje.slice(0, 4));
  if (m[3] && m[3].length === 2) ano += 2000;
  if (!diaValido(ano, mes, dia)) return null;
  let resultado = montarDia(ano, mes, dia);
  if (!m[3] && resultado > somarDiasAoDia(hoje, 62) && diaValido(ano - 1, mes, dia)) resultado = montarDia(ano - 1, mes, dia);
  return resultado;
}

// "dia 5" → dia 5 deste mês (ou do mês passado, se a mensagem fala no passado e o dia ainda não chegou)
function lerDiaDoMes(n: number, hoje: string, passado: boolean): string | null {
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7));
  if (n < 1 || n > 31) return null;
  if (passado && n > Number(hoje.slice(8, 10))) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  if (!diaValido(ano, mes, n)) return null;
  return montarDia(ano, mes, n);
}

// ── Leitura ───────────────────────────────────

function lerComando(n: string): Comando | null {
  const limpo = n.replace(/[!.?,;]+$/g, "").replace(/\s+/g, " ").trim();
  if (n.trim() === "?") return "ajuda";
  return COMANDOS[limpo] ?? null;
}

// Separa a mensagem em partes. hoje = "AAAA-MM-DD" em Brasília.
export function lerMensagem(texto: string, hoje: string): Leitura {
  const original = texto.trim().replace(/\s+/g, " ");
  if (!original) return { tipo: "desconhecido" };
  const comando = lerComando(normalizar(original));
  if (comando) return { tipo: "comando", comando };

  // "R$ 45" (separado) vira um token só; vírgula colada no fim de palavra sai ("mercado, 45")
  const tokens = original
    .replace(/\b(r\$|rs)\s+(?=\d)/gi, "R$")
    .split(" ")
    .map((t) => t.replace(/^[,;(]+|[,;)]+$/g, ""))
    .filter(Boolean);
  const normais = tokens.map(normalizar);
  const passado = normais.some((t) => PASSADO.has(t));

  let valor: string | null = null;
  let data: string | null = null;
  let tipo: "INCOME" | "EXPENSE" | null = null;
  let cartao = false;
  let forma: FormaPagamento = null;
  let parcelas = 1;
  const palavras: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = normais[i];
    const seguinte = normais[i + 1];

    if (t === "hoje") { data ??= hoje; continue; }
    if (t === "ontem") { data ??= somarDiasAoDia(hoje, -1); continue; }
    if (t === "anteontem") { data ??= somarDiasAoDia(hoje, -2); continue; }
    if (t === "dia" && seguinte && /^\d{1,2}$/.test(seguinte)) {
      const d = lerDiaDoMes(Number(seguinte), hoje, passado);
      if (d) { data ??= d; i++; continue; }
    }
    const barra = lerDataBarra(t, hoje);
    if (barra) { data ??= barra; continue; }

    // Parcelas: "3x", "em 3x", "3 vezes", "3 parcelas"
    const px = t.match(/^(\d{1,2})x$/);
    if (px) { parcelas = Math.max(1, Number(px[1])); continue; }
    if (/^\d{1,2}$/.test(t) && (seguinte === "vezes" || seguinte === "parcelas") && valor) {
      parcelas = Math.max(1, Number(t));
      i++;
      continue;
    }
    if (t === "a" && seguinte === "vista") { i++; continue; }

    if (RECEITA.has(t)) { tipo ??= "INCOME"; continue; }
    if (DESPESA.has(t)) { tipo ??= "EXPENSE"; continue; }
    if (CARTAO.has(t)) { cartao = true; continue; }
    if (FORMAS[t]) { forma ??= FORMAS[t]; continue; }

    if (!valor) {
      const v = lerValor(tokens[i]);
      if (v) { valor = v; continue; }
    }
    if (VAZIAS.has(t)) continue;
    palavras.push(tokens[i]);
  }

  if (!valor) return { tipo: "desconhecido" };
  return {
    tipo: "lancamento",
    lancamento: {
      tipo: tipo ?? "EXPENSE",
      tipoExplicito: tipo !== null,
      valor,
      data: data ?? hoje,
      palavras,
      cartao,
      forma,
      parcelas: Math.min(parcelas, 24),
    },
  };
}

// Código de 6 dígitos para ligar o número: "123456", "Famicash 123456", "código: 123 456"
export function lerCodigoDeVinculo(texto: string): string | null {
  const n = normalizar(texto).trim();
  const m = n.match(/^(?:famicash|codigo|cod|meu codigo)?[\s:.-]*(\d{3})\s?(\d{3})[\s.!]*$/);
  return m ? `${m[1]}${m[2]}` : null;
}
