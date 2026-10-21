"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuditFinding } from "@prisma/client";
import { CATEGORY_ICONS, FindingCard } from "@/components/finding-card";
import { groupFindings } from "@/lib/diagnostic-groups";
import { Icon } from "@/components/icon";
import { EmptyState, PageHeading, SectionTitle } from "@/components/mockup-ui";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";

const ANALYSIS_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const ANALYSIS_TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function DiagnosticClient({ initialFindings, feedback, leadCount }: { initialFindings: AuditFinding[]; feedback: string[]; leadCount: number }) {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const [findings, setFindings] = useState(initialFindings);
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
      const refreshed = await fetch("/api/audit-findings");
      if (!refreshed.ok) throw new Error("Impossible d'actualiser le diagnostic. Rechargez la page.");
      setFindings(await refreshed.json());
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le diagnostic a échoué.");
    } finally {
      setRunning(false);
    }
  }

  const latest = findings[0] ? new Date(findings[0].createdAt) : null;
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
        actions={<button type="button" className="primary" onClick={() => void requestProfile("marketing", run)} disabled={running || checking}><Icon name="refresh-cw" /> {running ? "Analyse en cours…" : findings.length ? "Actualiser le diagnostic" : "Lancer le diagnostic"}</button>}
      />
      {profileDialog}
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
      {findings.length > 0 && <p className="legend"><Link href="/dashboard?view=plan">Voir le plan d’action qui en découle →</Link></p>}
      <SectionTitle title="Ce que votre équipe retient" />
      <div className="notice">{feedback.length ? `${feedback.length} retour(s) explicite(s) pris en compte dans la prochaine préparation.` : "Aucune préférence nouvelle enregistrée. Vos corrections ne changent pas votre objectif sans votre accord."}</div>
      {feedback.length > 0 && <ul className="feedback-list">{feedback.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </div>
  );
}
