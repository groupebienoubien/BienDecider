-- US #280 : analyse publique de l'entreprise avant le compte, gardée dans le brouillon. Additif.
-- Retour arrière : supprimer la colonne analysis de OnboardingDraft.
-- AlterTable
ALTER TABLE "OnboardingDraft" ADD COLUMN     "analysis" JSONB;
