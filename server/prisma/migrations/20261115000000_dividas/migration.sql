-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CARTAO', 'EMPRESTIMO', 'FINANCIAMENTO', 'CHEQUE_ESPECIAL', 'PESSOAL', 'OUTRA');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID', 'ARCHIVED');

-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditor" TEXT,
    "type" "DebtType" NOT NULL DEFAULT 'OUTRA',
    "startingBalance" DECIMAL(12,2) NOT NULL,
    "interestRateMonthly" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "minimumPayment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDay" INTEGER,
    "notes" TEXT,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debts_householdId_status_idx" ON "debts"("householdId", "status");

-- CreateIndex
CREATE INDEX "debts_accountId_idx" ON "debts"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "debt_payments_transactionId_key" ON "debt_payments"("transactionId");

-- CreateIndex
CREATE INDEX "debt_payments_debtId_date_idx" ON "debt_payments"("debtId", "date");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

