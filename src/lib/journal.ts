import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { channelLabel, type MissionChannel } from "@/lib/missions/channels";

/** Journal des décisions (spécification §15) : un code et ses paramètres ; le texte est rendu à l'affichage, jamais stocké. */
export const JOURNAL_TEXTS = {
  "J-01": "Mission créée avec Paul : {titre}. Périmètre et brouillon à vérifier avant lancement.",
  "J-02": "Profil corrigé. Les contenus doivent être relus et les programmations ont été annulées.",
  "J-03": "Cap mis à jour avec Paul : {cap}.",
  "J-04": "Profil et ambition confirmés. Aucune mission lancée.",
  "J-07": "{canal} {suite}.",
  "J-08": "Priorité confirmée avec Paul : {mission}. Aucune mission lancée automatiquement.",
  "J-09": "Mission écartée du plan : {mission}.",
  "J-10": "Mission remise au plan : {mission}.",
  "J-11": "Objectif modifié · {mission} : « {résultat} ».",
  "J-12": "Périmètre modifié · {mission} : {résumé}.",
  "J-14": "Décision de fin de test · {mission} : {décision}.",
  "J-15": "Bilan déclaré · {mission} : {n} demande(s), {m} rendez-vous{ca}. Attribution déclarative, non vérifiée.",
  "J-16": "Idée notée avec Paul : « {idée} ». À cadrer avant tout lancement.",
  "J-17": "Mission lancée (ou reprise) : {mission}. Paul prépare le premier contenu.",
  "J-18": "Mission suspendue : {mission}. Programmations annulées.",
  "J-19": "V{n} {origine} · {mission}.",
  "J-20": "V{n} validée : {titre}. Aucun envoi effectué.",
  "J-21": "V{n} programmée sur {canal} le {date}.",
  "J-22": "V{n} publiée sur {canal}{destinataires}. Version désormais en lecture seule.",
  "J-23": "Programmation de V{n} annulée : {raison}. La version reste validée.",
  "J-24": "V{n} diffusée par vous sur {canal}, déclarée le {date}.",
  "J-25": "Résultat de V{n} vérifié : {résultat}.",
  "J-26": "Règle de collaboration mise à jour : {niveau}.{suite}",
  "J-27": "V{n} refusée : {motif}.",
  "J-28": "Échec de diffusion de V{n} sur {canal} : {motif}.",
  "J-29": "Canal de la mission changé · {mission} : {canal}. Nouvelle version du brouillon à relire.",
  "J-30": "Idée retirée : « {idée} ».",
  "J-31": "Idée cadrée en mission : {mission}.",
  "J-32": "Identité de marque confirmée. Le visuel doit être validé à nouveau.",
  "J-33": "Logo {action}. Le visuel doit être validé à nouveau.",
} as const;

export type JournalCode = keyof typeof JOURNAL_TEXTS;
export type JournalActor = "owner" | "paul" | "system";

/** Auteurs affichés (charte §3 et §8) : « vous », « Paul » ou « mise à jour automatique », rien d'autre. */
export const JOURNAL_ACTOR_LABELS: Record<JournalActor, string> = { owner: "vous", paul: "Paul", system: "mise à jour automatique" };

export function journalActorLabel(actor: string): string {
  return Object.prototype.hasOwnProperty.call(JOURNAL_ACTOR_LABELS, actor) ? JOURNAL_ACTOR_LABELS[actor as JournalActor] : JOURNAL_ACTOR_LABELS.owner;
}

export function isJournalCode(code: string): code is JournalCode {
  return Object.prototype.hasOwnProperty.call(JOURNAL_TEXTS, code);
}

/** Texte d'une entrée : un paramètre absent (ou illisible) s'affiche « — », jamais « {x} ». */
export function renderJournal(code: JournalCode, params: Record<string, unknown>): string {
  return JOURNAL_TEXTS[code].replace(/\{([^}]+)\}/g, (_whole, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
    return typeof value === "string" || typeof value === "number" ? String(value) : "—";
  });
}

/** Libellés de canal au féminin (« Page Facebook », « Fiche établissement Google ») : l'accord suit le libellé affiché. */
const FEMININE_CHANNELS: readonly MissionChannel[] = ["facebook", "google_business_profile"];

/** Paramètres de J-07 : la variante (connecté, ou déconnecté avec le nombre de programmations annulées) est portée par `suite`. */
export function channelJournalParams(channel: MissionChannel, cancelled?: number): Record<string, string> {
  const agreement = FEMININE_CHANNELS.includes(channel) ? "e" : "";
  return { canal: channelLabel(channel), suite: cancelled === undefined ? `connecté${agreement}` : `déconnecté${agreement} : ${cancelled} programmation(s) annulée(s)` };
}

/** Écrit dans la transaction de la décision qu'il trace : la décision et sa trace existent ensemble, ou aucune. */
export async function writeJournal(tx: Prisma.TransactionClient, entry: { companyId: string; missionId?: string; code: JournalCode; params: Record<string, string>; actor?: JournalActor }): Promise<void> {
  await tx.journalEntry.create({ data: { companyId: entry.companyId, missionId: entry.missionId, code: entry.code, actor: entry.actor ?? "owner", params: entry.params } });
}

export type JournalRow = { id: string; createdAt: Date; author: string; mission: string | null; text: string };

/** Lignes d'affichage, des plus récentes aux plus anciennes ; `titles` donne le titre des missions encore présentes. */
export function journalRows(
  entries: readonly { id: string; createdAt: Date; code: string; actor: string; params: Prisma.JsonValue; missionId: string | null }[],
  titles: ReadonlyMap<string, string>,
): JournalRow[] {
  return [...entries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((entry) => {
      const params = entry.params !== null && typeof entry.params === "object" && !Array.isArray(entry.params) ? (entry.params as Record<string, unknown>) : {};
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        author: journalActorLabel(entry.actor),
        mission: entry.missionId ? titles.get(entry.missionId) ?? null : null,
        text: isJournalCode(entry.code) ? renderJournal(entry.code, params) : "—",
      };
    });
}

/** Journal de l'entreprise connectée seulement (FR-50), une source pour la page Résultats et l'export. */
export async function listJournal(companyId: string): Promise<JournalRow[]> {
  const entries = await prisma.journalEntry.findMany({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const missionIds = [...new Set(entries.map((entry) => entry.missionId).filter((id): id is string => id !== null))];
  const missions = missionIds.length ? await prisma.mission.findMany({ where: { companyId, id: { in: missionIds } }, select: { id: true, title: true } }) : [];
  return journalRows(entries, new Map(missions.map((mission) => [mission.id, mission.title])));
}

const CSV_DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** Cellule CSV : une formule possible (tabulation ou retour chariot en tête, = + - @ en tête même après des espaces) est neutralisée par une apostrophe, puis le champ est entouré de guillemets doublés. */
export function csvCell(value: string): string {
  const safe = /^[\t\r]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export du journal (FR-50, NFR-12) : UTF-8 avec BOM, séparateur « ; », plus ancien d'abord ; colonnes date, auteur, mission, décision. */
export function journalCsv(rows: readonly Pick<JournalRow, "id" | "createdAt" | "author" | "mission" | "text">[]): string {
  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lines = [["Date", "Auteur", "Mission", "Décision"], ...ordered.map((row) => [CSV_DATE.format(row.createdAt), row.author, row.mission ?? "—", row.text])];
  return `﻿${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
