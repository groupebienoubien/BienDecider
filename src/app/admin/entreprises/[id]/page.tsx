import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/mockup-ui";
import { getShellPropsForEmail } from "@/lib/shell-data";
import { PERSONAS } from "@/lib/agents/personas";
import { isRunFailureReason, failureMessage } from "@/lib/agents/agent-errors";
import { parisQuotaWindows } from "@/lib/quota-windows";
import { redactSecrets } from "@/lib/redact-secrets";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { queued: "En attente", running: "En cours", succeeded: "Réussi", failed: "Échec", cancelled: "Annulé" };
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
const formatUsd = (value: number) => `$${value.toFixed(4)}`;

/** Activité d'une entreprise pour aider un client qui signale un problème (story 7.2) : lecture seule, aucun secret affiché. */
export default async function CompanyActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  if (!isAdminEmail(ownerEmail)) {
    return (
      <AppShell {...await getShellPropsForEmail(ownerEmail)}>
        <div className="warning"><strong>Accès réservé</strong><br />Cette page est réservée aux administrateurs.</div>
      </AppShell>
    );
  }

  const { id } = await params;
  // Seules les colonnes utiles : ni empreinte de mot de passe, ni jetons de connexion.
  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, trade: true, servingArea: true, ownerEmail: true, createdAt: true, emailVerifiedAt: true, suspendedAt: true, loginCount: true, lastLoginAt: true },
  });
  if (!company) notFound();

  const now = new Date();
  const { dayStart, monthStart } = parisQuotaWindows(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000);
  const [runs, weekRuns, weekFailures, dayCost, monthCost] = await Promise.all([
    prisma.agentRun.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, agent: true, status: true, failureReason: true, errorMessage: true, attempts: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true },
    }),
    prisma.agentRun.count({ where: { companyId: id, createdAt: { gte: weekStart } } }),
    prisma.agentRun.count({ where: { companyId: id, createdAt: { gte: weekStart }, status: "failed" } }),
    prisma.usageEvent.aggregate({ where: { companyId: id, createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
    prisma.usageEvent.aggregate({ where: { companyId: id, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
  ]);

  const agentName = (agent: string) => (agent in PERSONAS ? PERSONAS[agent as keyof typeof PERSONAS].name : agent);

  return (
    <AppShell {...await getShellPropsForEmail(ownerEmail)}>
      <div>
        <PageHeading
          kicker="ADMINISTRATION · ACCÈS RESTREINT"
          title={`Activité de ${company.name || company.ownerEmail}`}
          description="Derniers lancements, échecs et messages d'erreur. Lecture seule : aucun jeton ni mot de passe n'est affiché."
          actions={<Link className="btn" href="/admin">Retour à l’administration</Link>}
        />

        <section className="metrics metrics-4" aria-label="Repères de l’entreprise">
          <div className="metric"><div className="metric-label">Lancements (7 jours)</div><div className="metric-value">{weekRuns}</div></div>
          <div className="metric"><div className="metric-label">Échecs (7 jours)</div><div className="metric-value">{weekFailures}</div></div>
          <div className="metric"><div className="metric-label">Coût du jour</div><div className="metric-value">{formatUsd(dayCost._sum.costUsd ?? 0)}</div></div>
          <div className="metric"><div className="metric-label">Coût du mois</div><div className="metric-value">{formatUsd(monthCost._sum.costUsd ?? 0)}</div></div>
        </section>

        <section>
          <div className="section-title"><h2>Identité</h2></div>
          <dl>
            <dt>Entreprise</dt><dd>{company.name || "Profil non renseigné"} {company.trade && <small>({company.trade})</small>}</dd>
            <dt>Zone</dt><dd>{company.servingArea || "—"}</dd>
            <dt>Compte</dt><dd>{company.ownerEmail}</dd>
            <dt>Créée le</dt><dd>{DATE_TIME.format(company.createdAt)}</dd>
            <dt>Adresse e-mail</dt><dd>{company.emailVerifiedAt ? "Confirmée" : "Non confirmée"}</dd>
            <dt>État</dt><dd>{company.suspendedAt ? `Suspendue depuis le ${DATE_TIME.format(company.suspendedAt)}` : "Active"}</dd>
            <dt>Connexions</dt><dd>{company.loginCount}{company.lastLoginAt ? ` · dernière le ${DATE_TIME.format(company.lastLoginAt)}` : ""}</dd>
          </dl>
        </section>

        <section>
          <div className="section-title"><h2>Derniers lancements ({runs.length})</h2></div>
          {runs.length === 0 ? (
            <p>Aucun lancement pour cette entreprise.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Mis en file</th><th>Agent</th><th>État</th><th>Résultats</th><th>Tentatives</th><th>Terminé</th><th>Motif et message</th></tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const reason = isRunFailureReason(run.failureReason) ? failureMessage(run.failureReason, agentName(run.agent)) : null;
                    const detail = redactSecrets(run.errorMessage);
                    return (
                      <tr key={run.id}>
                        <td>{DATE_TIME.format(run.queuedAt)}</td>
                        <td>{agentName(run.agent)}</td>
                        <td>{STATUS_LABELS[run.status] ?? run.status}</td>
                        <td>{run.resultCount}</td>
                        <td>{run.attempts}</td>
                        <td>{run.finishedAt ? DATE_TIME.format(run.finishedAt) : "—"}</td>
                        <td>{reason ?? "—"}{detail && <><br /><small>{detail}</small></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
