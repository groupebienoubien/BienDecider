import { prisma } from "@/lib/prisma";
import type { PlanTheme } from "@/lib/plan-themes";
import { CHAT_REQUEST_TIMING } from "@/lib/agents/plan-item-shared";

export const PLAN_AGENTS = ["marketing", "contenu", "demarchage"] as const;
export type PlanAgent = (typeof PLAN_AGENTS)[number];

export function isPlanAgent(agent: string): agent is PlanAgent {
  return (PLAN_AGENTS as readonly string[]).includes(agent);
}

/** Une action reste "lancée" tant qu'une proposition attend une validation, sinon elle est terminée. */
export function statusAfterRun(pendingValidation: number): "lance" | "termine" {
  return pendingValidation > 0 ? "lance" : "termine";
}

export { CHAT_REQUEST_TIMING };

/**
 * Action du plan créée pour une demande faite à Paul dans le chat : sans
 * elle, les productions demandées en conversation n'étaient rattachées à
 * rien et le dirigeant suivait deux fils, le chat et le plan.
 */
export async function createChatPlanItem(companyId: string, agent: PlanAgent, title: string, brief: string, theme: PlanTheme, priority: number, outcome?: string) {
  return prisma.actionPlanItem.create({
    data: { companyId, agent, title: title.trim(), rationale: brief.trim(), outcome: outcome?.trim() || null, timing: CHAT_REQUEST_TIMING, theme, priority },
  });
}

/** Action du plan encore "à lancer" de cette entreprise pour cet agent, ou null. */
export async function findLaunchablePlanItem(companyId: string, agent: PlanAgent, planItemId: string) {
  return prisma.actionPlanItem.findFirst({ where: { id: planItemId, companyId, agent, status: "propose" } });
}
