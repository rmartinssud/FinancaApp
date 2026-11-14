import { randomUUID } from "node:crypto";
import { Prisma, type MemberRole, type WhatsAppDraft, type WhatsAppLink } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { whatsappConfig } from "../../env.js";
import { Decimal, ZERO, intervaloDoMes, mesAtual } from "../../lib/money.js";
import { contasComSaldo } from "../saldos.js";
import { dividirParcelas, mesDaFatura, somarMesesNaData } from "../cartoes.js";
import { mapaDePais, selecionarPorcoes, somarPorCategoria } from "../porcoes.js";
import { somarMeses } from "../../lib/money.js";
import { diaLocal, formatarDia, formatarReais } from "../alertas/regras.js";
import { lerCodigoDeVinculo, lerMensagem, somarDiasAoDia, type LancamentoLido } from "./parser.js";
import { acharCategoria, acharConta, categoriaPeloNome, montarDescricao, type CategoriaSimples, type ContaSimples } from "./casamento.js";
import { baixarMidia, enviarBotoes, enviarLista, enviarTexto, type LinhaLista } from "./cliente.js";
import { confirmarVinculo } from "./vinculo.js";
import { podeUsarWhatsApp } from "./plano.js";
import { provedorIA, type DadosComprovante } from "./ia.js";

// ─────────────────────────────────────────────
// Bot do WhatsApp: recebe o webhook do Meta e responde.
//
// - Número desconhecido: explica como ligar em famicash.com (ou liga, se mandou o código).
// - Texto: "gastei 45,90 mercado" vira um RASCUNHO com botões Confirmar / Editar categoria / Cancelar.
//   O lançamento só é criado no Confirmar. Rascunho vale 30 minutos.
// - Comandos: saldo, resumo, ajuda, cancelar.
// - Áudio e foto: passam pela IA (ia.ts); sem IA configurada, respondemos que chega em breve.
// Cada mensagem é processada uma vez só (id da mensagem do WhatsApp em whatsapp_inbound).
// ─────────────────────────────────────────────

export const VALIDADE_RASCUNHO_MIN = 30;
const SITE = "famicash.com";

// ── Tipos do webhook (só o que usamos) ────────

type MensagemWebhook = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  audio?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
};

export type PayloadWebhook = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: MensagemWebhook[];
      };
    }[];
  }[];
};

// ── Fila: responde 200 ao Meta na hora e processa depois ──

const emAndamento = new Set<Promise<void>>();

export function processarEmSegundoPlano(payload: PayloadWebhook) {
  const p = processarWebhook(payload)
    .catch((e) => console.error("WhatsApp: falha ao processar webhook", e))
    .finally(() => emAndamento.delete(p));
  emAndamento.add(p);
}

// Testes: espera tudo que está na fila terminar
export async function aguardarProcessamento() {
  while (emAndamento.size) await Promise.all([...emAndamento]);
}

export async function processarWebhook(payload: PayloadWebhook) {
  const cfg = whatsappConfig();
  if (!cfg || payload.object !== "whatsapp_business_account") return;
  for (const entrada of payload.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value;
      if (!v?.messages?.length) continue; // status de entrega, etc.
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== cfg.phoneNumberId) continue;
      for (const msg of v.messages) {
        if (!msg?.id || !msg.from) continue;
        if (!(await primeiraVez(msg.id, msg.from))) continue;
        try {
          await tratarMensagem(msg);
        } catch (e) {
          console.error(`WhatsApp: erro na mensagem ${msg.id}`, e);
          await enviarTexto(msg.from, "Ops, algo deu errado por aqui. Tente de novo daqui a pouco.").catch(() => undefined);
        }
      }
    }
  }
}

