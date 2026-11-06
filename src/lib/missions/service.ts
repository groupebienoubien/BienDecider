import type { Mission, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { debitCredits } from "@/lib/credits";
import { MissionError } from "@/lib/missions/messages";
import { checkTransition, validateNewMission, type MissionAction, type MissionSnapshot } from "@/lib/missions/rules";
import { isMissionChannel, channelLabel } from "@/lib/missions/channels";
import type { TemplateKey } from "@/lib/missions/templates";
import { scopeSummary } from "@/lib/missions/scope";
import { writeJournal, type JournalCode } from "@/lib/journal";
import { adaptContentToChannel } from "@/lib/contents/service";
import { convertIdeaIn, lockOpenIdeaIn } from "@/lib/ideas";

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

/** Ce que les règles lisent d'une mission (aussi utilisé par Paul pour vérifier une proposition avant de la faire). */
export function missionSnapshot(mission: Mission): MissionSnapshot {
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

/**
 * Création : 0 crédit, aucune diffusion autorisée. Une demande « Sur mesure » est transmise à l'administration pour enrichir le catalogue.
 * Avec `ideaId`, la mission cadre cette idée (US #312) : l'idée est retirée dans la même transaction, ou rien n'est créé.
 */
export async function createMission(companyId: string, body: unknown, ideaId?: string): Promise<Mission> {
  return prisma.$transaction((tx) => createMissionIn(tx, companyId, body, "owner", ideaId));
}

/**
 * Création dans la transaction de l'appelant : celle du formulaire, ou celle d'une proposition de Paul acceptée
 * (mêmes contrôles, même trace J-01). `createdBy` dit d'où vient le constat : le dirigeant, ou Paul.
 * `ideaId` : idée ouverte de l'entreprise cadrée par cette mission, verrouillée d'abord ; absente, d'une autre
 * entreprise, déjà cadrée ou retirée → IdeaNotFoundError, rien n'est créé. Sinon elle est retirée et J-31 suit J-01.
 */
export async function createMissionIn(tx: Prisma.TransactionClient, companyId: string, body: unknown, createdBy: "owner" | "paul" = "owner", ideaId?: string): Promise<Mission> {
  if (ideaId !== undefined) await lockOpenIdeaIn(tx, companyId, ideaId);
  // Plafond des missions créées par le dirigeant, directement ou en acceptant une proposition de Paul (§12).
  const openMissions = await tx.mission.count({ where: { companyId, createdBy: { in: ["owner", "paul"] }, status: { not: "stopped" } } });
  const validated = validateNewMission(body, openMissions);
  if (!validated.ok) throw new MissionError(validated.code, validated.params);
  const { value } = validated;
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
      createdBy,
      position: (last._max.position ?? 0) + 1,
    },
  });
  if (value.template === "custom") {
    await tx.uncoveredRequest.create({ data: { companyId, request: `${value.title} : ${value.outcome}`.slice(0, 300), source: "mission" } });
  }
  await writeJournal(tx, { companyId, missionId: mission.id, code: "J-01", params: { titre: mission.title } });
  if (ideaId !== undefined) await convertIdeaIn(tx, companyId, ideaId, mission);
  return mission;
}

/**
 * Une transition, une transaction : contrôles, écriture et débit de crédits ensemble, ou rien.
 * La version lue protège contre une écriture concurrente (M-02).
 */
export async function applyMissionTransition(companyId: string, missionId: string, request: MissionAction, expectedVersion: number): Promise<{ mission: Mission; balance: number | null }> {
  return prisma.$transaction((tx) => applyMissionTransitionIn(tx, companyId, missionId, request, expectedVersion));
}

/**
 * La même transition dans la transaction de l'appelant (proposition de Paul acceptée) ; `expectedVersion` null
 * applique la transition à la version courante, si les règles le permettent.
 */
export async function applyMissionTransitionIn(tx: Prisma.TransactionClient, companyId: string, missionId: string, request: MissionAction, expectedVersion: number | null): Promise<{ mission: Mission; balance: number | null }> {
  const mission = await tx.mission.findFirst({ where: { id: missionId, companyId } });
  if (!mission) throw new MissionNotFoundError();
  const version = expectedVersion ?? mission.version;
  if (mission.version !== version) throw new MissionError("M-02");
  const result = checkTransition(missionSnapshot(mission), request);
  if (!result.ok) throw new MissionError(result.code, result.params);
  if (request.action === "set_priority") {
    // La priorité est un pointeur de l'entreprise : la mission ne change pas, rien n'est lancé ni suspendu.
    // Déjà la priorité choisie : rien à écrire, pas de second J-08.
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { priorityMissionId: true } });
    if (company.priorityMissionId === mission.id) return { mission, balance: null };
    await tx.company.update({ where: { id: companyId }, data: { priorityMissionId: mission.id } });
    await writeJournal(tx, { companyId, missionId: mission.id, code: "J-08", params: { mission: mission.title } });
    return { mission, balance: null };
  }
  if (result.noop) return { mission, balance: null };
  const written = await tx.mission.updateMany({
    where: { id: mission.id, companyId, version },
    data: { ...result.patch, scope: result.patch.scope as object | undefined, version: { increment: 1 } },
  });
  if (written.count === 0) throw new MissionError("M-02");
  const balance = result.debit > 0
    ? await debitCredits(tx, { companyId, amount: result.debit, kind: "mission_launch", label: `Lancement de la mission « ${mission.title} »`, missionId: mission.id })
    : null;
  // Écarter la priorité choisie la rend au calcul : la première mission non écartée (§2.2).
  if (request.action === "dismiss") await tx.company.updateMany({ where: { id: companyId, priorityMissionId: mission.id }, data: { priorityMissionId: null } });
  const updated = await tx.mission.findUniqueOrThrow({ where: { id: mission.id } });
  if (request.action === "set_channel") await adaptContentToChannel(tx, updated);
  const entry = journalFor(request, updated);
  if (entry) await writeJournal(tx, { companyId, missionId: mission.id, ...entry });
  return { mission: updated, balance };
}

/** Trace de chaque transition (§15) ; la confirmation des contacts n'a pas de code propre. */
function journalFor(request: MissionAction, mission: Mission): { code: JournalCode; params: Record<string, string> } | null {
  const params = { mission: mission.title };
  switch (request.action) {
    case "launch":
    case "resume":
      return { code: "J-17", params };
    case "pause":
      return { code: "J-18", params };
    case "dismiss":
      return { code: "J-09", params };
    case "restore":
      return { code: "J-10", params };
    case "set_outcome":
      return { code: "J-11", params: { ...params, résultat: mission.outcome } };
    case "set_scope":
      return { code: "J-12", params: { ...params, résumé: scopeSummary(mission.template as TemplateKey, mission.scope) } };
    case "set_channel":
      return { code: "J-29", params: { ...params, canal: isMissionChannel(mission.channel) ? channelLabel(mission.channel) : "hors canal" } };
    case "confirm_contacts":
      return null;
    case "set_priority":
      return { code: "J-08", params };
  }
}
