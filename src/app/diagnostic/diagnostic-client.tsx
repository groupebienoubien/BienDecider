"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditFinding } from "@prisma/client";
import { FindingCard } from "@/components/finding-card";
import { Icon } from "@/components/icon";
import { PageHeading, SectionTitle } from "@/components/mockup-ui";
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

  return (
    <div>
      <PageHeading
        kicker={`DIAGNOSTIC · ${findings.length} CONSTAT${findings.length > 1 ? "S" : ""}`}
        title="Une lecture claire de votre activité."
        description={<>{latest ? <>Dernière analyse : {ANALYSIS_DATE.format(latest)} à {ANALYSIS_TIME.format(latest)} · </> : null}À partir de vos informations et des signaux disponibles.</>}
        actions={<button type="button" className="primary" onClick={() => void requestProfile("marketing", run)} disabled={running || checking}><Icon name="refresh-cw" /> {running ? "Analyse en cours…" : findings.length ? "Actualiser le diagnostic" : "Lancer le diagnostic"}</button>}
      />
      <div className="sync-line">
        <span>{findings.length > 0 ? "Diagnostic à jour avec les signaux retenus" : "Aucun diagnostic disponible pour le moment"} · {leadCount} prospect(s) suivi(s)</span>
        {findings.length > 0 && <Link href="/dashboard?view=plan">Voir le plan associé →</Link>}
      </div>
      {profileDialog}
      {error && <p role="alert" className="warning">{error}</p>}
      {done && <p role="status" className="notice">Diagnostic actualisé. <Link href="/dashboard?view=validation">Voir les productions à valider</Link></p>}
      {findings.length === 0 && (
        <div className="empty" aria-label="Diagnostic à préparer">
          <Icon name="scan-line" />
          <h3>Repérer les premières opportunités</h3>
          <p>Aucun diagnostic disponible pour le moment. Martine peut examiner votre présence en ligne et votre positionnement pour proposer des priorités liées à votre objectif.</p>
          <p>Lancez le diagnostic pour obtenir les premiers constats. Vous déciderez ensuite des actions à confier.</p>
        </div>
      )}
      {findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
      <SectionTitle title="Ce que votre équipe retient" />
      <div className="notice">{feedback.length ? `${feedback.length} retour(s) explicite(s) pris en compte dans la prochaine préparation.` : "Aucune préférence nouvelle enregistrée. Vos corrections ne changent pas votre objectif sans votre accord."}</div>
      {feedback.length > 0 && <ul className="feedback-list">{feedback.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </div>
  );
}
