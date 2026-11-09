-- US #290 : identité de marque confirmée (couleurs, ton), composition du visuel d'un contenu et instantané de marque par version. Additif.
-- Retour arrière : supprimer les colonnes.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "brandPrimary" TEXT,
ADD COLUMN "brandAccent" TEXT,
ADD COLUMN "brandTone" TEXT,
ADD COLUMN "brandOrigins" JSONB,
ADD COLUMN "brandProposal" JSONB,
ADD COLUMN "brandConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MissionContent" ADD COLUMN "visualComposition" TEXT;

-- AlterTable
ALTER TABLE "ContentVersion" ADD COLUMN "brandSnapshot" JSONB;
