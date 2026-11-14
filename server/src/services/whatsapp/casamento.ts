import { normalizar, type FormaPagamento } from "./parser.js";

// ─────────────────────────────────────────────
// Casa as palavras da mensagem com as categorias e contas/cartões do espaço.
// Sem acento e sem diferença de maiúsculas. Funções puras (recebem as listas já carregadas).
// ─────────────────────────────────────────────

export type CategoriaSimples = { id: string; name: string; type: "INCOME" | "EXPENSE"; parentId: string | null };
export type ContaSimples = {
  id: string;
  name: string;
  type: "WALLET" | "BANK" | "CREDIT_CARD" | "INVESTMENT" | "OTHER";
  isDefault: boolean;
  archivedAt: Date | null;
};

// Palavra da mensagem → nomes de categoria que ela costuma querer dizer (na ordem de preferência).
// Vale só se o espaço tiver uma categoria com um desses nomes.
const SINONIMOS: Record<string, string[]> = {
  // Mercado / alimentação
  mercado: ["mercado", "supermercado", "alimentacao", "compras"],
  supermercado: ["supermercado", "mercado", "alimentacao"],
  feira: ["feira", "mercado", "alimentacao"],
  hortifruti: ["mercado", "alimentacao"],
  acougue: ["mercado", "alimentacao"],
  padaria: ["padaria", "alimentacao", "mercado", "restaurante"],
  ifood: ["delivery", "restaurante", "restaurantes", "alimentacao", "lazer"],
  delivery: ["delivery", "restaurante", "alimentacao"],
  rappi: ["delivery", "restaurante", "alimentacao"],
  restaurante: ["restaurante", "restaurantes", "alimentacao", "lazer"],
  lanche: ["lanche", "restaurante", "alimentacao"],
  lanchonete: ["restaurante", "alimentacao"],
  pizza: ["restaurante", "delivery", "alimentacao", "lazer"],
  almoco: ["restaurante", "alimentacao"],
  jantar: ["restaurante", "alimentacao", "lazer"],
  cafe: ["restaurante", "alimentacao"],
  // Transporte
  uber: ["transporte", "uber", "aplicativo"],
  "99": ["transporte"],
  taxi: ["transporte"],
  onibus: ["transporte"],
  metro: ["transporte"],
  trem: ["transporte"],
  passagem: ["transporte", "viagem"],
  gasolina: ["combustivel", "transporte", "carro"],
  combustivel: ["combustivel", "transporte", "carro"],
  etanol: ["combustivel", "transporte", "carro"],
  alcool: ["combustivel", "transporte"],
  posto: ["combustivel", "transporte", "carro"],
  estacionamento: ["transporte", "carro"],
  pedagio: ["transporte", "carro"],
  oficina: ["carro", "transporte"],
  mecanico: ["carro", "transporte"],
  // Contas da casa
  luz: ["energia", "luz", "contas", "moradia"],
  energia: ["energia", "luz", "contas", "moradia"],
  agua: ["agua", "contas", "moradia"],
  gas: ["gas", "contas", "moradia"],
  internet: ["internet", "contas", "moradia"],
  telefone: ["telefone", "celular", "contas"],
  celular: ["celular", "telefone", "contas"],
  claro: ["contas"],
  vivo: ["contas"],
  tim: ["contas"],
  aluguel: ["aluguel", "moradia"],
  condominio: ["condominio", "moradia"],
  iptu: ["impostos", "moradia"],
  // Saúde
  farmacia: ["farmacia", "saude"],
  remedio: ["farmacia", "saude"],
  medico: ["saude"],
  consulta: ["saude"],
  dentista: ["saude"],
  exame: ["saude"],
  academia: ["academia", "saude", "lazer"],
  // Lazer e assinaturas
  cinema: ["lazer"],
  netflix: ["assinaturas", "streaming", "lazer"],
  spotify: ["assinaturas", "streaming", "lazer"],
  streaming: ["assinaturas", "streaming", "lazer"],
  show: ["lazer"],
  bar: ["lazer", "restaurante"],
  cerveja: ["lazer"],
  viagem: ["viagem", "viagens", "lazer"],
  hotel: ["viagem", "viagens", "lazer"],
  // Educação
  escola: ["educacao"],
  curso: ["educacao"],
  faculdade: ["educacao"],
  livro: ["educacao", "lazer"],
  mensalidade: ["educacao"],
  // Outros gastos
  roupa: ["vestuario", "roupas", "compras"],
  roupas: ["vestuario", "roupas", "compras"],
  pet: ["pets", "pet"],
  racao: ["pets", "pet"],
  veterinario: ["pets", "pet", "saude"],
  // Receitas
  salario: ["salario"],
  pagamento: ["salario"],
  holerite: ["salario"],
  adiantamento: ["salario"],
  vale: ["salario"],
  "13o": ["salario"],
  ferias: ["salario"],
  freela: ["freelance", "freela"],
  freelance: ["freelance", "freela"],
  job: ["freelance"],
  projeto: ["freelance"],
  venda: ["vendas", "outros"],
  rendimento: ["rendimentos", "investimentos", "outros"],
  juros: ["rendimentos", "investimentos", "outros"],
  reembolso: ["reembolso", "outros"],
};

