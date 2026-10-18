import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";
import { EquipeClient } from "./equipe-client";
import type { AgentRunView } from "@/lib/agent-run-types";
import { CompanySections } from "@/components/company-sections";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const initialAgentRuns: AgentRunView[] = await prisma.agentRun.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true },
  });
  const pendingCount = await getPendingDecisionCount(company.id);

  return (
    <AppShell companyName={company.name} companyTrade={company.trade} companyArea={company.servingArea} pendingCount={pendingCount}>
      <CompanySections active="equipe" />
      <EquipeClient initialAgentRuns={initialAgentRuns} />
    </AppShell>
  );
}
