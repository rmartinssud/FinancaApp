-- Comprovante (foto/PDF) recebido pelo WhatsApp, guardado por até 1 dia para virar anexo do lançamento
-- CreateTable
CREATE TABLE "whatsapp_receipts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "draftId" TEXT,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_receipts_draftId_key" ON "whatsapp_receipts"("draftId");

-- CreateIndex
CREATE INDEX "whatsapp_receipts_waId_askedAt_idx" ON "whatsapp_receipts"("waId", "askedAt");

-- CreateIndex
CREATE INDEX "whatsapp_receipts_createdAt_idx" ON "whatsapp_receipts"("createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_receipts" ADD CONSTRAINT "whatsapp_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_receipts" ADD CONSTRAINT "whatsapp_receipts_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "whatsapp_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
