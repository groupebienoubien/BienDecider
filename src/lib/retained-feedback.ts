import { prisma } from "@/lib/prisma";

/** Derniers retours explicites du dirigeant (motifs de rejet) : ce que l'équipe retient pour les prochaines productions. */
export async function getRetainedFeedback(companyId: string, take = 5) {
  const rejected = await prisma.agentProposal.findMany({
    where: { companyId, status: "rejetee", rejectionReason: { not: null } },
    orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    take,
    select: { rejectionReason: true },
  });
  return rejected.flatMap((proposal) => proposal.rejectionReason?.trim() ? [proposal.rejectionReason.trim()] : []);
}
