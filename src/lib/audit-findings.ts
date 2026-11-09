import type { AuditFinding, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitAudits, type AuditFindingsView } from "@/lib/audit-split";

export type { AuditFindingsView } from "@/lib/audit-split";

/** Client de lecture : la base, ou la transaction de l'appelant (acceptation d'une carte de Paul). */
type FindingsClient = Pick<Prisma.TransactionClient, "auditFinding" | "agentRun">;

/**
 * Constats du dernier audit terminé et de l'audit d'avant, du plus récent au plus ancien.
 * Une version remplacée par une correction du dirigeant (#169, `replacedAt`) n'est jamais présentée comme actuelle.
 */
export async function getAuditFindingsView(companyId: string, client: FindingsClient = prisma): Promise<AuditFindingsView<AuditFinding>> {
  const findings = await client.auditFinding.findMany({
    where: { companyId, replacedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const runIds = [...new Set(findings.map((finding) => finding.agentRunId).filter((id): id is string => Boolean(id)))];
  const runs = runIds.length
    ? await client.agentRun.findMany({ where: { companyId, id: { in: runIds } }, select: { id: true, status: true, finishedAt: true } })
    : [];
  return splitAudits(findings, runs);
}

/** Constats du seul dernier audit terminé : ce que lisent Paul et les agents. */
export async function getLatestAuditFindings(companyId: string, options: { category?: string; take?: number } = {}) {
  const { latest } = await getAuditFindingsView(companyId);
  const filtered = options.category ? latest.filter((finding) => finding.category === options.category) : latest;
  return options.take === undefined ? filtered : filtered.slice(0, options.take);
}

/**
 * Constat qu'une mission peut citer (#168) : de l'entreprise et du diagnostic courant (`splitAudits().latest`).
 * Un constat d'une autre entreprise ou d'un diagnostic précédent donne null.
 */
export async function findCurrentFinding(companyId: string, findingId: string, client: FindingsClient = prisma): Promise<AuditFinding | null> {
  const { latest } = await getAuditFindingsView(companyId, client);
  return latest.find((finding) => finding.id === findingId) ?? null;
}
