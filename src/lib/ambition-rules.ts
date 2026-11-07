import { z } from "zod";

/**
 * Règles pures de l'ambition (#282, spécification §11) : bornes, notes et questions de Paul, reformulation,
 * libellé court du cap et analyseur de secours. Sans dépendance serveur : les composants client l'importent ;
 * le jeton de confirmation est dans `ambition-token.ts`. Les mêmes règles s'appliquent à la sortie
 * du modèle et à celle de l'analyseur de secours, côté serveur, avant tout enregistrement.
 */

export const AMBITION_BOUNDS = {
  textMin: 10,
  textMax: 600,
  gainMin: 1,
  gainMax: 50,
  horizonMin: 3,
  horizonMax: 36,
  budgetMin: 0,
  budgetMax: 2000,
} as const;

export type Recruitment = "no" | "possible" | "unspecified";

/** Éléments retenus, toujours dans les bornes : un élément absent ou hors bornes vaut null. */
export type AmbitionTerms = {
  gainPercent: number | null;
  horizonMonths: number | null;
  mediaBudgetPerMonth: number | null;
  recruitment: Recruitment;
};

/** Lecture brute (modèle ou analyseur de secours), avant les bornes. */
export type RawAmbition = {
  gainPercent: number | null;
  horizonMonths: number | null;
  mediaBudgetPerMonth: number | null;
  recruitment: Recruitment;
  /** Objectif reformulé en quelques mots (modèle seulement), sinon null. */
  goal: string | null;
};

export type AmbitionInterpretation = {
  text: string;
  terms: AmbitionTerms;
  /** Sans point final : l'interface affiche « Voici ce que je comprends. {reformulation}. ». */
  reformulation: string;
  found: string[];
  notes: string[];
  questions: string[];
};

export const AMBITION_TARGET_NOTICE = "C'est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment.";
export const AMBITION_REFINE_INTRO = "Pour affiner, vous pouvez préciser :";
export const REINTERPRET_MESSAGE = "Interprétez de nouveau votre ambition avant de la confirmer.";
export const RECRUITMENT_UNSPECIFIED_NOTE = "Recrutement non précisé : aucune embauche supposée.";
export const GAIN_QUESTION = "Quel gain de chiffre d'affaires visez-vous, en pourcentage ?";
export const HORIZON_QUESTION = "En combien de mois voulez-vous l'atteindre ?";
export const EMPTY_TERMS: AmbitionTerms = { gainPercent: null, horizonMonths: null, mediaBudgetPerMonth: null, recruitment: "unspecified" };

const number = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value).replace(/ /g, " ");
const finite = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value);

export const termsSchema = z.object({
  gainPercent: z.number().min(AMBITION_BOUNDS.gainMin).max(AMBITION_BOUNDS.gainMax).nullable(),
  horizonMonths: z.number().int().min(AMBITION_BOUNDS.horizonMin).max(AMBITION_BOUNDS.horizonMax).nullable(),
  mediaBudgetPerMonth: z.number().min(AMBITION_BOUNDS.budgetMin).max(AMBITION_BOUNDS.budgetMax).nullable(),
  recruitment: z.enum(["no", "possible", "unspecified"]),
}).strict();

