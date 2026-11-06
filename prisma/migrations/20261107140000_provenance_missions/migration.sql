-- US #168 : provenance des missions (constat relié, déduction de Paul) et certitude des constats. Additif.
-- Retour arrière : supprimer la clé étrangère, l'index et les trois colonnes.

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN "certainty" TEXT NOT NULL DEFAULT 'a_verifier';

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN "sourceFindingId" TEXT,
ADD COLUMN "deduction" TEXT;

-- CreateIndex
CREATE INDEX "Mission_sourceFindingId_idx" ON "Mission"("sourceFindingId");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_sourceFindingId_fkey" FOREIGN KEY ("sourceFindingId") REFERENCES "AuditFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise : seul un constat dont la source a été consultée, avec son adresse, devient « Observé » ; les autres restent « À vérifier ».
UPDATE "AuditFinding" SET "certainty" = 'observe' WHERE "sourceStatus" = 'consultée' AND "sourceUrl" IS NOT NULL AND "sourceUrl" ~* '^https?://';