// Grava o id da mensagem. false = já processada (o Meta reenviou)
async function primeiraVez(id: string, waId: string) {
  try {
    await prisma.whatsAppInbound.create({ data: { id, waId } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

// ── Contexto de quem escreveu ─────────────────

type Contexto = {
  waId: string;
  link: WhatsAppLink;
  userId: string;
  nome: string;
  householdId: string;
  espaco: string;
  role: MemberRole;
};

const hojeLocal = () => diaLocal(new Date());

const ajudaTexto = (espaco: string) =>
  [
    "*Famicash no WhatsApp* 👋",
    "Escreva o lançamento do seu jeito:",
    "• gastei 45,90 mercado",
    "• 50 uber ontem",
    "• recebi 1200 salário",
    "• paguei 120 luz 05/11",
    "• 30 no cartão Nubank ifood",
    "• 300 no cartão Nubank em 3x tv",
    "",
    "Comandos: *saldo*, *resumo*, *ajuda*.",
    `Espaço: ${espaco} (troque em ${SITE} › Segurança › WhatsApp).`,
  ].join("\n");

const instrucoesVinculo = () =>
  [
    "Olá! Este é o WhatsApp do *Famicash* 💙",
    `Para lançar gastos por aqui, ligue seu número no app: entre em ${SITE}, toque no seu nome › Segurança › WhatsApp e mande para cá o código que aparecer.`,
  ].join("\n\n");

async function carregarContexto(waId: string): Promise<Contexto | { erro: string } | null> {
  const link = await prisma.whatsAppLink.findUnique({ where: { waId }, include: { user: { select: { name: true } } } });
  if (!link) return null;
  if (!link.householdId) return { erro: `Escolha o espaço padrão do WhatsApp em ${SITE} › Segurança › WhatsApp.` };
  const membro = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: link.householdId, userId: link.userId } },
    include: { household: { select: { name: true } } },
  });
  if (!membro) return { erro: `Você não faz mais parte do espaço padrão do WhatsApp. Escolha outro em ${SITE} › Segurança › WhatsApp.` };
  return { waId, link, userId: link.userId, nome: link.user.name, householdId: link.householdId, espaco: membro.household.name, role: membro.role };
}

// ── Roteamento ────────────────────────────────

async function tratarMensagem(msg: MensagemWebhook) {
  const waId = msg.from;
  const texto = msg.type === "text" ? (msg.text?.body ?? "") : "";

  // Código para ligar o número (vale mesmo para quem já está ligado, ex.: trocar de conta)
  const codigo = texto ? lerCodigoDeVinculo(texto) : null;
  if (codigo) {
    const r = await confirmarVinculo(waId, codigo);
    if (r.ok) {
      const primeiro = r.nome.trim().split(/\s+/)[0] || "";
      await enviarTexto(waId, `Pronto, ${primeiro}! ✅ Seu WhatsApp está ligado ao Famicash, no espaço *${r.espaco}*.\n\n${ajudaTexto(r.espaco)}`);
      return;
    }
    if (r.motivo !== "sem-codigo") {
      const motivos = {
        "codigo-errado": `Código incorreto ou vencido. Gere um novo em ${SITE} › Segurança › WhatsApp.`,
        "numero-de-outra-pessoa": "Este número já está ligado a outra conta do Famicash. Desligue por lá antes de ligar nesta.",
        "sem-espaco": `Você não faz mais parte do espaço escolhido. Gere um novo código em ${SITE}.`,
        plano: "O WhatsApp não está disponível no seu plano.",
      } as const;
      await enviarTexto(waId, motivos[r.motivo]);
      return;
    }
  }

  const ctx = await carregarContexto(waId);
  if (!ctx) return void (await enviarTexto(waId, instrucoesVinculo()));
  if ("erro" in ctx) return void (await enviarTexto(waId, ctx.erro));
  if (!(await podeUsarWhatsApp({ userId: ctx.userId, householdId: ctx.householdId }))) {
    return void (await enviarTexto(waId, "O WhatsApp não está disponível no seu plano. Veja os planos em famicash.com."));
  }

  switch (msg.type) {
    case "text":
      return tratarTexto(ctx, texto);
    case "interactive": {
      const id = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? "";
      return tratarBotao(ctx, id);
    }
    case "audio":
      return tratarAudio(ctx, msg.audio!);
    case "image":
      return tratarImagem(ctx, msg.image!);
    default:
      return void (await enviarTexto(waId, "Por enquanto eu entendo texto, áudio e foto. Exemplo: *gastei 45,90 mercado*. Mande *ajuda* para ver mais."));
  }
}

