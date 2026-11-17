import type { PlanTier } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mesAtual } from "../lib/money.js";

// ─────────────────────────────────────────────
// Planos (Fase 10). O plano é do ESPAÇO e quem manda é o dono.
// - plan/planEndsAt: plano de cupom (ou pago, no futuro). Vencido, não vale mais.
// - trialEndsAt: 15 dias de Família para todo espaço novo.
// - Sem nada disso: Grátis.
// Os limites só bloqueiam CRIAR coisas novas: nada que já existe é apagado.
// ─────────────────────────────────────────────

export type Recurso = "contas" | "cartoes" | "dividas" | "objetivos" | "pessoas";

export type DadosPlano = {
  id: PlanTier;
  nome: string;
  precoMensal: number;
  precoAnual: number;
  // null = ilimitado
  contas: number | null;
  cartoes: number | null;
  dividas: number | null;
  objetivos: number | null;
  pessoas: number;
  mensagensIA: number;
  voz: boolean;
  armazenamentoMB: number;
};

export const PLANOS: Record<PlanTier, DadosPlano> = {
  GRATIS: { id: "GRATIS", nome: "Grátis", precoMensal: 0, precoAnual: 0, contas: 2, cartoes: 1, dividas: 1, objetivos: 1, pessoas: 1, mensagensIA: 30, voz: false, armazenamentoMB: 100 },
  FAMILIA: { id: "FAMILIA", nome: "Família", precoMensal: 11.9, precoAnual: 99.9, contas: null, cartoes: null, dividas: null, objetivos: null, pessoas: 4, mensagensIA: 300, voz: false, armazenamentoMB: 1024 },
  FAMILIA_PLUS: { id: "FAMILIA_PLUS", nome: "Família+", precoMensal: 19.9, precoAnual: 169.9, contas: null, cartoes: null, dividas: null, objetivos: null, pessoas: 8, mensagensIA: 1000, voz: true, armazenamentoMB: 5120 },
};

export const ORDEM: PlanTier[] = ["GRATIS", "FAMILIA", "FAMILIA_PLUS"];
export const DIAS_TESTE = 15;
export const MESES_CUPOM_MAX = 12;

export type Origem = "GRATIS" | "TESTE" | "CUPOM" | "PAGO";
export type PlanoAtual = { plano: DadosPlano; origem: Origem; ate: Date | null };

type CamposPlano = { plan: PlanTier; planEndsAt: Date | null; planSource: string | null; trialEndsAt: Date | null };

export function planoEfetivo(h: CamposPlano, agora = new Date()): PlanoAtual {
  if (h.plan !== "GRATIS" && h.planEndsAt && h.planEndsAt > agora) {
    return { plano: PLANOS[h.plan], origem: h.planSource === "PAYMENT" ? "PAGO" : "CUPOM", ate: h.planEndsAt };
  }
  if (h.trialEndsAt && h.trialEndsAt > agora) return { plano: PLANOS.FAMILIA, origem: "TESTE", ate: h.trialEndsAt };
  return { plano: PLANOS.GRATIS, origem: "GRATIS", ate: null };
}

const CAMPOS = { plan: true, planEndsAt: true, planSource: true, trialEndsAt: true } as const;

export async function planoDoEspaco(householdId: string): Promise<PlanoAtual> {
  const h = await prisma.household.findUnique({ where: { id: householdId }, select: CAMPOS });
  if (!h) return { plano: PLANOS.GRATIS, origem: "GRATIS", ate: null };
  return planoEfetivo(h);
}

// ── Uso ───────────────────────────────────────

const agoraValido = () => ({ acceptedAt: null, canceledAt: null, expiresAt: { gt: new Date() } });

