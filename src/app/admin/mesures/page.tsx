import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/mockup-ui";
import { getShellPropsForEmail } from "@/lib/shell-data";
import { readActivation } from "@/lib/activation";
import { ACTIVATION_STEPS, daysLabel, percent, readPeriod, type CohortMeasures, type Period } from "@/lib/activation-rules";
import { AGGREGATE_THRESHOLD, MASKED_LABEL, VISIT_TRACE_RETENTION_MONTHS, type GroupCell } from "@/lib/onboarding/visit-trace-rules";
import { channelName, rubricName, stepName, templateLabel } from "@/lib/activation-labels";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const formatDate = (date: Date | null) => (date ? DATE.format(date) : "—");
const formatMonth = (month: string) => MONTH.format(new Date(`${month}-01T00:00:00.000Z`));
const formatUsd = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const count = (value: number | null) => (value === null ? MASKED_LABEL : String(value));

function periodLabel(period: Period): string {
  if (period.from && period.to) return `du ${DATE.format(new Date(`${period.from}T12:00:00Z`))} au ${DATE.format(new Date(`${period.to}T12:00:00Z`))}`;
  if (period.from) return `depuis le ${DATE.format(new Date(`${period.from}T12:00:00Z`))}`;
  if (period.to) return `jusqu'au ${DATE.format(new Date(`${period.to}T12:00:00Z`))}`;
  return "depuis le début";
}

function exportHref(view: "visites" | "activation", period: Period): string {
  const query = new URLSearchParams({ vue: view, ...(period.from ? { du: period.from } : {}), ...(period.to ? { au: period.to } : {}) });
  return `/api/admin/mesures/export?${query.toString()}`;
}

