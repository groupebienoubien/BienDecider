-- US #288 : une conversation de Paul par contexte (spec 16.1, D12), priorite choisie avec Paul (J-08), propositions sur les missions.
-- Additif. Les messages existants sont rattaches a la conversation « strategie » par la valeur par defaut.
-- Retour arriere : supprimer l'index, les colonnes ChatMessage.contextKey et Company.priorityMissionId.

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "contextKey" TEXT NOT NULL DEFAULT 'strategie';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "priorityMissionId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_companyId_contextKey_createdAt_idx" ON "ChatMessage"("companyId", "contextKey", "createdAt");

-- Cartes de l'ancien plan (lancement d'agents, revision de productions, objectif) : leurs outils sont retires,
-- une carte encore en attente ne peut plus etre acceptee.
UPDATE "PaulPendingAction" SET "status" = 'expired', "decidedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'pending' AND "type" IN ('launch_plan_item', 'revise_proposal', 'update_objective');