// ── Texto ─────────────────────────────────────

async function tratarTexto(ctx: Contexto, texto: string, origem?: string) {
  const leitura = lerMensagem(texto, hojeLocal());
  if (leitura.tipo === "comando") {
    switch (leitura.comando) {
      case "ajuda":
        return void (await enviarTexto(ctx.waId, ajudaTexto(ctx.espaco)));
      case "saldo":
        return void (await enviarTexto(ctx.waId, await textoSaldo(ctx)));
      case "resumo":
        return void (await enviarTexto(ctx.waId, await textoResumo(ctx)));
      case "cancelar": {
        const r = await prisma.whatsAppDraft.updateMany({ where: { waId: ctx.waId, status: "PENDING" }, data: { status: "CANCELED", awaitingCategory: false } });
        return void (await enviarTexto(ctx.waId, r.count ? "Cancelado. Nada foi lançado." : "Não há nada para cancelar."));
      }
    }
  }

  // Esperando a categoria por texto ("Editar categoria")?
  if (leitura.tipo === "desconhecido") {
    const esperando = await prisma.whatsAppDraft.findFirst({
      where: { waId: ctx.waId, status: "PENDING", awaitingCategory: true, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
    });
    if (esperando) {
      const categorias = await categoriasDoEspaco(esperando.householdId);
      const c = categoriaPeloNome(texto, categorias, esperando.type === "INCOME" ? "INCOME" : "EXPENSE");
      if (c) return aplicarCategoria(ctx, esperando, c.id);
      return void (await enviarTexto(ctx.waId, "Não achei essa categoria. Escolha na lista ou escreva o nome dela como está no app."));
    }
    const exemplo = origem ? `Entendi: “${texto.slice(0, 200)}”, mas não achei o valor.` : "Não entendi. 🤔";
    return void (await enviarTexto(ctx.waId, `${exemplo} Tente assim: *gastei 45,90 mercado* ou mande *ajuda*.`));
  }

  return criarRascunho(ctx, leitura.lancamento, origem);
}

// ── Rascunho ──────────────────────────────────

async function categoriasDoEspaco(householdId: string): Promise<CategoriaSimples[]> {
  return prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, type: true, parentId: true }, orderBy: { name: "asc" } });
}

async function contasDoEspaco(householdId: string) {
  return prisma.financialAccount.findMany({
    where: { householdId },
    select: { id: true, name: true, type: true, isDefault: true, archivedAt: true, closingDay: true, dueDay: true },
    orderBy: { createdAt: "asc" },
  });
}

const somenteLeitura = (ctx: Contexto) => `Seu acesso ao espaço ${ctx.espaco} é somente leitura, então não dá para lançar. Você ainda pode ver o *saldo* e o *resumo*.`;

