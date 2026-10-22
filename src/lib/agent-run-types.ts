import type { AgentRun } from "@prisma/client";

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
};

/** Colonnes lues pour construire une AgentRunView (ni payload ni clés internes). */
export const AGENT_RUN_VIEW_SELECT = {
  id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true,
  queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true,
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
  };
}