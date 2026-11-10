import { prisma } from "@/lib/prisma";
import { findCurrentFinding } from "@/lib/audit-findings";
import { writeJournal } from "@/lib/journal";
import { COMPETITOR_CATEGORY } from "@/lib/findings/competitors";

/**
 * « Confirmer » ou « Écarter » un concurrent potentiel (#292, FR-51), côté serveur. Seul un constat `concurrence` du
 * diagnostic courant peut être confirmé ou écarté ; écarter ne touche à rien d'autre (aucune mission, aucune diffusion).
 */

export type CompetitorActionResult = { ok: true; status: "confirmed" | "dismissed" } | { ok: false; status: 404 };

const NOT_FOUND = { ok: false as const, status: 404 as const };

const TRANSACTION = { maxWait: 5000, timeout: 20000 };

async function setCompetitorStatus(companyId: string, findingId: string, status: "confirmed" | "dismissed"): Promise<CompetitorActionResult> {
  return prisma.$transaction(async (tx) => {
    const finding = await findCurrentFinding(companyId, findingId, tx);
    if (!finding || finding.category !== COMPETITOR_CATEGORY) return NOT_FOUND;
    const now = new Date();
    await tx.auditFinding.update({
      where: { id: finding.id },
      data: status === "confirmed" ? { competitorConfirmedAt: now, competitorDismissedAt: null } : { competitorDismissedAt: now, competitorConfirmedAt: null },
    });
    await writeJournal(tx, { companyId, code: status === "confirmed" ? "J-39" : "J-38", params: { concurrent: finding.title }, actor: "owner" });
    return { ok: true as const, status };
  }, TRANSACTION);
}

/** « Confirmer » : ce concurrent est bien réel et pertinent. */
export function confirmCompetitor(companyId: string, findingId: string): Promise<CompetitorActionResult> {
  return setCompetitorStatus(companyId, findingId, "confirmed");
}

/** « Écarter » : ce concurrent ne sera plus proposé par un audit suivant (src/lib/agents/marketing.ts). */
export function dismissCompetitor(companyId: string, findingId: string): Promise<CompetitorActionResult> {
  return setCompetitorStatus(companyId, findingId, "dismissed");
}
