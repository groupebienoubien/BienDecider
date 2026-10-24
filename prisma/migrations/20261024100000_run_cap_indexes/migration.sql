-- Story 3.2 : index des comptes de plafond par exécution.
CREATE INDEX "AgentProposal_agentRunId_idx" ON "AgentProposal"("agentRunId");

CREATE INDEX "AuditFinding_agentRunId_idx" ON "AuditFinding"("agentRunId");
