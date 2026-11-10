-- Conta de investimento
ALTER TYPE "AccountType" ADD VALUE 'INVESTMENT';

-- Cheque especial (só conta bancária) e logo do banco (slug de public/bancos/<slug>.svg)
ALTER TABLE "financial_accounts" ADD COLUMN "overdraftLimit" DECIMAL(12,2);
ALTER TABLE "financial_accounts" ADD COLUMN "bankLogo" TEXT;
