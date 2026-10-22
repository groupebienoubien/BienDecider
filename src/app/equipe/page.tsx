import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getShellProps } from "@/lib/shell-data";
import { EquipeClient } from "./equipe-client";
import { AGENT_RUN_VIEW_SELECT, publicRun, type AgentRunView } from "@/lib/agent-run-types";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const initialAgentRuns: AgentRunView[] = (await prisma.agentRun.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: AGENT_RUN_VIEW_SELECT,
  })).map(publicRun);

  return (
    <AppShell {...await getShellProps(company)}>
      <EquipeClient initialAgentRuns={initialAgentRuns} />
    </AppShell>
  );
}
