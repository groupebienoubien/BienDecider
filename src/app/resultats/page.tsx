import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Résultats (§13.4) : bilans et diffusions. Les indicateurs restent « — » tant que rien n'est mesuré (NFR-11) ; bilan et décision : #294. */
export default async function ResultatsPage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  return (
    <AppShell {...shell}>
      <PageHeading kicker="Résultats" title="L'activité n'est pas le résultat." description="Ce que vos missions ont réellement produit, déclaré par vous ou observé sur vos canaux." />
      <dl className="metrics metrics-3">
        <div><dt>Diffusions</dt><dd>—</dd></div>
        <div><dt>Demandes qualifiées</dt><dd>—</dd></div>
        <div><dt>CA signé</dt><dd>—</dd></div>
      </dl>
      <div className="empty">
        <Icon name="chart-no-axes-column" />
        <h3>Rien n&apos;a encore été diffusé</h3>
        <p>Le bilan d&apos;une mission se renseigne après sa première diffusion.</p>
        <Link className="btn" href="/missions">Voir mes missions</Link>
      </div>
    </AppShell>
  );
}
