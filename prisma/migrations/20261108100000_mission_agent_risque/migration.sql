-- US #284 : agent responsable et risque ou limite d'une mission, rédigés par Paul. Additif.
-- Retour arrière : supprimer les deux colonnes.

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN "responsibleAgent" TEXT,
ADD COLUMN "risk" TEXT;
