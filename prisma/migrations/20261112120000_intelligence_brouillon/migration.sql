-- US #361 : recherche réelle avant compte (concurrent, opportunité). Additif.
-- Retour arrière : supprimer la colonne.

-- AlterTable
ALTER TABLE "OnboardingDraft" ADD COLUMN     "intelligence" JSONB;
