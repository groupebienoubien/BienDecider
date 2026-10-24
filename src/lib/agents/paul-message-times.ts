import { WEEKLY_REVIEW_MARKER } from "@/lib/weekly-review";

type WindowMessage = { role: string; content: string; createdAt: Date };

/**
 * Fenêtre relue par Paul, dans l'ordre chronologique, à partir des messages les plus récents
 * (du plus récent au plus ancien) : l'API exige un premier message "user", un message assistant
 * resté en tête de fenêtre est écarté (cf. loadRecentChatHistory).
 */
export function chatWindow<T extends { role: string }>(latestFirst: T[]): T[] {
  const chronological = [...latestFirst].reverse();
  const firstUser = chronological.findIndex((message) => message.role === "user");
  return firstUser === -1 ? [] : chronological.slice(firstUser);
}

/**
 * Un message de Paul : son heure (affichée) et le début du tour qui l'a produit, c'est-à-dire l'heure
 * du message du dirigeant qui le précède. Paul lit l'état pendant le tour, sa réponse n'est enregistrée
 * qu'à la fin : c'est le début du tour qui sert à comparer (story 4.2).
 */
export type PaulMessageTime = { at: Date; turnStart: Date };

/** Messages de Paul dans la fenêtre relue, sans le point hebdomadaire écrit par le cron (story 4.2). */
export function paulMessageTimes(latestFirst: WindowMessage[]): PaulMessageTime[] {
  const times: PaulMessageTime[] = [];
  let turnStart: Date | null = null;
  for (const message of chatWindow(latestFirst)) {
    if (message.role === "user") turnStart = message.createdAt;
    else if (message.role === "assistant" && turnStart && !message.content.startsWith(WEEKLY_REVIEW_MARKER)) times.push({ at: message.createdAt, turnStart });
  }
  return times;
}

/**
 * Dernier message de Paul dont le tour a commencé strictement avant le changement, à la milliseconde
 * (story 4.2) : ce qu'il a écrit dans ce tour était peut-être vrai au moment où il a lu l'état.
 * Renvoie l'heure du message ; null sans changement ou si aucun tour ne le précède.
 */
export function lastMessageBefore(messages: PaulMessageTime[], date: Date | string | null | undefined): Date | null {
  if (date === null || date === undefined) return null;
  const changedAt = new Date(date).getTime();
  if (Number.isNaN(changedAt)) return null;
  let last: PaulMessageTime | null = null;
  for (const message of messages) {
    if (message.turnStart.getTime() < changedAt && (last === null || message.turnStart.getTime() > last.turnStart.getTime()
      || (message.turnStart.getTime() === last.turnStart.getTime() && message.at.getTime() > last.at.getTime()))) last = message;
  }
  return last?.at ?? null;
}

/** Le plus récent de plusieurs instants (début et fin d'une exécution), null s'il n'y en a aucun. */
export function latestOf(...dates: (Date | string | null | undefined)[]): Date | null {
  const times = dates.filter((date): date is Date | string => date !== null && date !== undefined).map((date) => new Date(date));
  return times.length === 0 ? null : new Date(Math.max(...times.map((time) => time.getTime())));
}
