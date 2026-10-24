/**
 * Personnification des agents (cf. docs/backlog.md). Équipe rationalisée le
 * 2026-10-05 (demande CEO) : Nadia (audit) fusionnée dans Martine, qui
 * devient Marketing Officer (diagnostic + pilotage de la fiche Google) ;
 * Camille se recentre sur la production de contenu (posts, site), en
 * s'appuyant sur les constats de Martine.
 *
 * Paul (ex-"Co-CEO") renommé "Partenaire de croissance" le 2026-10-07 —
 * cf. docs/backlog.md "partenaire de croissance" : "Co-CEO" évoquait un
 * statut hiérarchique factice, alors que son rôle réel (et celui qui doit
 * se lire dans son prompt, pas seulement dans son étiquette) est de
 * comprendre le métier et le marché du dirigeant, l'aider à fixer un
 * objectif chiffré, décider des priorités, déléguer, mesurer et apprendre
 * de ce qui fonctionne. Toujours pas de prénom donnant un genre marqué
 * inutilement par ailleurs — "Paul" reste un prénom neutre dans ce choix.
 *
 * "humeur" = un trait de personnalité fixe qui infuse le ton de l'agent
 * (pas un indicateur d'humeur dynamique en V1 — complexité non justifiée
 * tant qu'on rationalise l'équipe plutôt que l'inverse).
 *
 * Pas de photos réalistes : aucune génération d'image disponible, et une
 * fausse photo de personne réelle pour une IA serait trompeuse si elle
 * sort un jour du dashboard (cf. décision actée dans backlog.md). Chaque
 * agent a une illustration propre (PersonaAvatar) plutôt qu'une pastille
 * générique.
 */
import { businessTargetLines } from "@/lib/business-target";
import { cleanOwnerName } from "@/lib/company-profile";

export const PERSONAS = {
  co_ceo: {
    name: "Paul",
    role: "Partenaire de croissance",
    trait: "Direct et synthétique, ne promet jamais ce qu'il ne peut pas faire.",
    blurb:
      "Je comprends votre métier et votre marché, je fixe avec vous un objectif chiffré, je décide des priorités, je délègue aux bons agents, je mesure ce que ça produit et j'ajuste la suite — toujours avec votre validation avant toute action réelle.",
  },
  marketing: {
    name: "Martine",
    role: "Marketing Officer",
    trait: "Analytique et sans détour — elle dit ce qui ne marche pas avant ce qui marche.",
    blurb:
      "J'audite votre présence en ligne, je regarde vos concurrents, et je pilote votre fiche Google (infos, avis) pour que vous ressortiez mieux qu'eux en local.",
  },
  contenu: {
    name: "Camille",
    role: "Contenu & Site",
    trait: "Créative et concrète — elle préfère un brouillon imparfait à une idée jamais écrite.",
    blurb:
      "Je transforme les constats de Martine en contenu prêt à l'emploi : vos posts Instagram/Facebook et votre site web.",
  },
  demarchage: {
    name: "Jean-Claude",
    role: "Démarchage",
    trait: "Tenace et terre-à-terre, jamais dans la promesse commerciale exagérée.",
    blurb:
      "Je repère des pistes de croissance (actualités locales, événements) et je prépare des templates de prospection pour aller chercher de nouveaux clients.",
  },
} as const;

export type AgentKey = keyof typeof PERSONAS;

/**
 * Objectif business à injecter dans les prompts : phrase libre du dirigeant
 * + écart chiffré (CA actuel / cible / clients nécessaires) si renseigné.
 */
export function objectiveLine(
  company: { objective: string | null } & Parameters<typeof businessTargetLines>[0],
): string {
  const parts: string[] = [];
  if (company.objective) {
    parts.push(`Objectif business du dirigeant : ${company.objective}. Oriente tes propositions vers cet objectif en priorité.`);
  }
  const numbers = businessTargetLines(company);
  if (numbers) parts.push(numbers);
  return parts.join("\n");
}

type CompanyProfileFields = {
  description?: string | null;
  phone?: string | null;
  certifications?: string | null;
  openingHours?: string | null;
};

/**
 * Profil libre de l'entreprise (remplace l'ancien champ "tone" figé) —
 * description, téléphone, certifications, horaires, uniquement les champs
 * renseignés. Le ton de communication se déduit de la description elle-même.
 */
export function companyProfileLines(company: CompanyProfileFields): string {
  const lines: string[] = [];
  if (company.description) lines.push(`Description donnée par le dirigeant : ${company.description}`);
  if (company.phone) lines.push(`Téléphone à afficher : ${company.phone}`);
  if (company.certifications) lines.push(`Certifications/labels : ${company.certifications}`);
  if (company.openingHours) lines.push(`Horaires d'ouverture : ${company.openingHours}`);
  return lines.join("\n");
}

