import type { FinancialAccount, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Decimal, ZERO, diaDoMes, diasNoMes, partesLocais, somarMeses } from "../lib/money.js";
import { serializarConta } from "./saldos.js";

// ─────────────────────────────────────────────
// Faturas do cartão de crédito
//
// Cada fatura é identificada pelo mês do VENCIMENTO ("AAAA-MM").
// Compras feitas no dia do fechamento ou depois vão para a fatura seguinte.
// Ex.: fecha dia 3, vence dia 10 → compra em 05/11 entra na fatura que vence em 10/12 ("2026-12").
// ─────────────────────────────────────────────

type DiasCartao = { closingDay: number; dueDay: number };

// Mês da fatura em que entra uma compra feita em "data"
export function mesDaFatura(data: Date, { closingDay, dueDay }: DiasCartao) {
  const { mes, dia } = partesLocais(data);
  const fechaNoMes = Math.min(closingDay, diasNoMes(mes));
  const mesFechamento = dia >= fechaNoMes ? somarMeses(mes, 1) : mes;
  // Vencimento depois do fechamento: vence no mesmo mês. Senão, no mês seguinte.
  return dueDay > closingDay ? mesFechamento : somarMeses(mesFechamento, 1);
}

// Datas de fechamento e vencimento da fatura do mês "mes"
export function datasDaFatura(mes: string, { closingDay, dueDay }: DiasCartao) {
  const mesFechamento = dueDay > closingDay ? mes : somarMeses(mes, -1);
  return { closingDate: diaDoMes(mesFechamento, closingDay), dueDate: diaDoMes(mes, dueDay) };
}

// Fatura aberta hoje (onde entra uma compra feita agora)
export function faturaAtual(cartao: DiasCartao) {
  return mesDaFatura(new Date(), cartao);
}

// Divide o valor total em parcelas iguais; os centavos que sobram ficam na 1ª parcela.
// 100,00 em 3x → 33,34 + 33,33 + 33,33
export function dividirParcelas(total: Prisma.Decimal, parcelas: number) {
  const centavos = total.times(100).toNumber();
  const base = Math.floor(centavos / parcelas);
  const sobra = centavos - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => new Decimal(base + (i === 0 ? sobra : 0)).dividedBy(100));
}

// Mesma data N meses depois, sem passar do último dia do mês (31/01 + 1 mês → 28/02)
export function somarMesesNaData(data: Date, meses: number) {
  const { mes, dia } = partesLocais(data);
  const novoMes = somarMeses(mes, meses);
  // Mantém o horário original (só a data muda)
  const base = diaDoMes(novoMes, dia);
  const horario = data.getTime() - diaDoMes(mes, dia).getTime();
  return new Date(base.getTime() + horario);
}

export type Situacao = "OPEN" | "CLOSED" | "PAID" | "OVERDUE";

// Situação da fatura: aberta, fechada (aguardando pagamento), paga ou vencida
export function situacaoDaFatura(total: Prisma.Decimal, pago: Prisma.Decimal, closingDate: Date, dueDate: Date): Situacao {
  if (total.gt(0) && pago.gte(total)) return "PAID";
  const hoje = new Date();
  // Fecha/vence no começo do dia em Brasília (as datas guardadas são 09:00 em Brasília)
  const inicioDoDia = (d: Date) => new Date(d.getTime() - 9 * 60 * 60 * 1000);
  const fimDoDia = (d: Date) => new Date(d.getTime() + 15 * 60 * 60 * 1000);
  if (hoje < inicioDoDia(closingDate)) return "OPEN";
  if (total.gt(pago) && hoje >= fimDoDia(dueDate)) return "OVERDUE";
  return "CLOSED";
}

// Totais de compras e pagamentos por fatura de vários cartões de uma vez
async function totaisPorFatura(householdId: string, cartaoIds: string[]) {
  const [compras, pagamentos] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["accountId", "invoiceMonth"],
      where: { householdId, accountId: { in: cartaoIds }, type: "EXPENSE", invoiceMonth: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["toAccountId", "invoiceMonth"],
      where: { householdId, toAccountId: { in: cartaoIds }, type: "TRANSFER", status: "CONFIRMED", invoiceMonth: { not: null } },
      _sum: { amount: true },
    }),
  ]);
  return { compras, pagamentos };
}

type CartaoComConta = FinancialAccount & { paymentAccount: { id: string; name: string } | null };

// Cartões com limite usado/disponível e a fatura atual
export async function cartoesComFatura(householdId: string, filtro: Prisma.FinancialAccountWhereInput = {}) {
  const cartoes: CartaoComConta[] = await prisma.financialAccount.findMany({
    where: { householdId, type: "CREDIT_CARD", ...filtro },
    include: { paymentAccount: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const { compras, pagamentos } = await totaisPorFatura(householdId, cartoes.map((c) => c.id));

  return cartoes.map((c) => {
    const doCartao = compras.filter((x) => x.accountId === c.id);
    const pagosDoCartao = pagamentos.filter((x) => x.toAccountId === c.id);
    const soma = (lista: { _sum: { amount: Prisma.Decimal | null } }[]) => lista.reduce((s, x) => s.plus(x._sum.amount ?? 0), ZERO);
    const totalDaFatura = (mes: string) => ({
      total: soma(doCartao.filter((x) => x.invoiceMonth === mes)),
      pago: soma(pagosDoCartao.filter((x) => x.invoiceMonth === mes)),
    });

    // Limite usado = tudo que foi comprado (inclui parcelas futuras) − o que já foi pago
    const usado = Decimal.max(soma(doCartao).minus(soma(pagosDoCartao)), ZERO);
    const limite = c.creditLimit ?? ZERO;

    let currentInvoice = null;
    let closedInvoice = null;
    if (c.closingDay && c.dueDay) {
      const dias = { closingDay: c.closingDay, dueDay: c.dueDay };
      const resumo = (mes: string) => {
        const { total, pago } = totalDaFatura(mes);
        const { closingDate, dueDate } = datasDaFatura(mes, dias);
        return {
          month: mes,
          total: total.toFixed(2),
          paid: pago.toFixed(2),
          remaining: Decimal.max(total.minus(pago), ZERO).toFixed(2),
          closingDate: closingDate.toISOString(),
          dueDate: dueDate.toISOString(),
          status: situacaoDaFatura(total, pago, closingDate, dueDate),
        };
      };
      const atual = faturaAtual(dias);
      currentInvoice = resumo(atual);
      // Fatura anterior (já fechada) ainda com valor a pagar
      const anterior = resumo(somarMeses(atual, -1));
      if (Number(anterior.remaining) > 0) closedInvoice = anterior;
    }

    return {
      ...serializarConta(c),
      paymentAccount: c.paymentAccount,
      archived: c.archivedAt !== null,
      usedLimit: usado.toFixed(2),
      availableLimit: limite.minus(usado).toFixed(2),
      currentInvoice,
      closedInvoice,
    };
  });
}