export async function contarRecurso(householdId: string, r: Recurso): Promise<number> {
  switch (r) {
    case "contas":
      return prisma.financialAccount.count({ where: { householdId, type: { not: "CREDIT_CARD" }, archivedAt: null } });
    case "cartoes":
      return prisma.financialAccount.count({ where: { householdId, type: "CREDIT_CARD", archivedAt: null } });
    case "dividas":
      return prisma.debt.count({ where: { householdId, status: "ACTIVE" } });
    case "objetivos":
      return prisma.goal.count({ where: { householdId, status: "ACTIVE" } });
    case "pessoas": {
      const [membros, convites] = await Promise.all([
        prisma.householdMember.count({ where: { householdId } }),
        prisma.householdInvite.count({ where: { householdId, ...agoraValido() } }),
      ]);
      return membros + convites;
    }
  }
}

export async function bytesDeAnexos(householdId: string) {
  const r = await prisma.transactionAttachment.aggregate({ where: { transaction: { householdId } }, _sum: { size: true } });
  return r._sum.size ?? 0;
}

export async function mensagensIADoMes(householdId: string, mes = mesAtual()) {
  const u = await prisma.aiUsage.findUnique({ where: { householdId_month: { householdId, month: mes } } });
  return u?.count ?? 0;
}

// ── Limites ───────────────────────────────────

const NOMES: Record<Recurso, [string, string]> = {
  contas: ["conta", "contas"],
  cartoes: ["cartão", "cartões"],
  dividas: ["dívida ativa", "dívidas ativas"],
  objetivos: ["objetivo ativo", "objetivos ativos"],
  pessoas: ["pessoa no espaço (contando convites pendentes)", "pessoas no espaço (contando convites pendentes)"],
};

export class LimiteDoPlano extends Error {
  status = 403;
  code = "LIMITE_PLANO";
}

function proximoPlano(p: PlanTier): DadosPlano | null {
  const i = ORDEM.indexOf(p);
  return i < ORDEM.length - 1 ? PLANOS[ORDEM[i + 1]] : null;
}

export function mensagemDeLimite(p: DadosPlano, r: Recurso, limite: number) {
  const [um, varios] = NOMES[r];
  const prox = proximoPlano(p.id);
  const dica = prox ? ` Para ter mais, veja o plano ${prox.nome} em Meu plano.` : "";
  if (r === "pessoas" && limite === 1) return `No plano ${p.nome}, só o dono usa o espaço.${dica}`;
  return `Seu plano ${p.nome} permite até ${limite} ${limite === 1 ? um : varios}.${dica}`;
}

// Lança LimiteDoPlano se criar mais um "r" passar do limite do plano do espaço
export async function exigirLimite(householdId: string, r: Recurso) {
  const { plano } = await planoDoEspaco(householdId);
  const limite = plano[r];
  if (limite == null) return;
  if ((await contarRecurso(householdId, r)) >= limite) throw new LimiteDoPlano(mensagemDeLimite(plano, r, limite));
}

// Anexos: recusa se o novo arquivo passar da cota do plano
export async function exigirEspacoParaAnexo(householdId: string, bytesNovos: number) {
  const { plano } = await planoDoEspaco(householdId);
  const cota = plano.armazenamentoMB * 1024 * 1024;
  if ((await bytesDeAnexos(householdId)) + bytesNovos > cota) {
    const prox = proximoPlano(plano.id);
    const total = plano.armazenamentoMB >= 1024 ? `${plano.armazenamentoMB / 1024} GB` : `${plano.armazenamentoMB} MB`;
    throw new LimiteDoPlano(`Os anexos deste espaço chegaram ao limite de ${total} do plano ${plano.nome}.${prox ? ` Para ter mais espaço, veja o plano ${prox.nome} em Meu plano.` : " Apague anexos antigos para liberar espaço."}`);
  }
}

// WhatsApp: conta uma mensagem do assistente. false = o limite do mês acabou (não conta).
export async function consumirMensagemIA(householdId: string): Promise<{ ok: boolean; plano: DadosPlano }> {
  const { plano } = await planoDoEspaco(householdId);
  const month = mesAtual();
  if ((await mensagensIADoMes(householdId, month)) >= plano.mensagensIA) return { ok: false, plano };
  await prisma.aiUsage.upsert({
    where: { householdId_month: { householdId, month } },
    create: { householdId, month, count: 1 },
    update: { count: { increment: 1 } },
  });
  return { ok: true, plano };
}

