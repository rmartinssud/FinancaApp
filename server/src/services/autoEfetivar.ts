import { prisma } from "../lib/prisma.js";

// ─────────────────────────────────────────────
// Efetivação automática: receitas e despesas pendentes cuja data (vencimento) já chegou
// viram "Efetivada", menos as marcadas com "Não efetivar automaticamente" (noAutoConfirm).
// Nunca mexe em compras no cartão (invoiceMonth), transferências nem ajustes de saldo.
// É um UPDATE só (atômico): rodar várias vezes ou em várias instâncias ao mesmo tempo dá no mesmo.
// ─────────────────────────────────────────────

// Fim do dia de hoje em Brasília (UTC-3 fixo): tudo com data até hoje já "chegou"
export function fimDeHojeEmBrasilia(agora = new Date()) {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 3));
}

export async function efetivarVencidos(agora = new Date()) {
  const r = await prisma.transaction.updateMany({
    where: {
      status: "PENDING",
      noAutoConfirm: false,
      type: { in: ["INCOME", "EXPENSE"] },
      invoiceMonth: null,
      isAdjustment: false,
      date: { lt: fimDeHojeEmBrasilia(agora) },
    },
    data: { status: "CONFIRMED" },
  });
  return r.count;
}

const UMA_HORA = 60 * 60 * 1000;

// Roda no start e depois a cada hora
export function agendarEfetivacao() {
  const rodar = () =>
    efetivarVencidos()
      .then((n) => n && console.log(`Efetivação automática: ${n} lançamento(s) efetivado(s).`))
      .catch((e) => console.error("Efetivação automática falhou", e));
  void rodar();
  const timer = setInterval(rodar, UMA_HORA);
  timer.unref();
  return timer;
}
