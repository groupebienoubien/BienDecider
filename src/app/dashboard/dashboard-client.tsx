"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentProposal, ActionPlanItem } from "@prisma/client";
import type { AgentRunView } from "@/lib/agent-run-types";
import { AgentRunTracker, useAgentRunMonitor } from "@/components/agent-run-tracker";
import { finishedRunMessage } from "@/lib/agent-run-progress";
import type { SafeCompany } from "@/lib/safe-company";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { ProposalCard, type ProposalDecision } from "@/components/proposal-card";
import { JourneyProgress } from "@/components/journey-progress";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";
import { describeProgress, summarizeProposals } from "@/lib/proposal-progress";
import { countByFilter, FILTER_LABELS, groupQueue, type QueueFilter } from "@/lib/validation-queue";
import { needsAttention } from "@/lib/pending-decisions";
import { openPaul } from "@/lib/paul-context";

type PlanItemWithProposals = ActionPlanItem & { proposals: AgentProposal[]; agentRuns: AgentRunView[] };
type View = "today" | "plan" | "validation" | "historique";

export function DashboardClient({ company, initialPlanItems, initialAgentRuns, initialProposals, leadSources, initialDiagnosticCount, initialView, riskSettings, facebookPageName }: {
  company: SafeCompany;
  initialPlanItems: PlanItemWithProposals[];
  initialAgentRuns: AgentRunView[];
  initialProposals: AgentProposal[];
  leadSources: Record<string, string | null>;
  initialDiagnosticCount: number;
  initialView: View;
  riskSettings: Record<string, string>;
  facebookPageName: string | null;
}) {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const router = useRouter();
  const [planItems, setPlanItems] = useState(initialPlanItems);
  const [agentRuns, setAgentRuns] = useState(initialAgentRuns);
  const [proposals, setProposals] = useState(initialProposals);
  const [currentLeadSources, setLeadSources] = useState(leadSources);
  const [planLoading, setPlanLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [direction, setDirection] = useState(company.direction ?? "");
  const [directionSaving, setDirectionSaving] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [decidedIds, setDecidedIds] = useState<string[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const monitorRun = useAgentRunMonitor(initialAgentRuns, {
    onUpdate: (run) => setAgentRuns((previous) => [run, ...previous.filter((entry) => entry.id !== run.id)].slice(0, 20)),
    onFinished: async (finished) => {
      await refresh();
      if (finished.status === "failed") setError(finished.errorMessage ?? "L'agent a échoué. Vous pouvez relancer l'action.");
      else setNotice(finishedRunMessage(finished));
    },
    onError: reportError,
  });

  async function refresh() {
    const [planResponse, proposalResponse, runsResponse] = await Promise.all([
      fetch(`/api/co-ceo/plan?companyId=${company.id}`), fetch("/api/proposals"), fetch("/api/agent-runs"),
    ]);
    if (!planResponse.ok || !proposalResponse.ok || !runsResponse.ok) throw new Error("Impossible d'actualiser les actions. Rechargez la page.");
    const nextPlan = await planResponse.json();
    const nextProposals: AgentProposal[] = await proposalResponse.json();
    const nextRuns: { runs: AgentRunView[] } = await runsResponse.json();
    setPlanItems(nextPlan);
    setProposals(nextProposals);
    setAgentRuns(nextRuns.runs);
    router.refresh();
    return nextProposals;
  }

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(data?.error ?? "L'opération a échoué. Réessayez."), { status: response.status });
    return data;
  }

  function reportError(error: unknown) {
    setError(error instanceof Error ? error.message : "L'opération a échoué.");
  }

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setError(null);
    try {
      const { run } = await request("/api/co-ceo/plan", "POST", { requestId: crypto.randomUUID() });
      await refresh();
      setNotice("Paul prépare le plan en arrière-plan.");
      void monitorRun(run.id);
    } catch (error) { reportError(error); }
    finally { setPlanLoading(false); }
  }

  async function handleRetryPlanGeneration() {
    setPlanLoading(true);
    setError(null);
    try {
      const { run } = await request("/api/co-ceo/plan", "POST", { requestId: crypto.randomUUID() });
      await refresh();
      setNotice("Paul relance la préparation du plan en arrière-plan.");
      void monitorRun(run.id);
    } catch (error) { reportError(error); }
    finally { setPlanLoading(false); }
  }

  async function handleLaunch(item: ActionPlanItem, retryRunId?: string) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const { run } = await request(`/api/action-plan/${item.id}/launch`, "POST", retryRunId ? { retryRunId } : {});
      await refresh();
      setNotice("Action confiée. L'agent travaille en arrière-plan.");
      void monitorRun(run.id);
    } catch (error) { reportError(error); }
    finally { setBusyId(null); }
  }

  async function checkRun(runId: string) {
    try {
      const { run } = await request(`/api/agent-runs/${encodeURIComponent(runId)}`, "GET");
      setAgentRuns((previous) => [run, ...previous.filter((entry) => entry.id !== run.id)].slice(0, 20));
      if (run.status === "failed") {
        await refresh();
        setError(run.errorMessage ?? "L'agent a échoué. Vous pouvez relancer l'action.");
      } else if (run.status === "succeeded") {
        await refresh();
      }
    } catch (error) { reportError(error); }
  }

  async function handleDiscard(itemId: string) {
    setBusyId(itemId);
    setError(null);
    try {
      await request(`/api/action-plan/${itemId}`, "PATCH", { status: "ecarte", feedback: discardReason });
      setDiscardingId(null);
      setDiscardReason("");
      await refresh();
      setNotice("Action écartée. Elle reste disponible dans l'historique.");
    } catch (error) { reportError(error); }
    finally { setBusyId(null); }
  }

  async function handleDecision(proposalId: string, decision: ProposalDecision): Promise<boolean> {
    const { status, content, rejectionReason, expectedVersion } = decision;
    setBusyId(proposalId);
    setError(null);
    setNotice(null);
    try {
      await request(`/api/proposals/${proposalId}`, "PATCH", {
        status, expectedVersion,
        ...(content === undefined ? {} : { content }),
        ...(rejectionReason === undefined ? {} : { rejectionReason }),
      });
      if (status !== "brouillon") setDecidedIds((previous) => [...previous, proposalId]);
      await refresh();
      setNotice(status === "a_relire"
        ? "Production rouverte : elle est de nouveau à relire dans la file À valider."
        : status === "brouillon"
        ? "Brouillon enregistré. Il n'est pas approuvé : rien ne sera publié ni envoyé."
        : status === "modifiee"
          ? "Cette version est approuvée. Aucune action n'a été exécutée automatiquement."
          : status === "validee"
            ? "Production approuvée. L'approbation ne vaut pas publication ou envoi."
            : "Production rejetée.");
      return true;
    } catch (error) {
      reportError(error);
      // Version périmée : on réaffiche la dernière version pour que le dirigeant voie ce qui a changé avant de décider.
      if ((error as { status?: number }).status === 409) await refresh().catch(() => undefined);
      return false;
    }
    finally { setBusyId(null); }
  }

  async function handleExecute(proposalId: string, expectedVersion: number, confirmed: true, acknowledgedReviewIds: string[]) {
    setBusyId(proposalId);
    setError(null);
    try {
      const result = await request(`/api/proposals/${proposalId}/execute`, "POST", { expectedVersion, confirmed, acknowledgedReviewIds });
      setDecidedIds((previous) => [...previous, proposalId]);
      await refresh();
      setNotice(result?.message ?? "Publication effectuée. Elle figure dans les résultats.");
    } catch (error) {
      reportError(error);
      // Un refus ou un résultat incertain a pu changer l'état : on réaffiche la situation réelle.
      await refresh().catch(() => undefined);
    }
    finally { setBusyId(null); }
  }

  async function handleSetLeadSource(proposalId: string, source: string): Promise<boolean> {
    setBusyId(proposalId);
    setError(null);
    try {
      await request(`/api/proposals/${proposalId}`, "PATCH", { leadSource: source });
      setLeadSources((previous) => ({ ...previous, [proposalId]: source }));
      setNotice("Source enregistrée. Vérifiez vous-même qu'elle correspond à l'organisation.");
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveDirection() {
    setDirectionSaving(true);
    setError(null);
    try {
      await request("/api/companies/direction", "POST", { direction });
      setNotice("Consigne enregistrée pour les prochaines actions.");
    } catch (error) { reportError(error); }
    finally { setDirectionSaving(false); }
  }

  const activeItems = planItems.filter((item) => item.status !== "ecarte" && item.status !== "termine");
  const closedItems = planItems.filter((item) => item.status === "ecarte" || item.status === "termine");
  const actionable = proposals.filter((proposal) => needsAttention(proposal, facebookPageName));
  const validationItems = proposals.filter((proposal) => needsAttention(proposal, facebookPageName) || decidedIds.includes(proposal.id));
  const queueCounts = countByFilter(validationItems);
  const queueGroups = groupQueue(validationItems, queueFilter, new Map(planItems.map((item) => [item.id, item.title])));
  const history = proposals.filter((proposal) => !needsAttention(proposal, facebookPageName));
  const nextItem = activeItems.find((item) => item.status === "propose");
  const runningItem = activeItems.find((item) => item.status === "en_cours");
  const needsFirstDiagnostic = initialDiagnosticCount === 0 && planItems.length === 0;
  const emptyNextHref = needsFirstDiagnostic ? "/diagnostic" : "/dashboard?view=plan";
  const emptyNextLabel = needsFirstDiagnostic ? "Commencer par le diagnostic" : activeItems.length > 0 ? "Voir les actions du plan" : "Revenir au plan d'action";
  const locked = busyId !== null || planLoading;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-indigo-700">{company.name}</p>
          <h1 className="text-2xl font-semibold">{({ today: "À décider", plan: "Mon plan d’action", validation: "Productions", historique: "Historique" })[initialView]}</h1>
          <p className="mt-1 text-sm text-slate-500">{company.objective || "Votre activité, vos priorités"}</p>
        </div>
        <Link href="/rapport" className="text-sm font-medium text-indigo-600 underline underline-offset-4">Voir les résultats</Link>
      </header>
      {initialView === "today" && <dl className="decision-metrics">
        <div><dt>Productions à examiner</dt><dd>{actionable.length}</dd></div>
        <div><dt>Actions à confier</dt><dd>{activeItems.filter((item) => item.status === "propose").length}</dd></div>
        <div><dt>Productions exécutées</dt><dd>{proposals.filter((proposal) => proposal.status === "executee").length}</dd></div>
      </dl>}
      {initialView === "today" && needsFirstDiagnostic && <JourneyProgress
        objectiveComplete={Boolean(company.objective?.trim())}
        diagnosticComplete={initialDiagnosticCount > 0}
        planComplete={planItems.length > 0}
        workStarted={proposals.length > 0 || planItems.some((item) => ["en_cours", "lance", "termine"].includes(item.status))}
        needsValidation={actionable.length > 0}
        resultsAvailable={proposals.some((proposal) => proposal.status === "executee")}
        planLoading={planLoading}
        onPreparePlan={handleGeneratePlan}
      />}
      {initialView === "today" && <section className="mt-6 border-y border-slate-200 py-5" aria-labelledby="next-step">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochaine étape</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h2 id="next-step" className="max-w-xl text-lg font-medium">{actionable.length > 0 ? `${actionable.length} production(s) attendent votre décision` : nextItem ? nextItem.title : runningItem ? `En cours : ${runningItem.title}` : needsFirstDiagnostic ? "Repérer les premières opportunités" : "Préparer les prochaines actions"}</h2>
          {actionable.length > 0 ? (
            <Link href="/dashboard?view=validation" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Examiner les productions</Link>
          ) : runningItem ? (
            <span role="status" className="text-sm text-slate-600">L&apos;agent prépare le résultat…</span>
          ) : nextItem ? (
            <Link href="/dashboard?view=plan" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Examiner l&apos;action</Link>
          ) : needsFirstDiagnostic ? (
            <Link href="/diagnostic" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Commencer par le diagnostic</Link>
          ) : (
            <button onClick={handleGeneratePlan} disabled={locked} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{planLoading ? "Paul réfléchit…" : "Préparer le plan"}</button>
          )}
        </div>
      </section>}
      {initialView === "today" && <>
        {actionable.length > 0 && <section className="mt-7" aria-label="Vos prochaines décisions">
          <h2 className="mb-4 text-lg font-semibold">À examiner maintenant</h2>
          <div>{actionable.slice(0, 3).map((proposal) => <article key={proposal.id} className="decision-row">
            <div><p>{PERSONAS[proposal.agent as AgentKey]?.name ?? proposal.agent} · {proposal.status === "validee" || proposal.status === "modifiee" ? "Approuvée, diffusion à confirmer" : "Relecture attendue"}</p><h3 className="mt-1 font-semibold">{proposal.title}</h3><p>{planItems.find((item) => item.id === proposal.planItemId)?.title ?? "Demande à l’équipe"}</p></div>
            <Link href={`/dashboard?view=validation&proposal=${encodeURIComponent(proposal.id)}#proposal-${encodeURIComponent(proposal.id)}`}>Examiner →</Link>
          </article>)}</div>
        </section>}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section><h2 className="text-lg font-semibold">Dernières décisions</h2>
            {history.length === 0 ? <p className="mt-3 text-sm text-slate-600">Vos décisions apparaîtront ici après la première relecture.</p> : <ul className="mt-3 divide-y divide-slate-200">{history.slice(0, 3).map((proposal) => <li key={proposal.id} className="py-3"><Link className="text-sm font-medium text-indigo-700" href={`/dashboard?view=historique&proposal=${encodeURIComponent(proposal.id)}`}>{proposal.title}</Link><p className="mt-1 text-xs text-slate-600">{proposal.status === "executee" ? "Exécution enregistrée" : proposal.status === "rejetee" ? "Rejetée" : "Décision enregistrée"}</p></li>)}</ul>}
            <Link href="/dashboard?view=historique" className="mt-3 inline-block text-sm text-indigo-700 underline">Consulter l&apos;historique</Link>
          </section>
          <section className="border-t-2 border-indigo-600 bg-indigo-50 p-5"><div className="flex items-center gap-3"><PersonaAvatar agentKey="co_ceo" size={32} /><h2 className="text-base font-semibold">Le point avec Paul</h2></div><p className="mt-4 text-sm text-slate-700">{actionable.length > 0 ? "Des productions sont prêtes pour votre relecture. Examinons-les avant de préparer la suite." : "Faisons le point sur votre objectif et les prochains sujets à confier à l’équipe."}</p><button type="button" onClick={() => openPaul()} className="mt-4 min-h-11 text-sm font-semibold text-indigo-700">Échanger avec Paul →</button></section>
        </div>
      </>}
      {initialView === "validation" && (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-800">
          {actionable.length > 0 ? `${actionable.length} production(s) attendent votre décision. Valider ou rejeter ne publie ni n'envoie rien.` : "Aucune production n'attend votre décision."}
        </p>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} onRetry={() => void handleRetryPlanGeneration()} retryDisabled={planLoading} />
      {initialView !== "today" && <nav aria-label="Actions" className="mt-6 flex flex-wrap gap-x-6 border-b border-slate-200">
        {([
          ["plan", "Plan d'action", activeItems.length],
          ["validation", "À valider", actionable.length],
          ["historique", "Historique", history.length],
        ] as const).map(([view, label, count]) => (
          <Link key={view} href={`/dashboard?view=${view}`} aria-current={initialView === view ? "page" : undefined} className={`border-b-2 py-3 text-sm font-medium ${initialView === view ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            {label} <span className="ml-1 text-xs">{count}</span>
          </Link>
        ))}
      </nav>}
      {initialView === "plan" && (
        <section id="plan-actions" className="py-5" aria-label="Plan d'action">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Priorités de {PERSONAS.co_ceo.name}</h2>
            {!needsFirstDiagnostic && <button onClick={handleGeneratePlan} disabled={locked} className="text-sm font-medium text-indigo-600 underline underline-offset-4 disabled:opacity-50">{planLoading ? "Préparation…" : "Compléter le plan"}</button>}
          </div>
          {activeItems.length === 0 && <div className="py-6" aria-label="Plan à préparer">
            <h3 className="text-base font-medium">Choisir les prochaines activités à confier</h3>
            <p className="mt-2 max-w-prose text-sm text-slate-600">Aucune action à lancer pour le moment. Le plan rassemble les priorités proposées par Paul ; vous choisissez celles à confier à l&apos;équipe.</p>
            {needsFirstDiagnostic ? <Link href="/diagnostic" className="mt-3 inline-block text-sm font-medium text-indigo-600 underline">Commencer par le diagnostic</Link> : <p className="mt-3 text-sm text-slate-500">Préparez le plan avec Paul pour obtenir de nouvelles propositions. Aucune action externe ne sera exécutée à cette étape.</p>}
          </div>}
          <ol className="divide-y divide-slate-200">
            {activeItems.map((item, index) => {
              const persona = PERSONAS[item.agent as AgentKey];
              const count = proposals.filter((proposal) => proposal.planItemId === item.id && needsAttention(proposal, facebookPageName)).length;
              const progress = summarizeProposals(proposals.filter((proposal) => proposal.planItemId === item.id));
              const progressParts = describeProgress(progress);
              return (
                <li key={item.id} className="py-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="pt-1 text-sm text-slate-600">{index + 1}.</span>
                    <PersonaAvatar agentKey={item.agent as AgentKey} size={32} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-xs text-slate-500">{persona?.name ?? item.agent} · {item.timing}</p>
                      <span className="mt-2 inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800">{item.agent === "marketing" ? "Marketing & visibilité" : item.agent === "demarchage" ? "Prospection" : "Contenus & site"}</span>
                      <h3 className="mt-1 font-medium">{item.title}</h3>
                      <p className="mt-2 max-w-2xl text-sm text-slate-600">{item.rationale}</p>
                      {progressParts.length > 0 && <p className="mt-2 text-xs text-slate-600">Avancement : {progressParts.join(" · ")}.</p>}
                      {progress.total > 0 && progress.rejected === progress.total && <p className="mt-1 text-xs text-slate-600">Rien n&apos;a été retenu : l&apos;action reste ouverte. Précisez votre consigne à l&apos;équipe pour obtenir une autre proposition.</p>}
                    </div>
                    {item.status === "en_cours" ? (
                      <div className="flex items-center gap-3">
                        <span role="status" className="text-sm text-slate-600">En cours</span>
                        {item.agentRuns[0] && <button onClick={() => void checkRun(item.agentRuns[0].id)} className="text-xs text-indigo-600 underline">Vérifier l&apos;état</button>}
                      </div>
                    ) : item.status === "propose" ? (
                      <div className="flex items-center gap-3">
                        <button onClick={() => setDiscardingId(discardingId === item.id ? null : item.id)} disabled={locked} className="text-xs text-slate-500 disabled:opacity-50">Écarter</button>
                        <button onClick={() => void requestProfile(item.agent as AgentKey, () => handleLaunch(item, item.agentRuns[0]?.status === "failed" ? item.agentRuns[0].id : undefined))} disabled={locked || checking} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{busyId === item.id ? "Mise en file…" : item.agentRuns[0]?.status === "failed" ? "Relancer" : "Lancer"}</button>
                      </div>
                    ) : (
                      <Link href={count > 0 ? "/dashboard?view=validation" : "/dashboard?view=historique"} className="text-sm text-indigo-600 underline">{count > 0 ? `${count} à examiner` : "Voir la production"}</Link>
                    )}
                  </div>
                  {discardingId === item.id && (
                    <form onSubmit={(event) => { event.preventDefault(); void handleDiscard(item.id); }} className="mt-3 flex flex-wrap gap-2">
                      <input aria-label="Raison de l'abandon" placeholder="Pourquoi écarter cette action ?" value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} className="min-w-0 flex-1 basis-48 rounded-lg border px-3 py-2 text-sm" />
                      <button disabled={locked} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmer</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
          {closedItems.length > 0 && <Link href="/dashboard?view=historique" className="mt-4 inline-block text-sm text-slate-500 underline">{closedItems.length} action(s) traitée(s) ou écartée(s)</Link>}
        </section>
      )}
      {initialView === "validation" && (
        <section className="space-y-4 py-5" aria-label="Productions à valider">
          {validationItems.length === 0 && <div className="py-6" aria-label="Validation à venir">
            <h2 className="text-base font-medium">Tout est à jour.</h2>
            <p className="mt-2 max-w-prose text-sm text-slate-600">Aucune production à valider ou à publier. Les brouillons de l&apos;équipe apparaissent ici pour être relus, corrigés ou refusés avant toute action externe.</p>
            <Link href={emptyNextHref} className="mt-3 inline-block text-sm font-medium text-indigo-600 underline">{emptyNextLabel}</Link>
          </div>}
          {validationItems.length > 0 && (
            <div role="group" aria-label="Filtrer les productions" className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as QueueFilter[]).map((filter) => (
                <button key={filter} type="button" aria-pressed={queueFilter === filter} onClick={() => setQueueFilter(filter)}
                  className={`min-h-11 rounded-lg border px-3 text-sm ${queueFilter === filter ? "border-indigo-700 bg-indigo-50 font-medium text-indigo-900" : "border-slate-300 text-slate-700"}`}>
                  {FILTER_LABELS[filter]} ({queueCounts[filter]})
                </button>
              ))}
            </div>
          )}
          {validationItems.length > 0 && queueGroups.length === 0 && (
            <div role="status" className="py-4">
              <p className="text-sm text-slate-700">Aucune production ne correspond à ce filtre. {queueCounts.all} production(s) restent dans la file.</p>
              <button type="button" onClick={() => setQueueFilter("all")} className="mt-2 min-h-11 text-sm font-medium text-indigo-700 underline">Afficher toutes les productions</button>
            </div>
          )}
          <div className={queueGroups.length > 0 ? "production-workspace" : undefined}>
          {queueGroups.length > 0 && <nav className="production-index" aria-label="Sommaire des productions">
            {queueGroups.map((group) => <div key={group.key}>
              <p className="mb-2 text-xs font-semibold text-slate-600">{group.title}</p>
              {group.items.map((proposal) => <a key={proposal.id} href={`#proposal-${proposal.id}`} className="mb-2 block rounded-md border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800"><span className="mb-1 block text-xs font-normal text-indigo-700">{PERSONAS[proposal.agent as AgentKey]?.name ?? proposal.agent} · v{proposal.version}</span>{proposal.title}</a>)}
            </div>)}
          </nav>}
          <div className="min-w-0 space-y-6">
          {queueGroups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`} className="space-y-3">
              <h2 id={`group-${group.key}`} className="text-sm font-semibold text-slate-800">{group.title} <span className="font-normal text-slate-600">({group.items.length})</span></h2>
              {group.items.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} onDecision={handleDecision} onExecute={handleExecute} onSetLeadSource={handleSetLeadSource} busy={locked} showAgent workspace riskSettings={riskSettings} facebookPageName={facebookPageName} siteDestination={company.siteSlug ? `/site/${company.siteSlug}` : null} companyPhone={company.phone} companyCertifications={company.certifications} leadSource={currentLeadSources[proposal.id]} />
              ))}
            </section>
          ))}
          </div>
          </div>
        </section>
      )}
      {initialView === "historique" && (
        <section className="space-y-4 py-5" aria-label="Historique">
          <h2 className="font-medium">Productions traitées</h2>
          {history.length === 0 && <div role="region" aria-label="Historique à venir">
            <p className="text-sm text-slate-600">Aucune production traitée. Vos validations et refus resteront ici pour retrouver vos décisions.</p>
            <Link href={actionable.length > 0 ? "/dashboard?view=validation" : emptyNextHref} className="mt-3 inline-block text-sm font-medium text-indigo-600 underline">{actionable.length > 0 ? "Examiner les productions" : emptyNextLabel}</Link>
          </div>}
          {history.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onDecision={handleDecision} busy={locked} showAgent riskSettings={riskSettings} facebookPageName={facebookPageName} />)}
          <h2 className="pt-4 font-medium">Actions terminées et écartées</h2>
          {closedItems.length === 0 && <p className="text-sm text-slate-500">Les actions terminées ou écartées du plan seront conservées ici.</p>}
          <ul className="divide-y divide-slate-200">
            {closedItems.map((item) => <li key={item.id} className="py-3 text-sm"><span className="text-xs text-slate-500">{item.status === "ecarte" ? "Écartée" : "Traitée"}</span><p className="font-medium">{item.title}</p>{item.feedback && <p className="mt-1 text-slate-500">{item.feedback}</p>}</li>)}
          </ul>
          <Link href="/diagnostic" className="inline-block text-sm text-indigo-600 underline">Consulter le diagnostic</Link>
        </section>
      )}
      {profileDialog}
      <details className="mt-6 border-t border-slate-200 py-5">
        <summary className="flex cursor-pointer items-center gap-3 font-medium"><PersonaAvatar agentKey="co_ceo" size={32} />Faire le point avec {PERSONAS.co_ceo.name}</summary>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <section>
            <label htmlFor="direction" className="text-sm font-medium">Consigne pour l&apos;équipe</label>
            <textarea id="direction" value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Priorités, contraintes, actualités…" rows={4} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" />
            <button onClick={handleSaveDirection} disabled={directionSaving} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{directionSaving ? "Enregistrement…" : "Enregistrer la consigne"}</button>
          </section>
          <section className="min-w-0">
            <h2 className="text-sm font-medium">Conversation avec {PERSONAS.co_ceo.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{PERSONAS.co_ceo.name} est disponible sur chaque page avec le bouton « Parler à {PERSONAS.co_ceo.name} ». La conversation et votre brouillon sont conservés d&apos;une page à l&apos;autre.</p>
            <button type="button" onClick={() => openPaul()} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Ouvrir la discussion</button>
          </section>
        </div>
      </details>
    </div>
  );
}