-- US #315, #295, #36, #172 (epic 12) : diffusions des versions, pages du site vitrine, niveau de delegation. Additif. Retour arriere : supprimer les deux tables et la colonne.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "delegationLevel" TEXT NOT NULL DEFAULT 'review';

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "channel" TEXT,
    "channelLabel" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT,
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER,
    "externalId" TEXT,
    "url" TEXT,
    "failureReason" TEXT,
    "cancelReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_idempotencyKey_key" ON "Publication"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Publication_status_scheduledAt_idx" ON "Publication"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Publication_contentId_idx" ON "Publication"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_missionId_key" ON "SitePage"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_companyId_slug_key" ON "SitePage"("companyId", "slug");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MissionContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;


