import { MISSION_MESSAGES } from "@/lib/missions/messages";

/** Niveaux de délégation (spécification §9, #36) : ce que BienDecider peut faire sans redemander. */
export const DELEGATION_LEVELS = ["prepare", "review", "bounded"] as const;
export type DelegationLevel = (typeof DELEGATION_LEVELS)[number];

export const DELEGATION_LABELS: Record<DelegationLevel, string> = {
  prepare: "Préparer seulement",
  review: "Valider avant chaque action",
  bounded: "Déléguer dans un cadre précis",
};

export const DELEGATION_DETAILS: Record<DelegationLevel, string> = {
  prepare: "Paul prépare dans les missions en cours ; vous diffusez vous-même puis le déclarez. BienDecider ne diffuse rien.",
  review: "Chaque version est validée par vous, chaque diffusion confirmée. Conseillé pour démarrer.",
  bounded: "Paul prépare analyses et brouillons sans demande dans les missions en cours ; diffusions, premiers contacts et dépenses restent confirmés par vous.",
};

export function asDelegationLevel(value: unknown): DelegationLevel {
  return (DELEGATION_LEVELS as readonly unknown[]).includes(value) ? (value as DelegationLevel) : "review";
}

/** « Préparer seulement » interdit toute diffusion externe, même si l'interface est contournée (#295). */
export function prepareOnlyRefusal(company: { delegationLevel: string }): { code: "M-55"; error: string } | null {
  return asDelegationLevel(company.delegationLevel) === "prepare" ? { code: "M-55", error: MISSION_MESSAGES["M-55"] } : null;
}
