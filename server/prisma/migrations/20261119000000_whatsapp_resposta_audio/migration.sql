-- Preferência de resposta do assistente do WhatsApp: texto ou áudio (nota de voz)
-- CreateEnum
CREATE TYPE "WhatsAppReplyMode" AS ENUM ('AUTO', 'TEXT', 'AUDIO');

-- AlterTable
ALTER TABLE "whatsapp_links" ADD COLUMN "replyMode" "WhatsAppReplyMode" NOT NULL DEFAULT 'AUTO';
