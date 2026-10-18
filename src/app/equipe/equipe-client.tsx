"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgentRunView } from "@/lib/agent-run-types";
import { fetchAgentRun } from "@/lib/agent-runs-client";
import { AgentRunTracker, useAgentRunMonitor } from "@/components/agent-run-tracker";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { CHANNEL_CAPABILITIES } from "@/lib/channel-capabilities";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";
import { PageHeading } from "@/components/mockup-ui";
import { DictationButton } from "@/components/voice-controls";
import { appendDictation } from "@/lib/voice";

export function EquipeClient({ initialAgentRuns }: { initialAgentRuns: AgentRunView[] }) {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [newsContext, setNewsContext] = useState("");
  const [prospectDescription, setProspectDescription] = useState("");
  const [agentRuns, setAgentRuns] = useState(initialAgentRuns);

  function trackRun(run: AgentRunView) {
    setAgentRuns((previous) => [run, ...previous.filter((entry) => entry.id !== run.id)].slice(0, 12));
  }

  function announceFinished(run: AgentRunView) {
    if (run.status === "failed") setError(run.errorMessage ?? "L'agent a échoué. Vous pouvez relancer la demande.");
    if (run.status === "succeeded") setDone(true);
  }

  const monitorRun = useAgentRunMonitor(initialAgentRuns, {
    onUpdate: trackRun,
    onFinished: announceFinished,
    onError: (pollError) => setError(pollError instanceof Error ? pollError.message : "Impossible de suivre l'exécution."),
  });

  async function checkRun(runId: string) {
    try {
      const checked = await fetchAgentRun(runId);
      trackRun(checked);
      announceFinished(checked);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Impossible de vérifier l'exécution.");
    }
  }

  async function run(key: "contenu" | "demarchage") {
    setRunning(key);
    setError(null);
    setDone(false);
    try {
      const response = await fetch(`/api/agents/${key}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key === "contenu"
          ? { newsContext: newsContext || undefined, requestId: crypto.randomUUID() }
          : { prospectDescription: prospectDescription || undefined, requestId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "La demande a échoué. Réessayez.");
      const run = data.run as AgentRunView;
      setAgentRuns((previous) => [run, ...previous.filter((entry) => entry.id !== run.id)].slice(0, 12));
      setDone(false);
      void monitorRun(run.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "La demande a échoué.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="settings-stack">
      <PageHeading
        kicker="MON ENTREPRISE"
        title="Votre équipe."
        description="Paul coordonne ; les autres agents préparent. Vous validez avant toute diffusion."
        actions={<Link className="btn" href="/dashboard?view=plan">Voir le plan d’action</Link>}
      />
      {error && <p role="alert" className="warning">{error}</p>}
      {done && <p role="status" className="notice">Demande traitée. <Link href="/dashboard?view=validation">Examiner les productions</Link></p>}
      <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} />
      {profileDialog}
      {(["co_ceo", "marketing", "contenu", "demarchage"] as AgentKey[]).map((key) => {
        const persona = PERSONAS[key];
        const nextStep = key === "co_ceo"
          ? "Paul propose les priorités ; vous choisissez les activités à confier."
          : key === "marketing"
            ? `${CHANNEL_CAPABILITIES.googleBusiness.label} : ${CHANNEL_CAPABILITIES.googleBusiness.availability}`
            : key === "contenu"
              ? "Le site et Facebook peuvent être mis en ligne après votre approbation et une confirmation. Pour les autres réseaux, vous copiez et publiez vous-même."
              : CHANNEL_CAPABILITIES.prospecting.nextStep;
        const active = agentRuns.some((entry) => entry.agent === key && (entry.status === "queued" || entry.status === "running"));
        return (
          <section key={key} className="setting-section">
            <h2>{persona.name}</h2>
            <p><strong>{persona.role}</strong><br />{persona.blurb}</p>
            <p>{nextStep}</p>
            {key === "co_ceo" ? (
              <Link className="btn" href="/dashboard">Retrouver Paul et les priorités</Link>
            ) : key === "marketing" ? (
              <Link className="btn" href="/diagnostic">Ouvrir le diagnostic de Martine</Link>
            ) : (
              <details>
                <summary className="text-link">Demande ponctuelle</summary>
                <form onSubmit={(event) => { event.preventDefault(); void requestProfile(key, () => run(key)); }}>
                  <label className="field">{key === "contenu" ? "Actualité à communiquer (facultatif)" : "Prospects visés (facultatif)"}
                    <input value={key === "contenu" ? newsContext : prospectDescription} onChange={(event) => key === "contenu" ? setNewsContext(event.target.value) : setProspectDescription(event.target.value)} />
                  </label>
                  <div className="heading-actions">
                    <DictationButton
                      label={`Dicter la demande pour ${persona.name}`}
                      onTranscript={(text) => key === "contenu" ? setNewsContext((previous) => appendDictation(previous, text, 4000)) : setProspectDescription((previous) => appendDictation(previous, text, 4000))}
                    />
                    <button className="primary" disabled={running !== null || checking || active}>{running === key ? "Mise en file…" : active ? "En cours" : agentRuns.some((entry) => entry.agent === key && entry.status === "failed") ? "Relancer" : "Confier la demande"}</button>
                  </div>
                </form>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
