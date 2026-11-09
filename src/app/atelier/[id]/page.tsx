import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { checklistFor, loadAtelierItems, loadContentDetail } from "@/lib/contents/view";
import { visualOfVersion } from "@/lib/brand/service";
import { ContentWorkbench } from "./content-workbench";

export const dynamic = "force-dynamic";

/** Un contenu dans l'atelier (§13.3, stories 11.1 à 11.3) : aperçu, décision, historique, retouche et « Retravailler avec Paul ». */
export default async function ContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const company = await requireWorkspaceCompany();
  const { id } = await params;
  const { v } = await searchParams;
  const detail = await loadContentDetail(company.id, id);
  if (!detail) notFound();
  const [shell, items] = await Promise.all([getShellProps(company), loadAtelierItems(company.id)]);
  const requested = Number(v);
  const viewing = detail.versions.find((version) => version.number === requested) ?? detail.versions[0];
  // Le visuel de la version vue : même rendu que la route d'image, d'après la marque conservée avec cette version (#290).
  const visual = detail.visual.composition ? await visualOfVersion(company.id, id, viewing.number) : null;

  return (
    <AppShell {...shell}>
      <PageHeading
        kicker="Atelier"
        title="L'atelier"
        description="Un contenu lié à une mission, une marque et une version précise."
        actions={<Link className="btn" href={`/missions/${detail.mission.id}`}><Icon name="arrow-right" className="flip" />Retour à la mission</Link>}
      />
      <ContentWorkbench
        key={`${detail.id}:${detail.currentNumber}:${viewing.number}`}
        detail={detail}
        viewing={viewing.number}
        items={items}
        checklist={checklistFor(detail.versions[0])}
        credits={company.creditBalance}
        visualSvg={visual?.svg ?? null}
        visualPreview={visual?.preview ?? false}
      />
    </AppShell>
  );
}