const palavrasDe = (texto: string) => normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);

// Contém a sequência de palavras "agulha" (palavras inteiras, em ordem)?
function contemSequencia(palheiro: string[], agulha: string[]) {
  if (!agulha.length || agulha.length > palheiro.length) return -1;
  for (let i = 0; i <= palheiro.length - agulha.length; i++) {
    if (agulha.every((p, j) => palheiro[i + j] === p)) return i;
  }
  return -1;
}

// Plural simples: "mercados" casa com "mercado"
const semPlural = (p: string) => (p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p);

export function acharCategoria(palavras: string[], categorias: CategoriaSimples[], tipo: "INCOME" | "EXPENSE") {
  const texto = palavras.flatMap(palavrasDe);
  const textoSing = texto.map(semPlural);
  const doTipo = categorias.filter((c) => c.type === tipo);
  let melhor: { c: CategoriaSimples; pontos: number } | null = null;
  const considerar = (c: CategoriaSimples, pontos: number) => {
    // Subcategoria é mais específica: ganha um pouco
    const total = pontos + (c.parentId ? 5 : 0);
    if (!melhor || total > melhor.pontos) melhor = { c, pontos: total };
  };

  for (const c of doTipo) {
    const nome = palavrasDe(c.name);
    if (!nome.length) continue;
    if (contemSequencia(texto, nome) >= 0 || contemSequencia(textoSing, nome.map(semPlural)) >= 0) considerar(c, 100 + nome.join(" ").length);
  }
  if (!melhor) {
    for (const [i, p] of texto.entries()) {
      const candidatos = SINONIMOS[p] ?? SINONIMOS[textoSing[i]];
      if (!candidatos) continue;
      for (const [ordem, nomeCandidato] of candidatos.entries()) {
        const c = doTipo.find((x) => normalizar(x.name) === nomeCandidato) ?? doTipo.find((x) => normalizar(x.name).startsWith(nomeCandidato));
        if (c) {
          considerar(c, 50 - ordem);
          break;
        }
      }
    }
  }
  return (melhor as { c: CategoriaSimples } | null)?.c ?? null;
}

// Categoria pelo nome que a pessoa escreveu ("Editar categoria" por texto)
export function categoriaPeloNome(texto: string, categorias: CategoriaSimples[], tipo: "INCOME" | "EXPENSE") {
  const alvo = normalizar(texto).trim().replace(/\s+/g, " ");
  const doTipo = categorias.filter((c) => c.type === tipo);
  return doTipo.find((c) => normalizar(c.name) === alvo) ?? acharCategoria([texto], categorias, tipo);
}

