-- Paramètres de lancement durables ; les actions historiques restent compatibles.
ALTER TABLE "ActionPlanItem" ADD COLUMN "launchExtras" JSONB;
