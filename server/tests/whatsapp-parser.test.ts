import { describe, it, expect } from "vitest";
import { lerMensagem, lerValor, lerDataBarra, lerCodigoDeVinculo, type LancamentoLido } from "../src/services/whatsapp/parser.js";
import { acharCategoria, acharConta, categoriaPeloNome, montarDescricao, type CategoriaSimples, type ContaSimples } from "../src/services/whatsapp/casamento.js";
import { normalizarTelefone, variantesDoTelefone, mesmoTelefone, formatarTelefone } from "../src/services/whatsapp/telefone.js";
import { fraseDoComprovante } from "../src/services/whatsapp/bot.js";

const HOJE = "2026-11-13"; // sexta-feira

function lancamento(texto: string, hoje = HOJE): LancamentoLido {
  const r = lerMensagem(texto, hoje);
  if (r.tipo !== "lancamento") throw new Error(`"${texto}" não virou lançamento: ${JSON.stringify(r)}`);
  return r.lancamento;
}

describe("parser: valores", () => {
  it.each([
    ["45,90", "45.90"],
    ["45.90", "45.90"],
    ["45.9", "45.90"],
    ["45", "45.00"],
    ["R$45", "45.00"],
    ["r$12,5", "12.50"],
    ["1.200", "1200.00"],
    ["1.234,56", "1234.56"],
    ["12.345.678,90", "12345678.90"],
    ["1,234.56", "1234.56"],
    ["1200", "1200.00"],
    ["0,99", "0.99"],
    ["50reais", "50.00"],
    ["45,90.", "45.90"],
  ])("%s → %s", (entrada, esperado) => {
    expect(lerValor(entrada)).toBe(esperado);
  });

  it.each(["0", "0,00", "abc", "12/11", "1.23.4", "4,5,6", ""])("rejeita %s", (entrada) => {
    expect(lerValor(entrada)).toBeNull();
  });
});

describe("parser: datas", () => {
  it("dd/mm, dd/mm/aaaa, dd-mm-aa e virada de ano", () => {
    expect(lerDataBarra("05/11", HOJE)).toBe("2026-11-05");
    expect(lerDataBarra("5/11/2026", HOJE)).toBe("2026-11-05");
    expect(lerDataBarra("05-11-26", HOJE)).toBe("2026-11-05");
    expect(lerDataBarra("31/02", HOJE)).toBeNull();
    // Em janeiro, "28/12" é o dezembro que passou
    expect(lerDataBarra("28/12", "2027-01-05")).toBe("2026-12-28");
    // Dezembro ainda deste ano (poucos dias à frente): fica no ano atual
    expect(lerDataBarra("20/12", HOJE)).toBe("2026-12-20");
  });

  it("hoje, ontem, anteontem e dia N", () => {
    expect(lancamento("50 uber").data).toBe(HOJE);
    expect(lancamento("50 uber hoje").data).toBe(HOJE);
    expect(lancamento("paguei 120 luz ontem").data).toBe("2026-11-12");
    expect(lancamento("anteontem 30 padaria").data).toBe("2026-11-11");
    expect(lancamento("paguei 120 luz dia 5").data).toBe("2026-11-05");
    // "paguei ... dia 28" no dia 13: foi no mês passado
    expect(lancamento("paguei 80 internet dia 28").data).toBe("2026-10-28");
    // Sem verbo no passado: dia 20 deste mês (conta a pagar)
    expect(lancamento("200 aluguel dia 20").data).toBe("2026-11-20");
    expect(lancamento("1/1 30 lanche", "2026-01-03").data).toBe("2026-01-01");
  });
});

