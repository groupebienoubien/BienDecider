-- Bascule de tous les comptes sur l'espace V5.2 (decision des fondateurs du 2026-11-06 : pleine refonte).
-- Les donnees de l'ancien parcours sont effacees : prospects, productions (avec leurs revisions et journaux d'execution, en cascade)
-- et actions du plan. Irreversible sans restauration d'une sauvegarde (docs/sauvegarde-restauration.md).
-- Conserves : entreprises, comptes, site public publie (Company.siteHtml), diagnostic (AuditFinding), conversations, consommation, connexions.
ALTER TABLE "Company" ALTER COLUMN "workspaceV52" SET DEFAULT true;
UPDATE "Company" SET "workspaceV52" = true;

DELETE FROM "Lead";
DELETE FROM "AgentProposal";
DELETE FROM "ActionPlanItem";