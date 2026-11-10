-- Orçamentos: metas de despesa/receita, filtros, agrupados e histórico da meta
-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BudgetGoalType" AS ENUM ('FIXED', 'PERCENT_INCOME', 'PERCENT_BUDGET');

-- CreateEnum
CREATE TYPE "BudgetCardDate" AS ENUM ('PURCHASE', 'INVOICE');

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "startMonth" TEXT,
    "archivedFromMonth" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "goalType" "BudgetGoalType" NOT NULL DEFAULT 'FIXED',
    "amount" DECIMAL(12,2),
    "percent" DECIMAL(5,2),
    "percentOfBudgetId" TEXT,
    "includeIgnored" BOOLEAN NOT NULL DEFAULT false,
    "includePending" BOOLEAN NOT NULL DEFAULT true,
    "cardDateRef" "BudgetCardDate" NOT NULL DEFAULT 'PURCHASE',
    "alertPercent" INTEGER,
    "showOnHome" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("budgetId","categoryId")
);

-- CreateTable
CREATE TABLE "budget_accounts" (
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "budget_accounts_pkey" PRIMARY KEY ("budgetId","accountId")
);

-- CreateTable
CREATE TABLE "budget_group_items" (
    "groupId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,

    CONSTRAINT "budget_group_items_pkey" PRIMARY KEY ("groupId","budgetId")
);

-- CreateTable
CREATE TABLE "budget_goals" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "onlyMonth" BOOLEAN NOT NULL DEFAULT false,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_householdId_kind_idx" ON "budgets"("householdId", "kind");

-- CreateIndex
CREATE INDEX "budget_categories_categoryId_idx" ON "budget_categories"("categoryId");

-- CreateIndex
CREATE INDEX "budget_accounts_accountId_idx" ON "budget_accounts"("accountId");

-- CreateIndex
CREATE INDEX "budget_group_items_budgetId_idx" ON "budget_group_items"("budgetId");

-- CreateIndex
CREATE INDEX "budget_goals_budgetId_fromMonth_idx" ON "budget_goals"("budgetId", "fromMonth");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_percentOfBudgetId_fkey" FOREIGN KEY ("percentOfBudgetId") REFERENCES "budgets"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_group_items" ADD CONSTRAINT "budget_group_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_group_items" ADD CONSTRAINT "budget_group_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_goals" ADD CONSTRAINT "budget_goals_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

