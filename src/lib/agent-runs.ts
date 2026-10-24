import { after } from "next/server";
import { Prisma, type AgentRun, type ActionPlanItem } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { publicRun } from "@/lib/agent-run-types";
import { prisma } from "@/lib/prisma";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { executePlanItem, type PlanRunExtras } from "@/lib/agents/plan-runner";
import { isPlanAgent, resolvePlanLaunchExtras, type PlanAgent } from "@/lib/agents/plan-items";
import { createAgentExecution, withAgentExecution, withAgentRunWrite } from "@/lib/agent-run-execution";
import { AGENT_RUN_MAX_DURATION_SECONDS, AGENT_RUN_COST_RESERVATION_USD, AgentRunLimitError } from "@/lib/agent-run-limits";
export { AGENT_RUN_MAX_DURATION_SECONDS, AGENT_RUN_COST_RESERVATION_USD } from "@/lib/agent-run-limits";
import { AgentRunConflictError, AgentRunQuotaError, RevisionConflictError, classifyRunError, failureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";
import { isSerializationConflict } from "@/lib/serialization-conflict";
import { revisionActiveKey } from "@/lib/agents/revision-state";
import { CHAT_USAGE_PURPOSES, parisQuotaWindows, usageCounterFor, type UsageCounter } from "@/lib/quota-windows";

const STALE_GRACE_SECONDS = 10;
const DIRECT_DEDUPE_SECONDS = 5 * 60;

type AgentRunPayload =
  | { kind: "plan_item"; planItemId: string; extras: PlanRunExtras }
  | { kind: "plan_generation" }
  | { kind: "direct"; agent: PlanAgent; newsContext?: string; prospectDescription?: string }
  | RevisionRunPayload;

/** Révision d'une production par son agent auteur (story 3.3) : la version fromVersion devient fromVersion + 1 ; title sert à l'affichage de l'exécution. */
export type RevisionRunPayload = { kind: "revision"; proposalId: string; fromVersion: number; instruction: string; title?: string };

// Classes déplacées dans agent-errors (point unique de conversion en motif), réexportées pour les imports existants.
export { AgentRunConflictError, AgentRunQuotaError };

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function schedule(runId: string) {
  after(async () => {
    try {
      await processAgentRun(runId);
    } catch (error) {
      console.error("Erreur de traitement du run agent:", error);
    }
  });
}

/**
 * Motif d'une action du plan qui n'a pas pu être réclamée : déjà en cours ou
 * à décider, l'agent y a travaillé ; écartée, terminée ou introuvable, elle
 * n'est pas lançable (null : erreur de l'appelant, pas un motif d'échec).
 */
async function conflictReasonForItem(tx: Prisma.TransactionClient, companyId: string, planItemId: string) {
  const item = await tx.actionPlanItem.findFirst({ where: { id: planItemId, companyId }, select: { status: true } });
  return item && ["en_cours", "lance"].includes(item.status) ? "already_running" as const : null;
}

async function findDuplicate(companyId: string, requestKey: string, activeDedupeKey: string, planItemId?: string) {
  const byKey = await prisma.agentRun.findUnique({ where: { companyId_requestKey: { companyId, requestKey } } });
  if (byKey) return byKey;
  const active = await prisma.agentRun.findUnique({ where: { companyId_activeDedupeKey: { companyId, activeDedupeKey } } });
  if (active) return active;
  if (!planItemId) return null;
  return prisma.agentRun.findFirst({
    where: { companyId, planItemId, status: { in: ["queued", "running", "succeeded"] } },
    orderBy: { createdAt: "desc" },
  });
}

async function persistRun(params: {
  companyId: string;
  agent: string;
  requestKey: string;
  activeDedupeKey: string;
  payload: AgentRunPayload;
  planItemId?: string;
  retryRunId?: string;
  /** Durée pendant laquelle une exécution réussie bloque une demande identique ; 0 : seule une exécution active la bloque. */
  succeededDedupeSeconds?: number;
}) {
  const succeededDedupeSeconds = params.succeededDedupeSeconds ?? DIRECT_DEDUPE_SECONDS;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.agentRun.findUnique({
        where: { companyId_requestKey: { companyId: params.companyId, requestKey: params.requestKey } },
      });
      if (existing) {
        if (existing.status !== "failed" || params.retryRunId !== existing.id) return existing;
        if (existing.reservedCostUsd > 0) {
          throw new AgentRunQuotaError("La consommation du passage précédent n'a pas pu être finalisée. Son budget reste réservé ; réessayez après sa finalisation.", "quota_budget");
        }
        await assertRunQuota(tx, params.companyId, "runs");
        const retry = await tx.agentRun.updateMany({
          where: { id: existing.id, companyId: params.companyId, status: "failed", attempts: existing.attempts },
          data: {
            status: "queued", activeDedupeKey: params.activeDedupeKey, reservedCostUsd: AGENT_RUN_COST_RESERVATION_USD,
            maxDurationSeconds: AGENT_RUN_MAX_DURATION_SECONDS,
            queuedAt: new Date(), startedAt: null, finishedAt: null, resultCount: 0, errorMessage: null, failureReason: null,
          },
        });
        if (retry.count === 0) return tx.agentRun.findUniqueOrThrow({ where: { id: existing.id } });
        if (params.planItemId) {
          const claimed = await tx.actionPlanItem.updateMany({
            where: { id: params.planItemId, companyId: params.companyId, status: "propose" },
            data: { status: "en_cours" },
          });
          if (claimed.count !== 1) {
            throw new AgentRunConflictError("L'action n'est plus disponible pour une relance.", await conflictReasonForItem(tx, params.companyId, params.planItemId));
          }
        }
        await tx.agentRunAttempt.create({ data: { companyId: params.companyId, agentRunId: existing.id, status: "queued" } });
        return tx.agentRun.findUniqueOrThrow({ where: { id: existing.id } });
      }

      const active = await tx.agentRun.findUnique({
        where: { companyId_activeDedupeKey: { companyId: params.companyId, activeDedupeKey: params.activeDedupeKey } },
      });
      if (active) {
        const dedupeExpired = active.status === "succeeded" && active.finishedAt !== null &&
          (succeededDedupeSeconds === 0 || Date.now() - active.finishedAt.getTime() > succeededDedupeSeconds * 1000);
        if (!dedupeExpired) return active;
        await tx.agentRun.update({ where: { id: active.id }, data: { activeDedupeKey: null } });
      }

      if (params.planItemId) {
        const claimed = await tx.actionPlanItem.updateMany({
          where: { id: params.planItemId, companyId: params.companyId, agent: params.agent, status: "propose" },
          data: { status: "en_cours" },
        });
        if (claimed.count !== 1) {
          const duplicate = await tx.agentRun.findFirst({
            where: { companyId: params.companyId, planItemId: params.planItemId, status: { in: ["queued", "running", "succeeded"] } },
            orderBy: { createdAt: "desc" },
          });
          if (duplicate) return duplicate;
          throw new AgentRunConflictError("Action déjà lancée ou écartée.", await conflictReasonForItem(tx, params.companyId, params.planItemId));
        }
      }

      await assertRunQuota(tx, params.companyId, "runs");

      return tx.agentRun.create({
        data: {
          companyId: params.companyId,
          planItemId: params.planItemId,
          agent: params.agent,
          requestKey: params.requestKey,
          activeDedupeKey: params.activeDedupeKey,
          payload: params.payload,
          reservedCostUsd: AGENT_RUN_COST_RESERVATION_USD,
          maxDurationSeconds: AGENT_RUN_MAX_DURATION_SECONDS,
          attemptHistory: { create: { companyId: params.companyId, status: "queued" } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!isUniqueConflict(error) && !isSerializationConflict(error)) throw error;
    const duplicate = await findDuplicate(params.companyId, params.requestKey, params.activeDedupeKey, params.planItemId);
    if (duplicate) return duplicate;
    throw new AgentRunConflictError("Cette action n'est plus disponible au lancement.", "outage");
  }
}

export async function enqueuePlanRun(params: {
  companyId: string;
  item: Pick<ActionPlanItem, "id" | "agent" | "title" | "rationale"> & { launchExtras?: unknown };
  extras?: PlanRunExtras;
  retryRunId?: string;
}) {
  if (!isPlanAgent(params.item.agent)) throw new AgentRunConflictError("Agent inconnu.", "outage");
  const storedItem = await prisma.actionPlanItem.findFirst({ where: { id: params.item.id, companyId: params.companyId } });
  const extras = await resolvePlanLaunchExtras(params.companyId, storedItem ?? params.item);
  const run = await persistRun({
    companyId: params.companyId,
    agent: params.item.agent,
    planItemId: params.item.id,
    requestKey: `plan:${params.item.id}`,
    activeDedupeKey: `plan:${params.item.id}`,
    payload: { kind: "plan_item", planItemId: params.item.id, extras },
    retryRunId: params.retryRunId,
  });
  schedule(run.id);
  return run;
}

export async function enqueueDirectRun(params: {
  companyId: string;
  agent: PlanAgent;
  requestKey?: string;
  newsContext?: string;
  prospectDescription?: string;
}) {
  const run = await persistRun({
    companyId: params.companyId,
    agent: params.agent,
    requestKey: `direct:${params.requestKey ?? randomUUID()}`,
    activeDedupeKey: `direct:${createHash("sha256").update(JSON.stringify({
      agent: params.agent,
      newsContext: params.newsContext?.trim() ?? "",
      prospectDescription: params.prospectDescription?.trim() ?? "",
    })).digest("hex")}`,
    payload: {
      kind: "direct",
      agent: params.agent,
      ...(params.newsContext === undefined ? {} : { newsContext: params.newsContext }),
      ...(params.prospectDescription === undefined ? {} : { prospectDescription: params.prospectDescription }),
    },
  });
  schedule(run.id);
  return run;
}

/**
 * Révision d'une production : une exécution de l'agent auteur, avec quota,
 * budget et carte d'exécution comme tout lancement. Une révision déjà en
 * cours de la même production est renvoyée telle quelle (clé active) ; une
 * révision terminée ne bloque pas la suivante (la version a changé).
 */
export async function enqueueRevisionRun(params: {
  companyId: string;
  agent: PlanAgent;
  proposalId: string;
  fromVersion: number;
  instruction: string;
  title: string;
}) {
  const run = await persistRun({
    companyId: params.companyId,
    agent: params.agent,
    requestKey: `revision:${params.proposalId}:${randomUUID()}`,
    activeDedupeKey: revisionActiveKey(params.proposalId),
    payload: { kind: "revision", proposalId: params.proposalId, fromVersion: params.fromVersion, instruction: params.instruction, title: params.title },
    succeededDedupeSeconds: 0,
  });
  schedule(run.id);
  return run;
}

export async function enqueuePlanGeneration(companyId: string, requestKey: string) {
  const run = await persistRun({
    companyId,
    agent: "co_ceo",
    requestKey: `plan-generation:${requestKey}`,
    activeDedupeKey: "plan-generation",
    payload: { kind: "plan_generation" },
  });
  schedule(run.id);
  return run;
}

export async function getAgentRun(companyId: string, runId: string) {
  let run = await prisma.agentRun.findFirst({ where: { id: runId, companyId } });
  if (!run) return null;

  const staleAfter = run.maxDurationSeconds + STALE_GRACE_SECONDS;
  const referenceTime = run.startedAt ?? run.queuedAt;
  if (["queued", "running"].includes(run.status) && Date.now() - referenceTime.getTime() > staleAfter * 1000) {
    const stale = run;
    // Un seul commit : l'exécution ne doit jamais être lue échouée alors que son action reste « en cours ».
    await prisma.$transaction(async (tx) => {
      const failed = await tx.agentRun.updateMany({
        where: { id: stale.id, companyId, status: stale.status, attempts: stale.attempts, queuedAt: stale.queuedAt, startedAt: stale.startedAt },
        data: {
          status: "failed",
          activeDedupeKey: null,
          reservedCostUsd: 0,
          finishedAt: new Date(),
          failureReason: "outage",
          errorMessage: stale.status === "queued"
            ? "L'agent n'a pas pu démarrer. Vous pouvez relancer l'action."
            : "Le délai maximal est dépassé. Vous pouvez relancer l'action.",
        },
      });
      if (failed.count !== 1) return;
      await tx.agentRunAttempt.updateMany({
        where: { agentRunId: stale.id, status: { in: ["queued", "running"] } },
        data: { status: "failed", finishedAt: new Date(), errorMessage: "Délai maximal dépassé avant la reprise." },
      });
      if (stale.planItemId) {
        await tx.actionPlanItem.updateMany({
          where: { id: stale.planItemId, companyId, status: "en_cours" },
          data: { status: "propose" },
        });
      }
    });
    run = await prisma.agentRun.findFirst({ where: { id: runId, companyId } });
  }

  if (run?.status === "queued") schedule(run.id);

  return run ? publicRun(run) : null;
}

export async function listAgentRuns(companyId: string) {
  const runs = await prisma.agentRun.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 });
  return runs.map(publicRun);
}

async function executeRun(run: AgentRun) {
  const payload = run.payload as unknown as AgentRunPayload;
  if (payload.kind === "plan_generation") {
    const { runCoCeoPlanning } = await import("@/lib/agents/co-ceo");
    const items = await runCoCeoPlanning(run.companyId, run.id);
    return items.length;
  }
  if (payload.kind === "plan_item") {
    const item = await prisma.actionPlanItem.findFirst({ where: { id: payload.planItemId, companyId: run.companyId } });
    if (!item || !isPlanAgent(item.agent)) throw new AgentRunConflictError("Action introuvable ou agent invalide.", "outage");
    const result = await executePlanItem({ ...item, agent: item.agent }, payload.extras, run.id);
    return result.producedCount;
  }

  if (payload.kind === "revision") {
    if (!isPlanAgent(run.agent)) throw new AgentRunConflictError("Révision invalide.", "outage");
    const { runRevision } = await import("@/lib/agents/revision");
    return runRevision(run.companyId, payload, { agentRunId: run.id, agent: run.agent });
  }

  if (payload.kind !== "direct" || payload.agent !== run.agent) throw new AgentRunConflictError("Demande de lancement invalide.", "outage");
  switch (payload.agent) {
    case "marketing": {
      const result = await runMarketingAgent(run.companyId, { agentRunId: run.id });
      return result.findings.length + result.proposals.length;
    }
    case "contenu": {
      const result = await runContenuAgent(run.companyId, payload.newsContext, { agentRunId: run.id });
      return result.length;
    }
    case "demarchage": {
      const result = await runDemarchageAgent(run.companyId, payload.prospectDescription, { agentRunId: run.id });
      return result.length;
    }
  }
}

export async function processAgentRun(runId: string) {
  // Capture the run and attempt under the claim's lock, never reread a later
  // attempt after another worker has expired/retried this one.
  const claimed = await prisma.$transaction(async (tx) => {
    const startedAt = new Date();
    const claim = await tx.agentRun.updateMany({
      where: { id: runId, status: "queued" },
      data: { status: "running", startedAt, attempts: { increment: 1 }, errorMessage: null, failureReason: null },
    });
    if (claim.count !== 1) return null;
    const run = await tx.agentRun.findUniqueOrThrow({ where: { id: runId } });
    let attempt = await tx.agentRunAttempt.findFirst({ where: { agentRunId: runId, companyId: run.companyId, status: "queued" }, orderBy: { queuedAt: "desc" } });
    attempt ??= await tx.agentRunAttempt.create({ data: { companyId: run.companyId, agentRunId: runId } });
    await tx.agentRunAttempt.update({ where: { id: attempt.id }, data: { status: "running", startedAt } });
    return { run, attemptId: attempt.id };
  });
  if (!claimed) return;
  const { run, attemptId } = claimed;
  const context = createAgentExecution({ companyId: run.companyId, agentRunId: run.id, attempt: run.attempts, startedAt: run.startedAt! });
  try {
    await withAgentExecution(context, async () => {
      const resultCount = await executeRun(run);
      await withAgentRunWrite(run.companyId, run.id, async (tx) => {
      const completed = await tx.agentRun.updateMany({
        where: { id: run.id, companyId: run.companyId, status: "running", attempts: run.attempts },
        data: { status: "succeeded", ...(context.usageFinalized ? { reservedCostUsd: 0 } : {}), resultCount, finishedAt: new Date() },
      });
      if (completed.count === 1) await tx.agentRunAttempt.updateMany({ where: { id: attemptId, status: "running" }, data: { status: "succeeded", finishedAt: new Date() } });
      });
    });
  } catch (error) {
    console.error("Echec du run agent:", error);
    const failureReason = classifyRunError(error) ?? "outage";
    const message = error instanceof AgentRunLimitError || (failureReason === "already_running" && error instanceof AgentRunConflictError) || error instanceof RevisionConflictError
      ? error.message : failureMessage(failureReason, PERSONAS[run.agent as PlanAgent]?.name ?? "L'agent");
    const finalization = prisma.$transaction(async (tx) => {
      const failed = await tx.agentRun.updateMany({
        where: { id: run.id, companyId: run.companyId, status: "running", attempts: run.attempts },
        data: { status: "failed", activeDedupeKey: null, ...(context.usageFinalized ? { reservedCostUsd: 0 } : {}), errorMessage: message, failureReason, finishedAt: new Date() },
      });
      if (failed.count !== 1) return;
      await tx.agentRunAttempt.updateMany({ where: { id: attemptId, status: "running" }, data: { status: "failed", finishedAt: new Date(), errorMessage: message } });
      if (run.planItemId) await tx.actionPlanItem.updateMany({ where: { id: run.planItemId, companyId: run.companyId, status: "en_cours" }, data: { status: "propose" } });
    });
    finalization.catch((failure) => console.error("Finalisation du run agent:", failure));
    const remaining = context.deadlineAt - Date.now();
    if (remaining > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([finalization, new Promise<void>((resolve) => { timer = setTimeout(resolve, remaining); })]); }
      finally { clearTimeout(timer); }
    }
  }
}

