import { DECLARED_CERTAINTY } from "./certainty.ts";

/**
 * « Corriger cette information » sur un constat (#169) : règles pures, sans dépendance serveur.
 * Le constat est corrigé en place (même identifiant, même ordre, mêmes missions) ; la version remplacée est archivée
 * dans une nouvelle ligne, avec sa certitude, sa source et sa date de lecture d'origine, et n'est plus présentée comme actuelle.
 * Une correction ne relance rien : elle signale seulement les missions reliées, à réexaminer.
 */

export const CORRECTION_BOUNDS = { titleMin: 5, titleMax: 120, contentMin: 10, contentMax: 600 } as const;

export const CORRECTION_EFFECTS = "Les missions issues de ce constat seront à réexaminer. Rien n'est relancé ni publié.";

export type CorrectionField = "title" | "content";
export type CorrectionInput = { title: string; content: string };
export type CorrectionCheck = { ok: true; value: CorrectionInput } | { ok: false; code: "M-98" | "M-99"; field?: CorrectionField };

/** Texte sur une ligne : espaces réduits, sans caractère de contrôle. */
function oneLine(value: string): string {
  return value.replace(/[\p{Cc}\s]+/gu, " ").trim();
}

/** Texte sur plusieurs lignes : retours à la ligne gardés (deux au plus de suite), espaces réduits, sans autre caractère de contrôle. */
function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("").filter((char) => char === "\n" || !/\p{Cc}/u.test(char)).join("")
    .split("\n").map((line) => line.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fieldIssue(value: string, min: number, max: number): boolean {
  return value.length < min || value.length > max || /[<>]/.test(value);
}

/**
 * Contrôle du serveur : constat de 5 à 120 caractères, détail de 10 à 600, sans balise (M-99, avec le champ fautif) ;
 * une correction identique au constat actuel est refusée (M-98) : rien ne serait corrigé.
 */
export function checkCorrection(body: unknown, current: CorrectionInput): CorrectionCheck {
  const raw = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (typeof raw.title !== "string") return { ok: false, code: "M-99", field: "title" };
  if (typeof raw.content !== "string") return { ok: false, code: "M-99", field: "content" };
  const title = oneLine(raw.title);
  const content = multiLine(raw.content);
  if (fieldIssue(title, CORRECTION_BOUNDS.titleMin, CORRECTION_BOUNDS.titleMax)) return { ok: false, code: "M-99", field: "title" };
  if (fieldIssue(content, CORRECTION_BOUNDS.contentMin, CORRECTION_BOUNDS.contentMax)) return { ok: false, code: "M-99", field: "content" };
  if (title === oneLine(current.title) && content === multiLine(current.content)) return { ok: false, code: "M-98" };
  return { ok: true, value: { title, content } };
}

/** Champs d'un constat qu'une correction remplace, et qu'une version archivée garde. */
export type FindingVersionFields = {
  title: string;
  content: string;
  whatWorks: string | null;
  toImprove: string | null;
  actionItems: unknown;
  sourceUrl: string | null;
  sourceStatus: string | null;
  certainty: string;
  correctedAt: Date | null;
};

/** Ce que garde la version archivée : le constat tel qu'il était, avec sa date de correction s'il avait déjà été corrigé. */
export function versionFields(finding: FindingVersionFields): FindingVersionFields {
  return {
    title: finding.title,
    content: finding.content,
    whatWorks: finding.whatWorks,
    toImprove: finding.toImprove,
    actionItems: finding.actionItems ?? null,
    sourceUrl: finding.sourceUrl,
    sourceStatus: finding.sourceStatus,
    certainty: finding.certainty,
    correctedAt: finding.correctedAt,
  };
}

/**
 * Le constat corrigé : déclaré par le dirigeant, sans source (la source lue reste sur la version archivée),
 * sans le détail ni le plan d'action que Paul avait tirés de l'information remplacée.
 */
export function correctedFields(input: CorrectionInput, now: Date): FindingVersionFields {
  return { title: input.title, content: input.content, whatWorks: null, toImprove: null, actionItems: null, sourceUrl: null, sourceStatus: null, certainty: DECLARED_CERTAINTY, correctedAt: now };
}

/** Revenir à la version remplacée retire le signal « à réexaminer » seulement si cette version est celle de Paul (non corrigée). */
export function clearsReview(restored: Pick<FindingVersionFields, "certainty">): boolean {
  return restored.certainty !== DECLARED_CERTAINTY;
}

/** Suite de J-34 : le nombre de missions à réexaminer, et que rien n'est relancé. */
export function reviewSuite(missions: number): string {
  if (missions === 0) return "Aucune mission concernée.";
  return `${missions} mission${missions > 1 ? "s" : ""} à réexaminer, rien n'est relancé.`;
}

/** Constat cité au journal : sur une ligne, 80 caractères au plus. */
export function journalQuote(title: string): string {
  const clean = oneLine(title);
  return clean.length <= 80 ? clean : `${clean.slice(0, 79).trimEnd()}…`;
}
