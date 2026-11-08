/**
 * Règles des champs texte du profil, partagées par la page Entreprise
 * (POST /api/companies) et les cartes de profil de Paul (update_profile) :
 * une seule règle de longueur et de nettoyage. Module pur, sans accès base.
 */
import type { ProfileOrigin } from "@/lib/onboarding/draft-rules";

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

/** Valeur du profil reprise sur une ligne de consigne : texte brut, retours à la ligne et caractères de contrôle ramenés à une espace. */
function oneLine(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s\p{Cc}]+/gu, " ").replace(/^\s+|[\s.]+$/g, "");
}

/**
 * Clients prioritaires et offres principales confirmés à l'étape 2 (#281), repris dans toute consigne qui présente
 * l'entreprise : « Clients prioritaires : …. Offres principales : …. », seulement ce qui est renseigné ("" sinon).
 */
export function companyFocusText(company: { targetClients?: string | null; offers?: string | null }): string {
  const parts: string[] = [];
  const targetClients = oneLine(company.targetClients);
  const offers = oneLine(company.offers);
  if (targetClients) parts.push(`Clients prioritaires : ${targetClients}.`);
  if (offers) parts.push(`Offres principales : ${offers}.`);
  return parts.join(" ");
}

/**
 * Ligne « Entreprise » des consignes de Paul et des agents (#281) : nom, métier et zone de chalandise, puis les clients
 * prioritaires et les offres principales confirmés à l'étape 2, seulement s'ils sont renseignés.
 */
export function companyContextLine(company: { name: string; trade: string; servingArea: string; targetClients?: string | null; offers?: string | null }): string {
  const focus = companyFocusText(company);
  return `Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.${focus ? ` ${focus}` : ""}`;
}

/** Nettoyage d'un champ du profil à l'enregistrement (page Entreprise, compléments, carte de Paul). */
export function cleanProfileText(field: ProfileTextField, value: unknown): string | null | undefined {
  const text = clearableText(value);
  if (field !== "ownerName" || typeof text !== "string") return text;
  return cleanOwnerName(text) || null;
}

/**
 * Vrai si au moins un champ demandé change réellement (J-02, §4.5) : un champ absent (undefined) est inchangé,
 * les dates sont comparées par leur instant, et une valeur renvoyée à l'identique ne compte pas.
 */
export function profileChanges(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return Object.entries(after).some(([field, value]) => {
    if (value === undefined) return false;
    const previous = before[field] ?? null;
    if (value instanceof Date || previous instanceof Date) {
      const time = (date: unknown) => (date instanceof Date ? date.getTime() : date);
      return time(value) !== time(previous);
    }
    return value !== previous;
  });
}

/**
 * « Corriger mon profil » (#169) : les sept champs confirmés au parcours d'entrée, dans l'ordre de la page Entreprise.
 * Clés de `Company` ; `name` est l'entreprise (`companyName` du brouillon).
 */
export const CORRECTION_FIELDS = ["firstName", "name", "location", "trade", "servingArea", "targetClients", "offers"] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

/** Origine d'une information du profil : lue sur le site, proposée par Paul, déclarée par le dirigeant, ou vide (celle de l'étape 2). */
export type CompanyOrigin = ProfileOrigin;
export type ProfileOrigins = Partial<Record<CorrectionField, CompanyOrigin>>;

/** Étiquettes d'origine de la page Entreprise (décision de Samir du 2026-11-08). */
export const COMPANY_ORIGIN_LABELS: Record<CompanyOrigin, string> = {
  observed: "Lu sur le site",
  hypothesis: "Proposé par Paul, confirmé par vous",
  declared: "Déclaré par vous",
  missing: "À renseigner par vous",
};

const ORIGINS = Object.keys(COMPANY_ORIGIN_LABELS) as CompanyOrigin[];

export function companyOriginLabel(origin: CompanyOrigin | undefined): string | null {
  return origin ? COMPANY_ORIGIN_LABELS[origin] : null;
}

/** Lecture défensive de `Company.profileOrigins` : null pour un compte d'avant #169 ; toute entrée illisible est ignorée. */
export function readProfileOrigins(value: unknown): ProfileOrigins | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const origins: ProfileOrigins = {};
  for (const field of CORRECTION_FIELDS) {
    const origin = raw[field];
    if (typeof origin === "string" && (ORIGINS as string[]).includes(origin)) origins[field] = origin as CompanyOrigin;
  }
  return origins;
}

/**
 * Origines après une correction : un champ absent (undefined) ou inchangé garde la sienne, un champ vidé passe à « missing »,
 * un champ modifié à « declared ». Un compte d'avant #169 (null) reste sans origine.
 */
export function nextProfileOrigins(before: Record<string, unknown>, after: Record<string, unknown>, origins: ProfileOrigins | null): ProfileOrigins | null {
  if (!origins) return null;
  const next: ProfileOrigins = { ...origins };
  for (const field of CORRECTION_FIELDS) {
    const value = after[field];
    if (value === undefined) continue;
    const previous = before[field] ?? "";
    // "" et null sont un même champ vide : vide avant et après, l'origine ne change pas.
    if (value === null || value === "") {
      if (previous !== "") next[field] = "missing";
    } else if (value !== previous) next[field] = "declared";
  }
  return next;
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
