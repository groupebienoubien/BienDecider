import type { AgentRun } from "@prisma/client";
import { isRunFailureReason, type RunFailureReason } from "@/lib/agents/agent-errors";

export type AgentRunView = {
  id: string;
  agent: string;
  planItemId: string | null;
  status: string;
  attempts: number;
  maxDurationSeconds: number;
  queuedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  resultCount: number;
  errorMessage: string | null;
  /** Motif typé d'une exécution échouée ; null tant qu'elle n'a pas échoué. */
  failureReason: RunFailureReason | null;
  /** Exécution de révision (story 3.3) : la production révisée, sa version de départ et son titre. */
  revision?: RunRevisionView;
};

export type RunRevisionView = { proposalId: string; fromVersion: number; title: string | null };

/** Révision décrite par la charge d'une exécution, sans en exposer le reste (consigne comprise). */
function revisionOf(payload: unknown): RunRevisionView | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { kind?: unknown; proposalId?: unknown; fromVersion?: unknown; title?: unknown };
  if (value.kind !== "revision" || typeof value.proposalId !== "string" || typeof value.fromVersion !== "number") return undefined;
  return { proposalId: value.proposalId, fromVersion: value.fromVersion, title: typeof value.title === "string" ? value.title : null };
}

/** Colonnes lues pour construire une AgentRunView (ni payload ni clés internes). */
export const AGENT_RUN_VIEW_SELECT = {
  id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true,
  queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true, failureReason: true,
  // Lue seulement pour décrire une révision (revisionOf) ; jamais transmise telle quelle.
  payload: true,
} as const;

export type AgentRunViewSource = Pick<AgentRun, keyof typeof AGENT_RUN_VIEW_SELECT>;

/** Vue d'une exécution transmise au navigateur ou à Paul. */
export function publicRun(run: AgentRunViewSource): AgentRunView {
  return {
    id: run.id,
    agent: run.agent,
    planItemId: run.planItemId,
    status: run.status,
    attempts: run.attempts,
    maxDurationSeconds: run.maxDurationSeconds,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    resultCount: run.resultCount,
    errorMessage: run.errorMessage,
    failureReason: isRunFailureReason(run.failureReason) ? run.failureReason : null,
    ...(revisionOf(run.payload) ? { revision: revisionOf(run.payload) } : {}),
  };
}