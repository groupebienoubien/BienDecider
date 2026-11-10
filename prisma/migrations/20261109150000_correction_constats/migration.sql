-- US #169 et #292 : correction d'un constat par le dirigeant (version archivée), missions à réexaminer, capacité disponible. Additif.
-- Retour arrière : supprimer les lignes archivées (replacedAt non nul), puis les colonnes, l'index et la clé étrangère.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "availableCapacity" INTEGER,
ADD COLUMN     "capacityConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "replacedAt" TIMESTAMP(3),
ADD COLUMN     "versionOfId" TEXT;

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "findingReviewAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuditFinding_versionOfId_idx" ON "AuditFinding"("versionOfId");

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_versionOfId_fkey" FOREIGN KEY ("versionOfId") REFERENCES "AuditFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
