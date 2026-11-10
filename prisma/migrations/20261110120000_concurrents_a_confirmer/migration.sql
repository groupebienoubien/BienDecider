-- US #292 : concurrents potentiels à confirmer ou écarter (catégorie concurrence seulement). Additif.
-- Retour arrière : supprimer les deux colonnes.

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN     "competitorConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "competitorDismissedAt" TIMESTAMP(3);
