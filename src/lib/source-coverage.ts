import type { SourceRead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sourceReasonLabel } from "@/lib/google-place";

/** Couverture des sources du dernier diagnostic terminé : ce que le code a réellement lu, avec le motif quand il n'a pas pu. */

export type CoverageItem = { id: string; label: string; status: "lue" | "non_lue"; detail: string };

export function describeSourceRead(read: Pick<SourceRead, "id" | "target" | "subject" | "status" | "reason" | "itemCount">): CoverageItem {
  const label = read.target === "own" ? "Avis Google de votre fiche" : `Avis Google d'un concurrent${read.subject ? ` (« ${read.subject} »)` : ""}`;
  if (read.status === "lue") {
    const count = read.itemCount ?? 0;
    return { id: read.id, label, status: "lue", detail: count === 0 ? "Lue, aucun avis" : `Lue, ${count} avis lus` };
  }
  const reason = sourceReasonLabel(read.reason);
  return { id: read.id, label, status: "non_lue", detail: `Non lue : ${reason}` };
}

export async function getSourceCoverage(companyId: string): Promise<CoverageItem[]> {
  const run = await prisma.agentRun.findFirst({
    where: { companyId, agent: "marketing", status: "succeeded" },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    select: { id: true, startedAt: true },
  });
  if (!run) return [];
  // Une relance réutilise l'identifiant du passage : seules les lectures de la tentative en cours comptent.
  const since = run.startedAt ? { createdAt: { gte: run.startedAt } } : {};
  const reads = await prisma.sourceRead.findMany({
    where: { companyId, agentRunId: run.id, ...since },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return reads.map(describeSourceRead);
}
