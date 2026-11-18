// Planos do Famicash (Fase 10). Os mesmos números do servidor (server/src/services/planos.ts):
// a landing usa esta lista; a tela Meu plano usa a que vem da API.
export const DIAS_TESTE = 15;

export const PLANOS = [
  {
    id: "GRATIS",
    nome: "Grátis",
    precoAnual: 0,
    precoMensal: 0,
    descricao: "Para começar a organizar suas finanças.",
    itens: ["Sem anúncios", "2 contas e 1 cartão", "1 dívida e 1 objetivo", "30 mensagens/mês no assistente do WhatsApp", "Só você no espaço", "100 MB de anexos"],
  },
  {
    id: "FAMILIA",
    nome: "Família",
    precoAnual: 99.9,
    precoMensal: 11.9,
    descricao: "Para a casa toda registrar junto.",
    itens: ["Contas, cartões, dívidas e objetivos ilimitados", "Até 4 pessoas", "300 mensagens/mês no assistente do WhatsApp", "1 GB de anexos"],
    destaque: true,
  },
  {
    id: "FAMILIA_PLUS",
    nome: "Família+",
    precoAnual: 169.9,
    precoMensal: 19.9,
    descricao: "Para famílias maiores e quem usa muito o WhatsApp.",
    itens: ["Tudo do plano Família", "Até 8 pessoas", "1.000 mensagens/mês no assistente", "Respostas em áudio no WhatsApp", "5 GB de anexos"],
  },
];

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const preco = (v) => (v ? reais.format(v) : "R$ 0");

export const NOME_PLANO = { GRATIS: "Grátis", FAMILIA: "Família", FAMILIA_PLUS: "Família+" };
