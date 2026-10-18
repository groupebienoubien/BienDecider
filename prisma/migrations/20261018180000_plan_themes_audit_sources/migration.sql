ALTER TABLE "ActionPlanItem" ADD COLUMN "theme" TEXT;
ALTER TABLE "ActionPlanItem" ADD COLUMN "priority" INTEGER;
ALTER TABLE "AuditFinding" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "AuditFinding" ADD COLUMN "sourceStatus" TEXT;
ALTER TABLE "AgentRun" ALTER COLUMN "maxDurationSeconds" SET DEFAULT 300;

UPDATE "ActionPlanItem"
SET "theme" = CASE
  WHEN "agent" = 'demarchage' THEN 'Prospection'
  WHEN "agent" = 'marketing' THEN 'Visibilité'
  ELSE NULL
END;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS position
  FROM "ActionPlanItem"
)
UPDATE "ActionPlanItem" AS item
SET "priority" = ranked.position
FROM ranked
WHERE item."id" = ranked."id";