export type ContaEscolhida =
  | { ok: true; conta: ContaSimples; usadas: number[] } // usadas: índices das palavras que eram o nome da conta
  | { ok: false; motivo: "sem-conta" | "qual-cartao" | "sem-cartao"; cartoes: ContaSimples[] };

// Conta ou cartão da mensagem. Pelo nome (inteiro ou uma palavra dele); "cartão" limita aos cartões;
// "dinheiro" prefere a carteira; sem nome: a conta padrão do espaço (ou a 1ª carteira / conta).
export function acharConta(palavras: string[], contas: ContaSimples[], opcoes: { cartao: boolean; forma: FormaPagamento }): ContaEscolhida {
  const ativas = contas.filter((c) => !c.archivedAt);
  const cartoes = ativas.filter((c) => c.type === "CREDIT_CARD");
  const normais = palavras.map((p) => normalizar(p));
  const candidatas = opcoes.cartao ? cartoes : ativas;

  let melhor: { c: ContaSimples; pontos: number; usadas: number[] } | null = null;
  for (const c of candidatas) {
    const nome = palavrasDe(c.name);
    if (!nome.length) continue;
    const inicio = contemSequencia(normais, nome);
    let pontos = 0;
    let usadas: number[] = [];
    if (inicio >= 0) {
      pontos = 100 + nome.join(" ").length;
      usadas = nome.map((_, j) => inicio + j);
    } else {
      // Uma palavra do nome ("nubank" casa com "Nubank Ultravioleta"). Fora do "cartão", palavras que
      // costumam ser categoria não contam ("mercado" não é a conta "Mercado Pago").
      for (const p of nome) {
        if (p.length < 3) continue;
        if (!opcoes.cartao && SINONIMOS[p]) continue;
        const i = normais.indexOf(p);
        if (i >= 0 && 50 + p.length > pontos) {
          pontos = 50 + p.length;
          usadas = [i];
        }
      }
    }
    if (!pontos) continue;
    // Sem falar "cartão": empate fica com a conta (não o cartão)
    if (c.type !== "CREDIT_CARD") pontos += 1;
    if (!melhor || pontos > melhor.pontos) melhor = { c, pontos, usadas };
  }
  if (melhor) return { ok: true, conta: melhor.c, usadas: melhor.usadas };

  if (opcoes.cartao) {
    if (cartoes.length === 1) return { ok: true, conta: cartoes[0], usadas: [] };
    return { ok: false, motivo: cartoes.length ? "qual-cartao" : "sem-cartao", cartoes };
  }
  const contasComuns = ativas.filter((c) => c.type !== "CREDIT_CARD");
  if (opcoes.forma === "dinheiro") {
    const carteira = contasComuns.find((c) => c.type === "WALLET");
    if (carteira) return { ok: true, conta: carteira, usadas: [] };
  }
  if (opcoes.forma === "pix" || opcoes.forma === "debito") {
    const banco = contasComuns.find((c) => c.isDefault && c.type === "BANK") ?? contasComuns.find((c) => c.type === "BANK");
    if (banco) return { ok: true, conta: banco, usadas: [] };
  }
  const padrao = contasComuns.find((c) => c.isDefault) ?? contasComuns.find((c) => c.type === "WALLET") ?? contasComuns[0];
  if (padrao) return { ok: true, conta: padrao, usadas: [] };
  return { ok: false, motivo: "sem-conta", cartoes };
}

// Descrição: as palavras que sobraram (sem o nome da conta), com a 1ª letra maiúscula
export function montarDescricao(palavras: string[], usadas: number[], reserva: string) {
  const resto = palavras.filter((_, i) => !usadas.includes(i)).join(" ").trim();
  const texto = resto || reserva;
  return (texto.charAt(0).toUpperCase() + texto.slice(1)).slice(0, 120);
}
