import type { AgentRunView } from "@/lib/agent-run-types";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";

export type RunStepState = "done" | "active" | "todo";
export type RunStep = { label: string; state: RunStepState };

// Les agents ne publient pas leur phase : les étapes sont une estimation d'après le temps écoulé, jamais un état mesuré.
const AGENT_STEPS: Record<string, { expectedSeconds: number; steps: string[] }> = {
  co_ceo: { expectedSeconds: 25, steps: ["Lecture de votre diagnostic et de vos résultats", "Choix des priorités", "Rédaction du plan"] },
  marketing: { expectedSeconds: 45, steps: ["Lecture de votre site et de votre fiche", "Recherche de vos concurrents", "Rédaction du diagnostic"] },
  contenu: { expectedSeconds: 30, steps: ["Lecture de votre activité et du diagnostic", "Rédaction des contenus"] },
  demarchage: { expectedSeconds: 45, steps: ["Recherche d'organisations à contacter", "Préparation des messages"] },
};
const FALLBACK_STEPS = { expectedSeconds: 30, steps: ["Travail en cours"] };

export const RECENT_FINISH_MINUTES = 60;

export function isActiveRun(run: Pick<AgentRunView, "status">): boolean {
  return run.status === "queued" || run.status === "running";
}

function toMs(value: Date | string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}

export function describeRunProgress(run: AgentRunView, now: number) {
  const spec = AGENT_STEPS[run.agent] ?? FALLBACK_STEPS;
  const queued = run.status === "queued";
  const reference = (queued ? toMs(run.queuedAt) : toMs(run.startedAt) ?? toMs(run.queuedAt)) ?? now;
  const elapsedSeconds = Math.max(0, (now - reference) / 1000);
  const perStep = spec.expectedSeconds / spec.steps.length;
  const activeIndex = queued ? -1 : Math.min(spec.steps.length - 1, Math.floor(elapsedSeconds / perStep));
  const steps: RunStep[] = spec.steps.map((label, index) => ({
    label,
    state: index < activeIndex ? "done" : index === activeIndex ? "active" : "todo",
  }));
  const overrun = !queued && elapsedSeconds > spec.expectedSeconds;
  const hint = queued
    ? "En attente de démarrage."
    : overrun
      ? `L'exécution dépasse la durée habituelle. Limite de la plateforme : ${run.maxDurationSeconds} s ; vous pourrez ensuite la relancer.`
      : `Durée habituelle : environ ${spec.expectedSeconds} s.`;
  return {
    headline: queued ? "Dans la file" : steps[activeIndex].label,
    steps,
    elapsedSeconds,
    overrun,
    hint,
  };
}

export function agentName(agent: string): string {
  return PERSONAS[agent as AgentKey]?.name ?? agent;
}

export function finishedRunMessage(run: Pick<AgentRunView, "agent" | "resultCount">): string {
  const name = agentName(run.agent);
  if (run.agent === "co_ceo") return `${name} a terminé : le plan est prêt à examiner.`;
  if (run.resultCount === 0) return `${name} a terminé : rien de nouveau à examiner.`;
  return `${name} a terminé : ${run.resultCount} élément(s) à examiner.`;
}

export function runResultHref(run: Pick<AgentRunView, "agent">): string {
  if (run.agent === "co_ceo") return "/dashboard?view=plan";
  if (run.agent === "marketing") return "/diagnostic";
  return "/dashboard?view=validation";
}

export function recentSucceededRuns(runs: AgentRunView[], now: number, limit = 3): AgentRunView[] {
  return runs
    .filter((run) => {
      const finished = toMs(run.finishedAt);
      return run.status === "succeeded" && finished !== null && now - finished <= RECENT_FINISH_MINUTES * 60_000;
    })
    .slice(0, limit);
}
