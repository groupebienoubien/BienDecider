// Règles pures du plafond d'inscriptions (story 6.1, #274) : sans base de données, testables sans réseau.
import { parisDateKey } from "@/lib/agents/personas";
import { parisQuotaWindows } from "@/lib/quota-windows";

export type SignupControlState = { open: boolean; dailyCap: number | null };
export type SignupAvailability = "open" | "closed" | "full";

/** Sans réglage enregistré : comportement d'avant la story 6.1. */
export const DEFAULT_SIGNUP_CONTROL: SignupControlState = { open: true, dailyCap: null };
export const MAX_DAILY_SIGNUP_CAP = 10_000;
export const SIGNUP_ALERT_RATIO = 0.8;

export const SIGNUP_CLOSED_MESSAGE = "Les inscriptions sont fermées pour le moment.";
export const SIGNUP_FULL_MESSAGE = "Inscriptions complètes aujourd'hui, revenez demain.";

export function signupAvailability(control: SignupControlState, todayCount: number): SignupAvailability {
  if (!control.open) return "closed";
  if (control.dailyCap !== null && todayCount >= control.dailyCap) return "full";
  return "open";
}

/** Vrai quand le compteur du jour atteint 80 % du plafond ou plus. */
export function signupCapAlert(control: SignupControlState, todayCount: number): boolean {
  return control.dailyCap !== null && control.dailyCap > 0 && todayCount >= control.dailyCap * SIGNUP_ALERT_RATIO;
}

/** Jour d'inscription, AAAA-MM-JJ en heure de Paris (même fenêtre que les quotas d'usage). */
export function signupDayKey(now: Date): string {
  return parisDateKey(now);
}

/** Secondes jusqu'au prochain minuit à Paris, pour `Retry-After`. */
export function secondsUntilNextSignupDay(now: Date): number {
  const { dayStart } = parisQuotaWindows(now);
  // Un jour dure 23, 24 ou 25 h : 25 h après minuit tombe toujours le jour suivant.
  const nextDayStart = parisQuotaWindows(new Date(dayStart.getTime() + 25 * 3_600_000)).dayStart;
  return Math.max(1, Math.ceil((nextDayStart.getTime() - now.getTime()) / 1000));
}

export function parseSignupControlInput(body: unknown): { ok: true; value: SignupControlState } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const { open, dailyCap } = body as Record<string, unknown>;
  if (typeof open !== "boolean") return { ok: false, error: "Indiquez si les inscriptions sont ouvertes ou fermées." };
  if (dailyCap === null || dailyCap === undefined) return { ok: true, value: { open, dailyCap: null } };
  if (typeof dailyCap !== "number" || !Number.isInteger(dailyCap) || dailyCap < 1 || dailyCap > MAX_DAILY_SIGNUP_CAP) {
    return { ok: false, error: `Le plafond doit être un nombre entier de 1 à ${MAX_DAILY_SIGNUP_CAP}, ou vide pour aucun plafond.` };
  }
  return { ok: true, value: { open, dailyCap } };
}
