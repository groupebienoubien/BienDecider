import { prisma } from "@/lib/prisma";
import { loadMissionViews, type MissionView } from "@/lib/missions/view";
import { readReport, type ReportReading } from "@/lib/missions/report";

/** « Ce que Paul apprend » d'une mission (§7.3), d'après son dernier bilan ; null sans bilan. */
export function learningOf(mission: Pick<MissionView, "outcome" | "report" | "stopRuleDue">, now: Date): ReportReading | null {
  if (!mission.report) return null;
  return readReport(mission.outcome, mission.report, { due: mission.stopRuleDue ? new Date(mission.stopRuleDue) : null, now });
}

/** Lectures des missions qui ont un bilan, dans l'ordre des missions. */
export function learningsOf(missions: MissionView[], now = new Date()): { mission: MissionView; reading: ReportReading }[] {
  return missions.flatMap((mission) => {
    const reading = learningOf(mission, now);
    return reading ? [{ mission, reading }] : [];
  });
}

export type PublicationLine = {
  id: string;
  contentId: string;
  missionTitle: string;
  versionNumber: number;
  channelLabel: string;
  status: "sent" | "scheduled";
  mode: string;
  at: string | null;
  recipientCount: number | null;
};

export type ResultsData = {
  missions: MissionView[];
  launched: MissionView[];
  publications: PublicationLine[];
  indicators: { diffusions: number; scheduled: number; qualifiedLeads: number | null; signedRevenue: number | null };
  nextPoint: { mission: MissionView; due: string; reached: boolean } | null;
};

/** Résultats (§13.4) : chiffres déclarés et diffusions, sans jamais confondre l'activité et le résultat ; « — » (null) tant que rien n'est déclaré. */
export async function loadResults(companyId: string, now = new Date()): Promise<ResultsData> {
  const [missions, publications, scheduled] = await Promise.all([
    loadMissionViews(companyId),
    prisma.publication.findMany({
      where: { companyId, status: { in: ["sent", "scheduled"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      include: { content: { select: { mission: { select: { title: true } } } } },
    }),
    prisma.publication.count({ where: { companyId, status: "scheduled" } }),
  ]);
  const launched = missions.filter((mission) => mission.actions.launched);
  const reports = missions.flatMap((mission) => (mission.report ? [mission.report] : []));
  const revenues = reports.flatMap((report) => (report.signedRevenue === null ? [] : [report.signedRevenue]));
  const due = missions
    .filter((mission) => mission.status === "active" && mission.stopRuleDue)
    .map((mission) => ({ mission, due: mission.stopRuleDue as string }))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  return {
    missions,
    launched,
    publications: publications.map((publication) => ({
      id: publication.id,
      contentId: publication.contentId,
      missionTitle: publication.content.mission.title,
      versionNumber: publication.versionNumber,
      channelLabel: publication.channelLabel,
      status: publication.status === "scheduled" ? "scheduled" : "sent",
      mode: publication.mode,
      at: (publication.status === "scheduled" ? publication.scheduledAt : publication.sentAt)?.toISOString() ?? null,
      recipientCount: publication.recipientCount,
    })),
    indicators: {
      diffusions: missions.reduce((sum, mission) => sum + mission.diffusions, 0),
      scheduled,
      qualifiedLeads: reports.length ? reports.reduce((sum, report) => sum + report.qualifiedLeads, 0) : null,
      signedRevenue: revenues.length ? revenues.reduce((sum, value) => sum + value, 0) : null,
    },
    nextPoint: due ? { ...due, reached: new Date(due.due) <= now } : null,
  };
}
