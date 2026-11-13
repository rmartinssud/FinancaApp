-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BUDGET_WARNING', 'BUDGET_OVER', 'INVOICE_DUE', 'BILLS_DIGEST');

-- CreateTable
CREATE TABLE "alert_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL DEFAULT 'EMAIL',
    "budget" BOOLEAN NOT NULL DEFAULT true,
    "invoice" BOOLEAN NOT NULL DEFAULT true,
    "bills" BOOLEAN NOT NULL DEFAULT true,
    "invoiceDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "type" "AlertType" NOT NULL,
    "refKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_preferences_householdId_idx" ON "alert_preferences"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_preferences_userId_householdId_channel_key" ON "alert_preferences"("userId", "householdId", "channel");

-- CreateIndex
CREATE INDEX "sent_alerts_householdId_idx" ON "sent_alerts"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "sent_alerts_userId_householdId_channel_type_refKey_key" ON "sent_alerts"("userId", "householdId", "channel", "type", "refKey");

-- AddForeignKey
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_alerts" ADD CONSTRAINT "sent_alerts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

