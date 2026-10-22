"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type CSSProperties } from "react";
import type { AgentProposal, ActionPlanItem } from "@prisma/client";
import type { AgentRunView } from "@/lib/agent-run-types";
import { AgentRunTracker, useAgentRunMonitor } from "@/components/agent-run-tracker";
import { finishedRunMessage } from "@/lib/agent-run-progress";
import type { SafeCompany } from "@/lib/safe-company";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { ProposalCard, type ProposalDecision } from "@/components/proposal-card";
import { ProductionPreview } from "@/components/production-preview";
import { JourneyProgress } from "@/components/journey-progress";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";
import { Icon, type IconName } from "@/components/icon";
import { Modal } from "@/components/modal";
import { AgentByline, DecisionCard, EmptyState, PageHeading, SectionTitle, Tag } from "@/components/mockup-ui";
import { agentName, productionNoun } from "@/lib/agent-voice";
import { CHAT_REQUEST_TIMING } from "@/lib/agents/plan-item-shared";
import { ObjectiveHero, type ObjectiveProgress } from "@/components/objective-hero";
import { PaulSummary } from "@/components/paul-summary";
import { Celebration } from "@/components/celebration";
import { describeProgress, summarizeProposals } from "@/lib/proposal-progress";
import { countByFilter, FILTER_LABELS, matchesFilter, type QueueFilter } from "@/lib/validation-queue";
import { needsAttention } from "@/lib/pending-decisions";
import { getProposalGuidance } from "@/lib/channel-capabilities";
import { proposalStatusView, STATUS_TAG_COLORS } from "@/lib/proposal-status";
import { proposalChannel } from "@/lib/proposal-channel";
import { openPaul } from "@/lib/paul-context";
import { groupPlanItems, planItemStatusView } from "@/lib/action-plan-view";
import { weekStart } from "@/lib/results-timeline";

type PlanItemWithProposals = ActionPlanItem & { proposals: AgentProposal[]; agentRuns: AgentRunView[] };
type View = "today" | "plan" | "validation" | "historique";

