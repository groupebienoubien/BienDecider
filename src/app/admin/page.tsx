import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail, isExplicitAdminEmail } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/mockup-ui";
import { getShellPropsForEmail } from "@/lib/shell-data";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { DeleteCompanyButton } from "./delete-company-button";
import Link from "next/link";
import { listUncoveredRequests } from "@/lib/agents/capabilities";
import { CompanyQuotaForm } from "./company-quota-form";

export const dynamic = "force-dynamic";

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default async function AdminPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  if (!isAdminEmail(ownerEmail)) {
    return (
      <AppShell {...await getShellPropsForEmail(ownerEmail)}>
        <div className="warning">
          <strong>Accès réservé</strong>
          <br />
            Cette page est réservée aux administrateurs. Pour vous donner
            accès, ajoutez votre email dans <code>ADMIN_EMAILS</code> (séparés
            par des virgules) dans le <code>.env</code> du serveur, puis
            reconnectez-vous.
        </div>
      </AppShell>
    );
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [companies, usageByCompany, usageByCompanyToday, usageByCompanyMonth, attemptsByCompanyToday, attemptsByCompanyMonth, inlineCallsByCompanyToday, inlineCallsByCompanyMonth, reservedByCompany, reservedInlineByCompany, usageByAgent, usageByModel, totals, companiesWithPlan, companiesWithValidated, companiesWithSite] =
    await Promise.all([
      prisma.company.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { proposals: true, planItems: true, chatMessages: true } } },
      }),
      prisma.usageEvent.groupBy({
        by: ["companyId"],
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.usageEvent.groupBy({ by: ["companyId"], where: { createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
      prisma.usageEvent.groupBy({ by: ["companyId"], where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
      prisma.agentRunAttempt.groupBy({ by: ["companyId"], where: { queuedAt: { gte: dayStart } }, _count: { _all: true } }),
      prisma.agentRunAttempt.groupBy({ by: ["companyId"], where: { queuedAt: { gte: monthStart } }, _count: { _all: true } }),
      prisma.usageReservation.groupBy({ by: ["companyId"], where: { createdAt: { gte: dayStart } }, _count: { _all: true } }),
      prisma.usageReservation.groupBy({ by: ["companyId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
      prisma.agentRun.groupBy({ by: ["companyId"], where: { status: { in: ["queued", "running"] } }, _sum: { reservedCostUsd: true } }),
      prisma.usageReservation.groupBy({ by: ["companyId"], where: { expiresAt: { gt: now }, releasedAt: null }, _sum: { amountUsd: true } }),
      prisma.usageEvent.groupBy({
        by: ["agent"],
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } },
      }),
      prisma.usageEvent.groupBy({
        by: ["model"],
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      prisma.usageEvent.aggregate({ _sum: { costUsd: true }, _count: { _all: true } }),
      prisma.actionPlanItem.findMany({ distinct: ["companyId"], select: { companyId: true } }),
      prisma.agentProposal.findMany({
        where: { status: { in: ["validee", "modifiee", "executee"] } },
        distinct: ["companyId"],
        select: { companyId: true },
      }),
      prisma.company.count({ where: { siteSlug: { not: null } } }),
    ]);

  const usageMap = new Map(usageByCompany.map((u) => [u.companyId, u]));
  const usageTodayMap = new Map(usageByCompanyToday.map((u) => [u.companyId, u._sum.costUsd ?? 0]));
  const usageMonthMap = new Map(usageByCompanyMonth.map((u) => [u.companyId, u._sum.costUsd ?? 0]));
  const attemptsTodayMap = new Map(attemptsByCompanyToday.map((u) => [u.companyId, u._count._all]));
  const attemptsMonthMap = new Map(attemptsByCompanyMonth.map((u) => [u.companyId, u._count._all]));
  const inlineCallsTodayMap = new Map(inlineCallsByCompanyToday.map((u) => [u.companyId, u._count._all]));
  const inlineCallsMonthMap = new Map(inlineCallsByCompanyMonth.map((u) => [u.companyId, u._count._all]));
  const reservedMap = new Map(reservedByCompany.map((u) => [u.companyId, u._sum.reservedCostUsd ?? 0]));
  const reservedInlineMap = new Map(reservedInlineByCompany.map((u) => [u.companyId, u._sum.amountUsd ?? 0]));

  const funnel = [
    { label: "Entreprises créées", count: companies.length },
    { label: "Ont un plan généré", count: companiesWithPlan.length },
    { label: "Ont validé une action", count: companiesWithValidated.length },
    { label: "Ont un site publié", count: companiesWithSite },
  ];

  const uncoveredRequests = isExplicitAdminEmail(ownerEmail) ? await listUncoveredRequests() : null;

  return (
    <AppShell {...await getShellPropsForEmail(ownerEmail)}>
      <div>
        <PageHeading
          kicker="ADMINISTRATION · ACCÈS RESTREINT"
          title="Pilotage de la plateforme"
          description={`Vue réservée à l’administrateur, distincte de l’espace entreprise. ${usageByCompany.length === 0 ? "Aucun usage mesuré encore." : `${totals._count._all} appel(s) modèle au total.`}`}
        />

        {/* Entonnoir d'activation */}
        <section className="metrics metrics-4" aria-label="Entonnoir d’activation">
          {funnel.map((f) => (
            <div key={f.label} className="metric">
              <div className="metric-label">{f.label}</div>
              <div className="metric-value">{String(f.count).padStart(2, "0")}</div>
            </div>
          ))}
        </section>

        {isExplicitAdminEmail(ownerEmail) && (
          <section className="setting-section">
            <h2>Politique de risque des actions</h2>
            <p>Réglez les niveaux de risque globaux par type d&apos;action.</p>
            <Link href="/admin/risques" className="btn primary">Configurer les risques</Link>
          </section>
        )}

        {/* Coût total */}
        <div className="sync-line">
          <span>Coût total estimé (tous modèles, tarif au moment de l&apos;appel)</span>
          <strong>{formatUsd(totals._sum.costUsd ?? 0)}</strong>
        </div>

        {/* Entreprises */}
        <section>
          <div className="section-title"><h2>Entreprises ({companies.length})</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Email</th>
                  <th>Créée le</th>
                  <th>Connexions</th>
                  <th>Dernière connexion</th>
                  <th>Propositions</th>
                  <th>Coût</th>
                  {isExplicitAdminEmail(ownerEmail) && <th>Plafonds IA (UTC)</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const usage = usageMap.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        <small>({c.trade})</small>
                      </td>
                      <td>{c.ownerEmail}</td>
                      <td>{c.createdAt.toLocaleDateString("fr-FR")}</td>
                      <td>{c.loginCount}</td>
                      <td>
                        {c.lastLoginAt ? c.lastLoginAt.toLocaleDateString("fr-FR") : "jamais"}
                      </td>
                      <td>{c._count.proposals}</td>
                      <td>{formatUsd(usage?._sum.costUsd ?? 0)}</td>
                      {isExplicitAdminEmail(ownerEmail) && <td><CompanyQuotaForm
                        companyId={c.id}
                        limits={{ dailyAgentRunLimit: c.dailyAgentRunLimit, monthlyAgentRunLimit: c.monthlyAgentRunLimit, dailySpendLimitUsd: c.dailySpendLimitUsd, monthlySpendLimitUsd: c.monthlySpendLimitUsd }}
                        dailyRuns={(attemptsTodayMap.get(c.id) ?? 0) + (inlineCallsTodayMap.get(c.id) ?? 0)}
                        monthlyRuns={(attemptsMonthMap.get(c.id) ?? 0) + (inlineCallsMonthMap.get(c.id) ?? 0)}
                        dailyCost={usageTodayMap.get(c.id) ?? 0}
                        monthlyCost={usageMonthMap.get(c.id) ?? 0}
                        reservedCost={(reservedMap.get(c.id) ?? 0) + (reservedInlineMap.get(c.id) ?? 0)}
                      /></td>}
                      <td>
                        <DeleteCompanyButton companyId={c.id} companyName={c.name} />
                      </td>
                    </tr>
                  );
                })}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={isExplicitAdminEmail(ownerEmail) ? 9 : 8}>
                      Aucune entreprise encore.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Coût par agent */}
        <section>
          <div className="section-title"><h2>Coût par agent</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Appels</th>
                  <th>Tokens entrée</th>
                  <th>Tokens sortie</th>
                  <th>Coût</th>
                </tr>
              </thead>
              <tbody>
                {usageByAgent.map((u) => {
                  const persona =
                    u.agent in PERSONAS ? PERSONAS[u.agent as AgentKey].name : u.agent;
                  return (
                    <tr key={u.agent}>
                      <td>{persona} <small>({u.agent})</small></td>
                      <td>{u._count._all}</td>
                      <td>{(u._sum.inputTokens ?? 0).toLocaleString("fr-FR")}</td>
                      <td>{(u._sum.outputTokens ?? 0).toLocaleString("fr-FR")}</td>
                      <td>{formatUsd(u._sum.costUsd ?? 0)}</td>
                    </tr>
                  );
                })}
                {usageByAgent.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      Aucun appel modèle mesuré encore.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Réservé aux administrateurs explicites : ces demandes citent ce que d'autres entreprises ont écrit. */}
        {uncoveredRequests && (
          <section>
            <div className="section-title"><h2>Demandes hors catalogue ({uncoveredRequests.length})</h2></div>
            <p className="legend">Ce que des dirigeants ont demandé et qu&apos;aucun agent ne couvre, noté par Paul. Les 50 plus récentes.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entreprise</th>
                    <th>Demande</th>
                    <th>Proposé à la place</th>
                    <th>Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {uncoveredRequests.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.createdAt.toLocaleDateString("fr-FR")}</td>
                      <td>{entry.company.name || entry.company.trade || "Sans nom"}</td>
                      <td>{entry.request}</td>
                      <td>{entry.closestAlternative ?? "Rien"}</td>
                      <td>{entry.source === "plan" ? "Plan" : "Chat"}</td>
                    </tr>
                  ))}
                  {uncoveredRequests.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        Aucune demande hors catalogue notée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Coût par modèle */}
        <section>
          <div className="section-title"><h2>Coût par modèle</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Modèle</th>
                  <th>Appels</th>
                  <th>Coût</th>
                </tr>
              </thead>
              <tbody>
                {usageByModel.map((u) => (
                  <tr key={u.model}>
                    <td>{u.model}</td>
                    <td>{u._count._all}</td>
                    <td>{formatUsd(u._sum.costUsd ?? 0)}</td>
                  </tr>
                ))}
                {usageByModel.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      Aucun appel modèle mesuré encore.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
