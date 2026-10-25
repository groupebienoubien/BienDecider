"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuditFinding } from "@prisma/client";
import { CATEGORY_ICONS, FindingCard } from "@/components/finding-card";
import { groupFindings } from "@/lib/diagnostic-groups";
import { Icon } from "@/components/icon";
import { EmptyState, PageHeading, SectionTitle } from "@/components/mockup-ui";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";
import { GooglePlaceDialog } from "@/components/google-place";
import { SourceCoverage } from "@/components/source-coverage";
import type { CoverageItem } from "@/lib/source-coverage";
import { waitForAgentRun } from "@/lib/agent-runs-client";
import type { AuditFindingsView } from "@/lib/audit-split";

const ANALYSIS_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const PREVIOUS_DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
const ANALYSIS_TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function DiagnosticClient({ initialAudits, feedback, leadCount, initialPlanUpToDate, coverage, hasGoogleCandidate }: { initialAudits: AuditFindingsView<AuditFinding>; feedback: string[]; leadCount: number; initialPlanUpToDate: boolean; coverage: CoverageItem[]; hasGoogleCandidate: boolean }) {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const router = useRouter();
  // Story 5.2 : plan à jour = des actions créées après la fin du dernier audit.
  const [planUpToDate, setPlanUpToDate] = useState(initialPlanUpToDate);
  const [preparing, setPreparing] = useState(false);
  // Le suivi de la préparation s'arrête quand le dirigeant quitte la page.
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  // Story 5.1 : le dernier audit terminé, et l'audit d'avant dans un lien repliable.
  const [audits, setAudits] = useState(initialAudits);
  const findings = audits.latest;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(false);
    try {
      const response = await fetch("/api/agents/marketing/run", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Le diagnostic a échoué. Réessayez.");
      // 202 : l'audit tourne encore ; ses constats ne comptent qu'une fois terminé (story 5.1).
      if (response.status === 202 && data?.run?.id) {
        const finished = await waitForAgentRun(data.run.id, () => undefined);
        if (finished?.status === "failed") throw new Error(finished.errorMessage ?? "Le diagnostic a échoué. Réessayez.");
        if (!finished) throw new Error("Le diagnostic prend plus de temps que prévu : il apparaîtra ici une fois terminé. Rechargez la page plus tard.");
      }
      const refreshed = await fetch("/api/audit-findings");
      if (!refreshed.ok) throw new Error("Impossible d'actualiser le diagnostic. Rechargez la page.");
      setAudits(await refreshed.json());
      // La couverture des sources et la fiche Google à confirmer viennent du serveur.
      router.refresh();
      // Nouvel audit : le plan reste à préparer à partir de ses constats.
      setPlanUpToDate(false);
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le diagnostic a échoué.");
    } finally {
      setRunning(false);
    }
  }

  /** Story 5.2 : Paul propose 3 à 5 actions tirées du dernier audit ; rien n'est lancé. */
  async function preparePlan() {
    setPreparing(true);
    setError(null);
    preparation.current?.abort();
    const controller = new AbortController();
    preparation.current = controller;
    const { signal } = controller;
    try {
      const response = await fetch("/api/co-ceo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Paul n'a pas pu préparer le plan. Réessayez.");
      if (!data?.run?.id) throw new Error("Paul n'a pas pu préparer le plan. Réessayez.");
      if (data.run.status !== "succeeded") {
        const finished = await waitForAgentRun(data.run.id, () => undefined, signal);
        if (signal.aborted) return;
        if (finished?.status === "failed") throw new Error(finished.errorMessage ?? "Paul n'a pas pu préparer le plan. Réessayez.");
        if (!finished) throw new Error("Paul prend plus de temps que prévu : le plan apparaîtra dans le plan d'action une fois prêt.");
      }
      setPlanUpToDate(true);
      router.push("/dashboard?view=plan");
    } catch (error) {
      if (signal.aborted) return;
      setError(error instanceof Error ? error.message : "Paul n'a pas pu préparer le plan. Réessayez.");
      setPreparing(false);
    }
  }

  const latest = audits.latestAt ? new Date(audits.latestAt) : null;
  const groups = groupFindings(findings);
  // Un seul sujet : ouvert d'office. Un lien vers un constat (#finding-…) ouvre son sujet.
  const [openGroups, setOpenGroups] = useState<string[]>(() => groups.length === 1 ? [groups[0].category] : []);
  useEffect(() => {
    const id = window.location.hash.replace(/^#finding-/, "");
    const row = id ? document.getElementById(`finding-${id}`) : null;
    const group = row?.closest("details");
    if (!row || !group) return;
    group.open = true; // l'événement toggle met à jour openGroups
    requestAnimationFrame(() => row.scrollIntoView({ block: "center" }));
  }, []);

  return (
    <div>
      <PageHeading
        kicker={`DIAGNOSTIC · ${findings.length} CONSTAT${findings.length > 1 ? "S" : ""}`}
        title="Ce que Martine a constaté."
        description={latest ? <>Dernière analyse le {ANALYSIS_DATE.format(latest)} à {ANALYSIS_TIME.format(latest)} · {leadCount} prospect(s) suivi(s)</> : "Martine examine votre présence en ligne et vos concurrents."}
        actions={<>
          {/* Une action principale : lancer le diagnostic, puis préparer le plan qui en découle (story 5.2). */}
          <button type="button" className={findings.length ? undefined : "primary"} onClick={() => void requestProfile("marketing", run)} disabled={running || checking || preparing}><Icon name="refresh-cw" /> {running ? "Analyse en cours…" : findings.length ? "Actualiser le diagnostic" : "Lancer le diagnostic"}</button>
          {findings.length > 0 && (planUpToDate && !preparing
            ? <Link className="btn" href="/dashboard?view=plan">Voir le plan d’action</Link>
            : <button type="button" className="primary" onClick={() => void preparePlan()} disabled={preparing || running || checking}>{preparing ? "Paul prépare le plan…" : "Préparer le plan à partir du diagnostic"}</button>)}
        </>}
      />
      {profileDialog}
      <GooglePlaceDialog hasCandidate={hasGoogleCandidate} />
      {error && <p role="alert" className="warning">{error}</p>}
      {done && <p role="status" className="notice">Diagnostic actualisé. <Link href="/dashboard?view=validation">Voir les productions à valider</Link></p>}
      {findings.length === 0 && (
        <EmptyState agent="marketing" label="Diagnostic à préparer" title="Repérer les premières opportunités" says="J’examine votre présence en ligne et vos concurrents, puis je vous dis par où commencer. Lancez le diagnostic quand vous voulez." />
      )}
      {groups.length > 0 && <div className="diagnostic-groups">
        {groups.map((group) => (
          <details key={group.category} className="diagnostic-group" open={openGroups.includes(group.category)} onToggle={(event) => {
            const isOpen = (event.currentTarget as HTMLDetailsElement).open;
            setOpenGroups((current) => isOpen ? [...new Set([...current, group.category])] : current.filter((category) => category !== group.category));
          }}>
            <summary>
              <span className="activity-icon"><Icon name={CATEGORY_ICONS[group.category] ?? "eye"} /></span>
              <span><strong>{group.label}</strong><small>{group.summary}</small></span>
              <span className="group-count" aria-label={`${group.findings.length} constat(s)`}>{group.findings.length}</span>
            </summary>
            {group.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
          </details>
        ))}
      </div>}
      {audits.previous.length > 0 && audits.previousAt && (
        <details className="diagnostic-previous">
          <summary>Diagnostic précédent du {PREVIOUS_DATE.format(new Date(audits.previousAt))} à {ANALYSIS_TIME.format(new Date(audits.previousAt))} · {audits.previous.length} constat{audits.previous.length > 1 ? "s" : ""}</summary>
          <p className="legend">Ces constats datent de l’analyse d’avant ; certains points ont pu être réglés depuis.</p>
          {audits.previous.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
        </details>
      )}
      <SourceCoverage items={coverage} />
      <SectionTitle title="Ce que votre équipe retient" />
      <div className="notice">{feedback.length ? `${feedback.length} retour(s) explicite(s) pris en compte dans la prochaine préparation.` : "Aucune préférence nouvelle enregistrée. Vos corrections ne changent pas votre objectif sans votre accord."}</div>
      {feedback.length > 0 && <ul className="feedback-list">{feedback.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </div>
  );
}
