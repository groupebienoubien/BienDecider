-- Story 4.1 : limite propre aux messages à Paul et à « Préremplir mon profil »,
-- distincte des lancements d'agents (migration additive, les entreprises existantes reçoivent les défauts).
ALTER TABLE "Company" ADD COLUMN "dailyChatMessageLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Company" ADD COLUMN "monthlyChatMessageLimit" INTEGER NOT NULL DEFAULT 500;
