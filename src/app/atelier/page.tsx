import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { PrepareDraftButton } from "@/components/prepare-draft-button";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { loadMissionViews } from "@/lib/missions/view";

export const dynamic = "force-dynamic";

/**
 * Atelier (§13.3) : ouvre le contenu demandé (?mission=) ou celui de la mission prioritaire.
 * Une mission sans contenu affiche de quoi demander son premier brouillon à Paul.
 */
export default async function AtelierPage({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const company = await requireWorkspaceCompany();
  const { mission: missionId } = await searchParams;
  const missions = await loadMissionViews(company.id);
  const requested = missionId ? missions.find((mission) => mission.id === missionId) : undefined;
  const target = requested ? requested.contentId : missions.find((mission) => mission.contentId)?.contentId;
  if (target) redirect(`/atelier/${target}`);
  const shell = await getShellProps(company);
  const waiting = requested && requested.status !== "stopped" && requested.status !== "dismissed" ? requested : null;

  return (
    <AppShell {...shell}>
      <PageHeading kicker="Atelier" title="L'atelier" description="Un contenu lié à une mission, une marque et une version précise." />
      {waiting ? (
        <div className="empty">
          <Icon name="panels-top-left" />
          <h3>{waiting.title} : premier contenu en préparation</h3>
          <p>Paul prépare un premier brouillon pour {waiting.channelLabel}, sans crédit. Rien ne sera diffusé sans votre accord.</p>
          <div className="heading-actions">
            <PrepareDraftButton missionId={waiting.id} className="primary" />
            <Link className="btn" href={`/missions/${waiting.id}`}>Voir la mission</Link>
          </div>
        </div>
      ) : (
        <div className="empty">
          <Icon name="panels-top-left" />
          <h3>Aucun contenu pour le moment</h3>
          <p>Les contenus de vos missions s&apos;afficheront ici, version par version. Valider une version n&apos;envoie rien.</p>
          <Link className="btn" href="/missions">Voir mes missions</Link>
        </div>
      )}
    </AppShell>
  );
}
