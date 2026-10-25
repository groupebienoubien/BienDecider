-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "googlePlaceCandidateId" TEXT,
ADD COLUMN     "googlePlaceDeclinedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "googlePlaceId" TEXT;

-- CreateTable
CREATE TABLE "SourceRead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "itemCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceRead_companyId_createdAt_idx" ON "SourceRead"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceRead_agentRunId_idx" ON "SourceRead"("agentRunId");

-- AddForeignKey
ALTER TABLE "SourceRead" ADD CONSTRAINT "SourceRead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRead" ADD CONSTRAINT "SourceRead_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