async function criarRascunho(ctx: Contexto, l: LancamentoLido, origem?: string) {
  if (ctx.role === "VIEWER") return void (await enviarTexto(ctx.waId, somenteLeitura(ctx)));

  const [categorias, contas] = await Promise.all([categoriasDoEspaco(ctx.householdId), contasDoEspaco(ctx.householdId)]);
  const conta = acharConta(l.palavras, contas as ContaSimples[], { cartao: l.cartao, forma: l.forma });
  if (!conta.ok) {
    const textos = {
      "sem-conta": `Você ainda não tem conta neste espaço. Crie uma em ${SITE} › Contas.`,
      "sem-cartao": `Não achei cartão de crédito no espaço ${ctx.espaco}. Cadastre em ${SITE} › Cartões.`,
      "qual-cartao": `Qual cartão? Escreva o nome dele, ex.: *${l.valor.replace(".", ",")} no cartão ${conta.cartoes[0]?.name ?? "Nubank"} ${l.palavras.join(" ") || "mercado"}*.\nSeus cartões: ${conta.cartoes.map((c) => c.name).join(", ")}.`,
    };
    return void (await enviarTexto(ctx.waId, textos[conta.motivo]));
  }
  const escolhida = contas.find((c) => c.id === conta.conta.id)!;
  const ehCartao = escolhida.type === "CREDIT_CARD";

  // Tipo: o que a mensagem disse; sem verbo, a categoria decide ("1200 salário" é receita)
  let tipo = l.tipo;
  let categoria = acharCategoria(l.palavras, categorias, tipo);
  if (!l.tipoExplicito && !categoria && !ehCartao) {
    const deReceita = acharCategoria(l.palavras, categorias, "INCOME");
    if (deReceita) {
      tipo = "INCOME";
      categoria = deReceita;
    }
  }
  if (ehCartao && tipo === "INCOME") return void (await enviarTexto(ctx.waId, "Receita não entra no cartão. Diga a conta, ex.: *recebi 1200 salário na conta Itaú*."));
  if (l.parcelas > 1 && !ehCartao) return void (await enviarTexto(ctx.waId, "Por aqui, parcelado só no cartão. Ex.: *300 no cartão Nubank em 3x tv*."));

  let invoiceMonth: string | null = null;
  if (ehCartao) {
    if (!escolhida.closingDay || !escolhida.dueDay) {
      return void (await enviarTexto(ctx.waId, `Cadastre o dia de fechamento e de vencimento do cartão ${escolhida.name} no app antes de lançar compras.`));
    }
    invoiceMonth = mesDaFatura(new Date(`${l.data}T12:00:00.000Z`), { closingDay: escolhida.closingDay, dueDay: escolhida.dueDay });
  }

  const reserva = categoria?.name ?? (tipo === "INCOME" ? "Receita" : "Despesa");
  const descricao = montarDescricao(l.palavras, conta.usadas, reserva);
  // Um rascunho pendente por vez: o anterior (se houver) é substituído
  await prisma.whatsAppDraft.updateMany({ where: { waId: ctx.waId, status: "PENDING" }, data: { status: "CANCELED", awaitingCategory: false } });
  const rascunho = await prisma.whatsAppDraft.create({
    data: {
      userId: ctx.userId,
      householdId: ctx.householdId,
      waId: ctx.waId,
      type: tipo,
      amount: new Decimal(l.valor),
      description: descricao,
      date: new Date(`${l.data}T12:00:00.000Z`),
      accountId: escolhida.id,
      categoryId: categoria?.id ?? null,
      installments: ehCartao ? l.parcelas : 1,
      invoiceMonth,
      expiresAt: new Date(Date.now() + VALIDADE_RASCUNHO_MIN * 60 * 1000),
    },
  });
  await enviarResumoRascunho(ctx, rascunho, origem);
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeFatura = (mes: string) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

function quando(dia: string) {
  const hoje = hojeLocal();
  const curto = formatarDia(dia).slice(0, 5);
  if (dia === hoje) return `hoje (${curto})`;
  if (dia === somarDiasAoDia(hoje, -1)) return `ontem (${curto})`;
  return formatarDia(dia);
}

export async function textoDoRascunho(r: WhatsAppDraft, espaco: string) {
  const [conta, categoria] = await Promise.all([
    prisma.financialAccount.findUnique({ where: { id: r.accountId }, select: { name: true, type: true } }),
    r.categoryId ? prisma.category.findUnique({ where: { id: r.categoryId }, include: { parent: { select: { name: true } } } }) : null,
  ]);
  const receita = r.type === "INCOME";
  const cartao = conta?.type === "CREDIT_CARD";
  const nomeCategoria = categoria ? (categoria.parent ? `${categoria.parent.name} › ${categoria.name}` : categoria.name) : "sem categoria";
  const parcelas = r.installments > 1 ? ` em ${r.installments}x de ${formatarReais(dividirParcelas(r.amount, r.installments).at(-1)!)}` : "";
  return [
    `*Confirma ${receita ? "esta receita" : "esta despesa"}?*`,
    `${receita ? "💰" : "💸"} ${formatarReais(r.amount)}${parcelas} · ${r.description}`,
    `🏷️ ${nomeCategoria}`,
    cartao ? `💳 Cartão ${conta?.name}${r.invoiceMonth ? ` · fatura de ${nomeFatura(r.invoiceMonth)}` : ""}` : `🏦 ${conta?.name ?? "Conta"}`,
    `📅 ${quando(diaLocal(r.date))}`,
    `📁 Espaço ${espaco}`,
  ].join("\n");
}

async function enviarResumoRascunho(ctx: Contexto, r: WhatsAppDraft, origem?: string) {
  const texto = await textoDoRascunho(r, ctx.espaco);
  await enviarBotoes(ctx.waId, origem ? `${origem}\n\n${texto}` : texto, [
    { id: `ok:${r.id}`, titulo: "Confirmar" },
    { id: `cat:${r.id}`, titulo: "Editar categoria" },
    { id: `no:${r.id}`, titulo: "Cancelar" },
  ]);
}

// ── Botões ────────────────────────────────────

async function rascunhoDe(ctx: Contexto, id: string) {
  const r = await prisma.whatsAppDraft.findFirst({ where: { id, waId: ctx.waId, userId: ctx.userId } });
  if (!r) return null;
  return r;
}

const expirou = "Esse lançamento expirou ou já foi resolvido. Mande de novo, se quiser.";

async function tratarBotao(ctx: Contexto, id: string) {
  const [acao, draftId, extra] = id.split(":");
  if (!draftId) return void (await enviarTexto(ctx.waId, ajudaTexto(ctx.espaco)));
  const r = await rascunhoDe(ctx, draftId);
  if (!r || r.status !== "PENDING" || r.expiresAt <= new Date()) return void (await enviarTexto(ctx.waId, expirou));

  if (acao === "ok") return confirmar(ctx, r);
  if (acao === "no") {
    await prisma.whatsAppDraft.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "CANCELED", awaitingCategory: false } });
    return void (await enviarTexto(ctx.waId, "Cancelado. Nada foi lançado."));
  }
  if (acao === "cat") return pedirCategoria(ctx, r);
  if (acao === "setcat") return aplicarCategoria(ctx, r, extra === "none" ? null : extra);
  await enviarTexto(ctx.waId, ajudaTexto(ctx.espaco));
}

