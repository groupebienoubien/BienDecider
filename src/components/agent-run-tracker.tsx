"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgentRunView } from "@/lib/agent-run-types";
import { waitForAgentRun } from "@/lib/agent-runs-client";
import { Icon } from "@/components/icon";
import { SectionTitle } from "@/components/mockup-ui";
import {
  agentName, describeRunProgress, finishedRunMessage, formatDuration, isActiveRun, recentSucceededRuns, runResultHref,
} from "@/lib/agent-run-progress";

type MonitorHandlers = {
  onUpdate: (run: AgentRunView) => void;
  onFinished: (run: AgentRunView) => void | Promise<void>;
  onError: (error: unknown) => void;
};

/** Suit une exécution jusqu'à sa fin et reprend celles déjà en cours quand on revient sur la page. */
export function useAgentRunMonitor(initialRuns: AgentRunView[], handlers: MonitorHandlers) {
  const handlersRef = useRef(handlers);
  const controllerRef = useRef<AbortController | null>(null);
  const resumeIds = useRef(initialRuns.filter(isActiveRun).map((run) => run.id));

  useEffect(() => { handlersRef.current = handlers; });

  const monitor = useCallback(async (runId: string) => {
    try {
      const finished = await waitForAgentRun(runId, (run) => handlersRef.current.onUpdate(run), controllerRef.current?.signal);
      if (finished) await handlersRef.current.onFinished(finished);
    } catch (error) { handlersRef.current.onError(error); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    for (const runId of resumeIds.current) void monitor(runId);
    return () => controller.abort();
  }, [monitor]);

  return monitor;
}

// Une seule horloge partagée, active seulement tant qu'une exécution est affichée ; 0 côté serveur pour éviter un décalage à l'hydratation.
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function useClock() {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => 0);
}

function ActiveRun({ run, onCheck }: { run: AgentRunView; onCheck: (runId: string) => void }) {
  const clock = useClock();
  const progress = describeRunProgress(run, clock || new Date(run.startedAt ?? run.queuedAt).getTime());
  return (
    <div className="activity-row">
      <span className="activity-icon"><Icon name="refresh-cw" /></span>
      <div>
        <strong>{agentName(run.agent)} : {progress.headline}{clock > 0 && <> · depuis {formatDuration(progress.elapsedSeconds)}</>}</strong>
        <ol className="feedback-list">
          {progress.steps.map((step) => (
            <li key={step.label} aria-current={step.state === "active" ? "step" : undefined}>
              <span aria-hidden="true">{step.state === "done" ? "✓" : step.state === "active" ? "●" : "○"}</span> {step.label}
              <span className="sr-only"> ({step.state === "done" ? "estimée terminée" : step.state === "active" ? "en cours" : "à venir"})</span>
            </li>
          ))}
        </ol>
        <small>{progress.hint} Étapes indicatives. Vous pouvez quitter cette page : le résultat sera retrouvé ici.</small>
      </div>
      <button type="button" onClick={() => onCheck(run.id)}>Vérifier</button>
    </div>
  );
}

export function AgentRunTracker({ runs, onCheck, onRetry, retryDisabled }: {
  runs: AgentRunView[];
  onCheck: (runId: string) => void;
  onRetry?: (run: AgentRunView) => void;
  retryDisabled?: boolean;
}) {
  const [openedAt] = useState(() => Date.now());
  const active = runs.filter(isActiveRun);
  const failed = runs.filter((run) => run.status === "failed");
  const succeeded = recentSucceededRuns(runs, openedAt);
  if (active.length + failed.length + succeeded.length === 0) return null;

  return (
    <section aria-label="Exécutions récentes">
      <SectionTitle title="Exécutions récentes" />
      {active.slice(0, 5).map((run) => <ActiveRun key={run.id} run={run} onCheck={onCheck} />)}
      {failed.slice(0, 3).map((run) => (
        <div key={run.id} className="activity-row">
          <span className="activity-icon"><Icon name="x" /></span>
          <div><strong>{agentName(run.agent)}</strong><small>{run.errorMessage ?? "Échec, relançable"}</small></div>
          {onRetry && run.agent === "co_ceo" && <button type="button" onClick={() => onRetry(run)} disabled={retryDisabled}>Relancer Paul</button>}
        </div>
      ))}
      {succeeded.map((run) => (
        <div key={run.id} className="activity-row">
          <span className="activity-icon"><Icon name="check" /></span>
          <div><strong>{finishedRunMessage(run)}</strong></div>
          {(run.agent === "co_ceo" || run.resultCount > 0) && <Link className="btn" href={runResultHref(run)}>Voir le résultat</Link>}
        </div>
      ))}
    </section>
  );
}