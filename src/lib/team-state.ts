import { prisma } from "@/lib/prisma";
import { AGENT_RUN_VIEW_SELECT, publicRun, type AgentRunView } from "@/lib/agent-run-types";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";

/** Actions du plan encore actives : à lancer, en cours, à décider. */
export const ACTIVE_PLAN_STATUSES = ["propose", "en_cours", "lance"] as const;
const RECENT_RUNS_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_RUNS_LIMIT = 10;
const ACTIVE_RUN_STATUSES = ["queued", "running"];
const RUN_SELECT = { ...AGENT_RUN_VIEW_SELECT, createdAt: true } as const;

export type TeamStateAction = {
  id: string;
  agent: string;
  title: string;
  rationale: string;
  timing: string;
  status: string;
  /** Dernière mise à jour de l'action (story 3.5). */
  updatedAt: Date;
};

export type TeamStateRun = AgentRunView & { elapsedSeconds: number };

export type TeamState = {
  actions: TeamStateAction[];
  recentRuns: TeamStateRun[];
  pendingDecisions: number;
};

/**
 * Lecture unique de l'état de l'équipe (AD-9) : Paul (get_current_status),
 * le compteur du menu et l'accueil s'appuient sur cette fonction, pour que
 * le dirigeant lise partout le même état.
 */
export async function getTeamState(companyId: string, now = new Date()): Promise<TeamState> {
  const [actions, activeRuns, latestRuns, pendingDecisions] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId, status: { in: [...ACTIVE_PLAN_STATUSES] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, agent: true, title: true, rationale: true, timing: true, status: true, updatedAt: true },
    }),
    // Une exécution en file ou en cours reste visible quel que soit son âge : son action est toujours « en cours ».
    prisma.agentRun.findMany({
      where: { companyId, status: { in: ACTIVE_RUN_STATUSES } },
      select: RUN_SELECT,
    }),
    prisma.agentRun.findMany({
      where: { companyId, status: { notIn: ACTIVE_RUN_STATUSES }, createdAt: { gt: new Date(now.getTime() - RECENT_RUNS_WINDOW_MS) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_RUNS_LIMIT,
      select: RUN_SELECT,
    }),
    getPendingDecisionCount(companyId),
  ]);
  // Au plus 10 exécutions, plus récentes d'abord, sans jamais écarter une exécution active.
  const runs = [...activeRuns, ...latestRuns.slice(0, Math.max(0, RECENT_RUNS_LIMIT - activeRuns.length))]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const recentRuns = runs.map((run) => {
    const start = run.startedAt ?? run.queuedAt;
    const end = run.finishedAt ?? now;
    return { ...publicRun(run), elapsedSeconds: Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) };
  });
  return { actions, recentRuns, pendingDecisions };
}
