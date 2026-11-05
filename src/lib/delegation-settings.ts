import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { MissionError } from "@/lib/missions/messages";
import { DELEGATION_LABELS, DELEGATION_LEVELS, asDelegationLevel, type DelegationLevel } from "@/lib/delegation-level";

/**
 * Changer de niveau de délégation (§9, #36) : journalisé (J-26) ; passer en « Préparer seulement »
 * annule toutes les programmations de l'entreprise (§5.3, J-23), dans la même transaction.
 */
export async function setDelegationLevel(companyId: string, value: unknown): Promise<{ level: DelegationLevel; cancelled: number }> {
  if (!(DELEGATION_LEVELS as readonly unknown[]).includes(value)) throw new MissionError("M-85");
  const level = value as DelegationLevel;
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { delegationLevel: true } });
    if (asDelegationLevel(company.delegationLevel) === level) return { level, cancelled: 0 };
    await tx.company.update({ where: { id: companyId }, data: { delegationLevel: level } });
    let cancelled = 0;
    if (level === "prepare") {
      const scheduled = await tx.publication.findMany({ where: { companyId, status: "scheduled" }, select: { id: true, missionId: true, versionNumber: true } });
      const reason = "passage en « Préparer seulement »";
      for (const publication of scheduled) {
        await tx.publication.update({ where: { id: publication.id }, data: { status: "cancelled", cancelReason: reason } });
        await writeJournal(tx, { companyId, missionId: publication.missionId, code: "J-23", params: { n: String(publication.versionNumber), raison: reason } });
      }
      cancelled = scheduled.length;
    }
    await writeJournal(tx, { companyId, code: "J-26", params: { niveau: DELEGATION_LABELS[level], suite: cancelled ? " Programmations annulées." : "" } });
    return { level, cancelled };
  });
}
