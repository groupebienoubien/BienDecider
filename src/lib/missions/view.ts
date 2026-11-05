import type { Mission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { channelLabel, isMissionChannel } from "@/lib/missions/channels";
import { scopeSummary } from "@/lib/missions/scope";
import { missionStage, orderMissions, priorityMissionId, type MissionStage, type StageMission } from "@/lib/missions/stage";
import { MISSION_TEMPLATES, type TemplateKey } from "@/lib/missions/templates";
import type { MissionStatus } from "@/lib/missions/rules";

export type MissionActionData = {
  id: string;
  title: string;
  status: MissionStatus;
  version: number;
  outcome: string;
  originalOutcome: string;
  channelLabel: string;
  scopeSummary: string;
  stopRuleDays: number | null;
  launched: boolean;
};

/** Ce que les pages V5.2 affichent d'une mission : données, étape et gestes possibles, calculés au même endroit. */
export type MissionView = StageMission & {
  stage: MissionStage;
  priority: boolean;
  finding: string;
  createdBy: string;
  templateLabel: string;
  channelLabel: string;
  scopeSummary: string;
  scope: Record<string, unknown>;
  stopRuleDays: number | null;
  hasValidatedVersion: boolean;
  actions: MissionActionData;
};

function toStageMission(mission: Mission): StageMission {
  return {
    id: mission.id,
    title: mission.title,
    outcome: mission.outcome,
    status: mission.status as MissionStatus,
    template: mission.template as TemplateKey,
    channel: isMissionChannel(mission.channel) ? mission.channel : null,
    position: mission.position,
    // Le contenu principal arrive avec l'atelier (#289) : d'ici là, une mission en cours est en préparation.
    content: null,
  };
}

function toView(mission: Mission, priorityId: string | null): MissionView {
  const base = toStageMission(mission);
  const scope = mission.scope !== null && typeof mission.scope === "object" && !Array.isArray(mission.scope) ? (mission.scope as Record<string, unknown>) : {};
  const summary = scopeSummary(base.template, scope);
  const label = base.channel ? channelLabel(base.channel) : "Hors canal, diffusion déclarée";
  return {
    ...base,
    stage: missionStage(base),
    priority: mission.id === priorityId,
    finding: mission.finding,
    createdBy: mission.createdBy,
    templateLabel: MISSION_TEMPLATES[base.template]?.label ?? "Sur mesure",
    channelLabel: label,
    scopeSummary: summary,
    scope,
    stopRuleDays: mission.stopRuleDays,
    hasValidatedVersion: mission.hasValidatedVersion,
    actions: {
      id: mission.id,
      title: mission.title,
      status: base.status,
      version: mission.version,
      outcome: mission.outcome,
      originalOutcome: mission.originalOutcome,
      channelLabel: label,
      scopeSummary: summary,
      stopRuleDays: mission.stopRuleDays,
      launched: mission.firstLaunchedAt !== null,
    },
  };
}

/** Missions de l'entreprise, la priorité d'abord (choisie avec Paul si elle est valable) puis l'ordre du plan. */
export async function loadMissionViews(companyId: string): Promise<MissionView[]> {
  const [missions, company] = await Promise.all([
    prisma.mission.findMany({ where: { companyId }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    prisma.company.findUnique({ where: { id: companyId }, select: { priorityMissionId: true } }),
  ]);
  const priorityId = priorityMissionId(missions.map(toStageMission), company?.priorityMissionId ?? null);
  return orderMissions(missions.map((mission) => toView(mission, priorityId)), priorityId);
}

/** Identifiant de la mission prioritaire parmi des vues déjà calculées. */
export function priorityOf(views: MissionView[]): string | null {
  return views.find((view) => view.priority)?.id ?? null;
}

export async function loadMissionView(companyId: string, missionId: string): Promise<MissionView | null> {
  const views = await loadMissionViews(companyId);
  return views.find((view) => view.id === missionId) ?? null;
}
