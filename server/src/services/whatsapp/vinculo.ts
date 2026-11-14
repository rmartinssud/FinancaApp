import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../env.js";
import { variantesDoTelefone } from "./telefone.js";
import { podeUsarWhatsApp } from "./plano.js";

// ─────────────────────────────────────────────
// Ligar um número de WhatsApp a uma pessoa.
//
// 1. No app, a pessoa digita o número → geramos um código de 6 dígitos (vale 10 minutos).
// 2. Ela manda o código para o bot DESSE número.
// 3. O bot confere (número + código) e liga o número à pessoa e ao espaço escolhido.
// Um número = uma pessoa. Guardamos só o hash do código.
// ─────────────────────────────────────────────

export const VALIDADE_CODIGO_MIN = 10;
export const MAX_TENTATIVAS = 5;
export const ESPERA_NOVO_CODIGO_SEG = 15;

export function hashCodigo(codigo: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(`whatsapp:${codigo}`).digest("hex");
}

function mesmoHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

// O número (em qualquer forma) já está ligado a OUTRA pessoa?
export async function numeroDeOutraPessoa(telefone: string, userId: string) {
  const formas = variantesDoTelefone(telefone);
  const outro = await prisma.whatsAppLink.findFirst({
    where: { userId: { not: userId }, OR: [{ phone: { in: formas } }, { waId: { in: formas } }] },
    select: { id: true },
  });
  return Boolean(outro);
}

export async function gerarCodigo(userId: string, telefone: string, householdId: string) {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000);
  await prisma.whatsAppLinkCode.upsert({
    where: { userId },
    create: { userId, phone: telefone, householdId, codeHash: hashCodigo(codigo), expiresAt },
    update: { phone: telefone, householdId, codeHash: hashCodigo(codigo), expiresAt, attempts: 0, createdAt: new Date() },
  });
  return { codigo, expiresAt };
}

export type ResultadoVinculo =
  | { ok: true; nome: string; espaco: string; userId: string }
  | { ok: false; motivo: "sem-codigo" | "codigo-errado" | "numero-de-outra-pessoa" | "sem-espaco" | "plano" };

// Mensagem com código vinda de "waId". "sem-codigo" = não há código pendente para esse número
// (aí a mensagem segue o caminho normal do bot).
export async function confirmarVinculo(waId: string, codigo: string): Promise<ResultadoVinculo> {
  const formas = variantesDoTelefone(waId);
  const pendentes = await prisma.whatsAppLinkCode.findMany({
    where: { phone: { in: formas }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pendentes.length) return { ok: false, motivo: "sem-codigo" };

  const hash = hashCodigo(codigo);
  const certo = pendentes.find((p) => mesmoHash(p.codeHash, hash));
  if (!certo) {
    // Conta a tentativa errada nos códigos desse número; 5 erros invalidam o código
    for (const p of pendentes) {
      if (p.attempts + 1 >= MAX_TENTATIVAS) await prisma.whatsAppLinkCode.delete({ where: { id: p.id } }).catch(() => undefined);
      else await prisma.whatsAppLinkCode.update({ where: { id: p.id }, data: { attempts: { increment: 1 } } });
    }
    return { ok: false, motivo: "codigo-errado" };
  }

  if (await numeroDeOutraPessoa(waId, certo.userId)) return { ok: false, motivo: "numero-de-outra-pessoa" };
  if (!(await podeUsarWhatsApp({ userId: certo.userId, householdId: certo.householdId }))) return { ok: false, motivo: "plano" };

  const membro = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: certo.householdId, userId: certo.userId } },
    include: { household: { select: { name: true } }, user: { select: { name: true } } },
  });
  if (!membro) {
    await prisma.whatsAppLinkCode.delete({ where: { id: certo.id } });
    return { ok: false, motivo: "sem-espaco" };
  }

  await prisma.$transaction([
    prisma.whatsAppLink.upsert({
      where: { userId: certo.userId },
      create: { userId: certo.userId, phone: certo.phone, waId, householdId: certo.householdId },
      update: { phone: certo.phone, waId, householdId: certo.householdId, linkedAt: new Date() },
    }),
    prisma.whatsAppLinkCode.delete({ where: { id: certo.id } }),
  ]);
  return { ok: true, nome: membro.user.name, espaco: membro.household.name, userId: certo.userId };
}
