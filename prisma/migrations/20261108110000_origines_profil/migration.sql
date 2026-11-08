-- US #169 : origine de chaque information du profil (prénom, entreprise, localisation, activité, zone, clients, offres). Additif.
-- Retour arrière : supprimer la colonne.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "profileOrigins" JSONB;
