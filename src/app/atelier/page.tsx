import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Atelier (§13.3) : les contenus des missions, version par version. Les versions arrivent avec #289. */
export default async function AtelierPage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  return (
    <AppShell {...shell}>
      <PageHeading kicker="Atelier" title="L'atelier" description="Un contenu lié à une mission, une marque et une version précise." />
      <div className="empty">
        <Icon name="panels-top-left" />
        <h3>Aucun contenu pour le moment</h3>
        <p>Les contenus de vos missions lancées s&apos;afficheront ici, version par version. Valider une version n&apos;envoie rien.</p>
        <Link className="btn" href="/missions">Voir mes missions</Link>
      </div>
    </AppShell>
  );
}
