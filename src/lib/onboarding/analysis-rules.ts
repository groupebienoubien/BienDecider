import { z } from "zod";
import { SOURCE_CONSULTED } from "@/lib/findings/certainty";

/**
 * Règles pures de l'analyse publique avant compte (#280, spécification §1.3) : quatre rubriques, leurs états,
 * la provenance de chaque valeur. Partagées par le serveur et l'interface ; aucune dépendance serveur ici.
 */

export const RUBRIC_KEYS = ["site", "google", "zone", "identity"] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

export const RUBRIC_NAMES: Record<RubricKey, string> = {
  site: "Site et offres",
  google: "Informations publiques",
  zone: "Zone et clients",
  identity: "Identité visuelle",
};

export type RubricStatus = "pending" | "read" | "unavailable" | "not_found";
export type UnavailableReason = "no_site" | "unreadable" | "refused" | "service" | "limit";
export type Rubric = { status: RubricStatus; reason?: UnavailableReason };

const REASON_LABELS: Record<UnavailableReason, string> = {
  no_site: "pas de site",
  unreadable: "site illisible",
  refused: "accès refusé",
  service: "service indisponible",
  limit: "limite du jour atteinte",
};

/** Libellé visible d'une rubrique : « En cours », « Lue », « Non disponible (raison) » ou « Non trouvée ». */
export function rubricLabel(rubric: Rubric): string {
  if (rubric.status === "pending") return "En cours";
  if (rubric.status === "read") return "Lue";
  if (rubric.status === "not_found") return "Non trouvée";
  return `Non disponible (${REASON_LABELS[rubric.reason ?? "service"]})`;
}

/** Provenance d'une valeur : observée (source et date de lecture), hypothèse du modèle, ou déclarée par le dirigeant. */
export type Provenance = { kind: "observed"; source: string; readAt: string } | { kind: "hypothesis" } | { kind: "declared" };
export type Finding<T = string> = { value: T; provenance: Provenance };

export type AnalysisFindings = {
  trade: Finding | null;
  servingArea: Finding | null;
  targetClients: Finding | null;
  offers: Finding | null;
  tone: Finding | null;
  contacts: Finding[];
  palette: Finding<string[]> | null;
  logo: Finding | null;
  google: Finding | null;
  /** Place IDs candidats uniquement ; les détails sont relus à l'affichage, jamais conservés dans le brouillon. */
  googlePlaceCandidates?: string[];
  pages: { url: string; readAt: string }[];
  publicSources?: {
    platform: "website" | "facebook" | "instagram" | "linkedin";
    url: string;
    source: string;
    readAt: string;
  }[];
  readLimitations?: {
    url: string;
    reason: "pdf" | "other_host" | "not_selected" | "unreadable" | "dynamic";
  }[];
};

export type AnalysisInput = {
  companyName: string;
  location: string;
  website: string;
  googlePlaceId?: string | null;
  googlePlaceCandidateIds?: string[];
  websiteRejected?: boolean;
};

/** Analyses anonymes par connexion (IP) et par 24 h (#280, D2). */
export const ANALYSIS_PER_IP_DAILY_LIMIT = 10;
/** Lecture refusée par un plafond : celui de la connexion ou celui de tous les visiteurs, et l'heure où il se libère. */
export type AnalysisLimit = { scope: "ip" | "global"; retryAt: string };

export type DraftAnalysis = {
  runId: string;
  status: "running" | "done" | "limited";
  startedAt: string;
  finishedAt: string | null;
  input: AnalysisInput;
  rubrics: Record<RubricKey, Rubric>;
  findings: AnalysisFindings;
  /** Les liens sont disponibles ; l'interprétation peut encore tourner. */
  sourcesReady?: boolean;
  /** `model` : modèle réellement appelé, repris dans le `UsageEvent` du compte à l'inscription (#281) ; absent d'un brouillon ancien. */
  cost: { usd: number; inputTokens: number; outputTokens: number; model?: string };
  limit?: AnalysisLimit;
  /** Premiers constats (FR-6, #292) : trois au plus ; absent d'un brouillon ancien. */
  constats?: FirstFinding[];
};

