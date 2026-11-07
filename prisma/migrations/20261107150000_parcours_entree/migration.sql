-- US #279 : parcours d'entrée en cinq étapes, compte créé en dernier. Additif.
-- Retour arrière : supprimer la table OnboardingDraft et les six colonnes ajoutées à Company.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ambitionText" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "offers" TEXT,
ADD COLUMN     "profileConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "targetClients" TEXT;

-- CreateTable
CREATE TABLE "OnboardingDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "profile" JSONB NOT NULL,
    "ambition" JSONB,
    "profileConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "diagnosticReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDraft_tokenHash_key" ON "OnboardingDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "OnboardingDraft_expiresAt_idx" ON "OnboardingDraft"("expiresAt");
