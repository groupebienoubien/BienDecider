/**
 * Règles pures d'une idée notée avec Paul (spécification §12, US #312) : sans accès base, pour que le panneau
 * de Paul et les tests sans base les lisent. Le service est dans src/lib/ideas.ts.
 */

/** Idées ouvertes au plus par entreprise (M-63). */
export const IDEA_MAX = 10;
/** Longueur d'une idée, après `trim` (M-62). */
export const IDEA_TEXT_MAX = 200;

/** Texte d'une idée : 1 à 200 caractères après `trim`, sans `<` ni `>` ; M-62 sinon. */
export function validateIdeaText(text: unknown): { ok: true; text: string } | { ok: false; code: "M-62" } {
  if (typeof text !== "string") return { ok: false, code: "M-62" };
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > IDEA_TEXT_MAX || /[<>]/.test(trimmed)) return { ok: false, code: "M-62" };
  return { ok: true, text: trimmed };
}

/** Formulaire « Cadrons votre nouvelle mission » prérempli avec une idée. */
export function ideaFrameHref(ideaId: string): string {
  return `/missions/nouvelle?idee=${encodeURIComponent(ideaId)}`;
}

/** Identifiant d'idée lisible (cuid), refusé sinon avant toute lecture. */
export function isIdeaId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
