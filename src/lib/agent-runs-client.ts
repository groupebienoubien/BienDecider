import type { AgentRunView } from "@/lib/agent-run-types";

export async function fetchAgentRun(runId: string, signal?: AbortSignal): Promise<AgentRunView> {
  const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.run) throw new Error(data?.error ?? "Impossible de suivre l'exécution.");
  return data.run as AgentRunView;
}

export async function waitForAgentRun(
  runId: string,
  onUpdate: (run: AgentRunView) => void,
  signal?: AbortSignal,
): Promise<AgentRunView | null> {
  for (let attempt = 0; attempt < 270; attempt++) {
    if (signal?.aborted) return null;
    let run: AgentRunView;
    try {
      run = await fetchAgentRun(runId, signal);
    } catch (error) {
      // L'utilisateur a quitté la page : ce n'est pas une erreur à afficher.
      if (signal?.aborted) return null;
      throw error;
    }
    onUpdate(run);
    if (run.status === "succeeded" || run.status === "failed") return run;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return null;
}