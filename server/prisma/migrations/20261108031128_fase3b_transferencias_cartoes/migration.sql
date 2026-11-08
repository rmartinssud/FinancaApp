-- Fase 3b: transferências entre contas, cartões de crédito e faturas.
-- Só ADICIONA colunas opcionais, índices e chaves estrangeiras: nenhum dado existente é alterado ou apagado.

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'OTHER');

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "brand" "CardBrand",
ADD COLUMN     "color" TEXT,
ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "invoiceMonth" TEXT,
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "toAccountId" TEXT;

-- CreateIndex
CREATE INDEX "transactions_toAccountId_idx" ON "transactions"("toAccountId");

-- CreateIndex
CREATE INDEX "transactions_householdId_invoiceMonth_idx" ON "transactions"("householdId", "invoiceMonth");

-- CreateIndex
CREATE INDEX "transactions_purchaseId_idx" ON "transactions"("purchaseId");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
