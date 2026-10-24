import type { AuditFinding } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitAudits, type AuditFindingsView } from "@/lib/audit-split";

export type { AuditFindingsView } from "@/lib/audit-split";

/** Constats du dernier audit terminé et de l'audit d'avant, du plus récent au plus ancien. */
export async function getAuditFindingsView(companyId: string): Promise<AuditFindingsView<AuditFinding>> {
  const findings = await prisma.auditFinding.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const runIds = [...new Set(findings.map((finding) => finding.agentRunId).filter((id): id is string => Boolean(id)))];
  const runs = runIds.length
    ? await prisma.agentRun.findMany({ where: { companyId, id: { in: runIds } }, select: { id: true, status: true, finishedAt: true } })
    : [];
  return splitAudits(findings, runs);
}

/** Constats du seul dernier audit terminé : ce que lisent Paul et les agents. */
export async function getLatestAuditFindings(companyId: string, options: { category?: string; take?: number } = {}) {
  const { latest } = await getAuditFindingsView(companyId);
  const filtered = options.category ? latest.filter((finding) => finding.category === options.category) : latest;
  return options.take === undefined ? filtered : filtered.slice(0, options.take);
}