export const FIRST_FINDINGS_MAX = 3;
export type FirstFindingTopic = "site_web" | "fiche_google" | "reseaux_sociaux";
/**
 * Constat avant compte : le fait relevé, sa conséquence possible, sa certitude, sa source et sa date de lecture.
 * « observe » seulement si la source est une page lue ou la fiche Google lue ; sinon « piste », sans source.
 */
export type FirstFinding = { topic: FirstFindingTopic; fact: string; consequence: string; certainty: "observe" | "piste"; source: string | null; readAt: string | null };
/** Constat proposé par le modèle, avant contrôle : `source` vaut « google », l'adresse d'une page lue, ou rien. */
export type ProposedFinding = { topic?: unknown; fact?: unknown; consequence?: unknown; source?: unknown };

const TOPICS: readonly FirstFindingTopic[] = ["site_web", "fiche_google", "reseaux_sociaux"];
const FACT_MAX = 200;

function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/<[^<>]*>/g, "").replace(/[\p{Cc}<>]+/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

const sameUrl = (left: string, right: string) => left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

/**
 * Constats du modèle gardés (FR-4, FR-6) : fait et conséquence de 10 à 200 caractères, trois au plus, sans doublon.
 * La certitude ne vient jamais du modèle : une source réellement lue donne « Observé » avec sa date, sinon « Piste à qualifier ».
 */
export function keepFirstFindings(proposed: ProposedFinding[], read: { pages: { url: string; readAt: string }[]; google: { link: string; readAt: string } | null }): FirstFinding[] {
  const kept: FirstFinding[] = [];
  for (const item of proposed) {
    const fact = plainText(item.fact, FACT_MAX);
    const consequence = plainText(item.consequence, FACT_MAX);
    if (fact.length < 10 || consequence.length < 10 || kept.some((finding) => finding.fact === fact)) continue;
    const source = typeof item.source === "string" ? item.source.trim() : "";
    const page = source ? read.pages.find((candidate) => sameUrl(candidate.url, source)) : undefined;
    const google = source.toLowerCase() === "google" ? read.google : null;
    const topic: FirstFindingTopic = google ? "fiche_google" : page ? "site_web" : TOPICS.includes(item.topic as FirstFindingTopic) ? item.topic as FirstFindingTopic : "site_web";
    kept.push(page || google
      ? { topic, fact, consequence, certainty: "observe", source: (page?.url ?? google!.link).slice(0, 600), readAt: page?.readAt ?? google!.readAt }
      : { topic, fact, consequence, certainty: "piste", source: null, readAt: null });
    if (kept.length === FIRST_FINDINGS_MAX) break;
  }
  return kept;
}

/** Sans constat du modèle : ce que la lecture a réellement établi (fiche Google, site), sans rien en déduire de plus. */
export function ruleFirstFindings(read: { site: { url: string; readAt: string } | null; google: { link: string; readAt: string } | null }): FirstFinding[] {
  const findings: FirstFinding[] = [];
  if (read.google) {
    findings.push({ topic: "fiche_google", fact: "Une fiche Google existe pour votre entreprise.", consequence: "C'est souvent le premier contact de vos clients : elle doit être complète et à jour.", certainty: "observe", source: read.google.link.slice(0, 600), readAt: read.google.readAt });
  }
  if (read.site) {
    findings.push({ topic: "site_web", fact: "Votre site est en ligne et lisible.", consequence: "Paul peut s'appuyer sur ce qu'il présente pour vos premiers contenus.", certainty: "observe", source: read.site.url.slice(0, 600), readAt: read.site.readAt });
  }
  if (!read.site && !read.google) {
    findings.push({ topic: "site_web", fact: "Aucun site ni fiche Google n'a pu être identifié lors de cette lecture.", consequence: "Vérifiez les liens avec Paul : une recherche sans résultat ne prouve pas une absence de présence en ligne.", certainty: "piste", source: null, readAt: null });
  }
  return findings;
}

/**
 * Premiers constats repris dans le compte à l'inscription (#292, addendum §6) : un `AuditFinding` chacun, sans exécution,
 * qui forme le premier diagnostic jusqu'au premier audit terminé. « Observé » garde sa source consultée ; une piste n'en a pas.
 */
export function firstFindingRecords(analysis: DraftAnalysis | null): { category: FirstFindingTopic; title: string; content: string; sourceUrl: string | null; sourceStatus: string | null; certainty: "observe" | "piste" }[] {
  return (analysis?.constats ?? []).map((constat) => ({
    category: constat.topic,
    title: constat.fact.length <= 80 ? constat.fact : `${constat.fact.slice(0, 79).trimEnd()}…`,
    content: `${constat.fact} ${constat.consequence}`,
    sourceUrl: constat.certainty === "observe" ? constat.source : null,
    sourceStatus: constat.certainty === "observe" ? SOURCE_CONSULTED : null,
    certainty: constat.certainty,
  }));
}

/** Une analyse « en cours » plus vieille que ce délai a été interrompue (durée maximale de la route : 60 s). */
export const ANALYSIS_STALE_MS = 90_000;

export const ANALYSIS_MESSAGES = {
  limited: "Paul a atteint sa limite de lectures pour aujourd'hui : ce n'est pas une panne. Réessayez plus tard, ou continuez dès maintenant et complétez vous-même l'étape suivante.",
  busy: "Paul lit déjà votre entreprise. Patientez quelques secondes.",
  missing: "Lancez d'abord « Découvrir mon entreprise ».",
  partial: "Paul n'a pas pu tout lire. Vous compléterez ce qui manque à l'étape suivante.",
} as const;

const PARIS_TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const PARIS_DAY = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

/** « aujourd'hui à 15 h 40 », « demain à 9 h 05 » (heure de Paris) ; « dès maintenant » si l'heure est passée. */
export function retryLabel(retryAt: string, now = new Date()): string {
  const at = new Date(retryAt);
  if (Number.isNaN(at.getTime()) || at <= now) return "dès maintenant";
  const time = PARIS_TIME.format(at).replace(":", " h ").replace(/^0/, "");
  return `${PARIS_DAY.format(at) === PARIS_DAY.format(now) ? "aujourd'hui" : "demain"} à ${time}`;
}

function limitScope(limit: AnalysisLimit): string {
  return limit.scope === "ip" ? `depuis cette connexion (${ANALYSIS_PER_IP_DAILY_LIMIT} lectures par jour)` : "pour l'ensemble des visiteurs";
}

/** Étape 1 : pourquoi la lecture n'a pas eu lieu, quand elle sera possible, et que le parcours continue. */
export function limitedNotice(limit: AnalysisLimit | undefined, now = new Date()): string {
  if (!limit) return ANALYSIS_MESSAGES.limited;
  return `Limite de lectures du jour atteinte ${limitScope(limit)} : ce n'est pas une panne. Paul pourra lire votre entreprise ${retryLabel(limit.retryAt, now)}. Vous pouvez continuer dès maintenant et compléter vous-même l'étape suivante.`;
}

/** Étape 2 : les champs sont vides parce que Paul n'a rien lu, pas parce que la lecture a échoué. */
export function limitedStepNotice(limit: AnalysisLimit | undefined, now = new Date()): string {
  const when = limit ? retryLabel(limit.retryAt, now) : "plus tard";
  const scope = limit ? ` ${limitScope(limit)}` : "";
  return `Paul n'a pas lu votre entreprise : limite de lectures du jour atteinte${scope}. Ce n'est pas une panne. Complétez les champs ci-dessous, ou revenez ${when} et choisissez « Non, corriger mes informations » pour qu'il la lise.`;
}

export function emptyFindings(): AnalysisFindings {
  return { trade: null, servingArea: null, targetClients: null, offers: null, tone: null, contacts: [], palette: null, logo: null, google: null, googlePlaceCandidates: [], pages: [] };
}

/** Garde les choix connus pendant une relecture, y compris si le quota empêche de nouveaux résultats. */
export function googlePlaceCandidateIds(analysis: DraftAnalysis | null): string[] {
  return analysis?.findings.googlePlaceCandidates?.length
    ? analysis.findings.googlePlaceCandidates
    : analysis?.input.googlePlaceCandidateIds ?? [];
}

export function newAnalysis(input: AnalysisInput, runId: string, now = new Date(), status: DraftAnalysis["status"] = "running", limit?: AnalysisLimit): DraftAnalysis {
  const pending: Rubric = { status: "pending" };
  const rubrics: Record<RubricKey, Rubric> = status === "limited"
    ? { site: { status: "unavailable", reason: "limit" }, google: { status: "unavailable", reason: "limit" }, zone: { status: "unavailable", reason: "limit" }, identity: { status: "unavailable", reason: "limit" } }
    : { site: input.website ? pending : { status: "unavailable", reason: "no_site" }, google: pending, zone: pending, identity: input.website ? pending : { status: "unavailable", reason: "no_site" } };
  return {
    runId, status, startedAt: now.toISOString(), finishedAt: status === "limited" ? now.toISOString() : null,
    input: {
      ...input,
      googlePlaceId: input.googlePlaceId ?? null,
      googlePlaceCandidateIds: input.googlePlaceCandidateIds ?? [],
      websiteRejected: input.websiteRejected ?? false,
    },
    rubrics, findings: emptyFindings(), cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    ...(status === "limited" && limit ? { limit } : {}),
  };
}

export type SiteOutcome = "pending" | "none" | "read" | "refused" | "unreadable";
export type GoogleOutcome = "pending" | "read" | "not_found" | "unavailable";
/** `skipped` : rien à lire (ni site ni fiche), le modèle n'est pas appelé. */
export type ModelOutcome = "pending" | "unavailable" | "skipped" | { zone: boolean; identity: boolean };

function siteReason(site: SiteOutcome): UnavailableReason {
  return site === "refused" ? "refused" : site === "unreadable" ? "unreadable" : "no_site";
}

/**
 * États des quatre rubriques à partir de ce qui a été lu. Une rubrique illisible ne bloque jamais les autres ;
 * « Identité visuelle » dépend du site ; sans modèle, « Zone et clients » et « Identité visuelle » sont « Non disponible »
 * (l'observé du site reste gardé).
 */
export function rubricsFor(input: { site: SiteOutcome; google: GoogleOutcome; model: ModelOutcome }): Record<RubricKey, Rubric> {
  const { site, google, model } = input;
  const siteRubric: Rubric = site === "pending" ? { status: "pending" } : site === "read" ? { status: "read" } : { status: "unavailable", reason: siteReason(site) };
  const googleRubric: Rubric = google === "pending" ? { status: "pending" } : google === "read" ? { status: "read" } : google === "not_found" ? { status: "not_found" } : { status: "unavailable", reason: "service" };
  let zone: Rubric;
  if (model === "pending") zone = { status: "pending" };
  else if (model === "unavailable") zone = { status: "unavailable", reason: "service" };
  else if (model === "skipped") zone = { status: "unavailable", reason: site === "read" ? "service" : siteReason(site) };
  else zone = model.zone ? { status: "read" } : { status: "not_found" };
  let identity: Rubric;
  if (site === "pending") identity = { status: "pending" };
  else if (site !== "read") identity = { status: "unavailable", reason: siteReason(site) };
  else if (model === "pending") identity = { status: "pending" };
  else if (model === "unavailable" || model === "skipped") identity = { status: "unavailable", reason: "service" };
  else identity = model.identity ? { status: "read" } : { status: "not_found" };
  return { site: siteRubric, google: googleRubric, zone, identity };
}

export function analysisRunning(analysis: DraftAnalysis | null, now = new Date()): boolean {
  return analysis?.status === "running" && now.getTime() - Date.parse(analysis.startedAt) < ANALYSIS_STALE_MS;
}

/** Analyse terminée, lue ou partiellement lue (une analyse interrompue compte pour terminée). */
export function analysisFinished(analysis: DraftAnalysis | null, now = new Date()): boolean {
  return analysis !== null && !analysisRunning(analysis, now);
}

export function analysisSourcesReady(analysis: DraftAnalysis | null, now = new Date()): boolean {
  return analysis?.sourcesReady === true || analysisFinished(analysis, now);
}

/** Analyse telle qu'affichée : une analyse interrompue passe ses rubriques encore « En cours » à « Non disponible ». */
export function effectiveAnalysis(analysis: DraftAnalysis | null, now = new Date()): DraftAnalysis | null {
  if (!analysis || analysis.status !== "running" || analysisRunning(analysis, now)) return analysis;
  const rubrics = Object.fromEntries(RUBRIC_KEYS.map((key) => [key, analysis.rubrics[key].status === "pending" ? { status: "unavailable", reason: "service" } : analysis.rubrics[key]])) as Record<RubricKey, Rubric>;
  return { ...analysis, status: "done", rubrics };
}

/** Faut-il lancer une nouvelle analyse ? Non si la même entreprise a déjà été lue ; oui après un refus de quota. */
export function needsNewAnalysis(current: DraftAnalysis | null, input: AnalysisInput, now = new Date()): boolean {
  if (!current) return true;
  if (analysisRunning(current, now)) return false;
  // Refusée par le quota, ou interrompue (« en cours » au-delà du délai) : on peut relancer.
  if (current.status === "limited" || current.status === "running") return true;
  if (
    current.input.googlePlaceId === undefined ||
    current.input.googlePlaceCandidateIds === undefined ||
    current.input.websiteRejected === undefined
  ) return true;
  return current.input.companyName !== input.companyName
    || current.input.location !== input.location
    || current.input.website !== input.website
    || (current.input.googlePlaceId ?? null) !== (input.googlePlaceId ?? null)
    || (current.input.websiteRejected ?? false) !== (input.websiteRejected ?? false);
}

/** Message affiché sous les rubriques, s'il y a lieu (quota, service indisponible, site illisible ou refusé). */
export function analysisNotice(analysis: DraftAnalysis | null, now = new Date()): string | null {
  if (!analysis || analysis.status === "running") return null;
  if (analysis.status === "limited") return limitedNotice(analysis.limit, now);
  return RUBRIC_KEYS.some((key) => analysis.rubrics[key].status === "unavailable" && analysis.rubrics[key].reason !== "no_site") ? ANALYSIS_MESSAGES.partial : null;
}

const provenanceSchema = z.union([
  z.object({ kind: z.literal("observed"), source: z.string().max(600), readAt: z.string().max(40) }),
  z.object({ kind: z.literal("hypothesis") }),
  z.object({ kind: z.literal("declared") }),
]);
const findingSchema = z.object({ value: z.string().max(600), provenance: provenanceSchema });
const rubricSchema = z.object({ status: z.enum(["pending", "read", "unavailable", "not_found"]), reason: z.enum(["no_site", "unreadable", "refused", "service", "limit"]).optional() });
const analysisSchema = z.object({
  runId: z.string().max(100),
  status: z.enum(["running", "done", "limited"]),
  startedAt: z.string().max(40),
  finishedAt: z.string().max(40).nullable(),
  sourcesReady: z.boolean().optional(),
  input: z.object({
    companyName: z.string(), location: z.string(), website: z.string(),
    googlePlaceId: z.string().max(256).nullable().optional(),
    googlePlaceCandidateIds: z.array(z.string().max(256)).max(3).optional(),
    websiteRejected: z.boolean().optional(),
  }),
  rubrics: z.object({ site: rubricSchema, google: rubricSchema, zone: rubricSchema, identity: rubricSchema }),
  findings: z.object({
    trade: findingSchema.nullable(), servingArea: findingSchema.nullable(), targetClients: findingSchema.nullable(), offers: findingSchema.nullable(),
    tone: findingSchema.nullable(), contacts: z.array(findingSchema).max(10), palette: z.object({ value: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).max(10), provenance: provenanceSchema }).nullable(),
    logo: findingSchema.nullable(), google: findingSchema.nullable(), pages: z.array(z.object({ url: z.string().max(600), readAt: z.string().max(40) })).max(5),
    googlePlaceCandidates: z.array(z.string().max(256)).max(3).optional(),
    publicSources: z.array(z.object({
      platform: z.enum(["website", "facebook", "instagram", "linkedin"]),
      url: z.string().max(600),
      source: z.string().max(600),
      readAt: z.string().max(40)
    })).max(11).optional(),
    readLimitations: z.array(z.object({
      url: z.string().max(600),
      reason: z.enum(["pdf", "other_host", "not_selected", "unreadable", "dynamic"])
    })).max(10).optional(),
  }),
  cost: z.object({ usd: z.number(), inputTokens: z.number(), outputTokens: z.number(), model: z.string().max(100).optional() }),
  limit: z.object({ scope: z.enum(["ip", "global"]), retryAt: z.string().max(40) }).optional(),
  constats: z.array(z.object({
    topic: z.enum(["site_web", "fiche_google", "reseaux_sociaux"]), fact: z.string().max(FACT_MAX), consequence: z.string().max(FACT_MAX),
    certainty: z.enum(["observe", "piste"]), source: z.string().max(600).nullable(), readAt: z.string().max(40).nullable(),
  })).max(FIRST_FINDINGS_MAX).optional(),
});

