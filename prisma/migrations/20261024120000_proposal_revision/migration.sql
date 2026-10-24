-- Story 3.3 : versions précédentes des productions, révisées par leur agent ou modifiées par le dirigeant.
-- CreateTable
CREATE TABLE "ProposalRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "previousContent" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "instruction" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalRevision_proposalId_fromVersion_key" ON "ProposalRevision"("proposalId", "fromVersion");

-- CreateIndex
CREATE INDEX "ProposalRevision_agentRunId_idx" ON "ProposalRevision"("agentRunId");

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
