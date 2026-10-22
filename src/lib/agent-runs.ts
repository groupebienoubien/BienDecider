import { after } from "next/server";
import { Prisma, type AgentRun, type ActionPlanItem } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { publicRun } from "@/lib/agent-run-types";
import { prisma } from "@/lib/prisma";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { executePlanItem, type PlanRunExtras } from "@/lib/agents/plan-runner";
import { isPlanAgent, type PlanAgent } from "@/lib/agents/plan-items";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";

export const AGENT_RUN_MAX_DURATION_SECONDS = 300;
export const AGENT_RUN_COST_RESERVATION_USD = 1;
const STALE_GRACE_SECONDS = 10;
const DIRECT_DEDUPE_SECONDS = 5 * 60;

type AgentRunPayload =
  | { kind: "plan_item"; planItemId: string; extras: PlanRunExtras }
  | { kind: "plan_generation" }
  | { kind: "direct"; agent: PlanAgent; newsContext?: string; prospectDescription?: string };

export class AgentRunConflictError extends Error {
  constructor(message = "Cette action n'est plus disponible au lancement.") {
    super(message);
    this.name = "AgentRunConflictError";
  }
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
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
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.agentRun.findUnique({
        where: { companyId_requestKey: { companyId: params.companyId, requestKey: params.requestKey } },
      });
      if (existing) {
        if (existing.status !== "failed" || params.retryRunId !== existing.id) return existing;
        await assertRunQuota(tx, params.companyId);
        const retry = await tx.agentRun.updateMany({
          where: { id: existing.id, status: "failed" },
          data: {
            status: "queued", activeDedupeKey: params.activeDedupeKey, reservedCostUsd: AGENT_RUN_COST_RESERVATION_USD,
            maxDurationSeconds: AGENT_RUN_MAX_DURATION_SECONDS,
            startedAt: null, finishedAt: null, resultCount: 0, errorMessage: null,
          },
        });
        if (retry.count === 0) return tx.agentRun.findUniqueOrThrow({ where: { id: existing.id } });
        if (params.planItemId) {
          const claimed = await tx.actionPlanItem.updateMany({
            where: { id: params.planItemId, companyId: params.companyId, status: "propose" },
            data: { status: "en_cours" },
          });
          if (claimed.count !== 1) throw new AgentRunConflictError("L'action n'est plus disponible pour une relance.");
        }
        await tx.agentRunAttempt.create({ data: { companyId: params.companyId, agentRunId: existing.id, status: "queued" } });
        return tx.agentRun.findUniqueOrThrow({ where: { id: existing.id } });
      }

      const active = await tx.agentRun.findUnique({
        where: { companyId_activeDedupeKey: { companyId: params.companyId, activeDedupeKey: params.activeDedupeKey } },
      });
      if (active) {
        const dedupeExpired = active.status === "succeeded" && active.finishedAt !== null &&
          Date.now() - active.finishedAt.getTime() > DIRECT_DEDUPE_SECONDS * 1000;
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
          throw new AgentRunConflictError("Action déjà lancée ou écartée.");
        }
      }

      await assertRunQuota(tx, params.companyId);

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
    throw new AgentRunConflictError();
  }
}