async function assertRunQuota(tx: Prisma.TransactionClient, companyId: string, counter: UsageCounter, now = new Date()) {
  const company = await tx.company.update({
    where: { id: companyId },
    data: { quotaEpoch: { increment: 1 } },
  });
  const { dayStart, monthStart, nextMonthName } = parisQuotaWindows(now);
  const chatPurposes = [...CHAT_USAGE_PURPOSES];

  if (counter === "chat") {
    const [dailyMessages, monthlyMessages] = await Promise.all([
      tx.usageReservation.count({ where: { companyId, purpose: { in: chatPurposes }, createdAt: { gte: dayStart } } }),
      tx.usageReservation.count({ where: { companyId, purpose: { in: chatPurposes }, createdAt: { gte: monthStart } } }),
    ]);
    // Le mois d'abord : si les deux limites sont atteintes, la reprise est le 1er, pas demain.
    if (monthlyMessages >= company.monthlyChatMessageLimit) {
      throw new AgentRunQuotaError(`Vous avez atteint la limite de messages à Paul pour ce mois-ci. Vous pourrez lui écrire de nouveau le 1er ${nextMonthName}.`, "quota_runs");
    }
    if (dailyMessages >= company.dailyChatMessageLimit) {
      throw new AgentRunQuotaError("Vous avez atteint la limite de messages à Paul pour aujourd'hui. Vous pourrez lui écrire de nouveau demain matin.", "quota_runs");
    }
  } else {
    const [dailyRuns, monthlyRuns, dailyInlineCalls, monthlyInlineCalls] = await Promise.all([
      tx.agentRunAttempt.count({ where: { companyId, queuedAt: { gte: dayStart } } }),
      tx.agentRunAttempt.count({ where: { companyId, queuedAt: { gte: monthStart } } }),
      tx.usageReservation.count({ where: { companyId, purpose: { notIn: chatPurposes }, createdAt: { gte: dayStart } } }),
      tx.usageReservation.count({ where: { companyId, purpose: { notIn: chatPurposes }, createdAt: { gte: monthStart } } }),
    ]);
    if (monthlyRuns + monthlyInlineCalls >= company.monthlyAgentRunLimit) {
      throw new AgentRunQuotaError(`Les agents ont atteint leur limite de lancements pour ce mois-ci. Ils reprendront le 1er ${nextMonthName}.`, "quota_runs");
    }
    if (dailyRuns + dailyInlineCalls >= company.dailyAgentRunLimit) {
      throw new AgentRunQuotaError("Les agents ont atteint leur limite de lancements pour aujourd'hui. Ils reprendront demain matin.", "quota_runs");
    }
  }

  const [dailyUsage, monthlyUsage, reservedRuns, reservedCalls] = await Promise.all([
    tx.usageEvent.aggregate({ where: { companyId, createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
    tx.usageEvent.aggregate({ where: { companyId, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
    tx.agentRun.aggregate({ where: { companyId, reservedCostUsd: { gt: 0 } }, _sum: { reservedCostUsd: true } }),
    tx.usageReservation.aggregate({ where: { companyId, releasedAt: null, OR: [{ expiresAt: { gt: now } }, { purpose: "co_ceo_chat" }] }, _sum: { amountUsd: true } }),
  ]);
  const dailyCost = dailyUsage._sum.costUsd ?? 0;
  const monthlyCost = monthlyUsage._sum.costUsd ?? 0;
  const activeReservation = (reservedRuns._sum.reservedCostUsd ?? 0) + (reservedCalls._sum.amountUsd ?? 0);
  if (dailyCost + activeReservation + AGENT_RUN_COST_RESERVATION_USD > company.dailySpendLimitUsd) {
    throw new AgentRunQuotaError("Le budget journalier est atteint ou réservé par une exécution en cours. Réessayez plus tard.", "quota_budget");
  }
  if (monthlyCost + activeReservation + AGENT_RUN_COST_RESERVATION_USD > company.monthlySpendLimitUsd) {
    throw new AgentRunQuotaError(`Le budget mensuel est atteint ou réservé par une exécution en cours. Réessayez le 1er ${nextMonthName}.`, "quota_budget");
  }
  return company;
}

/**
 * Réserve 1 $ avant un appel direct au modèle. Un message à Paul ou
 * « Préremplir mon profil » ne vérifie que la limite de messages et le
 * budget ; la mise en ligne du site, que la limite de lancements et le budget.
 */
export async function reserveUsageBudget(companyId: string, purpose: string) {
  return prisma.$transaction(async (tx) => {
    await assertRunQuota(tx, companyId, usageCounterFor(purpose));
    return tx.usageReservation.create({
      data: {
        companyId,
        purpose,
        amountUsd: AGENT_RUN_COST_RESERVATION_USD,
        expiresAt: new Date(Date.now() + (AGENT_RUN_MAX_DURATION_SECONDS + STALE_GRACE_SECONDS) * 1000),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
