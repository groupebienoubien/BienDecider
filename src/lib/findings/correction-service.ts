import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCurrentFinding } from "@/lib/audit-findings";
import { writeJournal } from "@/lib/journal";
import { renderMissionMessage, type MissionMessageCode } from "@/lib/missions/messages";
import { isOpenMission } from "@/lib/findings/decisions";
import { checkCorrection, clearsReview, correctedFields, journalQuote, reviewSuite, versionFields, type CorrectionField, type FindingVersionFields } from "@/lib/findings/correction";

/**
 * « Corriger cette information » sur un constat (#169), côté serveur. Tout se fait dans une transaction : le constat corrigé
 * en place, la version remplacée archivée, les missions reliées signalées à réexaminer et la trace au journal, ensemble ou rien.
 * Aucune mission n'est relancée, mise en pause ni régénérée ; aucune programmation n'est annulée ; rien n'est publié.
 */

export type CorrectionResult =
  | { ok: true; id: string; missions: number }
  | { ok: false; status: 404 | 409 | 422; code?: MissionMessageCode; error: string; field?: CorrectionField };

const NOT_FOUND = { ok: false as const, status: 404 as const, error: "Constat introuvable." };
const refused = (code: MissionMessageCode, field?: CorrectionField) => ({ ok: false as const, status: (code === "M-02" ? 409 : 422) as 409 | 422, code, error: renderMissionMessage(code), ...(field ? { field } : {}) });

/** Champs écrits en base : un plan d'action absent s'écrit en JSON nul. */
function writable(fields: FindingVersionFields) {
  return { ...fields, actionItems: fields.actionItems === null || fields.actionItems === undefined ? Prisma.DbNull : (fields.actionItems as Prisma.InputJsonValue) };
}

/** Le constat n'a pas changé depuis sa lecture (concurrence optimiste) : sinon M-02, rien n'est écrit. */
const unchangedSince = (finding: { id: string; companyId: string; title: string; content: string; correctedAt: Date | null }) =>
  ({ id: finding.id, companyId: finding.companyId, replacedAt: null, title: finding.title, content: finding.content, correctedAt: finding.correctedAt });

const TRANSACTION = { maxWait: 5000, timeout: 20000 };

/** Corrige un constat du diagnostic courant de l'entreprise ; les missions ouvertes qui en découlent deviennent « à réexaminer ». */
export async function correctFinding(companyId: string, findingId: string, body: unknown): Promise<CorrectionResult> {
  return prisma.$transaction(async (tx) => {
    const finding = await findCurrentFinding(companyId, findingId, tx);
    if (!finding) return NOT_FOUND;
    const checked = checkCorrection(body, finding);
    if (!checked.ok) return refused(checked.code, checked.field);
    const now = new Date();
    const updated = await tx.auditFinding.updateMany({ where: unchangedSince(finding), data: writable(correctedFields(checked.value, now)) });
    if (updated.count !== 1) return refused("M-02");
    // La version remplacée garde sa certitude, sa source et sa date de lecture, et le même audit : elle n'est plus présentée comme actuelle.
    await tx.auditFinding.create({ data: { companyId, category: finding.category, agentRunId: finding.agentRunId, createdAt: finding.createdAt, ...writable(versionFields(finding)), versionOfId: finding.id, replacedAt: now } });
    const linked = await tx.mission.findMany({ where: { companyId, sourceFindingId: finding.id }, select: { id: true, status: true } });
    const open = linked.filter((mission) => isOpenMission(mission.status)).map((mission) => mission.id);
    if (open.length) await tx.mission.updateMany({ where: { companyId, id: { in: open } }, data: { findingReviewAt: now } });
    await writeJournal(tx, { companyId, code: "J-34", params: { ancien: journalQuote(finding.title), nouveau: journalQuote(checked.value.title), suite: reviewSuite(open.length) }, actor: "owner" });
    return { ok: true as const, id: finding.id, missions: open.length };
  }, TRANSACTION);
}

/**
 * Revient à la version remplacée la plus récente : elle redevient le constat courant (et sa version archivée disparaît).
 * Revenu au constat de Paul, les missions reliées ne sont plus à réexaminer.
 */
export async function restoreFinding(companyId: string, findingId: string): Promise<CorrectionResult> {
  return prisma.$transaction(async (tx) => {
    const finding = await findCurrentFinding(companyId, findingId, tx);
    if (!finding) return NOT_FOUND;
    const previous = await tx.auditFinding.findFirst({ where: { companyId, versionOfId: finding.id, replacedAt: { not: null } }, orderBy: [{ replacedAt: "desc" }, { id: "desc" }] });
    if (!previous) return refused("M-101");
    const updated = await tx.auditFinding.updateMany({ where: unchangedSince(finding), data: writable(versionFields(previous)) });
    if (updated.count !== 1) return refused("M-02");
    await tx.auditFinding.delete({ where: { id: previous.id } });
    let missions = 0;
    if (clearsReview(previous)) {
      missions = (await tx.mission.updateMany({ where: { companyId, sourceFindingId: finding.id, findingReviewAt: { not: null } }, data: { findingReviewAt: null } })).count;
    }
    await writeJournal(tx, { companyId, code: "J-35", params: { constat: journalQuote(previous.title) }, actor: "owner" });
    return { ok: true as const, id: finding.id, missions };
  }, TRANSACTION);
}

/** « J'ai réexaminé cette mission » : le signal est retiré et J-36 écrit ; une mission qui n'était pas à réexaminer ne change pas. */
export async function reexamineMission(companyId: string, missionId: string): Promise<{ ok: true; changed: boolean } | { ok: false }> {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.mission.findFirst({ where: { id: missionId, companyId }, select: { id: true, title: true, findingReviewAt: true } });
    if (!mission) return { ok: false as const };
    if (!mission.findingReviewAt) return { ok: true as const, changed: false };
    const cleared = await tx.mission.updateMany({ where: { id: mission.id, companyId, findingReviewAt: { not: null } }, data: { findingReviewAt: null } });
    if (cleared.count) await writeJournal(tx, { companyId, missionId: mission.id, code: "J-36", params: { mission: mission.title }, actor: "owner" });
    return { ok: true as const, changed: cleared.count > 0 };
  }, TRANSACTION);
}

export type FindingPreviousVersion = { title: string; content: string; certainty: string; sourceUrl: string | null; sourceStatus: string | null; createdAt: string; correctedAt: string | null };

/** Dernière version remplacée de chaque constat courant (dialogue « Corriger cette information »). */
export async function previousVersions(companyId: string, findingIds: string[]): Promise<Map<string, FindingPreviousVersion>> {
  if (!findingIds.length) return new Map();
  const rows = await prisma.auditFinding.findMany({ where: { companyId, versionOfId: { in: findingIds }, replacedAt: { not: null } }, orderBy: [{ replacedAt: "desc" }, { id: "desc" }] });
  const versions = new Map<string, FindingPreviousVersion>();
  for (const row of rows) {
    if (!row.versionOfId || versions.has(row.versionOfId)) continue;
    versions.set(row.versionOfId, { title: row.title, content: row.content, certainty: row.certainty, sourceUrl: row.sourceUrl, sourceStatus: row.sourceStatus, createdAt: row.createdAt.toISOString(), correctedAt: row.correctedAt?.toISOString() ?? null });
  }
  return versions;
}