function GroupTable({ caption, header, rows }: { caption: string; header: string; rows: GroupCell[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">{header}</th><th scope="col">Visites</th><th scope="col">Comptes créés</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{count(row.visits)}</td><td>{count(row.accounts)}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={3}>Aucune visite sur la période.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}{detail && <small>{detail}</small>}</div>
    </div>
  );
}

function MissionRates({ measures }: { measures: CohortMeasures }) {
  return (
    <>
      <td>{measures.accounts}</td>
      <td>{measures.launchedWithin7Days} <small>({percent(measures.launchedWithin7Days, measures.accounts)})</small></td>
      <td>{measures.launched}</td>
      <td>{measures.withDiffusion} <small>({percent(measures.withDiffusion, measures.launched)})</small></td>
      <td>{measures.withReport} <small>({percent(measures.withReport, measures.launched)})</small></td>
      <td>{measures.withDecision} <small>({percent(measures.withDecision, measures.launched)})</small></td>
    </>
  );
}

/**
 * Mesures d'activation (#296) et traces anonymes des visites (#311) : réservé aux administrateurs.
 * Tout est calculé côté serveur depuis les données ; aucun contenu, nom de client final ni donnée de tiers n'est affiché.
 */
export default async function MeasuresPage({ searchParams }: { searchParams: Promise<{ du?: string | string[]; au?: string | string[] }> }) {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  if (!isAdminEmail(email)) {
    return (
      <AppShell {...await getShellPropsForEmail(email)}>
        <div className="warning"><strong>Accès réservé</strong><br />Cette page est réservée aux administrateurs.</div>
      </AppShell>
    );
  }

  const period = readPeriod(await searchParams);
  const report = await readActivation(period);
  const { visits, funnel, measures } = report;
  const notMeasured = "—";

  return (
    <AppShell {...await getShellPropsForEmail(email)}>
      <div>
        <PageHeading
          kicker="ADMINISTRATION · ACCÈS RESTREINT"
          title="Mesures d'activation"
          description={`De la première visite au premier bilan, inscriptions ${periodLabel(period)}. Calculé depuis les données : aucun contenu ni donnée de tiers.`}
          actions={<Link href="/admin" className="btn">Retour à l&apos;administration</Link>}
        />

        <section aria-labelledby="period-title" className="setting-section">
          <h2 id="period-title">Période</h2>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="field" htmlFor="du">Du<input id="du" name="du" type="date" defaultValue={period.from ?? ""} /></label>
            <label className="field" htmlFor="au">Au<input id="au" name="au" type="date" defaultValue={period.to ?? ""} /></label>
            <button className="btn primary" type="submit">Afficher</button>
            <Link className="btn" href="/admin/mesures">Toute la période</Link>
          </form>
          <p className="flex flex-wrap gap-3">
            <a className="btn" href={exportHref("visites", period)} download>Exporter les visites (CSV)</a>
            <a className="btn" href={exportHref("activation", period)} download>Exporter l&apos;activation (CSV)</a>
          </p>
        </section>

        {/* Visites du parcours d'entrée (#311) */}
        <section aria-labelledby="visits-title">
          <div className="section-title"><h2 id="visits-title">Visites du parcours d&apos;entrée</h2></div>
          <p className="legend">
            Traces anonymes, une par visite, écrites à la création du compte ou à l&apos;effacement du brouillon ; conservées {VISIT_TRACE_RETENTION_MONTHS} mois.
            Une activité ou un département de moins de {AGGREGATE_THRESHOLD} visites est regroupé dans « Autres ».
          </p>
          <section className="metrics metrics-4" aria-label="Visites">
            <Metric label="Visites" value={String(visits.total)} />
            <Metric label="Arrivées à « Un cap. Vos premières missions. »" value={String(visits.reachedPlan)} detail={percent(visits.reachedPlan, visits.total)} />
            <Metric label="Comptes créés après l'étape 4" value={String(visits.reachedPlanAccounts)} detail={percent(visits.reachedPlanAccounts, visits.reachedPlan)} />
            <Metric label="Coût moyen d'une analyse sans compte" value={visits.averageCostWithoutAccount === null ? notMeasured : formatUsd(visits.averageCostWithoutAccount)} />
          </section>

          <h3 className="section-title">Par étape</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Visites par étape atteinte et par étape d&apos;abandon</caption>
              <thead><tr><th scope="col">Étape</th><th scope="col">Atteinte</th><th scope="col">Abandon sans compte</th></tr></thead>
              <tbody>{visits.byStep.map((row) => <tr key={row.step}><td>{stepName(row.step)}</td><td>{row.reached}</td><td>{row.abandoned}</td></tr>)}</tbody>
            </table>
          </div>

          <h3 className="section-title">Par activité</h3>
          <GroupTable caption="Visites par activité" header="Activité" rows={visits.byTrade} />
          <h3 className="section-title">Par département</h3>
          <GroupTable caption="Visites par département" header="Département" rows={visits.byDepartment} />

          <h3 className="section-title">Par mois</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Visites par mois de début</caption>
              <thead><tr><th scope="col">Mois</th><th scope="col">Visites</th><th scope="col">Étape 4 atteinte</th><th scope="col">Comptes créés</th></tr></thead>
              <tbody>
                {visits.byMonth.map((row) => <tr key={row.month}><td>{formatMonth(row.month)}</td><td>{row.visits}</td><td>{row.reachedPlan} <small>({percent(row.reachedPlan, row.visits)})</small></td><td>{row.accounts}</td></tr>)}
                {visits.byMonth.length === 0 && <tr><td colSpan={4}>Aucune visite sur la période.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="section-title">Ce que les visiteurs nous ont permis de lire</h3>
          <ul className="legend">
            <li>Site renseigné : {visits.withWebsite} ({percent(visits.withWebsite, visits.total)})</li>
            {visits.sourcesRead.map((row) => <li key={row.key}>{rubricName(row.key)} lue : {row.read} ({percent(row.read, visits.total)})</li>)}
            {visits.proposedTemplates.map((row) => <li key={row.key}>Modèle proposé à l&apos;étape 4 · {templateLabel(row.key)} : {row.count}</li>)}
          </ul>
        </section>

        {/* Entonnoir d'activation (#296) */}
        <section aria-labelledby="funnel-title">
          <div className="section-title"><h2 id="funnel-title">Entonnoir d&apos;activation ({measures.accounts} entreprise{measures.accounts > 1 ? "s" : ""})</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Entonnoir d&apos;activation en huit étapes</caption>
              <thead><tr><th scope="col">Étape</th><th scope="col">Question observée</th><th scope="col">Entreprises</th><th scope="col">Part</th><th scope="col">Temps médian depuis l&apos;étape précédente</th></tr></thead>
              <tbody>
                {funnel.map((step, index) => (
                  <tr key={step.key}>
                    <td>{index + 1}. {step.label}</td>
                    <td>{step.theme}</td>
                    <td>{step.reached}</td>
                    <td>{step.share === null ? notMeasured : percent(step.reached, measures.accounts)}</td>
                    <td>{index === 0 ? notMeasured : daysLabel(step.medianDaysFromPrevious)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="legend">Le retour à J+7 est la première activité du dirigeant 7 jours ou plus après son inscription. Une première diffusion compte qu&apos;elle soit confirmée par le canal ou déclarée.</p>
        </section>

        <section aria-labelledby="cohorts-title">
          <div className="section-title"><h2 id="cohorts-title">Par cohorte d&apos;inscription</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Mesures par mois d&apos;inscription</caption>
              <thead><tr><th scope="col">Mois</th><th scope="col">Comptes</th><th scope="col">Mission lancée en 7 jours</th><th scope="col">Missions lancées</th><th scope="col">Avec une diffusion</th><th scope="col">Puis un bilan</th><th scope="col">Puis une décision</th></tr></thead>
              <tbody>
                {report.cohorts.map((cohort) => <tr key={cohort.month}><td>{formatMonth(cohort.month)}</td><MissionRates measures={cohort.measures} /></tr>)}
                <tr><td><strong>Toute la période</strong></td><MissionRates measures={measures} /></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="launched-title">
          <div className="section-title"><h2 id="launched-title">Missions lancées</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Missions lancées par modèle et par canal</caption>
              <thead><tr><th scope="col">Répartition</th><th scope="col">Valeur</th><th scope="col">Missions</th><th scope="col">Part</th></tr></thead>
              <tbody>
                {measures.byTemplate.map((row) => <tr key={`t-${row.key}`}><td>Modèle</td><td>{templateLabel(row.key)}</td><td>{row.count}</td><td>{percent(row.count, measures.launched)}</td></tr>)}
                {measures.byChannel.map((row) => <tr key={`c-${row.key ?? "aucun"}`}><td>Canal</td><td>{channelName(row.key)}</td><td>{row.count}</td><td>{percent(row.count, measures.launched)}</td></tr>)}
                {measures.launched === 0 && <tr><td colSpan={4}>Aucune mission lancée sur la période.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="legend">
            Diffusions : {measures.confirmedDiffusions} confirmée{measures.confirmedDiffusions > 1 ? "s" : ""} par le canal, {measures.declaredDiffusions} déclarée{measures.declaredDiffusions > 1 ? "s" : ""} ({percent(measures.declaredDiffusions, measures.confirmedDiffusions + measures.declaredDiffusions)} de diffusions déclarées).
            Avis et note moyenne par page : {notMeasured} (avis pas encore recueillis).
          </p>
        </section>

        <section aria-labelledby="counter-title">
          <div className="section-title"><h2 id="counter-title">Contre-mesures</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Contre-mesures</caption>
              <thead><tr><th scope="col">Mesure</th><th scope="col">Valeur</th></tr></thead>
              <tbody>
                <tr><td>Missions diffusées sans bilan après la règle d&apos;arrêt</td><td>{measures.diffusedWithoutReportAfterStopRule}</td></tr>
                <tr><td>Missions écartées dans l&apos;heure qui suit leur lancement</td><td>{measures.dismissedWithinHour}</td></tr>
                <tr><td>Coût moyen d&apos;une analyse avant compte, sans création de compte</td><td>{visits.averageCostWithoutAccount === null ? notMeasured : formatUsd(visits.averageCostWithoutAccount)}</td></tr>
                <tr><td>Oppositions au recontact reçues</td><td>{notMeasured} <small>(non mesuré)</small></td></tr>
                <tr><td>Contenus signalés comme erronés après diffusion</td><td>{notMeasured} <small>(non mesuré)</small></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="companies-title">
          <div className="section-title"><h2 id="companies-title">Par entreprise</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Dates de chaque étape, dernière étape atteinte, coût du modèle et plafonds atteints, par entreprise</caption>
              <thead>
                <tr>
                  <th scope="col">Entreprise</th>
                  {ACTIVATION_STEPS.map((step) => <th key={step.key} scope="col">{step.label}</th>)}
                  <th scope="col">Dernière étape atteinte</th>
                  <th scope="col">Coût du modèle</th>
                  <th scope="col">Plafonds atteints</th>
                </tr>
              </thead>
              <tbody>
                {report.companies.map((company) => (
                  <tr key={company.id}>
                    <td><Link href={`/admin/entreprises/${company.id}`}>{company.name || "Sans nom"}</Link></td>
                    {ACTIVATION_STEPS.map((step) => <td key={step.key}>{formatDate(company.dates[step.key])}</td>)}
                    <td>{ACTIVATION_STEPS.find((step) => step.key === company.lastStep)?.label}</td>
                    <td>{formatUsd(company.costUsd)}</td>
                    <td>{company.caps.length ? company.caps.join(", ") : "Aucun"}</td>
                  </tr>
                ))}
                {report.companies.length === 0 && <tr><td colSpan={ACTIVATION_STEPS.length + 4}>Aucune inscription sur la période.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="legend">Coût estimé de tous les appels de modèle de l&apos;entreprise, analyse avant compte comprise. Plafonds : aujourd&apos;hui et ce mois-ci, heure de Paris.</p>
        </section>
      </div>
    </AppShell>
  );
}
