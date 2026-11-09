-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('INSTALLMENT', 'REPEAT', 'FIXED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recurrence" "Recurrence";

-- CreateIndex
CREATE INDEX "transactions_groupId_idx" ON "transactions"("groupId");
