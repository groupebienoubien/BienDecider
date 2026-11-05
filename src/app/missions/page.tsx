import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/mockup-ui";
import { getShellProps } from "@/lib/shell-data";
import { requireWorkspaceCompany } from "@/lib/workspace";
import { loadMissionViews } from "@/lib/missions/view";
import { STAGE_LABELS } from "@/lib/missions/stage";
import { MissionList, type MissionCardData } from "./mission-list";

export const dynamic = "force-dynamic";

/** Missions (FR-16 à FR-19, spécification §13.2) : des missions filtrées par statut, la priorité d'abord. */
export default async function MissionsPage() {
  const company = await requireWorkspaceCompany();
  const shell = await getShellProps(company);
  const missions = await loadMissionViews(company.id);
  const cards: MissionCardData[] = missions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    outcome: mission.outcome,
    status: mission.status,
    stage: mission.stage,
    stageLabel: STAGE_LABELS[mission.stage],
    priority: mission.priority,
  }));

  return (
    <AppShell {...shell}>
      <PageHeading
        kicker="Vos missions"
        title="Des missions, pas une liste de tâches."
        description="Chaque mission teste une idée dans un cadre limité, puis vous décidez de la suite au vu du bilan."
        actions={<Link className="btn primary" href="/missions/nouvelle"><Icon name="plus" />Créer une mission avec Paul</Link>}
      />
      <p className="notice mission-banner">
        Délégation : vous validez chaque contenu, rien n&apos;est diffusé sans votre confirmation · Budget média maximum : — · Aucune dépense engagée
      </p>
      <Suspense fallback={null}><MissionList missions={cards} /></Suspense>
    </AppShell>
  );
}