describe("parser: frases em pt-BR", () => {
  it("gastei 45,90 mercado", () => {
    expect(lancamento("gastei 45,90 mercado")).toMatchObject({ tipo: "EXPENSE", tipoExplicito: true, valor: "45.90", palavras: ["mercado"], cartao: false, parcelas: 1 });
  });

  it("50 uber (sem verbo = despesa, não explícito)", () => {
    expect(lancamento("50 uber")).toMatchObject({ tipo: "EXPENSE", tipoExplicito: false, valor: "50.00", palavras: ["uber"] });
  });

  it("recebi 1200 salário", () => {
    expect(lancamento("recebi 1200 salário")).toMatchObject({ tipo: "INCOME", tipoExplicito: true, valor: "1200.00", palavras: ["salário"] });
  });

  it("Recebi R$ 1.500,00 do freela", () => {
    expect(lancamento("Recebi R$ 1.500,00 do freela")).toMatchObject({ tipo: "INCOME", valor: "1500.00", palavras: ["freela"] });
  });

  it("30 no cartão nubank ifood", () => {
    expect(lancamento("30 no cartão nubank ifood")).toMatchObject({ tipo: "EXPENSE", valor: "30.00", cartao: true, palavras: ["nubank", "ifood"] });
  });

  it("300 no cartão de crédito nubank em 3x tv", () => {
    expect(lancamento("300 no cartão de crédito nubank em 3x tv")).toMatchObject({ valor: "300.00", cartao: true, parcelas: 3, palavras: ["nubank", "tv"] });
  });

  it("comprei geladeira 2.400 em 10 vezes no crédito", () => {
    expect(lancamento("comprei geladeira 2.400 em 10 vezes no crédito")).toMatchObject({ valor: "2400.00", cartao: true, parcelas: 10, palavras: ["geladeira"] });
  });

  it("Paguei 89,90 de internet no pix", () => {
    expect(lancamento("Paguei 89,90 de internet no pix")).toMatchObject({ valor: "89.90", forma: "pix", palavras: ["internet"] });
  });

  it("25 pão em dinheiro", () => {
    expect(lancamento("25 pão em dinheiro")).toMatchObject({ valor: "25.00", forma: "dinheiro", palavras: ["pão"] });
  });

  it("mercado, 45 (valor no fim e vírgula colada)", () => {
    expect(lancamento("mercado, 45")).toMatchObject({ valor: "45.00", palavras: ["mercado"] });
  });

  it("GASTEI 12 REAIS NO ÔNIBUS (maiúsculas e acento)", () => {
    expect(lancamento("GASTEI 12 REAIS NO ÔNIBUS")).toMatchObject({ valor: "12.00", palavras: ["ÔNIBUS"] });
  });

  it("gasolina 200 05/11", () => {
    expect(lancamento("gasolina 200 05/11")).toMatchObject({ valor: "200.00", data: "2026-11-05", palavras: ["gasolina"] });
  });

  it("só o primeiro número é o valor (\"50 99 taxi\")", () => {
    expect(lancamento("50 99 taxi")).toMatchObject({ valor: "50.00", palavras: ["99", "taxi"] });
  });

  it("à vista não vira parcela", () => {
    expect(lancamento("150 no cartão inter à vista tênis")).toMatchObject({ parcelas: 1, cartao: true, palavras: ["inter", "tênis"] });
  });

  it("comandos", () => {
    expect(lerMensagem("saldo", HOJE)).toEqual({ tipo: "comando", comando: "saldo" });
    expect(lerMensagem("Saldo?", HOJE)).toEqual({ tipo: "comando", comando: "saldo" });
    expect(lerMensagem("RESUMO", HOJE)).toEqual({ tipo: "comando", comando: "resumo" });
    expect(lerMensagem("resumo do mês", HOJE)).toEqual({ tipo: "comando", comando: "resumo" });
    expect(lerMensagem("ajuda", HOJE)).toEqual({ tipo: "comando", comando: "ajuda" });
    expect(lerMensagem("Oi!", HOJE)).toEqual({ tipo: "comando", comando: "ajuda" });
    expect(lerMensagem("cancelar", HOJE)).toEqual({ tipo: "comando", comando: "cancelar" });
  });

  it("sem valor: desconhecido", () => {
    expect(lerMensagem("comprei pão", HOJE).tipo).toBe("desconhecido");
    expect(lerMensagem("", HOJE).tipo).toBe("desconhecido");
    expect(lerMensagem("alimentação", HOJE).tipo).toBe("desconhecido");
  });

  it("código de vínculo", () => {
    expect(lerCodigoDeVinculo("123456")).toBe("123456");
    expect(lerCodigoDeVinculo("Famicash 123456")).toBe("123456");
    expect(lerCodigoDeVinculo("código: 123 456")).toBe("123456");
    expect(lerCodigoDeVinculo("gastei 123456")).toBeNull();
    expect(lerCodigoDeVinculo("12345")).toBeNull();
    expect(lerCodigoDeVinculo("1234567")).toBeNull();
  });
});

