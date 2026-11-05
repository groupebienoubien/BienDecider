import type { Prisma } from "@prisma/client";

/** Journal des décisions (spécification §15) : un code et ses paramètres ; le texte est rendu à l'affichage, jamais stocké. */
export const JOURNAL_TEXTS = {
  "J-01": "Mission créée avec Paul : {titre}. Périmètre et brouillon à vérifier avant lancement.",
  "J-09": "Mission écartée du plan : {mission}.",
  "J-10": "Mission remise au plan : {mission}.",
  "J-11": "Objectif modifié · {mission} : « {résultat} ».",
  "J-12": "Périmètre modifié · {mission} : {résumé}.",
  "J-17": "Mission lancée (ou reprise) : {mission}. Paul prépare le premier contenu.",
  "J-18": "Mission suspendue : {mission}. Programmations annulées.",
  "J-19": "V{n} {origine} · {mission}.",
  "J-20": "V{n} validée : {titre}. Aucun envoi effectué.",
  "J-22": "V{n} publiée sur {canal}{destinataires}. Version désormais en lecture seule.",
  "J-23": "Programmation de V{n} annulée : {raison}. La version reste validée.",
  "J-24": "V{n} diffusée par vous sur {canal}, déclarée le {date}.",
  "J-25": "Résultat de V{n} vérifié : {résultat}.",
  "J-26": "Règle de collaboration mise à jour : {niveau}.{suite}",
  "J-27": "V{n} refusée : {motif}.",
  "J-28": "Échec de diffusion de V{n} sur {canal} : {motif}.",
  "J-29": "Canal de la mission changé · {mission} : {canal}. Nouvelle version du brouillon à relire.",
} as const;

export type JournalCode = keyof typeof JOURNAL_TEXTS;
export type JournalActor = "owner" | "paul" | "system";

export function renderJournal(code: JournalCode, params: Record<string, string>): string {
  return JOURNAL_TEXTS[code].replace(/\{([^}]+)\}/g, (whole, name: string) => params[name] ?? whole);
}

/** Écrit dans la transaction de la décision qu'il trace : la décision et sa trace existent ensemble, ou aucune. */
export async function writeJournal(tx: Prisma.TransactionClient, entry: { companyId: string; missionId?: string; code: JournalCode; params: Record<string, string>; actor?: JournalActor }): Promise<void> {
  await tx.journalEntry.create({ data: { companyId: entry.companyId, missionId: entry.missionId, code: entry.code, actor: entry.actor ?? "owner", params: entry.params } });
}
