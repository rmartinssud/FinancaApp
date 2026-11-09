-- Fase 4: Família e espaços (vários espaços por login, convites, papéis, quem lançou)
-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_createdById_fkey";

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "isPersonal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastHouseholdId" TEXT;

-- CreateTable
CREATE TABLE "household_invites" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_tokenHash_key" ON "household_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "household_invites_householdId_idx" ON "household_invites"("householdId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_lastHouseholdId_fkey" FOREIGN KEY ("lastHouseholdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Dados existentes: cada pessoa ganhou um único espaço no cadastro, então
-- todos os espaços atuais são "pessoais". O nome passa de "Família Fulano" para "Pessoal".
UPDATE "households" SET "isPersonal" = true;
UPDATE "households" SET "name" = 'Pessoal' WHERE "name" LIKE 'Família %';

-- O papel ADMIN não é usado: vira MEMBER.
UPDATE "household_members" SET "role" = 'MEMBER' WHERE "role" = 'ADMIN';

-- Todo espaço precisa de ao menos um dono: o membro mais antigo vira OWNER.
UPDATE "household_members" m SET "role" = 'OWNER'
WHERE m."id" IN (
  SELECT DISTINCT ON ("householdId") "id" FROM "household_members"
  WHERE "householdId" NOT IN (SELECT "householdId" FROM "household_members" WHERE "role" = 'OWNER')
  ORDER BY "householdId", "createdAt" ASC
);
