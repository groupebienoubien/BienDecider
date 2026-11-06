import type { AuditFinding, Mission, MissionContent, MissionDecision, MissionReport } from "@prisma/client";
import { normalizeCertainty, type MissionSourceFinding } from "@/lib/findings/certainty";
import { prisma } from "@/lib/prisma";
import { channelLabel, isMissionChannel, type MissionChannel } from "@/lib/missions/channels";
import { scopeSummary } from "@/lib/missions/scope";
import { missionStage, orderMissions, priorityMissionId, type ContentState, type Delegation, type MissionStage, type StageMission } from "@/lib/missions/stage";
import { asDelegationLevel } from "@/lib/delegation-level";
import { MISSION_TEMPLATES, type TemplateKey } from "@/lib/missions/templates";
import type { MissionStatus } from "@/lib/missions/rules";
import { isUpToDate, stopRuleDue } from "@/lib/missions/report";
import { listAgencies } from "@/lib/agencies/service";

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
  /** Déduction de Paul à la proposition (#168) ; null pour une mission du dirigeant ou ancienne. */
  deduction: string | null;
  /** Constat du diagnostic relié (#168) ; null s'il n'y en a pas ou s'il a été supprimé. */
  source: MissionSourceFinding | null;
  templateLabel: string;
  channelLabel: string;
  scopeSummary: string;
  scope: Record<string, unknown>;
  stopRuleDays: number | null;
  hasValidatedVersion: boolean;
  contentId: string | null;
  actions: MissionActionData;
  /** Diffusions de la mission, confirmées ou déclarées. */
  diffusions: number;
  /** Dernier bilan déclaré ; « à jour » tant que le nombre de diffusions n'a pas changé (§7.1). */
  report: { qualifiedLeads: number; meetings: number; signedRevenue: number | null; note: string | null; upToDate: boolean; createdAt: string } | null;
  decision: { choice: "continue" | "stop"; upToDate: boolean; createdAt: string } | null;
  /** Échéance de la règle d'arrêt de la série en cours, depuis sa première diffusion ; null avant toute diffusion. */
  stopRuleDue: string | null;
};

type MissionWithContent = Mission & {
  content: (MissionContent & { publications: { versionNumber: number; status: string; sentAt: Date | null }[] }) | null;
  reports: MissionReport[];
  decisions: MissionDecision[];
  sourceFinding: AuditFinding | null;
};

/** Constat relié, seulement s'il est de l'entreprise de la mission ; « Observé » refait selon la source. */
function sourceOf(mission: MissionWithContent): MissionSourceFinding | null {
  const finding = mission.sourceFinding;
  if (!finding || finding.companyId !== mission.companyId) return null;
  return {
    id: finding.id,
    title: finding.title,
    category: finding.category,
    content: finding.content,
    sourceUrl: finding.sourceUrl,
    sourceStatus: finding.sourceStatus,
    certainty: normalizeCertainty(finding.certainty, finding.sourceStatus, finding.sourceUrl),
    createdAt: finding.createdAt.toISOString(),
  };
}

/** Le site est publié par BienDecider : il n'a pas de connexion à établir. */
function isConnected(channel: MissionChannel | null, connected: ReadonlySet<string>): boolean {
  return channel === "site" || (channel !== null && connected.has(channel));
}

/** État du contenu principal d'après ses diffusions, le dernier bilan et la dernière décision. */
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
    reportAt: mission.reports[0]?.publicationCount ?? null,
    decisionAt: mission.decisions[0]?.publicationCount ?? null,
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

function toView(mission: MissionWithContent, priorityId: string | null, connected: ReadonlySet<string>, delegation: Delegation, names: Record<string, string>): MissionView {
  const base = toStageMission(mission, connected);
  const scope = mission.scope !== null && typeof mission.scope === "object" && !Array.isArray(mission.scope) ? (mission.scope as Record<string, unknown>) : {};
  const summary = scopeSummary(base.template, scope, names);
  const label = base.channel ? channelLabel(base.channel) : "Hors canal, diffusion déclarée";
  return {
    ...base,
    stage: missionStage(base, delegation),
    priority: mission.id === priorityId,
    finding: mission.finding,
    createdBy: mission.createdBy,
    deduction: mission.deduction,
    source: sourceOf(mission),
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
    ...resultsOf(mission),
  };
}

function resultsOf(mission: MissionWithContent): Pick<MissionView, "diffusions" | "report" | "decision" | "stopRuleDue"> {
  const sent = (mission.content?.publications ?? []).filter((publication) => publication.status === "sent" && publication.sentAt).map((publication) => publication.sentAt as Date);
  const diffusions = (mission.content?.publications ?? []).filter((publication) => publication.status === "sent").length;
  const report = mission.reports[0] ?? null;
  const decision = mission.decisions[0] ?? null;
  // Une décision de poursuivre ouvre une nouvelle série : son échéance part de la première diffusion qui la suit.
  const since = decision?.choice === "continue" ? decision.createdAt.getTime() : 0;
  const start = sent.filter((at) => at.getTime() >= since).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    diffusions,
    report: report && { qualifiedLeads: report.qualifiedLeads, meetings: report.meetings, signedRevenue: report.signedRevenue, note: report.note, upToDate: isUpToDate(report.publicationCount, diffusions), createdAt: report.createdAt.toISOString() },
    decision: decision && { choice: decision.choice === "stop" ? "stop" : "continue", upToDate: isUpToDate(decision.publicationCount, diffusions), createdAt: decision.createdAt.toISOString() },
    stopRuleDue: stopRuleDue(start, mission.stopRuleDays)?.toISOString() ?? null,
  };
}

/** Missions de l'entreprise, la priorité d'abord (choisie avec Paul si elle est valable) puis l'ordre du plan. */
export async function loadMissionViews(companyId: string): Promise<MissionView[]> {
  const [missions, connections, company, agencies] = await Promise.all([
    prisma.mission.findMany({
      where: { companyId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: {
        content: { include: { publications: { select: { versionNumber: true, status: true, sentAt: true } } } },
        reports: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
        decisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
        sourceFinding: true,
      },
    }),
    prisma.channelConnection.findMany({ where: { companyId, status: "connecte" }, select: { channel: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { delegationLevel: true, priorityMissionId: true } }),
    listAgencies(companyId),
  ]);
  const names = Object.fromEntries(agencies.map((agency) => [agency.id, agency.name]));
  const connected = new Set(connections.map((connection) => connection.channel));
  const delegation = asDelegationLevel(company.delegationLevel);
  const priorityId = priorityMissionId(missions.map((mission) => toStageMission(mission, connected)), company.priorityMissionId);
  return orderMissions(missions.map((mission) => toView(mission, priorityId, connected, delegation, names)), priorityId);
}

/** Identifiant de la mission prioritaire parmi des vues déjà calculées. */
export function priorityOf(views: MissionView[]): string | null {
  return views.find((view) => view.priority)?.id ?? null;
}

export async function loadMissionView(companyId: string, missionId: string): Promise<MissionView | null> {
  const views = await loadMissionViews(companyId);
  return views.find((view) => view.id === missionId) ?? null;
}
