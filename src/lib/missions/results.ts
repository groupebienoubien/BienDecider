import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MissionError } from "@/lib/missions/messages";
import { checkDecision, validateReport, type DecisionChoice } from "@/lib/missions/report";
import type { MissionStatus } from "@/lib/missions/rules";
import { writeJournal } from "@/lib/journal";
import { cancelScheduledPublications } from "@/lib/contents/publish";
import { MissionNotFoundError } from "@/lib/missions/service";

type Tx = Prisma.TransactionClient;

/** Diffusions de la mission, confirmées ou déclarées. */
export function countDiffusions(client: Tx | typeof prisma, missionId: string): Promise<number> {
  return client.publication.count({ where: { missionId, status: "sent" } });
}

async function lockMission(tx: Tx, companyId: string, missionId: string) {
  const mission = await tx.mission.findFirst({ where: { id: missionId, companyId } });
  if (!mission) throw new MissionNotFoundError();
  return mission;
}

/** Bilan (§7.1) : au moins une diffusion (M-37) ; il enregistre le nombre de diffusions et se journalise (J-15). */
export async function saveMissionReport(companyId: string, missionId: string, body: unknown) {
  const checked = validateReport(body);
  if (!checked.ok) throw new MissionError(checked.code);
  return prisma.$transaction(async (tx) => {
    const mission = await lockMission(tx, companyId, missionId);
    const diffusions = await countDiffusions(tx, missionId);
    if (diffusions === 0) throw new MissionError("M-37");
    const report = await tx.missionReport.create({ data: { missionId, ...checked.value, publicationCount: diffusions } });
    const ca = checked.value.signedRevenue === null ? "" : `, ${checked.value.signedRevenue.toLocaleString("fr-FR")} € signés`;
    await writeJournal(tx, { companyId, missionId, code: "J-15", params: { mission: mission.title, n: String(checked.value.qualifiedLeads), m: String(checked.value.meetings), ca } });
    return report;
  });
}

const CHOICES: readonly DecisionChoice[] = ["continue", "stop"];

export function parseDecisionBody(body: unknown): { choice: DecisionChoice; expectedVersion: number } | null {
  const input = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const choice = CHOICES.find((candidate) => candidate === input.choice);
  if (!choice || typeof input.expectedVersion !== "number" || !Number.isInteger(input.expectedVersion)) return null;
  return { choice, expectedVersion: input.expectedVersion };
}

/**
 * Décision de suite (§7.2) : « Poursuivre » garde le cadre ; « Arrêter » clôt la mission et annule ses programmations.
 * La version lue protège contre une décision concurrente (M-02) ; la décision et sa trace J-14 sont écrites ensemble.
 */
export async function decideMission(companyId: string, missionId: string, choice: DecisionChoice, expectedVersion: number) {
  return prisma.$transaction(async (tx) => {
    const mission = await lockMission(tx, companyId, missionId);
    if (mission.version !== expectedVersion) throw new MissionError("M-02");
    const diffusions = await countDiffusions(tx, missionId);
    const report = await tx.missionReport.findFirst({ where: { missionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const refusal = checkDecision({ status: mission.status as MissionStatus, diffusions, reportAt: report?.publicationCount ?? null }, choice);
    if (refusal) throw new MissionError(refusal);
    const written = await tx.mission.updateMany({
      where: { id: missionId, version: expectedVersion },
      data: { ...(choice === "stop" ? { status: "stopped" } : {}), version: { increment: 1 } },
    });
    if (written.count === 0) throw new MissionError("M-02");
    if (choice === "stop") {
      await cancelScheduledPublications(tx, { companyId, missionId }, "mission arrêtée", "owner");
      await tx.company.updateMany({ where: { id: companyId, priorityMissionId: missionId }, data: { priorityMissionId: null } });
    }
    const decision = await tx.missionDecision.create({ data: { missionId, choice, publicationCount: diffusions, reportId: report?.id ?? null } });
    await writeJournal(tx, { companyId, missionId, code: "J-14", params: { mission: mission.title, décision: choice === "stop" ? "arrêt, programmations annulées" : "poursuite, mêmes limites" } });
    return decision;
  });
}
