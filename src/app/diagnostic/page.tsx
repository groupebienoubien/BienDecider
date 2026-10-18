import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";
import { DiagnosticClient } from "./diagnostic-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const findings = await prisma.auditFinding.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } });
  const pendingCount = await getPendingDecisionCount(company.id);
  return <AppShell companyName={company.name} companyTrade={company.trade} companyArea={company.servingArea} pendingCount={pendingCount}><DiagnosticClient initialFindings={findings} /></AppShell>;
}