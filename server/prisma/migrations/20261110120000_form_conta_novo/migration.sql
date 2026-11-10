-- Tipo "Outros"
ALTER TYPE "AccountType" ADD VALUE 'OTHER';

-- Novos campos do formulário de conta
ALTER TABLE "financial_accounts" ADD COLUMN "accountNumber" TEXT;
ALTER TABLE "financial_accounts" ADD COLUMN "notes" TEXT;
ALTER TABLE "financial_accounts" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN "showOnSummary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "financial_accounts" ADD COLUMN "ignoreInTotals" BOOLEAN NOT NULL DEFAULT false;
