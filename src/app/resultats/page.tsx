import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading, Tag } from "@/components/mockup-ui";
import { PaulButton } from "@/components/mission-actions";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { loadResults } from "@/lib/missions/results-view";
import { STAGE_LABELS } from "@/lib/missions/stage";
import { MISSION_MESSAGES } from "@/lib/missions/messages";
import { listJournal } from "@/lib/journal";
import { DecisionButton, ReportForm } from "./results-client";
import { JournalSection } from "./journal-section";

export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;

/** Résultats (§13.4) : ce que les missions ont produit, déclaré par le dirigeant ; l'activité n'est jamais présentée comme un résultat. */
export default async function ResultatsPage({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const { mission: wanted } = await searchParams;
  const [{ launched, publications, indicators, nextPoint }, journal] = await Promise.all([loadResults(company.id), listJournal(company.id)]);
  const reportable = launched.filter((mission) => mission.diffusions > 0);
  const selected = reportable.find((mission) => mission.id === wanted) ?? reportable[0] ?? null;
  const reported = launched.filter((mission) => mission.report);

  return (
    <AppShell {...shell}>
      <PageHeading
        kicker="Résultats"
        title="L'activité n'est pas le résultat."
        description="Ce que vos missions ont réellement produit, déclaré par vous. Un envoi n'est ni une lecture, ni une vente."
        actions={selected ? <a className="btn primary" href="#bilan">Renseigner mon bilan</a> : undefined}
      />
      <dl className="metrics metrics-3">
        <div><dt>Diffusions</dt><dd>{indicators.diffusions}{indicators.scheduled ? <small> · {indicators.scheduled} programmée{indicators.scheduled > 1 ? "s" : ""}</small> : null}</dd></div>
        <div><dt>Demandes qualifiées</dt><dd>{indicators.qualifiedLeads ?? "—"}</dd></div>
        <div><dt>CA signé</dt><dd>{indicators.signedRevenue === null ? "—" : euros(indicators.signedRevenue)}</dd></div>
      </dl>

      <section className="section-space" aria-labelledby="by-mission-title">
        <h2 id="by-mission-title">Résultats par mission</h2>
        {launched.length === 0 ? (
          <div className="empty">
            <Icon name="chart-no-axes-column" />
            <h3>Aucune mission lancée.</h3>
            <p>Le bilan d&apos;une mission se renseigne après sa première diffusion.</p>
            <Link className="btn" href="/missions">Voir les missions</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Mission</th><th>Diffusions</th><th>Bilan déclaré</th><th>Résultat recherché</th><th>Suite</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {launched.map((mission) => (
                  <tr key={mission.id}>
                    <td><strong>{mission.title}</strong>{mission.templateLabel}</td>
                    <td>{mission.diffusions}</td>
                    <td>{mission.report
                      ? <>{mission.report.qualifiedLeads} demande(s) · {mission.report.meetings} rendez-vous{mission.report.signedRevenue === null ? "" : ` · ${euros(mission.report.signedRevenue)}`}{!mission.report.upToDate && <> <Tag color="orange">à mettre à jour</Tag></>}</>
                      : "—"}</td>
                    <td>{mission.outcome}</td>
                    <td>{mission.status === "stopped" ? "Arrêtée" : mission.decision?.upToDate && mission.decision.choice === "continue" ? "Poursuivie, mêmes limites" : STAGE_LABELS[mission.stage]}</td>
                    <td>
                      <div className="heading-actions">
                        {mission.diffusions > 0 && <Link className="btn small" href={`/resultats?mission=${mission.id}#bilan`}>Renseigner le bilan</Link>}
                        {mission.status === "active" && mission.diffusions > 0 && (
                          <DecisionButton mission={{ id: mission.id, title: mission.title, outcome: mission.outcome, version: mission.actions.version, stopRuleDays: mission.stopRuleDays, stopRuleDue: mission.stopRuleDue, contentId: mission.contentId, report: mission.report }} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="bilan" className="section-space" aria-labelledby="report-title">
        <h2 id="report-title">Renseigner mon bilan</h2>
        {selected
          ? <ReportForm key={selected.id} missions={reportable.map((mission) => ({ id: mission.id, title: mission.title, report: mission.report }))} selectedId={selected.id} />
          : <p className="small muted">{MISSION_MESSAGES["M-37"]}</p>}
      </section>

      <section className="section-space" aria-labelledby="diffusion-title">
        <h2 id="diffusion-title">La diffusion et son suivi</h2>
        {publications.length === 0 ? <p className="small muted">Rien n&apos;a encore été diffusé.</p> : publications.map((publication) => (
          <div key={publication.id} className="decision">
            <Icon name={publication.status === "scheduled" ? "history" : "megaphone"} />
            <span>
              <strong>{publication.missionTitle}</strong> · V{publication.versionNumber} · {publication.channelLabel}
              {publication.at ? ` · ${publication.status === "scheduled" ? "prévue le " : ""}${DAY.format(new Date(publication.at))}` : ""}
              {publication.recipientCount ? ` · ${publication.recipientCount} destinataire${publication.recipientCount > 1 ? "s" : ""}` : ""}
              {" · "}{publication.status === "scheduled" ? "programmée" : publication.mode === "declared" ? "déclarée par vous" : "confirmée"}
            </span>
            <Link href={`/atelier/${publication.contentId}`}>{publication.status === "scheduled" ? "Gérer" : "Voir"}</Link>
          </div>
        ))}
      </section>

      <section className="section-space" aria-labelledby="paul-point-title">
        <h2 id="paul-point-title">Le point de Paul</h2>
        <p>{reported.length
          ? `${reported.length} bilan${reported.length > 1 ? "s" : ""} déclaré${reported.length > 1 ? "s" : ""} : ${indicators.qualifiedLeads} demande(s) qualifiée(s) au total. Attribution déclarative, non vérifiée.`
          : "Aucun bilan déclaré pour le moment : Paul ne tire aucune conclusion sans vos chiffres."}</p>
        {reported.filter((mission) => mission.report?.note).map((mission) => (
          <p key={mission.id} className="small"><strong>{mission.title}</strong> : {mission.report?.note}</p>
        ))}
        {nextPoint && (
          <p className="notice small">
            {nextPoint.reached
              ? `Règle d'arrêt atteinte le ${DAY.format(new Date(nextPoint.due))} · ${nextPoint.mission.title} : décidez de la suite.`
              : `Prochain point le ${DAY.format(new Date(nextPoint.due))} · ${nextPoint.mission.title} (règle d'arrêt de ${nextPoint.mission.stopRuleDays} jours).`}
          </p>
        )}
        <div className="heading-actions">
          <PaulButton label="Préparer le bilan avec Paul" />
          <Link className="btn" href="/missions">Revoir les missions</Link>
        </div>
      </section>

      <JournalSection rows={journal} />
    </AppShell>
  );
}
