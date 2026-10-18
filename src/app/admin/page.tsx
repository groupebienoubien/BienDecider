import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail, isExplicitAdminEmail } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
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
      <AppShell>
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <h1 className="text-lg font-medium">Accès réservé</h1>
          <p className="mt-2">
            Cette page est réservée aux administrateurs. Pour vous donner
            accès, ajoutez votre email dans <code>ADMIN_EMAILS</code> (séparés
            par des virgules) dans le <code>.env</code> du serveur, puis
            reconnectez-vous.
          </p>
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
    <AppShell>
      <div className="w-full">
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Accès réservé — {usageByCompany.length === 0 ? "aucun usage mesuré encore" : `${totals._count._all} appel(s) modèle au total`}.
        </p>

        {/* Entonnoir d'activation */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {funnel.map((f) => (
            <div key={f.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-semibold">{f.count}</p>
              <p className="mt-1 text-xs text-slate-500">{f.label}</p>
            </div>
          ))}
        </section>

        {isExplicitAdminEmail(ownerEmail) && (
          <section className="mt-8 border-y border-slate-200 py-5">
            <h2 className="font-medium">Politique de risque des actions</h2>
            <p className="mt-1 text-sm text-slate-600">Réglez les niveaux de risque globaux par type d&apos;action.</p>
            <Link href="/admin/risques" className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Configurer les risques</Link>
          </section>
        )}

        {/* Coût total */}
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Coût total estimé (tous modèles, tarif au moment de l&apos;appel)</p>
          <p className="mt-1 text-3xl font-semibold">{formatUsd(totals._sum.costUsd ?? 0)}</p>
        </section>

        {/* Entreprises */}
        <section className="mt-8">
          <h2 className="text-lg font-medium">Entreprises ({companies.length})</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Entreprise</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Créée le</th>
                  <th className="px-3 py-2">Connexions</th>
                  <th className="px-3 py-2">Dernière connexion</th>
                  <th className="px-3 py-2">Propositions</th>
                  <th className="px-3 py-2">Coût</th>
                  {isExplicitAdminEmail(ownerEmail) && <th className="px-3 py-2">Plafonds IA (UTC)</th>}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const usage = usageMap.get(c.id);
                  return (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">
                        {c.name}
                        <span className="ml-1 text-xs text-slate-400">({c.trade})</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{c.ownerEmail}</td>
                      <td className="px-3 py-2 text-slate-500">{c.createdAt.toLocaleDateString("fr-FR")}</td>
                      <td className="px-3 py-2">{c.loginCount}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {c.lastLoginAt ? c.lastLoginAt.toLocaleDateString("fr-FR") : "jamais"}
                      </td>
                      <td className="px-3 py-2">{c._count.proposals}</td>
                      <td className="px-3 py-2">{formatUsd(usage?._sum.costUsd ?? 0)}</td>
                      {isExplicitAdminEmail(ownerEmail) && <td className="px-3 py-2"><CompanyQuotaForm
                        companyId={c.id}
                        limits={{ dailyAgentRunLimit: c.dailyAgentRunLimit, monthlyAgentRunLimit: c.monthlyAgentRunLimit, dailySpendLimitUsd: c.dailySpendLimitUsd, monthlySpendLimitUsd: c.monthlySpendLimitUsd }}
                        dailyRuns={(attemptsTodayMap.get(c.id) ?? 0) + (inlineCallsTodayMap.get(c.id) ?? 0)}
                        monthlyRuns={(attemptsMonthMap.get(c.id) ?? 0) + (inlineCallsMonthMap.get(c.id) ?? 0)}
                        dailyCost={usageTodayMap.get(c.id) ?? 0}
                        monthlyCost={usageMonthMap.get(c.id) ?? 0}
                        reservedCost={(reservedMap.get(c.id) ?? 0) + (reservedInlineMap.get(c.id) ?? 0)}
                      /></td>}
                      <td className="px-3 py-2 text-right">
                        <DeleteCompanyButton companyId={c.id} companyName={c.name} />
                      </td>
                    </tr>
                  );
                })}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={isExplicitAdminEmail(ownerEmail) ? 9 : 8} className="px-3 py-6 text-center text-slate-400">
                      Aucune entreprise encore.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Coût par agent */}
        <section className="mt-8">
          <h2 className="text-lg font-medium">Coût par agent</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Appels</th>
                  <th className="px-3 py-2">Tokens entrée</th>
                  <th className="px-3 py-2">Tokens sortie</th>
                  <th className="px-3 py-2">Coût</th>
                </tr>
              </thead>
              <tbody>
                {usageByAgent.map((u) => {
                  const persona =
                    u.agent in PERSONAS ? PERSONAS[u.agent as AgentKey].name : u.agent;
                  return (
                    <tr key={u.agent} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">{persona} <span className="text-xs text-slate-400">({u.agent})</span></td>
                      <td className="px-3 py-2">{u._count._all}</td>
                      <td className="px-3 py-2">{(u._sum.inputTokens ?? 0).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2">{(u._sum.outputTokens ?? 0).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2">{formatUsd(u._sum.costUsd ?? 0)}</td>
                    </tr>
                  );
                })}
                {usageByAgent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
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
          <section className="mt-8">
            <h2 className="text-lg font-medium">Demandes hors catalogue ({uncoveredRequests.length})</h2>
            <p className="mt-1 text-sm text-slate-500">Ce que des dirigeants ont demandé et qu&apos;aucun agent ne couvre, noté par Paul. Les 50 plus récentes.</p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Entreprise</th>
                    <th className="px-3 py-2">Demande</th>
                    <th className="px-3 py-2">Proposé à la place</th>
                    <th className="px-3 py-2">Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {uncoveredRequests.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.createdAt.toLocaleDateString("fr-FR")}</td>
                      <td className="px-3 py-2">{entry.company.name || entry.company.trade || "Sans nom"}</td>
                      <td className="px-3 py-2">{entry.request}</td>
                      <td className="px-3 py-2">{entry.closestAlternative ?? "Rien"}</td>
                      <td className="px-3 py-2">{entry.source === "plan" ? "Plan" : "Chat"}</td>
                    </tr>
                  ))}
                  {uncoveredRequests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
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
        <section className="mt-8 mb-8">
          <h2 className="text-lg font-medium">Coût par modèle</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Modèle</th>
                  <th className="px-3 py-2">Appels</th>
                  <th className="px-3 py-2">Coût</th>
                </tr>
              </thead>
              <tbody>
                {usageByModel.map((u) => (
                  <tr key={u.model} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{u.model}</td>
                    <td className="px-3 py-2">{u._count._all}</td>
                    <td className="px-3 py-2">{formatUsd(u._sum.costUsd ?? 0)}</td>
                  </tr>
                ))}
                {usageByModel.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
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
