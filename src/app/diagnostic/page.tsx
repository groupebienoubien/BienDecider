import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getShellProps } from "@/lib/shell-data";
import { getRetainedFeedback } from "@/lib/retained-feedback";
import { getAuditFindingsView } from "@/lib/audit-findings";
import { DiagnosticClient } from "./diagnostic-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const [audits, feedback, leadCount] = await Promise.all([
    getAuditFindingsView(company.id),
    getRetainedFeedback(company.id),
    prisma.lead.count({ where: { companyId: company.id, stage: { notIn: ["propose", "ecarte"] } } }),
  ]);
  return <AppShell {...await getShellProps(company)}><DiagnosticClient initialAudits={audits} feedback={feedback} leadCount={leadCount} /></AppShell>;
}