export async function enqueuePlanRun(params: {
  companyId: string;
  item: Pick<ActionPlanItem, "id" | "agent" | "title" | "rationale">;
  extras?: PlanRunExtras;
  retryRunId?: string;
}) {
  if (!isPlanAgent(params.item.agent)) throw new AgentRunConflictError("Agent inconnu.");
  const run = await persistRun({
    companyId: params.companyId,
    agent: params.item.agent,
    planItemId: params.item.id,
    requestKey: `plan:${params.item.id}`,
    activeDedupeKey: `plan:${params.item.id}`,
    payload: { kind: "plan_item", planItemId: params.item.id, extras: params.extras ?? {} },
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
        where: { id: stale.id, companyId, status: stale.status },
        data: {
          status: "failed",
          activeDedupeKey: null,
          reservedCostUsd: 0,
          finishedAt: new Date(),
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
    if (!item || !isPlanAgent(item.agent)) throw new AgentRunConflictError("Action introuvable ou agent invalide.");
    const result = await executePlanItem({ ...item, agent: item.agent }, payload.extras, run.id);
    return result.producedCount;
  }

  if (payload.kind !== "direct" || payload.agent !== run.agent) throw new AgentRunConflictError("Demande de lancement invalide.");
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
  const attemptId = await prisma.$transaction(async (tx) => {
    const claim = await tx.agentRun.updateMany({
      where: { id: runId, status: "queued" },
      data: { status: "running", startedAt: new Date(), attempts: { increment: 1 }, errorMessage: null },
    });
    if (claim.count !== 1) return null;
    let attempt = await tx.agentRunAttempt.findFirst({ where: { agentRunId: runId, status: "queued" }, orderBy: { queuedAt: "desc" } });
    attempt ??= await tx.agentRunAttempt.create({ data: { companyId: (await tx.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { companyId: true } })).companyId, agentRunId: runId } });
    await tx.agentRunAttempt.update({ where: { id: attempt.id }, data: { status: "running", startedAt: new Date() } });
    return attempt.id;
  });
  if (!attemptId) return;

  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  try {
    const resultCount = await executeRun(run);
    const completed = await prisma.agentRun.updateMany({
      where: { id: run.id, status: "running", attempts: run.attempts },
      data: { status: "succeeded", reservedCostUsd: 0, resultCount, finishedAt: new Date() },
    });
    if (completed.count === 1) {
      await prisma.agentRunAttempt.updateMany({ where: { id: attemptId, status: "running" }, data: { status: "succeeded", finishedAt: new Date() } });
    }
  } catch (error) {
    console.error("Échec du run agent:", error);
    const message = error instanceof AgentRunConflictError
      ? error.message
      : agentFailureMessage(error, PERSONAS[run.agent as PlanAgent]?.name ?? "L'agent");
    // Un seul commit : l'exécution ne doit jamais être lue échouée alors que son action reste « en cours ».
    await prisma.$transaction(async (tx) => {
      const failed = await tx.agentRun.updateMany({
        where: { id: run.id, status: "running", attempts: run.attempts },
        data: { status: "failed", activeDedupeKey: null, reservedCostUsd: 0, errorMessage: message, finishedAt: new Date() },
      });
      await tx.agentRunAttempt.updateMany({ where: { id: attemptId, status: "running" }, data: { status: "failed", finishedAt: new Date(), errorMessage: message } });
      if (failed.count === 1 && run.planItemId) {
        await tx.actionPlanItem.updateMany({
          where: { id: run.planItemId, companyId: run.companyId, status: "en_cours" },
          data: { status: "propose" },
        });
      }
    });
  }
}

export class AgentRunQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunQuotaError";
  }
}

function utcQuotaWindows(now: Date) {
  return {
    dayStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

async function assertRunQuota(tx: Prisma.TransactionClient, companyId: string, now = new Date()) {
  const company = await tx.company.update({
    where: { id: companyId },
    data: { quotaEpoch: { increment: 1 } },
  });
  const { dayStart, monthStart } = utcQuotaWindows(now);
  const [dailyRuns, monthlyRuns, dailyInlineCalls, monthlyInlineCalls, dailyUsage, monthlyUsage, reservedRuns, reservedCalls] = await Promise.all([
    tx.agentRunAttempt.count({ where: { companyId, queuedAt: { gte: dayStart } } }),
    tx.agentRunAttempt.count({ where: { companyId, queuedAt: { gte: monthStart } } }),
    tx.usageReservation.count({ where: { companyId, createdAt: { gte: dayStart } } }),
    tx.usageReservation.count({ where: { companyId, createdAt: { gte: monthStart } } }),
    tx.usageEvent.aggregate({ where: { companyId, createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
    tx.usageEvent.aggregate({ where: { companyId, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
    tx.agentRun.aggregate({ where: { companyId, status: { in: ["queued", "running"] } }, _sum: { reservedCostUsd: true } }),
    tx.usageReservation.aggregate({ where: { companyId, expiresAt: { gt: now }, releasedAt: null }, _sum: { amountUsd: true } }),
  ]);

  if (dailyRuns + dailyInlineCalls >= company.dailyAgentRunLimit) throw new AgentRunQuotaError("Le quota journalier de lancements est atteint. Réessayez demain ou contactez l'administrateur.");
  if (monthlyRuns + monthlyInlineCalls >= company.monthlyAgentRunLimit) throw new AgentRunQuotaError("Le quota mensuel de lancements est atteint. Contactez l'administrateur.");

  const dailyCost = dailyUsage._sum.costUsd ?? 0;
  const monthlyCost = monthlyUsage._sum.costUsd ?? 0;
  const activeReservation = (reservedRuns._sum.reservedCostUsd ?? 0) + (reservedCalls._sum.amountUsd ?? 0);
  if (dailyCost + activeReservation + AGENT_RUN_COST_RESERVATION_USD > company.dailySpendLimitUsd) {
    throw new AgentRunQuotaError("Le budget journalier est atteint ou réservé par une exécution en cours. Réessayez plus tard.");
  }
  if (monthlyCost + activeReservation + AGENT_RUN_COST_RESERVATION_USD > company.monthlySpendLimitUsd) {
    throw new AgentRunQuotaError("Le budget mensuel est atteint ou réservé par une exécution en cours. Contactez l'administrateur.");
  }
  return company;
}

export async function reserveUsageBudget(companyId: string, purpose: string) {
  return prisma.$transaction(async (tx) => {
    await assertRunQuota(tx, companyId);
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