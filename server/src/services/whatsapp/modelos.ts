// ─────────────────────────────────────────────
// Modelos (templates) de mensagem do WhatsApp usados nos alertas.
//
// Mensagem que o Famicash começa (fora da janela de 24h) só sai com modelo APROVADO pelo Meta.
// Os textos abaixo são os que precisam ser cadastrados no WhatsApp Manager (categoria Utilidade,
// idioma Português (BR) = pt_BR), com os MESMOS nomes. {{1}} é sempre o primeiro nome da pessoa.
// Botão: "Link" (URL dinâmica) https://famicash.com/{{1}} — o sufixo é o caminho da tela no app.
// ─────────────────────────────────────────────

export type ModeloWhatsApp = {
  nome: string;
  idioma: "pt_BR";
  categoria: "UTILITY";
  // Texto do corpo, exatamente como cadastrar no Meta
  texto: string;
  // O que vai em cada variável, a partir do {{2}} ({{1}} = primeiro nome), com exemplo para o cadastro
  variaveis: { descricao: string; exemplo: string }[];
  rodape: string;
  botao: { texto: string; url: string; exemplo: string };
};

const RODAPE = "Famicash · desligue em Segurança no app";

export const MODELOS = {
  orcamentoAlerta: {
    nome: "famicash_orcamento_alerta",
    idioma: "pt_BR",
    categoria: "UTILITY",
    texto:
      "Olá, {{1}}! O orçamento {{2}} do espaço {{3}} chegou a {{4}} da meta.\n\nMeta: {{5}}\nUsado: {{6}}\n\nAinda dá tempo de ajustar. Toque no botão para ver os detalhes.",
    variaveis: [
      { descricao: "nome do orçamento", exemplo: "Mercado" },
      { descricao: "nome do espaço", exemplo: "Pessoal" },
      { descricao: "percentual usado", exemplo: "82%" },
      { descricao: "meta", exemplo: "R$ 800,00" },
      { descricao: "valor usado", exemplo: "R$ 656,00" },
    ],
    rodape: RODAPE,
    botao: { texto: "Ver orçamento", url: "https://famicash.com/{{1}}", exemplo: "app/orcamentos/abc123?mes=2026-11" },
  },
  orcamentoEstourou: {
    nome: "famicash_orcamento_estourou",
    idioma: "pt_BR",
    categoria: "UTILITY",
    texto:
      "Olá, {{1}}! O orçamento {{2}} do espaço {{3}} passou da meta: {{4}} usados.\n\nMeta: {{5}}\nUsado: {{6}}\n\nToque no botão para ver os detalhes.",
    variaveis: [
      { descricao: "nome do orçamento", exemplo: "Mercado" },
      { descricao: "nome do espaço", exemplo: "Pessoal" },
      { descricao: "percentual usado", exemplo: "112%" },
      { descricao: "meta", exemplo: "R$ 800,00" },
      { descricao: "valor usado", exemplo: "R$ 896,00" },
    ],
    rodape: RODAPE,
    botao: { texto: "Ver orçamento", url: "https://famicash.com/{{1}}", exemplo: "app/orcamentos/abc123?mes=2026-11" },
  },
  faturaVencendo: {
    nome: "famicash_fatura_vencendo",
    idioma: "pt_BR",
    categoria: "UTILITY",
    texto:
      "Olá, {{1}}! A fatura do cartão {{2}} (espaço {{3}}) vence em {{4}}.\n\nValor a pagar: {{5}}\n\nToque no botão para ver a fatura.",
    variaveis: [
      { descricao: "nome do cartão", exemplo: "Nubank" },
      { descricao: "nome do espaço", exemplo: "Pessoal" },
      { descricao: "vencimento e quando", exemplo: "20/11/2026 (em 3 dias)" },
      { descricao: "valor a pagar", exemplo: "R$ 1.234,56" },
    ],
    rodape: RODAPE,
    botao: { texto: "Ver fatura", url: "https://famicash.com/{{1}}", exemplo: "app/cartoes/abc123?mes=2026-11" },
  },
  contasDoDia: {
    nome: "famicash_contas_a_pagar",
    idioma: "pt_BR",
    categoria: "UTILITY",
    texto:
      "Olá, {{1}}! No espaço {{2}}, você tem {{3}} para pagar ({{4}}), no total de {{5}}.\n\nDepois de pagar, marque como efetivada no Famicash.",
    variaveis: [
      { descricao: "nome do espaço", exemplo: "Pessoal" },
      { descricao: "quantidade de contas", exemplo: "3 contas" },
      { descricao: "quando vencem", exemplo: "2 hoje e 1 amanhã" },
      { descricao: "total", exemplo: "R$ 450,00" },
    ],
    rodape: RODAPE,
    botao: { texto: "Ver lançamentos", url: "https://famicash.com/{{1}}", exemplo: "app/lancamentos?mes=2026-11" },
  },
} satisfies Record<string, ModeloWhatsApp>;

export type ChaveModelo = keyof typeof MODELOS;
