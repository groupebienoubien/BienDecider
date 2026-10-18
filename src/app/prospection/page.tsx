import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";
import { isOutreachSendingConfigured } from "@/lib/outreach";
import { ProspectionClient } from "./prospection-client";

export const dynamic = "force-dynamic";

export default async function ProspectionPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const leads = await prisma.lead.findMany({
    where: {
      companyId: company.id,
      OR: [{ stage: { notIn: ["propose", "ecarte"] } }, { stage: "ecarte", statusReason: { not: null } }],
    },
    orderBy: { updatedAt: "desc" },
  });
  const pendingCount = await getPendingDecisionCount(company.id);

  return (
    <AppShell companyName={company.name} companyTrade={company.trade} companyArea={company.servingArea} pendingCount={pendingCount}>
      <ProspectionClient
        initialLeads={leads}
        initialAutoOutreach={company.autoOutreachEnabled}
        sendingConfigured={isOutreachSendingConfigured()}
        companyName={company.name}
        trade={company.trade}
        phone={company.phone}
      />
    </AppShell>
  );
}
