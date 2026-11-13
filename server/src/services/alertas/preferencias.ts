import type { AlertChannel, AlertPreference, MemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

// ─────────────────────────────────────────────
// Quem recebe alertas de um espaço, e quais.
//
// - Dono (OWNER): tudo ligado por padrão.
// - Membro (MEMBER; ADMIN é tratado como Membro): pode receber, mas começa desligado (liga em Segurança).
// - Visualizador (VIEWER): não recebe alertas.
// - Só e-mails verificados.
// ─────────────────────────────────────────────

export const TIPOS_PREFERENCIA = ["budget", "invoice", "bills"] as const;
export type TipoPreferencia = (typeof TIPOS_PREFERENCIA)[number];

export type Preferencias = { budget: boolean; invoice: boolean; bills: boolean; invoiceDaysBefore: number };

export const DIAS_FATURA_PADRAO = 3;
export const DIAS_FATURA_MAX = 10;

export function podeReceber(role: MemberRole) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

// Preferências valendo: a linha salva ou o padrão do papel
export function preferenciasEfetivas(role: MemberRole, salvo: Pick<AlertPreference, TipoPreferencia | "invoiceDaysBefore"> | null): Preferencias {
  if (!podeReceber(role)) return { budget: false, invoice: false, bills: false, invoiceDaysBefore: salvo?.invoiceDaysBefore ?? DIAS_FATURA_PADRAO };
  if (salvo) return { budget: salvo.budget, invoice: salvo.invoice, bills: salvo.bills, invoiceDaysBefore: salvo.invoiceDaysBefore };
  const ligado = role === "OWNER";
  return { budget: ligado, invoice: ligado, bills: ligado, invoiceDaysBefore: DIAS_FATURA_PADRAO };
}

export type Inscrito = { userId: string; nome: string; email: string; prefs: Preferencias };

// Pessoas do espaço que recebem alertas neste canal (com pelo menos um tipo ligado)
export async function inscritosDoEspaco(householdId: string, canal: AlertChannel): Promise<Inscrito[]> {
  const membros = await prisma.householdMember.findMany({
    where: { householdId, role: { in: ["OWNER", "ADMIN", "MEMBER"] }, user: { emailVerified: true } },
    include: {
      user: {
        select: { id: true, name: true, email: true, alertPreferences: { where: { householdId, channel: canal } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return membros
    .map((m) => ({
      userId: m.user.id,
      nome: m.user.name,
      email: m.user.email,
      prefs: preferenciasEfetivas(m.role, m.user.alertPreferences[0] ?? null),
    }))
    .filter((i) => i.prefs.budget || i.prefs.invoice || i.prefs.bills);
}
