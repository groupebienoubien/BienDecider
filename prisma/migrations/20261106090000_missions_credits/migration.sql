-- US #277, #314 et #56 (stories 9.1 a 9.3) : modele Mission et credits. Additif : table neuve pour les missions (l'ancien plan d'action n'est pas repris),
-- deux colonnes de credits sur l'entreprise (20 credits offerts a tous, D1) et le registre des credits en ajout seul. Retour arriere : supprimer les deux tables et les deux colonnes.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "creditGrantedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "channel" TEXT,
    "stopRuleDays" INTEGER,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "originalOutcome" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "previousStatus" TEXT,
    "position" INTEGER NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "contactsConfirmedAt" TIMESTAMP(3),
    "firstLaunchedAt" TIMESTAMP(3),
    "hasValidatedVersion" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "missionId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mission_companyId_status_idx" ON "Mission"("companyId", "status");

-- CreateIndex
CREATE INDEX "CreditLedger_companyId_createdAt_idx" ON "CreditLedger"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
