/**
 * Story 5.1 : un audit est l'ensemble des constats d'une même exécution de
 * Martine. Seul compte le dernier audit terminé avec succès ; les constats
 * sans exécution (antérieurs à ce rattachement) forment un audit ancien.
 * Rien n'est supprimé : les audits plus anciens restent en base.
 */
export type AuditFindingsView<T> = { latest: T[]; latestAt: string | null; previous: T[]; previousAt: string | null };

type FindingLike = { agentRunId: string | null; createdAt: Date | string };
type RunLike = { id: string; status: string; finishedAt: Date | string | null };

const LEGACY = "__sans_execution__";

/** Fonction pure : constats regroupés par audit terminé, du plus récent au plus ancien ; dans un audit, l'ordre reçu est gardé. */
export function splitAudits<T extends FindingLike>(findings: T[], runs: RunLike[]): AuditFindingsView<T> {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  // rank : un audit ancien (sans exécution, ou dont l'exécution a été supprimée) passe toujours après un audit rattaché.
  const audits = new Map<string, { at: number; rank: number; findings: T[] }>();
  for (const finding of findings) {
    const run = finding.agentRunId ? runsById.get(finding.agentRunId) : undefined;
    // Exécution en cours ou échouée : ses constats ne forment pas un audit terminé (un audit échoué en cours de route reste hors du diagnostic).
    if (finding.agentRunId && run?.status !== "succeeded") continue;
    const key = finding.agentRunId ?? LEGACY;
    const at = new Date(run?.finishedAt ?? finding.createdAt).getTime();
    const audit = audits.get(key) ?? { at, rank: finding.agentRunId ? 1 : 0, findings: [] };
    audit.at = Math.max(audit.at, at);
    audit.findings.push(finding);
    audits.set(key, audit);
  }
  const ordered = [...audits.values()].sort((left, right) => right.rank - left.rank || right.at - left.at);
  return {
    latest: ordered[0]?.findings ?? [],
    latestAt: ordered[0] ? new Date(ordered[0].at).toISOString() : null,
    previous: ordered[1]?.findings ?? [],
    previousAt: ordered[1] ? new Date(ordered[1].at).toISOString() : null,
  };
}
