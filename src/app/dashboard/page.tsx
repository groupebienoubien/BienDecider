import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { omitPasswordHash } from "@/lib/safe-company";
import { DashboardClient } from "./dashboard-client";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { needsAttention } from "@/lib/pending-decisions";
import { getShellProps } from "@/lib/shell-data";
import { computeBusinessTarget } from "@/lib/business-target";
import { getWeeklyDelta } from "@/lib/funnel";

export const dynamic = "force-dynamic";

/** Début de la fenêtre « cette semaine » de l'accueil : les sept derniers jours. */
function startOfRollingWeek() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ view?: string; proposal?: string }>;
}) {
  const { view, proposal: focusProposalId } = await searchParams;
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const weekStart = startOfRollingWeek();
  const [planItems, recentAgentRuns, proposals, leads, leadStages, diagnosticCount, riskSettings, facebookConnection, week] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId: company.id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: {
        proposals: { orderBy: { createdAt: "desc" } },
        agentRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true } },
      },
    }),
    prisma.agentRun.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true },
    }),
    prisma.agentProposal.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.findMany({ where: { companyId: company.id, proposalId: { not: null } }, select: { proposalId: true, source: true } }),
    prisma.lead.findMany({ where: { companyId: company.id }, select: { stage: true } }),
    prisma.auditFinding.count({ where: { companyId: company.id } }),
    getConfiguredRiskLevels(),
    prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } }),
    getWeeklyDelta(company.id, weekStart),
  ]);
  // Seul le nom de la Page connectée est transmis au navigateur, jamais un jeton.
  const facebook = facebookConnectionView(facebookConnection ?? undefined, company.id);
  const facebookPageName = facebook.status === "connected" ? facebook.pageName : null;
  const focusedProposal = focusProposalId ? proposals.find((proposal) => proposal.id === focusProposalId) : undefined;
  const initialView = focusedProposal
    ? needsAttention(focusedProposal, facebookPageName) ? "validation" : "historique"
    : view === "validation" || view === "historique" || view === "plan" ? view : "today";

  return (
    <AppShell {...await getShellProps(company)}>
      <DashboardClient
        company={omitPasswordHash(company)}
        initialPlanItems={planItems}
        initialAgentRuns={recentAgentRuns}
        initialProposals={proposals}
        leadSources={Object.fromEntries(leads.map((lead) => [lead.proposalId!, lead.source]))}
        initialLeadStats={{
          active: leadStages.filter((lead) => !["gagne", "perdu", "ecarte"].includes(lead.stage)).length,
          appointments: leadStages.filter((lead) => lead.stage === "rdv").length,
        }}
        initialDiagnosticCount={diagnosticCount}
        progress={{ target: computeBusinessTarget(company), week, weekStart: weekStart.toISOString() }}
        riskSettings={riskSettings}
        facebookPageName={facebookPageName}
        initialView={initialView}
        focusProposalId={focusedProposal?.id}
        todayLabel={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date()).toLocaleUpperCase("fr-FR")}
      />
    </AppShell>
  );
}
