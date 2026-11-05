-- US #278, #283, #285, #286, #313 (stories 10.1 a 10.4) : espace V5.2 active par entreprise pendant la bascule (faux par defaut, l'ancien parcours reste en service)
-- et journal des decisions (spec, section 15). Additif. Retour arriere : supprimer la table JournalEntry et la colonne workspaceV52.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "workspaceV52" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "missionId" TEXT,
    "code" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'owner',
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_createdAt_idx" ON "JournalEntry"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_missionId_idx" ON "JournalEntry"("missionId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

