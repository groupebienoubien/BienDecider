import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeJournal } from "@/lib/journal";
import { MissionError } from "@/lib/missions/messages";
import { IDEA_MAX, isIdeaId, validateIdeaText } from "@/lib/idea-text";

export { IDEA_MAX, IDEA_TEXT_MAX, ideaFrameHref, validateIdeaText } from "@/lib/idea-text";

/**
 * Idées notées avec Paul (FR-17, FR-25, addendum §4.5) : une envie qui n'est pas encore une mission.
 * Notée seulement en acceptant la carte « Noter l'idée » de Paul ; retirée par « Retirer l'idée » ;
 * cadrée en mission par createMissionIn, qui la retire dans la même transaction. Ouverte = convertedMissionId nul.
 */

/** Idée absente, d'une autre entreprise, déjà cadrée ou retirée (404, rien n'est écrit). */
export class IdeaNotFoundError extends Error {
  constructor() {
    super("Idée introuvable");
    this.name = "IdeaNotFoundError";
  }
}

const OPEN = { convertedMissionId: null } as const;

/** Verrou de l'entreprise : deux notes simultanées ne dépassent pas le plafond. */
async function lockCompany(tx: Prisma.TransactionClient, companyId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
}

export async function countOpenIdeas(db: Prisma.TransactionClient, companyId: string): Promise<number> {
  return db.idea.count({ where: { companyId, ...OPEN } });
}

/** Note une idée dans la transaction de l'appelant (carte de Paul acceptée) : M-62, M-63, puis J-16. */
export async function noteIdeaIn(tx: Prisma.TransactionClient, companyId: string, text: unknown): Promise<Idea> {
  const checked = validateIdeaText(text);
  if (!checked.ok) throw new MissionError(checked.code);
  await lockCompany(tx, companyId);
  if (await countOpenIdeas(tx, companyId) >= IDEA_MAX) throw new MissionError("M-63");
  const idea = await tx.idea.create({ data: { companyId, text: checked.text } });
  await writeJournal(tx, { companyId, code: "J-16", params: { idée: idea.text } });
  return idea;
}

/** « Retirer l'idée » : supprimée et tracée (J-30) ; null si absente, d'une autre entreprise ou déjà cadrée. */
export async function removeIdea(companyId: string, id: string): Promise<Idea | null> {
  if (!isIdeaId(id)) return null;
  return prisma.$transaction(async (tx) => {
    const idea = await tx.idea.findFirst({ where: { id, companyId, ...OPEN } });
    if (!idea) return null;
    const removed = await tx.idea.deleteMany({ where: { id, companyId, ...OPEN } });
    if (removed.count === 0) return null;
    await writeJournal(tx, { companyId, code: "J-30", params: { idée: idea.text } });
    return idea;
  });
}

/** Idées ouvertes, de la plus ancienne à la plus récente. */
export async function listOpenIdeas(companyId: string): Promise<Idea[]> {
  return prisma.idea.findMany({ where: { companyId, ...OPEN }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

/** Idée ouverte de l'entreprise, ou null (préremplissage du formulaire). */
export async function findOpenIdea(companyId: string, id: unknown): Promise<Idea | null> {
  if (!isIdeaId(id)) return null;
  return prisma.idea.findFirst({ where: { id, companyId, ...OPEN } });
}

/**
 * Verrouille l'idée ouverte de l'entreprise avant de la cadrer : un double envoi ou un retrait simultané
 * attend la fin de la transaction, puis ne la trouve plus ouverte.
 */
export async function lockOpenIdeaIn(tx: Prisma.TransactionClient, companyId: string, id: unknown): Promise<Idea> {
  if (!isIdeaId(id)) throw new IdeaNotFoundError();
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Idea" WHERE "id" = ${id} AND "companyId" = ${companyId} AND "convertedMissionId" IS NULL FOR UPDATE`;
  if (locked.length === 0) throw new IdeaNotFoundError();
  return tx.idea.findUniqueOrThrow({ where: { id } });
}

/** Retire l'idée cadrée (convertedMissionId posé) et trace J-31, dans la transaction de création de la mission. */
export async function convertIdeaIn(tx: Prisma.TransactionClient, companyId: string, ideaId: string, mission: { id: string; title: string }): Promise<void> {
  const converted = await tx.idea.updateMany({ where: { id: ideaId, companyId, ...OPEN }, data: { convertedMissionId: mission.id } });
  // Impossible après lockOpenIdeaIn : erreur brute, pour que la transaction (et la mission) soit annulée même si l'appelant rattrape IdeaNotFoundError.
  if (converted.count === 0) throw new Error("Idée verrouillée introuvable au cadrage");
  await writeJournal(tx, { companyId, missionId: mission.id, code: "J-31", params: { mission: mission.title } });
}
