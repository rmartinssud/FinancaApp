-- CreateEnum
CREATE TYPE "WhatsAppDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AlertChannel" ADD VALUE 'WHATSAPP';

-- CreateTable
CREATE TABLE "whatsapp_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "householdId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_link_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_inbound" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "invoiceMonth" TEXT,
    "status" "WhatsAppDraftStatus" NOT NULL DEFAULT 'PENDING',
    "awaitingCategory" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_userId_key" ON "whatsapp_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_phone_key" ON "whatsapp_links"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_waId_key" ON "whatsapp_links"("waId");

-- CreateIndex
CREATE INDEX "whatsapp_links_householdId_idx" ON "whatsapp_links"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_link_codes_userId_key" ON "whatsapp_link_codes"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_link_codes_phone_idx" ON "whatsapp_link_codes"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_receivedAt_idx" ON "whatsapp_inbound"("receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_drafts_waId_status_idx" ON "whatsapp_drafts"("waId", "status");

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_drafts" ADD CONSTRAINT "whatsapp_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_drafts" ADD CONSTRAINT "whatsapp_drafts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

