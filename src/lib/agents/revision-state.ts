import { prisma } from "@/lib/prisma";

/** Clé active d'une révision : une seule révision en file ou en cours par production (story 3.3). */
export function revisionActiveKey(proposalId: string) {
  return `revision:${proposalId}`;
}

/** Refus d'une approbation ou d'une diffusion pendant que l'agent écrit la version suivante. */
export const REVISION_IN_PROGRESS_MESSAGE = "Une révision est en cours : attendez la nouvelle version.";

/** Révision en cours (en file ou en exécution) de la production, s'il y en a une. */
export async function activeRevisionRun(companyId: string, proposalId: string) {
  return prisma.agentRun.findFirst({
    where: { companyId, activeDedupeKey: revisionActiveKey(proposalId), status: { in: ["queued", "running"] } },
    select: { id: true, agent: true },
  });
}