/** Consigne de réorientation du dirigeant — prime sur tout le reste. */
export function directionLine(direction: string | null): string {
  return direction
    ? `CONSIGNE DU DIRIGEANT (prioritaire) : ${direction}`
    : "";
}

/** Fuseau de référence des dates données aux agents. */
export const RUNTIME_TIME_ZONE = "Europe/Paris";
/** Signature à laisser dans un email quand le dirigeant n'a pas donné son nom. */
export const OWNER_NAME_PLACEHOLDER = "[Votre prénom et nom]";

const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: RUNTIME_TIME_ZONE });
// en-CA formate en AAAA-MM-JJ.
const DATE_KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: RUNTIME_TIME_ZONE });

/** Date du jour à Paris, au format « vendredi 23 octobre 2026 ». */
export function formatParisDate(now: Date): string {
  return LONG_DATE.format(now);
}

/** Date du jour à Paris, au format AAAA-MM-JJ (comparable comme texte). */
export function parisDateKey(now: Date): string {
  return DATE_KEY.format(now);
}

const TIME_PARTS = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: RUNTIME_TIME_ZONE });

/**
 * Heure d'un état à Paris (story 3.5) : « 23:39 » le jour même, « 22/10 23:39 »
 * un autre jour, « 22/10/2025 23:39 » une autre année. null si la date est absente.
 */
export function formatParisTime(date: Date | string | null | undefined, now: Date): string | null {
  if (date === null || date === undefined) return null;
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  const parts = TIME_PARTS.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const time = `${part("hour")}:${part("minute")}`;
  if (parisDateKey(value) === parisDateKey(now)) return time;
  const day = `${part("day")}/${part("month")}`;
  return parisDateKey(value).slice(0, 4) === parisDateKey(now).slice(0, 4) ? `${day} ${time}` : `${day}/${part("year")} ${time}`;
}

/**
 * Contexte du moment donné à tous les agents : date du jour (Europe/Paris) et
 * nom du dirigeant pour signer. Varie d'un jour à l'autre : toujours placé
 * dans un bloc système sans cache_control, jamais dans le bloc mis en cache.
 */
export function runtimeContextLines(company: { ownerName?: string | null }, now: Date): string {
  const owner = company.ownerName ? cleanOwnerName(company.ownerName) : "";
  return [
    `Date du jour : ${formatParisDate(now)} (heure de Paris). Calcule les échéances relatives (« dans 8 jours », « la semaine prochaine ») à partir de cette date, et ne propose jamais un événement déjà terminé.`,
    owner
      ? `Nom du dirigeant : ${owner} ; signe « ${owner} » les emails et messages rédigés en son nom, jamais avec le nom d'un agent ni seulement le nom de l'entreprise.`
      : `Nom du dirigeant : non renseigné ; signe « ${OWNER_NAME_PLACEHOLDER} » les emails et messages rédigés en son nom, jamais avec le nom d'un agent ni seulement le nom de l'entreprise.`,
  ].join("\n");
}

/** Une date de fin d'événement au-delà de cet horizon est refusée (date probablement erronée). */
export const EVENT_END_MAX_MONTHS = 24;

/** Date de fin d'un événement (AAAA-MM-JJ) : invalide, déjà passée à Paris, trop lointaine, ou acceptable (null). */
export function eventEndDateIssue(value: string, now: Date): "invalid" | "past" | "too_far" | null {
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "invalid";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // setUTCFullYear : Date.UTC ramènerait les années 0 à 99 vers 1900 à 1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "invalid";
  const today = parisDateKey(now);
  if (text < today) return "past";
  const limit = new Date(0);
  limit.setUTCFullYear(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + EVENT_END_MAX_MONTHS, Number(today.slice(8, 10)));
  return date.getTime() > limit.getTime() ? "too_far" : null;
}

/** Options communes de lancement d'un agent depuis le plan de Paul. */
export type AgentRunOptions = {
  /** Action du plan à réaliser — l'agent doit s'y tenir plutôt que de proposer autre chose. */
  brief?: string;
  /** Rattache les propositions créées à l'action du plan correspondante. */
  planItemId?: string;
  /** Run persistant qui a créé les éléments produits. */
  agentRunId?: string;
};

export function briefLine(brief?: string): string {
  return brief
    ? `ACTION DEMANDÉE PAR PAUL : ${brief}\nTes propositions doivent réaliser précisément cette action, pas autre chose.`
    : "";
}

