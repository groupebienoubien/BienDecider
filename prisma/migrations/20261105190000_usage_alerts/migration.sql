-- US #72 (story 7.3) : seuils d'alerte de consommation et historique des alertes. Additif ; sans ligne de réglage, les seuils par défaut s'appliquent (3 $ par entreprise, 10 $ au total, par jour).
-- CreateTable
CREATE TABLE "UsageAlertSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "companyDailyUsd" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "totalDailyUsd" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageAlertSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageAlert" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "thresholdUsd" DOUBLE PRECISION NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageAlert_createdAt_idx" ON "UsageAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageAlert_day_scope_key" ON "UsageAlert"("day", "scope");
