import type { Mission, MissionContent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { channelLabel, isMissionChannel, type MissionChannel } from "@/lib/missions/channels";
import { scopeSummary } from "@/lib/missions/scope";
import { missionStage, orderMissions, priorityMissionId, type ContentState, type Delegation, type MissionStage, type StageMission } from "@/lib/missions/stage";
import { asDelegationLevel } from "@/lib/delegation-level";
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
  contentId: string | null;
  actions: MissionActionData;
};

type MissionWithContent = Mission & { content: (MissionContent & { publications: { versionNumber: number; status: string }[] }) | null };

/** Le site est publié par BienDecider : il n'a pas de connexion à établir. */
function isConnected(channel: MissionChannel | null, connected: ReadonlySet<string>): boolean {
  return channel === "site" || (channel !== null && connected.has(channel));
}

/** État du contenu principal d'après ses diffusions ; le bilan et la décision arrivent avec #294 et #52. */
function contentStateOf(mission: MissionWithContent, connected: ReadonlySet<string>): ContentState | null {
  const content = mission.content;
  if (!content || content.currentNumber === 0) return null;
  const current = content.publications.filter((publication) => publication.versionNumber === content.currentNumber);
  return {
    number: content.currentNumber,
    validated: content.validatedNumber === content.currentNumber,
    currentDiffused: current.some((publication) => publication.status === "sent"),
    scheduled: current.some((publication) => publication.status === "scheduled"),
    uncertain: current.some((publication) => publication.status === "uncertain" || publication.status === "sending"),
    diffusions: content.publications.filter((publication) => publication.status === "sent").length,
    reportAt: null,
    decisionAt: null,
    channelConnected: isConnected(isMissionChannel(mission.channel) ? mission.channel : null, connected),
  };
}

function toStageMission(mission: MissionWithContent, connected: ReadonlySet<string>): StageMission {
  return {
    id: mission.id,
    title: mission.title,
    outcome: mission.outcome,
    status: mission.status as MissionStatus,
    template: mission.template as TemplateKey,
    channel: isMissionChannel(mission.channel) ? mission.channel : null,
    position: mission.position,
    content: contentStateOf(mission, connected),
  };
}

function toView(mission: MissionWithContent, priorityId: string | null, connected: ReadonlySet<string>, delegation: Delegation): MissionView {
  const base = toStageMission(mission, connected);
  const scope = mission.scope !== null && typeof mission.scope === "object" && !Array.isArray(mission.scope) ? (mission.scope as Record<string, unknown>) : {};
  const summary = scopeSummary(base.template, scope);
  const label = base.channel ? channelLabel(base.channel) : "Hors canal, diffusion déclarée";
  return {
    ...base,
    stage: missionStage(base, delegation),
    priority: mission.id === priorityId,
    finding: mission.finding,
    createdBy: mission.createdBy,
    templateLabel: MISSION_TEMPLATES[base.template]?.label ?? "Sur mesure",
    channelLabel: label,
    scopeSummary: summary,
    scope,
    stopRuleDays: mission.stopRuleDays,
    hasValidatedVersion: mission.hasValidatedVersion,
    contentId: mission.content && mission.content.currentNumber > 0 ? mission.content.id : null,
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

/** Missions de l'entreprise, la priorité d'abord puis l'ordre du plan. */
export async function loadMissionViews(companyId: string): Promise<MissionView[]> {
  const [missions, connections, company] = await Promise.all([
    prisma.mission.findMany({ where: { companyId }, orderBy: [{ position: "asc" }, { id: "asc" }], include: { content: { include: { publications: { select: { versionNumber: true, status: true } } } } } }),
    prisma.channelConnection.findMany({ where: { companyId, status: "connecte" }, select: { channel: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { delegationLevel: true } }),
  ]);
  const connected = new Set(connections.map((connection) => connection.channel));
  const delegation = asDelegationLevel(company.delegationLevel);
  const priorityId = priorityMissionId(missions.map((mission) => toStageMission(mission, connected)));
  return orderMissions(missions.map((mission) => toView(mission, priorityId, connected, delegation)));
}

export async function loadMissionView(companyId: string, missionId: string): Promise<MissionView | null> {
  const views = await loadMissionViews(companyId);
  return views.find((view) => view.id === missionId) ?? null;
}
