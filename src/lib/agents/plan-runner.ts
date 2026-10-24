import type { ActionPlanItem } from "@prisma/client";
import { withAgentRunWrite } from "@/lib/agent-run-execution";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { statusAfterRun, type PlanAgent } from "@/lib/agents/plan-items";
import type { AgentRunOptions } from "@/lib/agents/personas";

export type PlanRunExtras = { newsContext?: string; prospectDescription?: string };

/**
 * Lance l'agent d'une action du plan EN LUI PASSANT L'ACTION COMME BRIEF
 * (titre + justification) et rattache ses propositions à l'action. Chemin
 * unique pour le bouton "Lancer" du plan et pour les délégations de Paul
 * dans le chat. En cas d'échec de l'agent, l'erreur remonte et le statut
 * n'est pas modifié : l'action reste "à lancer".
 */
export async function executePlanItem(
  item: Pick<ActionPlanItem, "id" | "companyId" | "title" | "rationale"> & { agent: PlanAgent },
  extras: PlanRunExtras = {},
  agentRunId?: string,
) {
  const options: AgentRunOptions = { brief: `${item.title} — ${item.rationale}`, planItemId: item.id, agentRunId };
  let producedCount = 0;
  // Seules les PROPOSITIONS nécessitent une validation (affichées sous
  // l'action dans le dashboard) — les constats d'audit sont informatifs,
  // pas une raison de garder l'action en "lancé" indéfiniment.
  let pendingValidation = 0;

  switch (item.agent) {
    case "marketing": {
      const { findings, proposals } = await runMarketingAgent(item.companyId, options);
      producedCount = findings.length + proposals.length;
      pendingValidation = proposals.length;
      break;
    }
    case "contenu": {
      const proposals = await runContenuAgent(item.companyId, extras.newsContext, options);
      producedCount = proposals.length;
      pendingValidation = proposals.length;
      break;
    }
    case "demarchage": {
      const proposals = await runDemarchageAgent(item.companyId, extras.prospectDescription, options);
      producedCount = proposals.length;
      pendingValidation = proposals.length;
      break;
    }
  }

  const updated = await withAgentRunWrite(item.companyId, agentRunId, (tx) => tx.actionPlanItem.update({
    where: { id: item.id, companyId: item.companyId },
    data: { status: statusAfterRun(pendingValidation) },
  }));
  return { item: updated, producedCount, pendingValidation };
}
