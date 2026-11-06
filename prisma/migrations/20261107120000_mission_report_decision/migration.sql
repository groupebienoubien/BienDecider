-- Bilan et décision de suite d'une mission (#294, #52).

-- CreateTable
CREATE TABLE "MissionReport" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "qualifiedLeads" INTEGER NOT NULL,
    "meetings" INTEGER NOT NULL,
    "signedRevenue" INTEGER,
    "note" TEXT,
    "publicationCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MissionReport_counts_check" CHECK ("qualifiedLeads" >= 0 AND "meetings" >= 0 AND "meetings" <= "qualifiedLeads" AND ("signedRevenue" IS NULL OR "signedRevenue" >= 0))
);

-- CreateTable
CREATE TABLE "MissionDecision" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "publicationCount" INTEGER NOT NULL,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MissionReport_missionId_createdAt_idx" ON "MissionReport"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionDecision_missionId_createdAt_idx" ON "MissionDecision"("missionId", "createdAt");

-- AddForeignKey
ALTER TABLE "MissionReport" ADD CONSTRAINT "MissionReport_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionDecision" ADD CONSTRAINT "MissionDecision_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionDecision" ADD CONSTRAINT "MissionDecision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MissionReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