async function pedirCategoria(ctx: Contexto, r: WhatsAppDraft) {
  await prisma.whatsAppDraft.update({ where: { id: r.id }, data: { awaitingCategory: true } });
  const categorias = (await categoriasDoEspaco(r.householdId)).filter((c) => c.type === r.type);
  const pais = new Map(categorias.map((c) => [c.id, c.name]));
  // Categorias principais primeiro; a lista do WhatsApp mostra até 10
  const ordenadas = [...categorias.filter((c) => !c.parentId), ...categorias.filter((c) => c.parentId)];
  const linhas: LinhaLista[] = ordenadas.slice(0, 9).map((c) => ({
    id: `setcat:${r.id}:${c.id}`,
    titulo: c.name,
    ...(c.parentId ? { descricao: `em ${pais.get(c.parentId) ?? ""}` } : {}),
  }));
  linhas.push({ id: `setcat:${r.id}:none`, titulo: "Sem categoria" });
  const mais = ordenadas.length > 9 ? " Não está na lista? Escreva o nome da categoria." : " Ou escreva o nome dela.";
  await enviarLista(ctx.waId, `Escolha a categoria.${mais}`, "Ver categorias", linhas);
}

async function aplicarCategoria(ctx: Contexto, r: WhatsAppDraft, categoryId: string | null) {
  if (categoryId) {
    const c = await prisma.category.findFirst({ where: { id: categoryId, householdId: r.householdId, type: r.type === "INCOME" ? "INCOME" : "EXPENSE" } });
    if (!c) return void (await enviarTexto(ctx.waId, "Categoria não encontrada."));
  }
  const atualizado = await prisma.whatsAppDraft.update({ where: { id: r.id }, data: { categoryId, awaitingCategory: false } });
  const espaco = r.householdId === ctx.householdId ? ctx.espaco : ((await prisma.household.findUnique({ where: { id: r.householdId } }))?.name ?? ctx.espaco);
  await enviarResumoRascunho({ ...ctx, espaco }, atualizado);
}

