import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getShellProps } from "@/lib/shell-data";
import { loadStudioState } from "@/lib/proposal-studio";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";

/** Studio conversationnel d'une production (US #258) : aperçu, conversation avec l'agent, versions. */
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const state = await loadStudioState(company.id, id);
  if (!state) notFound();

  return (
    <AppShell {...await getShellProps(company)}>
      <StudioClient
        initial={state}
        companyName={company.name}
        siteDestination={company.siteSlug ? `/site/${company.siteSlug}` : null}
      />
    </AppShell>
  );
}
