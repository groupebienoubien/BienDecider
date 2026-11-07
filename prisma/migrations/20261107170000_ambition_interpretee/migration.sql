-- US #282 : ambition reformulée par Paul, éléments retenus et date de confirmation. Additif.
-- Retour arrière : supprimer les colonnes ambitionTerms et ambitionConfirmedAt de Company.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ambitionTerms" JSONB,
ADD COLUMN     "ambitionConfirmedAt" TIMESTAMP(3);
