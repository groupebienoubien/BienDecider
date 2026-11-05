-- US #83 et #62 (stories 8.1 et 8.2) : erreurs serveur tracees et credit du fournisseur du modele. Additif ; sans reglage de credit, rien n'est affiche ni alerte.
-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "routeType" TEXT,
    "digest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCreditSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "balanceUsd" DOUBLE PRECISION NOT NULL,
    "balanceAt" TIMESTAMP(3) NOT NULL,
    "alertBelowUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmCreditSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorEvent_createdAt_idx" ON "ErrorEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorEvent_fingerprint_createdAt_idx" ON "ErrorEvent"("fingerprint", "createdAt");