// ─────────────────────────────────────────────
const cat = (id: string, name: string, type: "INCOME" | "EXPENSE" = "EXPENSE", parentId: string | null = null): CategoriaSimples => ({ id, name, type, parentId });
const CATEGORIAS = [
  cat("mer", "Mercado"),
  cat("mor", "Moradia"),
  cat("tra", "Transporte"),
  cat("sau", "Saúde"),
  cat("laz", "Lazer"),
  cat("edu", "Educação"),
  cat("con", "Contas"),
  cat("ali", "Alimentação"),
  cat("res", "Restaurantes", "EXPENSE", "ali"),
  cat("sal", "Salário", "INCOME"),
  cat("fre", "Freelance", "INCOME"),
  cat("out", "Outros", "INCOME"),
];

describe("casamento: categorias", () => {
  it.each([
    [["mercado"], "mer"],
    [["MERCADO"], "mer"],
    [["supermercado"], "mer"],
    [["uber"], "tra"],
    [["gasolina"], "tra"],
    [["luz"], "con"],
    [["internet"], "con"],
    [["aluguel"], "mor"],
    [["farmácia"], "sau"],
    [["remédio"], "sau"],
    [["ifood"], "res"], // subcategoria Restaurantes (de Alimentação)
    [["restaurantes"], "res"],
    [["almoço"], "res"],
    [["cinema"], "laz"],
    [["curso", "de", "inglês"], "edu"],
    [["saude"], "sau"],
  ])("%j → %s", (palavras, id) => {
    expect(acharCategoria(palavras as string[], CATEGORIAS, "EXPENSE")?.id).toBe(id);
  });

  it("receitas e sem categoria", () => {
    expect(acharCategoria(["salário"], CATEGORIAS, "INCOME")?.id).toBe("sal");
    expect(acharCategoria(["freela"], CATEGORIAS, "INCOME")?.id).toBe("fre");
    expect(acharCategoria(["xyz"], CATEGORIAS, "EXPENSE")).toBeNull();
    expect(acharCategoria(["salário"], CATEGORIAS, "EXPENSE")).toBeNull();
  });

  it("categoria pelo nome escrito", () => {
    expect(categoriaPeloNome("lazer", CATEGORIAS, "EXPENSE")?.id).toBe("laz");
    expect(categoriaPeloNome("Educacao", CATEGORIAS, "EXPENSE")?.id).toBe("edu");
    expect(categoriaPeloNome("nada a ver", CATEGORIAS, "EXPENSE")).toBeNull();
  });
});

const conta = (id: string, name: string, type: ContaSimples["type"], extra: Partial<ContaSimples> = {}): ContaSimples => ({ id, name, type, isDefault: false, archivedAt: null, ...extra });

describe("casamento: contas e cartões", () => {
  const CONTAS = [
    conta("cart", "Carteira", "WALLET"),
    conta("itau", "Itaú", "BANK", { isDefault: true }),
    conta("nuc", "Nubank", "BANK"),
    conta("nucc", "Nubank Ultravioleta", "CREDIT_CARD"),
    conta("inter", "Inter Gold", "CREDIT_CARD"),
    conta("velho", "Cartão Velho", "CREDIT_CARD", { archivedAt: new Date() }),
  ];
  const sem = { cartao: false, forma: null } as const;

  it("sem nome: conta padrão", () => {
    expect(acharConta(["mercado"], CONTAS, sem)).toMatchObject({ ok: true, conta: { id: "itau" }, usadas: [] });
  });
  it("sem padrão: 1ª carteira", () => {
    const semPadrao = CONTAS.map((c) => ({ ...c, isDefault: false }));
    expect(acharConta(["mercado"], semPadrao, sem)).toMatchObject({ ok: true, conta: { id: "cart" } });
  });
  it("pelo nome (com acento ou sem)", () => {
    expect(acharConta(["itau", "mercado"], CONTAS, sem)).toMatchObject({ ok: true, conta: { id: "itau" }, usadas: [0] });
    expect(acharConta(["luz", "carteira"], CONTAS, sem)).toMatchObject({ ok: true, conta: { id: "cart" }, usadas: [1] });
  });
  it("Nubank sem 'cartão' = a conta; com 'cartão' = o cartão (por uma palavra do nome)", () => {
    expect(acharConta(["nubank", "ifood"], CONTAS, sem)).toMatchObject({ ok: true, conta: { id: "nuc" } });
    expect(acharConta(["nubank", "ifood"], CONTAS, { cartao: true, forma: null })).toMatchObject({ ok: true, conta: { id: "nucc" }, usadas: [0] });
    expect(acharConta(["inter", "tênis"], CONTAS, { cartao: true, forma: null })).toMatchObject({ ok: true, conta: { id: "inter" } });
  });
  it("cartão sem nome: pergunta qual (mais de um) ou usa o único", () => {
    expect(acharConta(["ifood"], CONTAS, { cartao: true, forma: null })).toMatchObject({ ok: false, motivo: "qual-cartao" });
    const umCartao = CONTAS.filter((c) => c.id !== "inter");
    expect(acharConta(["ifood"], umCartao, { cartao: true, forma: null })).toMatchObject({ ok: true, conta: { id: "nucc" } });
    expect(acharConta(["ifood"], CONTAS.filter((c) => c.type !== "CREDIT_CARD"), { cartao: true, forma: null })).toMatchObject({ ok: false, motivo: "sem-cartao" });
  });
  it("cartão arquivado não conta", () => {
    expect(acharConta(["velho"], CONTAS, { cartao: true, forma: null })).toMatchObject({ ok: false, motivo: "qual-cartao" });
  });
  it("dinheiro → carteira; pix → banco padrão", () => {
    expect(acharConta(["pão"], CONTAS, { cartao: false, forma: "dinheiro" })).toMatchObject({ ok: true, conta: { id: "cart" } });
    expect(acharConta(["luz"], CONTAS, { cartao: false, forma: "pix" })).toMatchObject({ ok: true, conta: { id: "itau" } });
  });
  it("palavra de categoria não vira conta ('mercado' ≠ 'Mercado Pago')", () => {
    const comMP = [...CONTAS, conta("mp", "Mercado Pago", "BANK")];
    expect(acharConta(["mercado"], comMP, sem)).toMatchObject({ ok: true, conta: { id: "itau" } });
    expect(acharConta(["mercado", "pago", "luz"], comMP, sem)).toMatchObject({ ok: true, conta: { id: "mp" }, usadas: [0, 1] });
  });
  it("nenhuma conta", () => {
    expect(acharConta(["x"], [], sem)).toMatchObject({ ok: false, motivo: "sem-conta" });
  });
  it("descrição sem o nome da conta", () => {
    expect(montarDescricao(["nubank", "ifood"], [0], "Despesa")).toBe("Ifood");
    expect(montarDescricao([], [], "Mercado")).toBe("Mercado");
    expect(montarDescricao(["conta", "de", "luz"], [], "Despesa")).toBe("Conta de luz");
  });
});

