import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/serialization-conflict";
import type { PlanTheme } from "@/lib/plan-themes";
import { CHAT_REQUEST_TIMING, cleanPlanLaunchExtras, type PlanLaunchExtras } from "@/lib/agents/plan-item-shared";
import { launchPlanItemPayloadSchema } from "@/lib/agents/pending-action-view";
import { assertAgentExecutionActive, withAgentRunWrite } from "@/lib/agent-run-execution";

export const PLAN_AGENTS = ["marketing", "contenu", "demarchage"] as const;
export type PlanAgent = (typeof PLAN_AGENTS)[number];

export function isPlanAgent(agent: string): agent is PlanAgent {
  return (PLAN_AGENTS as readonly string[]).includes(agent);
}

/** Une action reste "lancée" tant qu'une proposition attend une validation, sinon elle est terminée. */
export function statusAfterRun(pendingValidation: number): "lance" | "termine" {
  return pendingValidation > 0 ? "lance" : "termine";
}

export { CHAT_REQUEST_TIMING, cleanPlanLaunchExtras, type PlanLaunchExtras };

/** Statuts d'une action active : à lancer ou en cours. Une action lancée, terminée ou écartée n'empêche pas d'en créer une nouvelle. */
export const ACTIVE_PLAN_ITEM_STATUSES = ["propose", "en_cours"] as const;
const MAX_SERIALIZATION_ATTEMPTS = 5;

/**
 * Action du plan créée pour une demande faite à Paul dans le chat : sans
 * elle, les productions demandées en conversation n'étaient rattachées à
 * rien et le dirigeant suivait deux fils, le chat et le plan.
 *
 * Une seule action active par agent et par thème (AD-16) : si une action
 * « à lancer » ou « en cours » du même agent et du même thème existe déjà
 * (y compris l'audit d'inscription), elle est reprise telle quelle (titre et
 * brief inchangés) au lieu d'en créer une seconde. Lecture et création se
 * font dans une transaction sérialisable : deux propositions simultanées
 * lisent « aucune action », l'une échoue en conflit, relit et reprend l'autre.
 */
export async function createChatPlanItem(companyId: string, agent: PlanAgent, title: string, brief: string, theme: PlanTheme, priority: number, outcome?: string, extras: PlanLaunchExtras = {}) {
  return withSerializableRetry(() => withAgentRunWrite(companyId, undefined, async (tx) => {
    // Doublons antérieurs : l'action en cours d'abord (« en_cours » < « propose »), puis la plus ancienne.
    const existing = await tx.actionPlanItem.findFirst({
      where: { companyId, agent, theme, status: { in: [...ACTIVE_PLAN_ITEM_STATUSES] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    assertAgentExecutionActive();
    if (existing) return { item: existing, reused: true };
    const item = await tx.actionPlanItem.create({
      data: { companyId, agent, title: title.trim(), rationale: brief.trim(), outcome: outcome?.trim() || null, launchExtras: cleanPlanLaunchExtras(extras), timing: CHAT_REQUEST_TIMING, theme, priority },
    });
    assertAgentExecutionActive();
    return { item, reused: false };
  }), MAX_SERIALIZATION_ATTEMPTS);
}

/**
 * La demande portée par l'action fait autorité, même si ses paramètres sont vides.
 * Avant l'ajout de launchExtras, seule la carte les conservait : relire la dernière
 * carte d'origine de cette entreprise, même reportée ou expirée. Une carte qui
 * reprend une action ne remplace jamais la consigne de cette action (AD-16).
 */
export async function resolvePlanLaunchExtras(companyId: string, item: { id: string; launchExtras?: unknown }): Promise<PlanLaunchExtras> {
  return withSerializableRetry(() => withAgentRunWrite(companyId, undefined, async (tx) => {
    // L'objet de l'appelant peut dater d'avant une autre lecture : seule la ligne
    // de cette entreprise fournit les paramètres courants et prouve la propriété.
    const current = await tx.actionPlanItem.findFirst({ where: { id: item.id, companyId }, select: { launchExtras: true } });
    assertAgentExecutionActive();
    if (!current) return {};
    if (current.launchExtras !== null) return cleanPlanLaunchExtras(current.launchExtras);
    const cards = await tx.paulPendingAction.findMany({
      where: { companyId, type: "launch_plan_item", payload: { path: ["planItemId"], equals: item.id } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { payload: true },
    });
    assertAgentExecutionActive();
    let extras: PlanLaunchExtras = {};
    for (const card of cards) {
      const parsed = launchPlanItemPayloadSchema.safeParse(card.payload);
      if (parsed.success && parsed.data.planItemId === item.id && !parsed.data.reused) {
        extras = cleanPlanLaunchExtras(parsed.data.extras);
        break;
      }
    }
    // Une lecture suffit à rendre l'ancienne demande durable. Ne jamais écraser
    // des paramètres déjà portés par l'action, même explicitement vides.
    await tx.actionPlanItem.updateMany({
      where: { id: item.id, companyId, launchExtras: { equals: Prisma.DbNull } },
      data: { launchExtras: extras },
    });
    assertAgentExecutionActive();
    return extras;
  }), MAX_SERIALIZATION_ATTEMPTS);
}

/** Action du plan encore "à lancer" de cette entreprise pour cet agent, ou null. */
export async function findLaunchablePlanItem(companyId: string, agent: PlanAgent, planItemId: string) {
  return prisma.actionPlanItem.findFirst({ where: { id: planItemId, companyId, agent, status: "propose" } });
}
