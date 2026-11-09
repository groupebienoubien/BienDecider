/**
 * Capacité disponible (#292, « Votre boussole » devenue « Vos repères ») : règles pures, sans dépendance serveur.
 * Déclarée par le dirigeant en nouveaux projets clients par mois, à reconfirmer tous les 30 jours.
 * Simple repère pour Paul : elle ne plafonne ni l'ambition ni les missions.
 */

export const CAPACITY_BOUNDS = { min: 0, max: 99 } as const;
export const CAPACITY_RECONFIRM_DAYS = 30;
const DAY_MS = 86_400_000;

export type CapacityCheck = { ok: true; capacity: number | null } | { ok: false };

/** Nombre entier de 0 à 99 (chiffres seuls, ou nombre) ; vide ou null efface la capacité (« À renseigner »). */
export function checkCapacity(value: unknown): CapacityCheck {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return { ok: true, capacity: null };
  const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,3}\s*$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(number) || number < CAPACITY_BOUNDS.min || number > CAPACITY_BOUNDS.max) return { ok: false };
  return { ok: true, capacity: number };
}

/** « 3 nouveaux projets clients par mois », « 1 nouveau projet client par mois », « Aucun nouveau projet client pour le moment ». */
export function capacityLabel(capacity: number): string {
  if (capacity === 0) return "Aucun nouveau projet client pour le moment";
  return capacity === 1 ? "1 nouveau projet client par mois" : `${capacity} nouveaux projets clients par mois`;
}

export type CapacityState =
  | { status: "missing" }
  | { status: "confirmed" | "stale"; capacity: number; label: string; confirmedAt: string | null; reconfirmBy: string };

/** Confirmée depuis moins de 30 jours : « Confirmé » ; au-delà, ou sans date : « À reconfirmer ». */
export function capacityState(capacity: number | null | undefined, confirmedAt: Date | string | null | undefined, now: Date = new Date()): CapacityState {
  if (capacity === null || capacity === undefined) return { status: "missing" };
  const at = confirmedAt ? new Date(confirmedAt) : null;
  const valid = at && !Number.isNaN(at.getTime()) ? at : null;
  const reconfirmBy = valid ? new Date(valid.getTime() + CAPACITY_RECONFIRM_DAYS * DAY_MS) : now;
  const status = valid && now.getTime() < reconfirmBy.getTime() ? "confirmed" : "stale";
  return { status, capacity, label: capacityLabel(capacity), confirmedAt: valid?.toISOString() ?? null, reconfirmBy: reconfirmBy.toISOString() };
}

/** Ligne donnée à Paul : la capacité déclarée, et « à reconfirmer » au-delà de 30 jours ; vide sans capacité. */
export function capacityPromptLine(capacity: number | null | undefined, confirmedAt: Date | string | null | undefined, now: Date = new Date()): string {
  const state = capacityState(capacity, confirmedAt, now);
  if (state.status === "missing") return "";
  const freshness = state.status === "confirmed" ? "confirmée il y a moins de 30 jours" : "déclarée il y a plus de 30 jours, à reconfirmer avec le dirigeant";
  return `Capacité disponible déclarée : ${state.label.toLowerCase()} (${freshness}). Ne propose pas plus de travail que cette capacité ; ce n'est pas une limite de l'ambition.`;
}
