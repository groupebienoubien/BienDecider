import type { Prisma, PrismaClient } from "@prisma/client";
import { rankStarterTemplates, readDraftState, type DraftState } from "@/lib/onboarding/draft-rules";
import { buildVisitTrace, retentionCutoff, type DraftSnapshot, type VisitTraceData } from "@/lib/onboarding/visit-trace-rules";

/**
 * Trace anonyme des visites (#311, spécification §1.5) : écrite dans la transaction d'inscription, ou par la purge des
 * brouillons expirés dans la transaction qui les efface. Une trace par brouillon, jamais deux : seul celui qui efface
 * le brouillon l'écrit. Le client Prisma est passé en paramètre (route, transaction ou test).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export function traceRecord(trace: VisitTraceData): Prisma.VisitTraceCreateManyInput {
  return {
    startedOn: trace.startedOn,
    lastStep: trace.lastStep,
    abandonedStep: trace.abandonedStep,
    trade: trace.trade,
    department: trace.department,
    hasWebsite: trace.hasWebsite,
    sourcesRead: trace.sourcesRead as Prisma.InputJsonObject,
    ambition: trace.ambition ?? undefined,
    proposedTemplates: trace.proposedTemplates,
    accountCreated: trace.accountCreated,
    analysisCostUsd: trace.analysisCostUsd,
  };
}

/** Modèles proposés à l'étape 4, recalculés comme l'étape les a affichés ; aucun si le visiteur ne l'a pas atteinte. */
export function proposedTemplatesFor(state: DraftState, furthestStep: number): string[] {
  return Math.max(furthestStep, state.step) >= 4 && state.ambition ? rankStarterTemplates(state) : [];
}

/** À l'inscription, dans la transaction qui efface le brouillon : `proposedTemplates` sont les missions réellement créées. */
export async function recordSignupTrace(tx: Db, draft: DraftSnapshot, proposedTemplates: readonly string[]): Promise<void> {
  await tx.visitTrace.create({ data: traceRecord(buildVisitTrace(draft, { accountCreated: true, proposedTemplates })) });
}

export const PURGE_BATCH = 100;

/**
 * Brouillons expirés, par lots : chacun est effacé puis tracé dans la même transaction. L'effacement fait foi : un
 * brouillon effacé entre-temps par une inscription (qui a écrit sa propre trace) n'est pas tracé une seconde fois.
 */
export async function purgeExpiredDrafts(db: PrismaClient, now = new Date(), batch = PURGE_BATCH): Promise<number> {
  let traced = 0;
  for (let round = 0; round < 50; round += 1) {
    const rows = await db.onboardingDraft.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: batch,
      select: { id: true, step: true, furthestStep: true, profile: true, ambition: true, profileConfirmed: true, diagnosticReady: true, analysis: true, createdAt: true },
    });
    if (rows.length === 0) break;
    traced += await db.$transaction(async (tx) => {
      let written = 0;
      for (const row of rows) {
        const { count } = await tx.onboardingDraft.deleteMany({ where: { id: row.id, expiresAt: { lte: now } } });
        if (count === 0) continue;
        const state = readDraftState(row);
        await tx.visitTrace.create({ data: traceRecord(buildVisitTrace({ state, furthestStep: row.furthestStep, createdAt: row.createdAt }, { accountCreated: false, proposedTemplates: proposedTemplatesFor(state, row.furthestStep) })) });
        written += 1;
      }
      return written;
    }, { maxWait: 5000, timeout: 30000 });
    if (rows.length < batch) break;
  }
  return traced;
}

/** Conservation de 25 mois (`[ASSUMPTION]` FR-60) : les traces commencées avant le premier jour conservé sont effacées. */
export async function purgeOldTraces(db: Db, now = new Date()): Promise<number> {
  const { count } = await db.visitTrace.deleteMany({ where: { startedOn: { lt: retentionCutoff(now) } } });
  return count;
}