/** Éléments lus d'une requête ou de la base ; null s'ils sont illisibles ou hors bornes. */
export function readAmbitionTerms(value: unknown): AmbitionTerms | null {
  const parsed = termsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Bornes de §11 : gain 1-50 %, horizon 3-36 mois (hors bornes : non converti, gardé dans le texte, note de Paul),
 * budget 0-2 000 €/mois (au-delà : ramené au maximum, note), recrutement non précisé : note.
 */
export function boundAmbition(raw: RawAmbition): { terms: AmbitionTerms; notes: string[] } {
  const notes: string[] = [];
  let gainPercent: number | null = null;
  if (finite(raw.gainPercent)) {
    const gain = Math.round(raw.gainPercent * 10) / 10;
    if (gain >= AMBITION_BOUNDS.gainMin && gain <= AMBITION_BOUNDS.gainMax) gainPercent = gain;
    else notes.push(`Un gain de ${number(gain)} % sort de mes repères (${AMBITION_BOUNDS.gainMin} à ${AMBITION_BOUNDS.gainMax} %) : je le garde dans votre texte, sans le convertir.`);
  }
  let horizonMonths: number | null = null;
  if (finite(raw.horizonMonths)) {
    const horizon = Math.round(raw.horizonMonths);
    if (horizon >= AMBITION_BOUNDS.horizonMin && horizon <= AMBITION_BOUNDS.horizonMax) horizonMonths = horizon;
    else notes.push(`Un horizon de ${number(horizon)} mois sort de mes repères (${AMBITION_BOUNDS.horizonMin} à ${AMBITION_BOUNDS.horizonMax} mois) : je le garde dans votre texte, sans le convertir.`);
  }
  let mediaBudgetPerMonth: number | null = null;
  if (finite(raw.mediaBudgetPerMonth) && raw.mediaBudgetPerMonth >= 0) {
    const budget = Math.round(raw.mediaBudgetPerMonth);
    if (budget > AMBITION_BOUNDS.budgetMax) {
      mediaBudgetPerMonth = AMBITION_BOUNDS.budgetMax;
      notes.push(`Le budget média est ramené à ${number(AMBITION_BOUNDS.budgetMax)} € par mois, le maximum retenu.`);
    } else {
      mediaBudgetPerMonth = budget;
    }
  }
  const recruitment: Recruitment = raw.recruitment === "no" || raw.recruitment === "possible" ? raw.recruitment : "unspecified";
  if (recruitment === "unspecified") notes.push(RECRUITMENT_UNSPECIFIED_NOTE);
  return { terms: { gainPercent, horizonMonths, mediaBudgetPerMonth, recruitment }, notes };
}

/** Libellé court du cap (§11) : le texte, sinon « +{gain} % de chiffre d'affaires en {horizon} mois », sinon « Cap à définir avec Paul ». */
export function capLabel(text: string | null | undefined, terms: AmbitionTerms | null | undefined): string {
  const clean = text?.trim();
  if (clean) return clean;
  if (terms && terms.gainPercent !== null && terms.horizonMonths !== null) return `+${number(terms.gainPercent)} % de chiffre d'affaires en ${terms.horizonMonths} mois`;
  return "Cap à définir avec Paul";
}

function budgetPhrase(budget: number): string {
  return budget === 0 ? "sans budget média" : `avec un budget média indicatif de ${number(budget)} € par mois, qui n'autorise aucune dépense`;
}

/** Texte court, sans balise ni caractère de contrôle. */
export function cleanGoal(value: string | null | undefined, max = 160): string | null {
  if (!value) return null;
  const clean = value.replace(/[\p{Cc}<>«»]+/gu, " ").replace(/\s+/g, " ").trim().replace(/[.!?;:,]+$/, "").trim();
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function clipQuote(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?;]+$/, "");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Reformulation de Paul (sans point final), construite à partir des seuls éléments retenus. */
export function reformulation(text: string, terms: AmbitionTerms, goal: string | null = null): string {
  const parts: string[] = [];
  if (terms.gainPercent !== null) parts.push(`Vous visez +${number(terms.gainPercent)} % de chiffre d'affaires`);
  else if (goal) parts.push(`Vous voulez ${goal}`);
  else parts.push(`Votre ambition : « ${clipQuote(text)} »`);
  if (terms.horizonMonths !== null) parts[0] += ` en ${terms.horizonMonths} mois`;
  if (terms.recruitment === "no") parts.push("sans embaucher");
  if (terms.recruitment === "possible") parts.push("avec une embauche possible");
  if (terms.mediaBudgetPerMonth !== null) parts.push(budgetPhrase(terms.mediaBudgetPerMonth));
  return parts.join(", ");
}

/** Éléments trouvés, dans l'ordre gain, horizon, budget média, recrutement. */
export function foundElements(terms: AmbitionTerms): string[] {
  const found: string[] = [];
  if (terms.gainPercent !== null) found.push(`Gain : +${number(terms.gainPercent)} % de chiffre d'affaires`);
  if (terms.horizonMonths !== null) found.push(`Horizon : ${terms.horizonMonths} mois`);
  if (terms.mediaBudgetPerMonth !== null) found.push(`Budget média : ${terms.mediaBudgetPerMonth === 0 ? "aucun" : `${number(terms.mediaBudgetPerMonth)} € par mois, indicatif, n'autorise aucune dépense`}`);
  if (terms.recruitment !== "unspecified") found.push(`Recrutement : ${terms.recruitment === "no" ? "non" : "possible"}`);
  return found;
}

/** Une question par élément manquant (gain, horizon) ; un élément hors bornes a déjà sa note. */
export function ambitionQuestions(raw: Pick<RawAmbition, "gainPercent" | "horizonMonths">): string[] {
  const questions: string[] = [];
  if (!finite(raw.gainPercent)) questions.push(GAIN_QUESTION);
  if (!finite(raw.horizonMonths)) questions.push(HORIZON_QUESTION);
  return questions;
}

/** Interprétation complète, toujours bornée, à partir d'une lecture brute. */
export function interpretationFrom(text: string, raw: RawAmbition): AmbitionInterpretation {
  const { terms, notes } = boundAmbition(raw);
  return { text, terms, reformulation: reformulation(text, terms, cleanGoal(raw.goal)), found: foundElements(terms), notes, questions: ambitionQuestions(raw) };
}

// ——— Analyseur de secours : expressions régulières bornées, sans modèle ———

const WORD_NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  quinze: 15, "dix-huit": 18, vingt: 20, "vingt-quatre": 24, trente: 30, "trente-six": 36,
};
const WORD = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|");

function readNumber(value: string): number | null {
  const word = WORD_NUMBERS[value];
  if (word !== undefined) return word;
  const parsed = Number(value.replace(/[\s.]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(text: string): string {
  return text.slice(0, AMBITION_BOUNDS.textMax).toLowerCase().replace(/[  ]/g, " ").replace(/[’`]/g, "'");
}

/** Nombre décimal (point ou virgule), sans séparateur de milliers : « 12.5 » et « 12,5 » valent 12,5. */
function readDecimal(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGain(text: string): number | null {
  if (/\bdoubl(?:er|ement|é|e)|\bx ?2\b/.test(text)) return 100;
  if (/\btripl(?:er|ement|é|e)|\bx ?3\b/.test(text)) return 200;
  // Un pourcentage négatif (« -10 % ») n'est pas un gain.
  for (const match of text.matchAll(/(^|[^\d.,])([-−] ?)?(\d{1,4}(?:[.,]\d{1,2})?) ?(?:%|pour ?cent\b)/g)) {
    if (!match[2]) return readDecimal(match[3]);
  }
  return null;
}

/** Une durée n'est lue que si une préposition de temps l'introduit (« en 12 mois », pas « depuis 30 ans »). */
const DURATION = "\\b(?:en|sur|dans|d'ici|sous|à) (?:les |des |moins de )?";

function parseHorizon(text: string): number | null {
  const months = new RegExp(`${DURATION}(\\d{1,3}|${WORD}) ?mois\\b`).exec(text);
  if (months) return readNumber(months[1]);
  const years = new RegExp(`${DURATION}(\\d{1,2}|${WORD}) ?(?:ans?|années?)\\b`).exec(text);
  if (years) {
    const value = readNumber(years[1]);
    return value === null ? null : value * 12;
  }
  if (/\b(?:cette|d'ici la fin de l'|en un) ?ann[ée]e\b|\bsur l'ann[ée]e\b/.test(text)) return 12;
  if (/\bsemestre\b/.test(text)) return 6;
  if (/\btrimestre\b/.test(text)) return 3;
  return null;
}

const MEDIA = /pub|publicit|budget|m[ée]dia|annonce|sponsor|ads\b/;

function parseBudget(text: string): number | null {
  if (/\bsans (?:aucun )?(?:budget|pub|publicit|d[ée]penser)/.test(text) || /\b(?:aucun|pas de|z[ée]ro) budget\b/.test(text)) return 0;
  // « 1.5k€ » ou « 1,5 k€ » : décimale avant « k » ; sinon le point sépare les milliers (« 2.000 € »).
  for (const match of text.matchAll(/(\d{1,3}[.,]\d{1,2}(?= ?k ?€)|\d{1,3}(?:[ .]\d{3}){0,2}|\d{1,7}) ?(?:€|euros?\b|k ?€)/g)) {
    const index = match.index ?? 0;
    const around = text.slice(Math.max(0, index - 40), index + match[0].length + 40);
    if (!MEDIA.test(around)) continue;
    const kilo = /k ?€$/.test(match[0]);
    let amount = kilo && /[.,]\d{1,2}$/.test(match[1]) ? readDecimal(match[1]) : readNumber(match[1]);
    if (amount === null) continue;
    if (kilo) amount *= 1000;
    const after = text.slice(index + match[0].length, index + match[0].length + 40);
    if (/(?:par|\/) ?(?:an|année)\b/.test(after)) amount /= 12;
    return amount;
  }
  return null;
}

function parseRecruitment(text: string): Recruitment {
  if (/\bsans (?:avoir (?:à |a )?)?(?:embauch|recrut|salari)|\bpas besoin (?:d'|de )(?:embauch|recrut)|\bpas d'(?:embauche|recrutement)|\bne (?:pas|veux pas) (?:embaucher|recruter)|\bpas (?:embaucher|recruter)/.test(text)) return "no";
  if (/embauch|recrut/.test(text)) return "possible";
  return "unspecified";
}

/** Analyseur de secours (sans clé, échec ou quota du modèle) : même lecture brute que le modèle, sans objectif reformulé. */
export function parseAmbition(text: string): RawAmbition {
  const clean = normalize(text);
  return { gainPercent: parseGain(clean), horizonMonths: parseHorizon(clean), mediaBudgetPerMonth: parseBudget(clean), recruitment: parseRecruitment(clean), goal: null };
}
