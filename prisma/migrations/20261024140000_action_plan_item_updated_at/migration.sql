-- Story 3.5 : dernière mise à jour d'une action du plan, lue par Paul (migration additive).
-- Les actions existantes reprennent leur date de création.
ALTER TABLE "ActionPlanItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ActionPlanItem" SET "updatedAt" = "createdAt";
