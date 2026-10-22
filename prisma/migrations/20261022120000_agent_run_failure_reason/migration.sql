-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "failureReason" TEXT;

-- Les exécutions échouées avant ce motif sont classées en panne.
UPDATE "AgentRun" SET "failureReason" = 'outage' WHERE "status" = 'failed' AND "failureReason" IS NULL;
