-- US #291 : photo importee dans un visuel et droits d'utilisation confirmes par version. Additif.
-- Retour arriere : supprimer les colonnes.

-- AlterTable
ALTER TABLE "ContentVersion" ADD COLUMN "photo" JSONB,
ADD COLUMN "rightsConfirmedAt" TIMESTAMP(3);
