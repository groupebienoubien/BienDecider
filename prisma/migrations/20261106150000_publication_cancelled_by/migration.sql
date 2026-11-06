-- US #261 (story 12.4) : auteur d'une annulation de programmation (vous ou l'ordonnanceur). Additif. Retour arriere : supprimer la colonne.
-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "cancelledBy" TEXT;


