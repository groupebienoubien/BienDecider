-- US #289, #22, #179 (stories 11.1 a 11.3) : contenus des missions et leurs versions. Additif. Retour arriere : supprimer les deux tables.
-- CreateTable
CREATE TABLE "MissionContent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "channel" TEXT,
    "format" TEXT NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "validatedNumber" INTEGER,
    "validatedAt" TIMESTAMP(3),
    "suggestion" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "note" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MissionContent_companyId_idx" ON "MissionContent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionContent_missionId_key" ON "MissionContent"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_contentId_number_key" ON "ContentVersion"("contentId", "number");

-- AddForeignKey
ALTER TABLE "MissionContent" ADD CONSTRAINT "MissionContent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionContent" ADD CONSTRAINT "MissionContent_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "MissionContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