describe("telefones", () => {
  it("normaliza (Brasil por padrão)", () => {
    expect(normalizarTelefone("(21) 96931-4264")).toBe("5521969314264");
    expect(normalizarTelefone("21969314264")).toBe("5521969314264");
    expect(normalizarTelefone("+55 21 96931-4264")).toBe("5521969314264");
    expect(normalizarTelefone("021 96931-4264")).toBe("5521969314264");
    expect(normalizarTelefone("(21) 3955-2279")).toBe("552139552279");
    expect(normalizarTelefone("+1 415 555 0100")).toBe("14155550100");
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("+55 21 86931-4264")).toBeNull(); // celular de 9 dígitos começa com 9
    expect(normalizarTelefone("+55 00 96931-4264")).toBeNull(); // DDD inválido
  });
  it("com e sem o 9 do celular", () => {
    expect(variantesDoTelefone("5521969314264").sort()).toEqual(["552169314264", "5521969314264"].sort());
    expect(mesmoTelefone("552169314264", "5521969314264")).toBe(true);
    expect(variantesDoTelefone("552139552279")).toEqual(["552139552279"]); // fixo (começa com 3) não ganha 9
    expect(formatarTelefone("5521969314264")).toBe("+55 21 96931-4264");
  });
});

describe("foto: frase a partir do comprovante", () => {
  it("monta a frase para o parser", () => {
    expect(fraseDoComprovante({ valor: "45.90", data: "2026-11-12", estabelecimento: "Supermercado Guanabara", categoriaSugerida: "Mercado", tipo: "EXPENSE" })).toBe(
      "gastei 45,90 Supermercado Guanabara Mercado 12/11/2026",
    );
    expect(fraseDoComprovante({ valor: "1200.00", data: null, estabelecimento: "Empresa X", categoriaSugerida: null, tipo: "INCOME" })).toBe("recebi 1200,00 Empresa X");
    expect(fraseDoComprovante({ valor: null, data: null, estabelecimento: null, categoriaSugerida: null, tipo: null })).toBeNull();
    const l = lancamento("gastei 45,90 Supermercado Guanabara Mercado 12/11/2026");
    expect(l).toMatchObject({ valor: "45.90", data: "2026-11-12" });
    expect(acharCategoria(l.palavras, CATEGORIAS, "EXPENSE")?.id).toBe("mer");
  });
});