const WEEK_LABEL = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const EVENT_TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const COUNT_WORDS = ["aucune", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
const THEME_ICONS: Record<string, IconName> = { Visibilité: "megaphone", Conversion: "panel-top", Prospection: "contact-round" };

function eventLabel(proposal: AgentProposal) {
  if (proposal.status === "executee") return proposal.kind === "gmail_email" ? "Mail envoyé" : proposal.kind === "site_web_content" ? "Page publiée" : "Production publiée";
  if (proposal.status === "rejetee") return "Version rejetée";
  if (proposal.status === "validee" || proposal.status === "modifiee") return "Version approuvée";
  if (proposal.status === "envoi_incertain" || proposal.status === "publication_incertaine") return "Résultat incertain";
  return "Décision enregistrée";
}

function eventTime(proposal: AgentProposal) {
  return EVENT_TIME.format(new Date(proposal.decidedAt ?? proposal.createdAt));
}

export function DashboardClient({ company, initialPlanItems, initialAgentRuns, initialProposals, leadSources, initialLeadStats, initialDiagnosticCount, progress, lastPaulMessage, initialView, riskSettings, facebookPageName, todayLabel, focusProposalId }: {
  company: SafeCompany;
  initialPlanItems: PlanItemWithProposals[];
  initialAgentRuns: AgentRunView[];
  initialProposals: AgentProposal[];
  leadSources: Record<string, string | null>;
  initialLeadStats: { active: number; appointments: number };
  initialDiagnosticCount: number;
  progress: ObjectiveProgress;
  lastPaulMessage: { content: string; createdAt: string } | null;
  initialView: View;
  riskSettings: Record<string, string>;
  facebookPageName: string | null;
  todayLabel: string;
  focusProposalId?: string;
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
  const [planModalId, setPlanModalId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState<string | null>(initialView === "historique" && focusProposalId ? focusProposalId : null);
  const [decidedIds, setDecidedIds] = useState<string[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [celebration, setCelebration] = useState<{ agent: string; kind: string } | null>(null);
  const closeCelebration = useCallback(() => setCelebration(null), []);
  const [selectedId, setSelectedId] = useState<string | undefined>(focusProposalId);
  const [historyFilter, setHistoryFilter] = useState("Tout l’historique");
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

  async function handleGeneratePlan(retry = false) {
    setPlanLoading(true);
    setError(null);
    try {
      const { run } = await request("/api/co-ceo/plan", "POST", { requestId: crypto.randomUUID() });
      await refresh();
      setNotice(retry ? "Paul relance la préparation du plan en arrière-plan." : "Paul prépare le plan en arrière-plan.");
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
      setPlanModalId(null);
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
      setPlanModalId(null);
      setDiscarding(false);
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
        ? "Production rouverte : elle est de nouveau à relire dans la file des productions."
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
      const published = (await refresh()).find((proposal) => proposal.id === proposalId);
      // Seule une diffusion confirmée par le canal est célébrée, jamais un résultat incertain.
      if (published?.status === "executee") setCelebration({ agent: published.agent, kind: published.kind });
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


  const activeItems = planItems.filter((item) => item.status !== "ecarte" && item.status !== "termine");
  const planGroups = groupPlanItems(activeItems);
  // Charte : une seule action principale par écran, la première action à lancer dans l'ordre affiché.
  const firstProposedId = planGroups.flatMap(({ items }) => items).find((item) => item.status === "propose")?.id;
  const closedItems = planItems.filter((item) => item.status === "ecarte" || item.status === "termine");
  const actionable = proposals.filter((proposal) => needsAttention(proposal, facebookPageName));
  const validationItems = proposals.filter((proposal) => needsAttention(proposal, facebookPageName) || decidedIds.includes(proposal.id));
  const queueCounts = countByFilter(validationItems);
  const queueAgents = [...new Set(validationItems.map((proposal) => proposal.agent))];
  // File de relecture : ce qui attend une décision d'abord, puis ce qui vient d'être décidé.
  const queueItems = validationItems
    .filter((proposal) => matchesFilter(proposal.status, queueFilter) && (agentFilter === "all" || proposal.agent === agentFilter))
    .sort((a, b) => Number(needsAttention(b, facebookPageName)) - Number(needsAttention(a, facebookPageName)));
  const selectedProposal = queueItems.find((proposal) => proposal.id === selectedId) ?? queueItems[0];
  const selectedIndex = selectedProposal ? queueItems.indexOf(selectedProposal) : -1;

  /** Décision prise dans la file : on passe à la suivante quand plus rien n'est à faire sur cette production. */
  async function decideInQueue(proposalId: string, decision: ProposalDecision) {
    const decided = queueItems.find((proposal) => proposal.id === proposalId);
    const ok = await handleDecision(proposalId, decision);
    if (!ok || !decided) return ok;
    const after = { ...decided, status: decision.status === "rejetee" ? "rejetee" : decision.status === "modifiee" ? "modifiee" : decision.status === "validee" ? "validee" : decided.status };
    const nothingLeft = decision.status === "rejetee" ||
      ((decision.status === "validee" || decision.status === "modifiee") && !needsAttention(after, facebookPageName) && !getProposalGuidance(decided.kind, facebookPageName).canCopy);
    if (nothingLeft) {
      const position = queueItems.indexOf(decided);
      const next = [...queueItems.slice(position + 1), ...queueItems.slice(0, position)].find((proposal) => needsAttention(proposal, facebookPageName));
      if (next) setSelectedId(next.id);
    }
    return ok;
  }
  const history = proposals.filter((proposal) => !needsAttention(proposal, facebookPageName));
  const visibleHistory = history.filter((proposal) => historyFilter === "Tout l’historique" || proposalChannel(proposal.kind) === historyFilter);
  // Même lecture que la synthèse : une carte par semaine, du plus récent au plus ancien.
  const historyWeeks = [...visibleHistory]
    .sort((a, b) => new Date(b.decidedAt ?? b.createdAt).getTime() - new Date(a.decidedAt ?? a.createdAt).getTime())
    .reduce<{ start: number; items: AgentProposal[] }[]>((weeks, proposal) => {
      const start = weekStart(new Date(proposal.decidedAt ?? proposal.createdAt)).getTime();
      const week = weeks.find((entry) => entry.start === start);
      if (week) week.items.push(proposal); else weeks.push({ start, items: [proposal] });
      return weeks;
    }, []);
  const proposedItems = activeItems.filter((item) => item.status === "propose");
  const runningItem = activeItems.find((item) => item.status === "en_cours");
  const needsFirstDiagnostic = initialDiagnosticCount === 0 && planItems.length === 0;
  const emptyNextHref = needsFirstDiagnostic ? "/diagnostic" : "/dashboard?view=plan";
  const emptyNextLabel = needsFirstDiagnostic ? "Commencer par le diagnostic" : activeItems.length > 0 ? "Voir les actions du plan" : "Revenir au plan d'action";
  const locked = busyId !== null || planLoading;
  const planOf = (proposal: AgentProposal) => {
    const item = planItems.find((entry) => entry.id === proposal.planItemId);
    return item ? { title: item.title, rationale: item.rationale, priority: item.priority, theme: item.theme } : null;
  };
  const decisions = [
    ...proposedItems.map((item) => ({ key: `plan-${item.id}`, priority: item.priority ?? 99, item, proposal: undefined })),
    ...actionable.map((proposal) => ({ key: proposal.id, priority: planItems.find((item) => item.id === proposal.planItemId)?.priority ?? 99, item: undefined, proposal })),
  ].sort((left, right) => left.priority - right.priority);
  const planModalItem = planItems.find((item) => item.id === planModalId);
  const inspected = proposals.find((proposal) => proposal.id === inspectedId);
  const planCount = activeItems.length;
  const planTitle = planCount === 0 ? "Un plan à préparer." : `Un plan, ${COUNT_WORDS[planCount] ?? planCount} ${planCount > 1 ? "priorités" : "priorité"}.`;
  const notices = <>
    {error && <p role="alert" className="warning">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </>;
  const hasObjective = Boolean(company.objective?.trim());
  const weekHistory = history.filter((proposal) => new Date(proposal.decidedAt ?? proposal.createdAt) >= new Date(progress.weekStart));
  const goalLine = (extra: string) => <div className="goal-line"><Icon name="target" /><span>{company.objective ? <>Mon objectif : <strong>{company.objective}</strong></> : "Mon objectif : à définir"}{extra}</span><Link href="/entreprise?tab=objectifs">{company.objective ? "Ajuster l’objectif" : "Définir l’objectif"} →</Link></div>;

  return (
    <div>
      {celebration && <Celebration agent={celebration.agent} kind={celebration.kind} onClose={closeCelebration} />}
      {initialView === "today" && <>
        <ObjectiveHero
          objective={company.objective}
          progress={progress}
          dateLabel={todayLabel}
          actions={<button type="button" className="quiet" onClick={() => setRefreshOpen(true)}><Icon name="refresh-cw" /> Actualiser</button>}
        />
        {notices}
        {needsFirstDiagnostic && <JourneyProgress
          objectiveComplete={Boolean(company.objective?.trim())}
          diagnosticComplete={initialDiagnosticCount > 0}
          planComplete={planItems.length > 0}
          workStarted={proposals.length > 0 || planItems.some((item) => ["en_cours", "lance", "termine"].includes(item.status))}
          needsValidation={actionable.length > 0}
          resultsAvailable={proposals.some((proposal) => proposal.status === "executee")}
          planLoading={planLoading}
          onPreparePlan={() => void handleGeneratePlan()}
        />}
        <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} onRetry={() => void handleGeneratePlan(true)} retryDisabled={planLoading} />
        <SectionTitle title="Ce que l’équipe vous a préparé">{decisions.length > 3 && <Link href="/dashboard?view=validation">Toutes les décisions ({actionable.length}) →</Link>}</SectionTitle>
        {decisions.length > 0 ? (
          <div className="decision-cards" aria-label="Vos prochaines décisions" role="region">
            {decisions.slice(0, 3).map((decision, index) => {
              // Charte : une seule action principale ; sans objectif, c'est « En parler avec Paul ».
              const first = index === 0 && hasObjective;
              if (decision.item) {
                const persona = PERSONAS[decision.item.agent as AgentKey];
                const itemView = planItemStatusView(decision.item.status, decision.item.agentRuns[0]?.status, 0);
                return <DecisionCard
                  key={decision.key}
                  agent={decision.item.agent}
                  byline={`vous propose une action ${itemView.label.toLowerCase()}`}
                  title={decision.item.title}
                  action={<Link className={`btn ${first ? "primary" : ""}`} href={`/dashboard?view=plan#plan-item-${decision.item.id}`}>Examiner l’action <Icon name="arrow-right" /></Link>}
                  details={<p>Action {itemView.label.toLowerCase()}{decision.item.theme ? ` · ${decision.item.theme}` : ""} · {decision.item.timing}. La lancer confiera la préparation d’une production à {persona?.name ?? "l’agent"} ; rien ne sera publié ni envoyé.</p>}
                />;
              }
              const proposal = decision.proposal!;
              const status = proposalStatusView(proposal.status, proposal.kind, facebookPageName);
              const plan = planOf(proposal);
              const approved = proposal.status === "validee" || proposal.status === "modifiee";
              return <DecisionCard
                key={decision.key}
                agent={proposal.agent}
                byline={`vous propose ${productionNoun(proposal.kind)}`}
                title={proposal.title}
                action={<Link className={`btn ${first ? "primary" : ""}`} href={`/dashboard?view=validation&proposal=${encodeURIComponent(proposal.id)}#proposal-${encodeURIComponent(proposal.id)}`}>{approved ? "Préparer la diffusion" : "Examiner"} <Icon name="arrow-right" /></Link>}
                details={<p>{status.label} · {proposalChannel(proposal.kind)}{plan?.theme ? ` · ${plan.theme}` : ""}. {approved ? "Version approuvée : la diffusion attend votre confirmation." : proposal.status === "publication_incertaine" ? "Le canal n’a pas confirmé le résultat. Vérifier avant toute nouvelle tentative." : plan?.title ?? "Une production à examiner, reliée à votre objectif."}</p>}
              />;
            })}
          </div>
        ) : runningItem ? (
          <EmptyState agent={runningItem.agent as AgentKey} title={<>En cours : {runningItem.title}</>} says="Je m’en occupe. Le résultat arrivera ici, à relire."><p role="status" className="sr-only">L’agent prépare le résultat…</p></EmptyState>
        ) : needsFirstDiagnostic ? (
          <EmptyState agent="marketing" title="Repérer les premières opportunités" says="Je n’ai pas encore examiné votre présence en ligne. Lancez le diagnostic et je vous dirai par où commencer."><Link className="btn primary" href="/diagnostic">Commencer par le diagnostic</Link></EmptyState>
        ) : (
          <EmptyState agent="co_ceo" title="Toutes les décisions sont à jour" says="Tout est relu. Je vous préviens dès que l’équipe a du nouveau."><button type="button" onClick={() => void handleGeneratePlan()} disabled={locked}>{planLoading ? "Paul réfléchit…" : "Préparer le plan"}</button></EmptyState>
        )}
        <div className="two-column band">
          <section>
            <SectionTitle title="Ce qui a été fait cette semaine"><Link href="/dashboard?view=historique">Tout l’historique →</Link></SectionTitle>
            {weekHistory.length === 0 ? <p className="legend">{history.length === 0 ? "Vos décisions apparaîtront ici après la première relecture." : "Rien de nouveau depuis sept jours."}</p> : weekHistory.slice(0, 4).map((proposal) => <div key={proposal.id} className="activity-row">
              <span className="activity-icon"><Icon name="check" /></span>
              <div><strong>{eventLabel(proposal)} · {proposalChannel(proposal.kind)}</strong><small>{proposal.title} · {eventTime(proposal)}</small></div>
              <Link className="icon-button" href={`/dashboard?view=historique&proposal=${encodeURIComponent(proposal.id)}`} aria-label={`Voir : ${proposal.title}`} title="Voir la production"><Icon name="arrow-up-right" /></Link>
            </div>)}
          </section>
          <PaulSummary lastMessage={lastPaulMessage} />
        </div>
      </>}

      {initialView === "plan" && <>
        <PageHeading
          kicker="DU DIAGNOSTIC À L’ACTION"
          title={planTitle}
          description="Les actions que l’équipe propose pour atteindre votre objectif."
          actions={<button type="button" onClick={() => openPaul()}><Icon name="message-circle" /> Revoir avec Paul</button>}
        />
        {goalLine("")}
        {notices}
        <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} onRetry={() => void handleGeneratePlan(true)} retryDisabled={planLoading} />
        <section id="plan-actions" aria-label="Plan d'action">
          {activeItems.length === 0 && <EmptyState agent="co_ceo" label="Plan à préparer" title="Choisir les prochaines activités à confier" says={needsFirstDiagnostic ? "Je proposerai des priorités dès que Martine aura fait le diagnostic." : "Je peux proposer de nouvelles priorités ; vous choisirez celles à confier à l’équipe."}>
            {needsFirstDiagnostic ? <Link className="btn primary" href="/diagnostic">Commencer par le diagnostic</Link> : <p>Aucune action externe ne sera exécutée à cette étape.</p>}
          </EmptyState>}
          {planGroups.map(({ theme, items }) => <section key={theme} aria-label={`Thème ${theme}`}>
            <div className="theme-heading"><Icon name={THEME_ICONS[theme] ?? "list-checks"} />{theme}</div>
            {items.map((item) => {
              const count = proposals.filter((proposal) => proposal.planItemId === item.id && needsAttention(proposal, facebookPageName)).length;
              const progress = summarizeProposals(proposals.filter((proposal) => proposal.planItemId === item.id));
              const progressParts = describeProgress(progress);
              const proposed = item.status === "propose";
              const statusView = planItemStatusView(item.status, item.agentRuns[0]?.status, count);
              return (
                <article key={item.id} id={`plan-item-${item.id}`} className="plan-row">
                  <span className="priority">{item.priority ? String(item.priority).padStart(2, "0") : "–"}</span>
                  <div>
                    <AgentByline agent={item.agent}>s’en charge · {item.timing}</AgentByline>
                    <h3>{item.title}</h3>
                    {item.outcome && <p className="plan-outcome"><span>Résultat attendu :</span> {item.outcome}</p>}
                    {progress.total > 0 && progress.rejected === progress.total && <small>Rien n’a été retenu : l’action reste ouverte. Précisez votre demande à Paul pour obtenir une autre proposition.</small>}
                    <details className="plan-details">
                      <summary>Détails</summary>
                      <p>{statusView.label}{item.priority ? ` · priorité ${item.priority}` : ""}{progressParts.length > 0 ? ` · ${progressParts.join(" · ")}` : ""}</p>
                      <p><strong>{item.timing === CHAT_REQUEST_TIMING ? `Consigne donnée à ${agentName(item.agent)}` : "Pourquoi cette action"} :</strong> {item.rationale}</p>
                    </details>
                  </div>
                  {item.status === "en_cours" ? (
                    item.agentRuns[0] ? <button type="button" onClick={() => void checkRun(item.agentRuns[0].id)}>Vérifier l’état</button> : <span>{statusView.label}</span>
                  ) : proposed ? (
                    <button type="button" className={item.id === firstProposedId ? "primary" : undefined} onClick={() => { setDiscarding(false); setDiscardReason(""); setPlanModalId(item.id); }} disabled={locked}>{statusView.cta?.label}</button>
                  ) : (
                    statusView.cta?.href ? <Link className="btn" href={statusView.cta.href}>{statusView.cta.label}</Link> : <span>{statusView.label}</span>
                  )}
                </article>
              );
            })}
          </section>)}
          {closedItems.length > 0 && <p className="legend"><Link href="/dashboard?view=historique">{closedItems.length} action(s) traitée(s) ou écartée(s)</Link></p>}
          <div className="notice">Prochaine réévaluation : après un nouveau retour prospect ou à votre demande. Les actions déjà validées ne sont pas remplacées automatiquement. {!needsFirstDiagnostic && <button type="button" className="text-link" onClick={() => void handleGeneratePlan()} disabled={locked}>{planLoading ? "Préparation…" : "Compléter le plan"}</button>}</div>
        </section>
      </>}

      {initialView === "validation" && <>
        <PageHeading kicker="DÉCISIONS" title="Vos productions à relire." description={actionable.length > 0 ? `${actionable.length} production(s) attendent votre décision.` : "Aucune production n’attend votre décision."} />
        {notices}
        <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} onRetry={() => void handleGeneratePlan(true)} retryDisabled={planLoading} />
        <section aria-label="Productions à valider">
          {validationItems.length === 0 && <EmptyState agent="co_ceo" label="Validation à venir" title="Tout est à jour." says="Rien à relire pour l’instant. Les prochaines productions de l’équipe arriveront ici.">
            <Link className="btn primary" href={emptyNextHref}>{emptyNextLabel}</Link>
          </EmptyState>}
          {validationItems.length > 1 && (
            <div className="tabs" role="group" aria-label="Filtrer les productions">
              {(Object.keys(FILTER_LABELS) as QueueFilter[]).map((filter) => (
                <button key={filter} type="button" aria-pressed={queueFilter === filter} className={queueFilter === filter ? "selected" : undefined} onClick={() => setQueueFilter(filter)}>
                  {FILTER_LABELS[filter]} ({queueCounts[filter]})
                </button>
              ))}
            </div>
          )}
          {queueAgents.length > 1 && (
            <div className="agent-filters" role="group" aria-label="Filtrer par agent">
              <button type="button" aria-pressed={agentFilter === "all"} className={agentFilter === "all" ? "selected" : undefined} onClick={() => setAgentFilter("all")}>Toute l’équipe</button>
              {queueAgents.map((agent) => (
                <button key={agent} type="button" aria-pressed={agentFilter === agent} className={agentFilter === agent ? "selected" : undefined} style={{ "--agent": `var(--bd-agent-${agent})` } as CSSProperties} onClick={() => setAgentFilter(agent)}>
                  <AgentByline agent={agent} size={20} />
                </button>
              ))}
            </div>
          )}
          {validationItems.length > 0 && queueItems.length === 0 && (
            <div role="status" className="empty">
              <p>Aucune production ne correspond à ce filtre. {queueCounts.all} production(s) restent dans la file.</p>
              <button type="button" onClick={() => { setQueueFilter("all"); setAgentFilter("all"); }}>Afficher toutes les productions</button>
            </div>
          )}
          {queueItems.length > 0 && selectedProposal && (
            <div className="studio review-queue">
              <div className="queue-position">
                <span>Production {selectedIndex + 1} sur {queueItems.length}</span>
                {queueItems.length > 1 && <span>
                  <button type="button" className="quiet" disabled={selectedIndex <= 0} onClick={() => setSelectedId(queueItems[selectedIndex - 1]?.id)}>← Précédente</button>
                  <button type="button" className="quiet" disabled={selectedIndex >= queueItems.length - 1} onClick={() => setSelectedId(queueItems[selectedIndex + 1]?.id)}>Suivante →</button>
                </span>}
              </div>
              <aside className="production-list" aria-label="Productions">
                {queueItems.map((proposal) => {
                  const status = proposalStatusView(proposal.status, proposal.kind, facebookPageName);
                  return <button key={proposal.id} type="button" className={`production-choice ${proposal.id === selectedProposal.id ? "active" : ""}`} aria-pressed={proposal.id === selectedProposal.id} onClick={() => setSelectedId(proposal.id)}>
                    <Tag color={STATUS_TAG_COLORS[status.tone]}>{status.label}</Tag>
                    <strong>{proposal.title}</strong>
                    <small><AgentByline agent={proposal.agent} size={18}>vous propose {productionNoun(proposal.kind)}</AgentByline></small>
                  </button>;
                })}
              </aside>
              <section>
                <ProposalCard key={selectedProposal.id} proposal={selectedProposal} onDecision={decideInQueue} onExecute={handleExecute} onSetLeadSource={handleSetLeadSource} busy={locked} riskSettings={riskSettings} facebookPageName={facebookPageName} siteDestination={company.siteSlug ? `/site/${company.siteSlug}` : null} companyName={company.name} companyPhone={company.phone} companyCertifications={company.certifications} leadSource={currentLeadSources[selectedProposal.id]} plan={planOf(selectedProposal)} />
              </section>
            </div>
          )}
        </section>
      </>}

      {initialView === "historique" && <>
        <PageHeading kicker="RÉSULTATS" title="Historique de vos décisions." description="Chaque version, chaque décision et chaque diffusion, semaine par semaine." />
        {notices}
        <AgentRunTracker runs={agentRuns} onCheck={(runId) => void checkRun(runId)} onRetry={() => void handleGeneratePlan(true)} retryDisabled={planLoading} />
        <section aria-label="Historique">
          {history.length > 0 && <div className="tabs" role="group" aria-label="Filtrer l’historique par canal">
            {["Tout l’historique", "Site", "Facebook", "Gmail", "Google"].map((channel) => <button key={channel} type="button" aria-pressed={historyFilter === channel} className={historyFilter === channel ? "selected" : undefined} onClick={() => setHistoryFilter(channel)}>{channel}</button>)}
          </div>}
          {history.length === 0 && <EmptyState agent="co_ceo" role="region" label="Historique à venir" title="Aucune production traitée" says="Vos décisions et ce qui a été publié resteront ici, pour les retrouver.">
            <Link className="btn primary" href={actionable.length > 0 ? "/dashboard?view=validation" : emptyNextHref}>{actionable.length > 0 ? "Examiner les productions" : emptyNextLabel}</Link>
          </EmptyState>}
          {history.length > 0 && visibleHistory.length === 0 && <div role="status" className="empty">Aucun événement sur ce canal.</div>}
          {visibleHistory.length > 0 && <div className="results-weeks">
            {historyWeeks.map((week) => (
              <section key={week.start} className="results-week" aria-label={`Semaine du ${WEEK_LABEL.format(new Date(week.start))}`}>
                <header>
                  <h3>Semaine du {WEEK_LABEL.format(new Date(week.start))}</h3>
                  <small>{week.items.length} événement{week.items.length > 1 ? "s" : ""}</small>
                </header>
                <ul>
                  {week.items.map((proposal) => (
                    <li key={proposal.id} id={`proposal-${proposal.id}`} className={`results-item history-item ${proposal.status === "executee" ? "diffusion" : ""}`}>
                      <span className="results-icon" aria-hidden="true"><Icon name={proposal.status === "executee" ? "check" : proposal.status === "rejetee" ? "x" : "history"} /></span>
                      <div>
                        <strong>{eventLabel(proposal)} · {proposal.title}</strong>
                        <small><Tag color="blue">{proposalChannel(proposal.kind)}</Tag> <AgentByline agent={proposal.agent} size={16}>· version {proposal.version}</AgentByline> · {eventTime(proposal)}</small>
                      </div>
                      <button type="button" className="icon-button" onClick={() => setInspectedId(proposal.id)} aria-label={`Voir : ${proposal.title}`} title="Voir le détail"><Icon name="eye" /></button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>}
          {closedItems.length > 0 && <>
            <SectionTitle title="Actions terminées et écartées" />
            <section className="results-week" aria-label="Actions terminées et écartées">
              <ul>
                {closedItems.map((item) => (
                  <li key={item.id} className="results-item">
                    <span className="results-icon" aria-hidden="true"><Icon name={item.status === "ecarte" ? "x" : "circle-check"} /></span>
                    <div>
                      <strong>{item.title}</strong>
                      <small><Tag color={item.status === "ecarte" ? "gray" : "green"}>{planItemStatusView(item.status, null, 0).label}</Tag> <AgentByline agent={item.agent} size={16} />{item.feedback ? <> · {item.feedback}</> : null}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>}
        </section>
      </>}

      {profileDialog}

      <Modal
        open={refreshOpen}
        onClose={() => setRefreshOpen(false)}
        kicker="BOUCLE D’AMÉLIORATION"
        title="Actualiser le diagnostic et le plan ?"
        actions={needsFirstDiagnostic
          ? <Link className="btn primary" href="/diagnostic">Commencer par le diagnostic</Link>
          : <button type="button" className="primary" disabled={locked} onClick={() => { setRefreshOpen(false); void handleGeneratePlan(); }}>Actualiser sans remplacer mes décisions</button>}
      >
        <p>{actionable.length} décision(s) en attente et {initialLeadStats.active} prospect(s) actif(s) disponibles.</p>
        <dl className="modal-details">
          <dt>À intégrer</dt><dd>Décisions prises, productions réalisées et suivi déclaré des prospects</dd>
          <dt>À préserver</dt><dd>Actions validées, versions approuvées et publications</dd>
          <dt>À revoir</dt><dd>Priorités des prochaines actions, sans génération ni diffusion automatique</dd>
        </dl>
      </Modal>

      <Modal
        open={Boolean(planModalItem)}
        onClose={() => setPlanModalId(null)}
        kicker={planModalItem ? `${planModalItem.theme ?? "Action"} · Priorité ${planModalItem.priority ?? "–"}` : ""}
        title="Lancer l’action, puis préparer"
        actions={planModalItem && (discarding
          ? <button type="button" className="danger" disabled={locked} onClick={() => void handleDiscard(planModalItem.id)}>Confirmer</button>
          : <>
            <button type="button" className="quiet" disabled={locked} onClick={() => setDiscarding(true)}>Écarter</button>
            <button type="button" className="primary" disabled={locked || checking} onClick={() => void requestProfile(planModalItem.agent as AgentKey, () => handleLaunch(planModalItem, planModalItem.agentRuns[0]?.status === "failed" ? planModalItem.agentRuns[0].id : undefined))}>{busyId === planModalItem.id ? "Mise en file…" : planModalItem.agentRuns[0]?.status === "failed" ? "Relancer l’action" : "Lancer et générer le brouillon"}</button>
          </>)}
      >
        {planModalItem && <>
          <p>{planModalItem.rationale}</p>
          <dl className="modal-details">
            <dt>Production</dt><dd>{planModalItem.title}</dd>
            <dt>Agent</dt><dd>{PERSONAS[planModalItem.agent as AgentKey]?.name ?? planModalItem.agent}</dd>
            <dt>Échéance</dt><dd>{planModalItem.timing}</dd>
          </dl>
          <p>Ce lancement démarre la génération d’un brouillon. Rien ne sera publié ou envoyé.</p>
          {discarding && <label className="field">Raison de l’abandon
            <input placeholder="Pourquoi écarter cette action ?" value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} maxLength={500} />
          </label>}
        </>}
      </Modal>

      <Modal
        open={Boolean(inspected)}
        onClose={() => setInspectedId(null)}
        kicker={inspected ? `${eventLabel(inspected)} · ${eventTime(inspected)}` : ""}
        title={inspected ? `Version ${inspected.version} · ${proposalChannel(inspected.kind)}` : ""}
        cancelLabel="Fermer"
        actions={inspected?.status === "rejetee" ? <button type="button" className="primary" disabled={locked} onClick={async () => { if (await handleDecision(inspected.id, { status: "a_relire", expectedVersion: inspected.version })) setInspectedId(null); }}>Rouvrir pour relecture</button> : undefined}
      >
        {inspected && <>
          <ProductionPreview kind={inspected.kind} title={inspected.title} content={inspected.content} version={inspected.version} companyName={company.name} siteDestination={company.siteSlug ? `/site/${company.siteSlug}` : null} />
          <p>{inspected.status === "executee" ? "Exécution enregistrée" : "Décision enregistrée"}. Version {inspected.version}, {PERSONAS[inspected.agent as AgentKey]?.name ?? inspected.agent}.</p>
          {inspected.status === "rejetee" && inspected.rejectionReason && <div className="warning"><strong>Raison du rejet :</strong> <span className="whitespace-pre-wrap break-words">{inspected.rejectionReason}</span></div>}
        </>}
      </Modal>
    </div>
  );
}