/** Lecture défensive de la colonne `analysis` : toute valeur illisible vaut « pas d'analyse ». */
export function readAnalysis(raw: unknown): DraftAnalysis | null {
  const parsed = analysisSchema.safeParse(raw);
  return parsed.success ? (parsed.data as DraftAnalysis) : null;
}

export const ANALYSIS_USAGE_AGENT = "onboarding_analysis";

/**
 * Coût de l'analyse anonyme à reprendre au compte créé (#281) : seulement s'il est supérieur à 0 et que le modèle réellement
 * appelé est connu (un brouillon d'avant #281 n'en garde pas). Sinon null, et rien n'est écrit.
 */
export function analysisUsage(analysis: DraftAnalysis | null): { agent: string; model: string; inputTokens: number; outputTokens: number; costUsd: number } | null {
  const cost = analysis?.cost;
  if (!cost || !cost.model || !Number.isFinite(cost.usd) || cost.usd <= 0) return null;
  const tokens = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  return { agent: ANALYSIS_USAGE_AGENT, model: cost.model, inputTokens: tokens(cost.inputTokens), outputTokens: tokens(cost.outputTokens), costUsd: cost.usd };
}

/** Vue publique de la progression (GET), sans l'entrée ni le coût. */
export function analysisView(analysis: DraftAnalysis | null, now = new Date()) {
  const shown = effectiveAnalysis(analysis, now);
  if (!shown) return null;
  return {
    status: shown.status,
    finished: analysisFinished(shown, now),
    sourcesReady: analysisSourcesReady(shown, now),
    rubrics: RUBRIC_KEYS.map((key) => ({ key, name: RUBRIC_NAMES[key], status: shown.rubrics[key].status, label: rubricLabel(shown.rubrics[key]) })),
    notice: analysisNotice(shown, now),
  };
}
export type AnalysisView = NonNullable<ReturnType<typeof analysisView>>;
