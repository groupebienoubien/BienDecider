import type { Mission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { debitCredits } from "@/lib/credits";
import { MissionError } from "@/lib/missions/messages";
import { checkTransition, validateNewMission, type MissionAction, type MissionSnapshot } from "@/lib/missions/rules";
import { isMissionChannel } from "@/lib/missions/channels";
import type { TemplateKey } from "@/lib/missions/templates";

export class MissionNotFoundError extends Error {
  constructor() {
    super("Mission introuvable");
    this.name = "MissionNotFoundError";
  }
}

const ACTIONS = ["launch", "resume", "pause", "dismiss", "restore", "confirm_contacts", "set_channel", "set_outcome", "set_scope"] as const;

/** Forme de la demande de transition ; null si le corps n'est pas une demande lisible (400). */
export function parseTransitionBody(body: unknown): { request: MissionAction; expectedVersion: number } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const action = ACTIONS.find((candidate) => candidate === input.action);
  if (!action || typeof input.expectedVersion !== "number" || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) return null;
  const request: MissionAction = action === "set_channel" ? { action, channel: input.channel } : action === "set_outcome" ? { action, outcome: input.outcome } : action === "set_scope" ? { action, scope: input.scope } : { action };
  return { request, expectedVersion: input.expectedVersion };
}

function snapshot(mission: Mission): MissionSnapshot {
  return {
    template: mission.template as TemplateKey,
    channel: isMissionChannel(mission.channel) ? mission.channel : null,
    status: mission.status as MissionSnapshot["status"],
    previousStatus: mission.previousStatus as MissionSnapshot["previousStatus"],
    scope: mission.scope !== null && typeof mission.scope === "object" && !Array.isArray(mission.scope) ? (mission.scope as Record<string, unknown>) : {},
    contactsConfirmedAt: mission.contactsConfirmedAt,
    firstLaunchedAt: mission.firstLaunchedAt,
    hasValidatedVersion: mission.hasValidatedVersion,
  };
}

export async function listMissions(companyId: string): Promise<Mission[]> {
  return prisma.mission.findMany({ where: { companyId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
}

/** Création : 0 crédit, aucune diffusion autorisée. Une demande « Sur mesure » est transmise à l'administration pour enrichir le catalogue. */
export async function createMission(companyId: string, body: unknown): Promise<Mission> {
  const openOwnerMissions = await prisma.mission.count({ where: { companyId, createdBy: "owner", status: { not: "stopped" } } });
  const validated = validateNewMission(body, openOwnerMissions);
  if (!validated.ok) throw new MissionError(validated.code, validated.params);
  const { value } = validated;
  return prisma.$transaction(async (tx) => {
    const last = await tx.mission.aggregate({ where: { companyId }, _max: { position: true } });
    const mission = await tx.mission.create({
      data: {
        companyId,
        template: value.template,
        channel: value.channel,
        stopRuleDays: value.stopRuleDays,
        title: value.title,
        outcome: value.outcome,
        originalOutcome: value.outcome,
        finding: value.finding,
        scope: value.scope as object,
        createdBy: "owner",
        position: (last._max.position ?? 0) + 1,
      },
    });
    if (value.template === "custom") {
      await tx.uncoveredRequest.create({ data: { companyId, request: `${value.title} : ${value.outcome}`.slice(0, 300), source: "mission" } });
    }
    return mission;
  });
}

/**
 * Une transition, une transaction : contrôles, écriture et débit de crédits ensemble, ou rien.
 * La version lue protège contre une écriture concurrente (M-02).
 */
export async function applyMissionTransition(companyId: string, missionId: string, request: MissionAction, expectedVersion: number): Promise<{ mission: Mission; balance: number | null }> {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.mission.findFirst({ where: { id: missionId, companyId } });
    if (!mission) throw new MissionNotFoundError();
    if (mission.version !== expectedVersion) throw new MissionError("M-02");
    const result = checkTransition(snapshot(mission), request);
    if (!result.ok) throw new MissionError(result.code, result.params);
    if (result.noop) return { mission, balance: null };
    const written = await tx.mission.updateMany({
      where: { id: mission.id, companyId, version: expectedVersion },
      data: { ...result.patch, scope: result.patch.scope as object | undefined, version: { increment: 1 } },
    });
    if (written.count === 0) throw new MissionError("M-02");
    const balance = result.debit > 0
      ? await debitCredits(tx, { companyId, amount: result.debit, kind: "mission_launch", label: `Lancement de la mission « ${mission.title} »`, missionId: mission.id })
      : null;
    return { mission: await tx.mission.findUniqueOrThrow({ where: { id: mission.id } }), balance };
  });
}
