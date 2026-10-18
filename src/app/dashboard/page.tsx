import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { omitPasswordHash } from "@/lib/safe-company";
import { DashboardClient } from "./dashboard-client";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { countPendingDecisions, needsAttention } from "@/lib/pending-decisions";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ view?: string; proposal?: string }>;
}) {
  const { view, proposal: focusProposalId } = await searchParams;
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const [planItems, recentAgentRuns, proposals, leads, leadStages, diagnosticCount, riskSettings, facebookConnection] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
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
  ]);
  // Seul le nom de la Page connectée est transmis au navigateur, jamais un jeton.
  const facebook = facebookConnectionView(facebookConnection ?? undefined, company.id);
  const facebookPageName = facebook.status === "connected" ? facebook.pageName : null;
  const focusedProposal = focusProposalId ? proposals.find((proposal) => proposal.id === focusProposalId) : undefined;
  const initialView = focusedProposal
    ? needsAttention(focusedProposal, facebookPageName) ? "validation" : "historique"
    : view === "validation" || view === "historique" || view === "plan" ? view : "today";

  return (
    <AppShell companyName={company.name} companyTrade={company.trade} companyArea={company.servingArea} pendingCount={countPendingDecisions(proposals, facebookPageName)}>
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
        riskSettings={riskSettings}
        facebookPageName={facebookPageName}
        initialView={initialView}
      />
    </AppShell>
  );
}
