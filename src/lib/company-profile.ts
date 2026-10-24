/**
 * Règles des champs texte du profil, partagées par la page Entreprise
 * (POST /api/companies) et les cartes de profil de Paul (update_profile) :
 * une seule règle de longueur et de nettoyage. Module pur, sans accès base.
 */

/** Longueur maximale de chaque champ texte facultatif, mesurée après rognage des espaces. */
export const PROFILE_TEXT_LIMITS = {
  website: 500,
  socialHandles: 500,
  objective: 500,
  description: 2000,
  phone: 100,
  certifications: 500,
  openingHours: 500,
  ownerName: 120,
} as const;
export type ProfileTextField = keyof typeof PROFILE_TEXT_LIMITS;

/** Écart à la règle d'un champ texte (rogné, puis mesuré) : null si la valeur est acceptable (absente comprise). */
export function profileTextIssue(field: ProfileTextField, value: unknown): "not_text" | "too_long" | null {
  if (value == null) return null;
  if (typeof value !== "string") return "not_text";
  return value.trim().length > PROFILE_TEXT_LIMITS[field] ? "too_long" : null;
}

/** Nettoyage : texte rogné, texte vide = champ effacé (null), absent = inchangé (undefined). */
export function clearableText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return typeof value === "string" ? value.trim() || null : null;
}

/**
 * Prénom et nom du dirigeant, repris dans tous les prompts : espaces, retours à
 * la ligne et caractères de contrôle ramenés à une espace, guillemets « » retirés.
 */
export function cleanOwnerName(value: string): string {
  return value.replace(/[\s\p{Cc}«»]+/gu, " ").trim();
}

/** Nettoyage d'un champ du profil à l'enregistrement (page Entreprise, compléments, carte de Paul). */
export function cleanProfileText(field: ProfileTextField, value: unknown): string | null | undefined {
  const text = clearableText(value);
  if (field !== "ownerName" || typeof text !== "string") return text;
  return cleanOwnerName(text) || null;
}

/** Champs que Paul peut proposer de modifier ; nom commercial, métier et zone restent sur la page Entreprise. */
export const PAUL_PROFILE_FIELDS = ["ownerName", "website", "socialHandles", "phone", "openingHours", "description"] as const;
export type PaulProfileField = (typeof PAUL_PROFILE_FIELDS)[number];

/** Libellés de la page Entreprise (sans la mention « facultatif »). */
export const PROFILE_FIELD_LABELS: Record<PaulProfileField, string> = {
  ownerName: "Votre prénom et nom",
  website: "Site web",
  socialHandles: "Compte Instagram ou Facebook",
  phone: "Téléphone affiché aux clients",
  openingHours: "Horaires d'ouverture",
  description: "Décrivez votre entreprise, votre savoir-faire et ce qui vous différencie",
};
