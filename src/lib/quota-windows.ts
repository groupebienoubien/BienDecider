// Fenêtres des limites d'usage (story 4.1) : jour et mois commencent à minuit,
// heure de Paris, pour les deux compteurs (messages à Paul, lancements) et le budget.
import { RUNTIME_TIME_ZONE, parisDateKey } from "@/lib/agents/personas";

const PARIS_PARTS = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: RUNTIME_TIME_ZONE,
});
const MONTH_NAME = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });

/** Décalage de l'heure de Paris sur UTC à cet instant, en millisecondes (+1 h l'hiver, +2 h l'été). */
function parisOffsetMs(instant: Date): number {
  const parts = PARIS_PARTS.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Minuit à Paris d'une date du calendrier (mois de 1 à 12, débordement admis).
 * Le changement d'heure a lieu entre 2 h et 3 h : le décalage relevé à minuit
 * UTC de ce jour est celui de minuit à Paris.
 */
function parisMidnight(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  return new Date(utcMidnight - parisOffsetMs(new Date(utcMidnight)));
}

export type QuotaWindows = {
  /** Minuit à Paris aujourd'hui. */
  dayStart: Date;
  /** Minuit à Paris le 1er du mois en cours. */
  monthStart: Date;
  /** Minuit à Paris le 1er du mois suivant. */
  nextMonthStart: Date;
  /** Nom du mois suivant, pour « le 1er novembre ». */
  nextMonthName: string;
};

/** Seul calcul des fenêtres jour et mois des limites d'usage, en heure de Paris. */
export function parisQuotaWindows(now: Date): QuotaWindows {
  const key = parisDateKey(now);
  const [year, month, day] = [Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10))];
  return {
    dayStart: parisMidnight(year, month, day),
    monthStart: parisMidnight(year, month, 1),
    nextMonthStart: parisMidnight(year, month + 1, 1),
    nextMonthName: MONTH_NAME.format(new Date(Date.UTC(year, month, 1))),
  };
}

/** Réservations qui comptent comme messages à Paul (« Préremplir mon profil » compris) ; toute autre réservation, mise en ligne du site comprise, est un lancement. */
export const CHAT_USAGE_PURPOSES = ["co_ceo_chat", "onboarding_interpret"] as const;

/** Compteur vérifié par un appel : messages à Paul ou lancements d'agents. Le budget est commun aux deux. */
export type UsageCounter = "chat" | "runs";

export function usageCounterFor(purpose: string): UsageCounter {
  return (CHAT_USAGE_PURPOSES as readonly string[]).includes(purpose) ? "chat" : "runs";
}
