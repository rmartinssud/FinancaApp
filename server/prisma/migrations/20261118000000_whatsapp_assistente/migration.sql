-- Memória curta do assistente de IA do WhatsApp
-- CreateEnum
CREATE TYPE "WhatsAppChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "whatsapp_chat_messages" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "role" "WhatsAppChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_chat_messages_waId_createdAt_idx" ON "whatsapp_chat_messages"("waId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_chat_messages_createdAt_idx" ON "whatsapp_chat_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_chat_messages" ADD CONSTRAINT "whatsapp_chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_chat_messages" ADD CONSTRAINT "whatsapp_chat_messages_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

