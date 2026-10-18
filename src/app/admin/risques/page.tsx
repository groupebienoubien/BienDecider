import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/mockup-ui";
import { getSessionEmail } from "@/lib/session";
import { isExplicitAdminEmail } from "@/lib/admin";
import { getShellPropsForEmail } from "@/lib/shell-data";
import { DelegationRiskSettings } from "../delegation-risk-settings";

export const dynamic = "force-dynamic";

export default async function DelegationRiskPage() {
  const email = await getSessionEmail();
  if (!email) redirect("/login");
  const authorized = isExplicitAdminEmail(email);
  return (
    <AppShell {...await getShellPropsForEmail(email)}>
      <div>
        <PageHeading
          kicker="ADMINISTRATION · GOUVERNANCE"
          title="Niveaux de risque"
          description="Politique globale de BienDecider, par type d’action."
          actions={<Link className="btn" href="/admin">Retour à l’administration</Link>}
        />
        <DelegationRiskSettings explicitlyAuthorized={authorized} />
        <p className="legend">Toute modification concerne l’ensemble des entreprises. La décision fondatrice sur les modes d’autonomie reste à acter ; ce réglage ne désactive pas la validation humaine.</p>
      </div>
    </AppShell>
  );
}