export async function vozLiberada(householdId: string) {
  return (await planoDoEspaco(householdId)).plano.voz;
}

// ── Resumo para a tela "Meu plano" e o /api/me ──

export const serializarPlano = (a: PlanoAtual) => ({
  id: a.plano.id,
  name: a.plano.nome,
  source: a.origem,
  endsAt: a.ate?.toISOString() ?? null,
});

export async function usoDoEspaco(householdId: string) {
  const atual = await planoDoEspaco(householdId);
  const p = atual.plano;
  const [contas, cartoes, dividas, objetivos, pessoas, bytes, mensagens] = await Promise.all([
    contarRecurso(householdId, "contas"),
    contarRecurso(householdId, "cartoes"),
    contarRecurso(householdId, "dividas"),
    contarRecurso(householdId, "objetivos"),
    contarRecurso(householdId, "pessoas"),
    bytesDeAnexos(householdId),
    mensagensIADoMes(householdId),
  ]);
  return {
    plan: { ...serializarPlano(atual), voice: p.voz },
    usage: {
      accounts: { used: contas, limit: p.contas },
      cards: { used: cartoes, limit: p.cartoes },
      debts: { used: dividas, limit: p.dividas },
      goals: { used: objetivos, limit: p.objetivos },
      people: { used: pessoas, limit: p.pessoas },
      aiMessages: { used: mensagens, limit: p.mensagensIA, month: mesAtual() },
      storage: { used: bytes, limit: p.armazenamentoMB * 1024 * 1024 },
    },
    plans: ORDEM.map((id) => PLANOS[id]),
  };
}

// ── Cupons ────────────────────────────────────

export const normalizarCodigo = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

function somarMeses(base: Date, meses: number) {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

export class CupomRecusado extends Error {
  constructor(msg: string, readonly status = 400) {
    super(msg);
  }
}

// Resgata o cupom no espaço: mesmo plano ativo → soma os meses; plano novo → começa hoje
// (Família durante o teste começa no fim do teste). Não troca um plano maior por um menor.
export async function resgatarCupom(householdId: string, userId: string, codigo: string) {
  const code = normalizarCodigo(codigo);
  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.findUnique({ where: { code }, include: { _count: { select: { redemptions: true } } } });
    const agora = new Date();
    if (!v || !v.active) throw new CupomRecusado("Cupom inválido. Confira o código e tente de novo.", 404);
    if (v.expiresAt && v.expiresAt <= agora) throw new CupomRecusado("Este cupom venceu.");
    if (v.maxUses != null && v._count.redemptions >= v.maxUses) throw new CupomRecusado("Este cupom já foi usado o máximo de vezes.");
    const ja = await tx.voucherRedemption.findUnique({ where: { voucherId_householdId: { voucherId: v.id, householdId } } });
    if (ja) throw new CupomRecusado("Este espaço já usou este cupom.", 409);

    const h = await tx.household.findUniqueOrThrow({ where: { id: householdId }, select: CAMPOS });
    const atual = planoEfetivo(h, agora);
    const pagoAtivo = atual.origem === "CUPOM" || atual.origem === "PAGO";
    if (pagoAtivo && ORDEM.indexOf(atual.plano.id) > ORDEM.indexOf(v.plan)) {
      throw new CupomRecusado(`Este espaço já tem o plano ${atual.plano.nome} ativo, que é maior que o do cupom.`, 409);
    }
    let base = agora;
    if (pagoAtivo && atual.plano.id === v.plan && atual.ate) base = atual.ate;
    else if (atual.origem === "TESTE" && v.plan === "FAMILIA" && atual.ate) base = atual.ate;
    const ate = somarMeses(base, Math.min(Math.max(v.months, 1), MESES_CUPOM_MAX));

    await tx.household.update({ where: { id: householdId }, data: { plan: v.plan, planEndsAt: ate, planSource: "VOUCHER" } });
    await tx.voucherRedemption.create({ data: { voucherId: v.id, householdId, userId, planEndsAt: ate } });
    return { plan: PLANOS[v.plan], endsAt: ate, months: v.months };
  });
}
