-- US #311 : trace anonyme des visites du parcours d'entrée (FR-60, addendum §4.12) et étape la plus avancée du brouillon. Additif.
-- Aucune clé vers OnboardingDraft ni Company ; identifiant aléatoire (uuid), dates sans heure.
-- Retour arrière : supprimer la table "VisitTrace" et la colonne "OnboardingDraft"."furthestStep".

-- AlterTable
ALTER TABLE "OnboardingDraft" ADD COLUMN     "furthestStep" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VisitTrace" (
    "id" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "lastStep" INTEGER NOT NULL,
    "abandonedStep" INTEGER,
    "trade" TEXT,
    "department" TEXT,
    "hasWebsite" BOOLEAN NOT NULL,
    "sourcesRead" JSONB NOT NULL DEFAULT '{}',
    "ambition" JSONB,
    "proposedTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accountCreated" BOOLEAN NOT NULL,
    "analysisCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "VisitTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitTrace_startedOn_idx" ON "VisitTrace"("startedOn");