// Cria o lançamento (ou as parcelas no cartão). Uma vez só, mesmo com dois toques no Confirmar.
async function confirmar(ctx: Contexto, r: WhatsAppDraft) {
  // Papel no espaço do rascunho (pode ter mudado desde que foi criado)
  const membro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: r.householdId, userId: ctx.userId } } });
  if (!membro || membro.role === "VIEWER") {
    await prisma.whatsAppDraft.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "CANCELED" } });
    return void (await enviarTexto(ctx.waId, membro ? somenteLeitura(ctx) : "Você não faz mais parte deste espaço. Nada foi lançado."));
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const trava = await tx.whatsAppDraft.updateMany({
      where: { id: r.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "CONFIRMED", awaitingCategory: false },
    });
    if (trava.count === 0) return { erro: expirou };

    const conta = await tx.financialAccount.findFirst({ where: { id: r.accountId, householdId: r.householdId } });
    if (!conta) throw new ErroDeNegocio("A conta deste lançamento não existe mais. Mande de novo.");
    const categoria = r.categoryId ? await tx.category.findFirst({ where: { id: r.categoryId, householdId: r.householdId } }) : null;
    const base = {
      householdId: r.householdId,
      accountId: conta.id,
      categoryId: categoria?.id ?? null,
      createdById: ctx.userId,
      description: r.description,
      source: "WHATSAPP" as const,
    };

    if (conta.type === "CREDIT_CARD") {
      if (conta.archivedAt) throw new ErroDeNegocio(`O cartão ${conta.name} está arquivado. Reative no app para lançar compras.`);
      if (!conta.closingDay || !conta.dueDay) throw new ErroDeNegocio(`Cadastre o fechamento e o vencimento do cartão ${conta.name} no app.`);
      // Mesma regra do app: compra no dia do fechamento ou depois vai para a fatura seguinte
      const primeira = mesDaFatura(r.date, { closingDay: conta.closingDay, dueDay: conta.dueDay });
      const valores = dividirParcelas(r.amount, r.installments);
      const purchaseId = randomUUID();
      const parcelado = r.installments > 1;
      let primeiroId = "";
      for (const [i, valor] of valores.entries()) {
        const t = await tx.transaction.create({
          data: {
            ...base,
            type: "EXPENSE",
            amount: valor,
            date: somarMesesNaData(r.date, i),
            status: "CONFIRMED",
            invoiceMonth: somarMeses(primeira, i),
            purchaseId,
            installmentNumber: parcelado ? i + 1 : null,
            installmentTotal: parcelado ? r.installments : null,
          },
        });
        if (i === 0) primeiroId = t.id;
      }
      await tx.whatsAppDraft.update({ where: { id: r.id }, data: { transactionId: primeiroId } });
      return { cartao: conta.name, fatura: primeira };
    }

    // Conta comum: data futura fica pendente (igual a uma conta a pagar)
    const futuro = diaLocal(r.date) > hojeLocal();
    const t = await tx.transaction.create({
      data: { ...base, type: r.type === "INCOME" ? "INCOME" : "EXPENSE", amount: r.amount, date: r.date, status: futuro ? "PENDING" : "CONFIRMED" },
    });
    await tx.whatsAppDraft.update({ where: { id: r.id }, data: { transactionId: t.id } });
    return { conta: conta.name, pendente: futuro };
  }).catch((e) => {
    if (e instanceof ErroDeNegocio) return { erro: e.message };
    throw e;
  });

  if ("erro" in resultado) return void (await enviarTexto(ctx.waId, resultado.erro!));
  const receita = r.type === "INCOME";
  const onde = "cartao" in resultado ? `no cartão ${resultado.cartao} (fatura de ${nomeFatura(resultado.fatura!)})` : `em ${resultado.conta}`;
  const pendente = "pendente" in resultado && resultado.pendente ? " Ficou como pendente (data futura)." : "";
  await enviarTexto(ctx.waId, `✅ Lançado! ${receita ? "Receita" : "Despesa"} de ${formatarReais(r.amount)} ${onde}.${pendente}\nPara desfazer, apague em Lançamentos no app.`);
}

