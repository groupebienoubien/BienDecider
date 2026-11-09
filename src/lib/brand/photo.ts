import { SITE_PHOTO_ALT_MAX, checkSitePhoto, type SitePhotoCheck, type SitePhotoType } from "../site/photos.ts";

/**
 * Photo d'un visuel (#291, FR-30 et FR-41) : contrôles purs, sans base ni réseau.
 * 1 Mo au plus, comme la maquette : le navigateur réduit la photo avant l'envoi, le serveur contrôle le type réel,
 * la taille et l'en-tête image sans se fier au nom ni au type annoncés.
 */
export const VISUAL_PHOTO_MAX_BYTES = 1024 * 1024;
export const VISUAL_PHOTO_TOO_LARGE = "1 Mo au plus pour la photo d'un visuel.";
export const VISUAL_PHOTO_ALT_REQUIRED = `Décrivez la photo en quelques mots (${SITE_PHOTO_ALT_MAX} caractères au plus).`;
export const VISUAL_PHOTO_NOTE = "Photo importée par vous, droits à reconfirmer";
export const VISUAL_PHOTO_REMOVED_NOTE = "Photo retirée par vous";
export const VISUAL_RIGHTS_LABEL = "Je confirme le visuel et les droits d'utilisation";

/** Photo portée par une version : la référence au fichier, jamais le fichier lui-même. */
export type VisualPhoto = { url: string; pathname: string; alt: string; width: number; height: number };

export function checkVisualPhoto(bytes: Uint8Array): SitePhotoCheck {
  if (bytes.length > VISUAL_PHOTO_MAX_BYTES) return { ok: false, status: 413, error: VISUAL_PHOTO_TOO_LARGE };
  return checkSitePhoto(bytes);
}

/** Texte alternatif obligatoire : une ligne, sans balise, 1 à 200 caractères ; null sinon. */
export function cleanVisualPhotoAlt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const alt = value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return alt.length >= 1 && alt.length <= SITE_PHOTO_ALT_MAX ? alt : null;
}

/** Chemin de stockage propre à l'entreprise et au contenu. */
export function visualPhotoPathname(companyId: string, contentId: string, id: string, type: SitePhotoType): string {
  return `content-photos/${companyId}/${contentId}/${id}.${type.extension}`;
}

/** Lit la photo d'une version ; une valeur illisible, ou hors du dossier de l'entreprise, est ignorée. */
export function readVisualPhoto(value: unknown, companyId: string): VisualPhoto | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { url, pathname, alt, width, height } = record;
  if (typeof url !== "string" || !/^https:\/\//.test(url) || typeof pathname !== "string" || !pathname.startsWith(`content-photos/${companyId}/`)) return null;
  if (typeof alt !== "string" || !Number.isInteger(width) || !Number.isInteger(height)) return null;
  return { url, pathname, alt, width: width as number, height: height as number };
}

/**
 * Droits d'utilisation à la validation : exigés quand la version porte une photo. Sans photo (illustration neutre de la marque),
 * il n'y a rien à confirmer.
 */
export function rightsRequired(photo: VisualPhoto | null): boolean {
  return photo !== null;
}
