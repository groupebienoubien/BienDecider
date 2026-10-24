import { prisma } from "@/lib/prisma";
import { PERSONAS } from "@/lib/agents/personas";
import { currentAgentExecution, withAgentRunWrite } from "@/lib/agent-run-execution";

/**
 * Ce que l'équipe sait faire aujourd'hui, et ce qu'elle ne fait pas. Injecté
 * dans les prompts de Paul pour qu'il réponde honnêtement quand un objectif
 * sort du catalogue, au lieu de déléguer à un agent qui produira autre
 * chose. À tenir à jour quand une capacité est ajoutée (cf. docs/domaines.md).
 */
export const CAPABILITY_CATALOG = `Catalogue de ce que l'équipe sait faire aujourd'hui : ${PERSONAS.marketing.name} — diagnostic de la présence en ligne, positionnement face aux concurrents locaux, propositions de mise à jour de la fiche Google et de réponses aux avis ; ${PERSONAS.contenu.name} — posts pour les réseaux sociaux et contenu d'un site d'une page, que BienDecider publie après validation ; ${PERSONAS.demarchage.name} — recherche d'organisations à prospecter, pistes de croissance locales et modèles d'emails de prospection. Hors catalogue, entre autres : publicité payante, comptabilité, facturation, devis, démarches administratives ou juridiques, recrutement, gestion de planning ou de stock, création de visuels ou de vidéos, appels téléphoniques, et toute action exécutée sans validation du dirigeant.`;

const REQUEST_MAX_LENGTH = 1000;

/** Note une demande hors catalogue pour les pères fondateurs (vue admin). */
export async function recordUncoveredRequest(
  companyId: string,
  source: "chat" | "plan",
  request: string,
  closestAlternative?: string,
) {
  return withAgentRunWrite(companyId, currentAgentExecution()?.agentRunId, (tx) => tx.uncoveredRequest.create({
    data: {
      companyId,
      source,
      request: request.trim().slice(0, REQUEST_MAX_LENGTH),
      closestAlternative: closestAlternative?.trim().slice(0, REQUEST_MAX_LENGTH) || null,
    },
  }));
}

export async function listUncoveredRequests(limit = 50) {
  return prisma.uncoveredRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: { company: { select: { name: true, trade: true } } },
  });
}