class ErroDeNegocio extends Error {}

// ── Saldo e resumo ────────────────────────────

async function textoSaldo(ctx: Contexto) {
  const contas = (await contasComSaldo(ctx.householdId)).filter((c) => c.type !== "CREDIT_CARD");
  if (!contas.length) return `Nenhuma conta no espaço ${ctx.espaco} ainda.`;
  const somadas = contas.filter((c) => !c.ignoreInTotals);
  const total = somadas.reduce((s, c) => s.plus(c.currentBalance), ZERO);
  const linhas = contas.map((c) => `• ${c.name}: ${formatarReais(c.currentBalance)}${c.ignoreInTotals ? " (fora do total)" : ""}`);
  return [`*Saldo · ${ctx.espaco}*`, ...linhas, "", `*Total: ${formatarReais(total)}*`].join("\n");
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Mesmas regras do Início: só confirmados, sem ajustes nem transferências, sem "Ignorar nos totais";
// compras no cartão contam no mês da fatura.
async function textoResumo(ctx: Contexto) {
  const mes = mesAtual();
  const doMes = {
    householdId: ctx.householdId,
    status: "CONFIRMED" as const,
    isAdjustment: false,
    OR: [{ invoiceMonth: null, date: intervaloDoMes(mes) }, { invoiceMonth: mes }],
  };
  const [totais, despesas, pais] = await Promise.all([
    prisma.transaction.groupBy({ by: ["type"], where: { ...doMes, type: { in: ["INCOME", "EXPENSE"] }, ignoreInTotals: false }, _sum: { amount: true } }),
    prisma.transaction.findMany({ where: { ...doMes, type: "EXPENSE", ignoreInStatistics: false }, select: selecionarPorcoes }),
    mapaDePais(ctx.householdId),
  ]);
  const receitas = totais.find((t) => t.type === "INCOME")?._sum.amount ?? ZERO;
  const gastos = totais.find((t) => t.type === "EXPENSE")?._sum.amount ?? ZERO;
  const porCategoria = [...somarPorCategoria(despesas, pais).entries()].sort((a, b) => b[1].comparedTo(a[1])).slice(0, 3);
  const nomes = await prisma.category.findMany({ where: { householdId: ctx.householdId, id: { in: porCategoria.flatMap(([id]) => (id ? [id] : [])) } }, select: { id: true, name: true } });
  const linhasTop = porCategoria.map(([id, v], i) => `${i + 1}. ${nomes.find((n) => n.id === id)?.name ?? "Sem categoria"}: ${formatarReais(v)}`);
  const saldo = receitas.minus(gastos);
  return [
    `*Resumo de ${NOMES_MES[Number(mes.slice(5, 7)) - 1]} · ${ctx.espaco}*`,
    `💰 Receitas: ${formatarReais(receitas)}`,
    `💸 Despesas: ${formatarReais(gastos)}`,
    `${saldo.gte(0) ? "🟢" : "🔴"} Saldo do mês: ${formatarReais(saldo)}`,
    ...(linhasTop.length ? ["", "*Onde mais gastou*", ...linhasTop] : []),
  ].join("\n");
}

// ── Áudio e foto ──────────────────────────────

const emBreve = "Áudio e foto chegam em breve por aqui! 🎧📷 Por enquanto, escreva assim: *gastei 45,90 mercado*.";

async function tratarAudio(ctx: Contexto, audio: { id: string; mime_type?: string }) {
  if (ctx.role === "VIEWER") return void (await enviarTexto(ctx.waId, somenteLeitura(ctx)));
  const ia = provedorIA();
  if (!ia) return void (await enviarTexto(ctx.waId, emBreve));
  let texto: string;
  try {
    const { dados, mime } = await baixarMidia(audio.id);
    texto = (await ia.transcrever(dados, audio.mime_type?.split(";")[0].trim() || mime)).trim();
  } catch (e) {
    console.error("WhatsApp: falha no áudio", e);
    return void (await enviarTexto(ctx.waId, "Não consegui ouvir esse áudio. Tente de novo ou escreva a mensagem."));
  }
  if (!texto) return void (await enviarTexto(ctx.waId, "Não consegui entender o áudio. Pode escrever?"));
  await tratarTexto(ctx, texto, `🎤 Entendi: “${texto.slice(0, 300)}”`);
}

// Frase equivalente ao que a IA leu, para passar pelo mesmo caminho do texto
export function fraseDoComprovante(d: DadosComprovante, legenda?: string) {
  if (!d.valor) return null;
  const partes = [d.tipo === "INCOME" ? "recebi" : "gastei", d.valor.replace(".", ",")];
  if (legenda?.trim()) partes.push(legenda.trim());
  else {
    if (d.estabelecimento) partes.push(d.estabelecimento);
    if (d.categoriaSugerida && normalizarSimples(d.categoriaSugerida) !== normalizarSimples(d.estabelecimento ?? "")) partes.push(d.categoriaSugerida);
  }
  if (d.data) partes.push(`${d.data.slice(8, 10)}/${d.data.slice(5, 7)}/${d.data.slice(0, 4)}`);
  return partes.join(" ");
}
const normalizarSimples = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

async function tratarImagem(ctx: Contexto, imagem: { id: string; mime_type?: string; caption?: string }) {
  if (ctx.role === "VIEWER") return void (await enviarTexto(ctx.waId, somenteLeitura(ctx)));
  // Legenda com valor ("45,90 mercado") já basta, sem IA
  const legenda = imagem.caption?.trim();
  if (legenda && lerMensagem(legenda, hojeLocal()).tipo === "lancamento") return tratarTexto(ctx, legenda);

  const ia = provedorIA();
  if (!ia) return void (await enviarTexto(ctx.waId, emBreve));
  let frase: string | null;
  try {
    const { dados, mime } = await baixarMidia(imagem.id);
    const categorias = (await categoriasDoEspaco(ctx.householdId)).map((c) => c.name);
    const lido = await ia.lerComprovante(dados, imagem.mime_type || mime, { hoje: hojeLocal(), categorias, legenda });
    frase = fraseDoComprovante(lido, legenda);
  } catch (e) {
    console.error("WhatsApp: falha na foto", e);
    return void (await enviarTexto(ctx.waId, "Não consegui ler essa foto. Tente outra mais nítida ou escreva o valor."));
  }
  if (!frase) return void (await enviarTexto(ctx.waId, "Não achei o valor nessa foto. Mande uma foto mais nítida do cupom ou escreva, ex.: *gastei 45,90 mercado*."));
  await tratarTexto(ctx, frase, "📷 Li o comprovante:");
}

// ── Limpeza (no start e a cada 6 horas) ───────

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export async function limparWhatsApp(agora = new Date()) {
  await prisma.$transaction([
    // Ids de mensagens: o Meta só reenvia por alguns dias
    prisma.whatsAppInbound.deleteMany({ where: { receivedAt: { lt: new Date(agora.getTime() - 30 * UM_DIA_MS) } } }),
    prisma.whatsAppDraft.updateMany({ where: { status: "PENDING", expiresAt: { lt: agora } }, data: { status: "CANCELED", awaitingCategory: false } }),
    prisma.whatsAppDraft.deleteMany({ where: { createdAt: { lt: new Date(agora.getTime() - 90 * UM_DIA_MS) } } }),
    prisma.whatsAppLinkCode.deleteMany({ where: { expiresAt: { lt: agora } } }),
  ]);
}

export function agendarLimpezaWhatsApp() {
  const rodar = () => void limparWhatsApp().catch((e) => console.error("WhatsApp: limpeza falhou", e));
  const inicio = setTimeout(rodar, 2 * 60 * 1000);
  inicio.unref();
  const timer = setInterval(rodar, 6 * 60 * 60 * 1000);
  timer.unref();
}
