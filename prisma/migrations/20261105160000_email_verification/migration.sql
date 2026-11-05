-- US #64 (story 6.4) : confirmation de l'adresse e-mail et jetons à usage unique (aussi utilisés par #24).
-- AlterTable : le défaut confirme tous les comptes existants (pilotes) ; seule la route d'inscription crée un compte non confirmé.
ALTER TABLE "Company" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_companyId_kind_idx" ON "EmailToken"("companyId", "kind");

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
