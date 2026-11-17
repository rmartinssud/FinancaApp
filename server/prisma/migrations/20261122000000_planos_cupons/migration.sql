-- Fase 10: planos por espaço, cupons e contagem de mensagens da IA.
-- Os espaços que já existem ganham os mesmos 15 dias de teste do Família (o default é calculado linha a linha).

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('GRATIS', 'FAMILIA', 'FAMILIA_PLUS');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "plan" "PlanTier" NOT NULL DEFAULT 'GRATIS',
ADD COLUMN     "planEndsAt" TIMESTAMP(3),
ADD COLUMN     "planProvider" TEXT,
ADD COLUMN     "planProviderSubscriptionId" TEXT,
ADD COLUMN     "planSource" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) DEFAULT (now() + '15 days'::interval);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "months" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planEndsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "householdId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("householdId","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_voucherId_householdId_key" ON "voucher_redemptions"("voucherId", "householdId");

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

