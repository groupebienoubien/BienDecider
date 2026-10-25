import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getShellProps } from "@/lib/shell-data";
import { getRetainedFeedback } from "@/lib/retained-feedback";
import { getAuditFindingsView } from "@/lib/audit-findings";
import { getSourceCoverage } from "@/lib/source-coverage";
import { DiagnosticClient } from "./diagnostic-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticPage() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");
  const [audits, feedback, leadCount, coverage] = await Promise.all([
    getAuditFindingsView(company.id),
    getRetainedFeedback(company.id),
    prisma.lead.count({ where: { companyId: company.id, stage: { notIn: ["propose", "ecarte"] } } }),
    getSourceCoverage(company.id),
  ]);
  // Story 5.2 : le plan est à jour si Paul l'a préparé avec succès après la fin du dernier audit.
  const planUpToDate = audits.latestAt
    ? await prisma.agentRun.count({ where: { companyId: company.id, agent: "co_ceo", status: "succeeded", requestKey: { startsWith: "plan-generation:" }, finishedAt: { gt: new Date(audits.latestAt) } } }) > 0
    : false;
  return <AppShell {...await getShellProps(company)}><DiagnosticClient initialAudits={audits} feedback={feedback} leadCount={leadCount} initialPlanUpToDate={planUpToDate} coverage={coverage} hasGoogleCandidate={Boolean(company.googlePlaceCandidateId)} hasFacebookCandidate={Boolean(company.facebookPageCandidateUrl) && !company.googlePlaceCandidateId} /></AppShell>;
}