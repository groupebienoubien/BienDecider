import { z } from "zod";

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
export type UnavailableReason = "no_site" | "unreadable" | "refused" | "service";
export type Rubric = { status: RubricStatus; reason?: UnavailableReason };

const REASON_LABELS: Record<UnavailableReason, string> = {
  no_site: "pas de site",
  unreadable: "site illisible",
  refused: "accès refusé",
  service: "service indisponible",
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
  pages: { url: string; readAt: string }[];
};

export type AnalysisInput = { companyName: string; location: string; website: string };

export type DraftAnalysis = {
  runId: string;
  status: "running" | "done" | "limited";
  startedAt: string;
  finishedAt: string | null;
  input: AnalysisInput;
  rubrics: Record<RubricKey, Rubric>;
  findings: AnalysisFindings;
  cost: { usd: number; inputTokens: number; outputTokens: number };
};

/** Une analyse « en cours » plus vieille que ce délai a été interrompue (durée maximale de la route : 60 s). */
export const ANALYSIS_STALE_MS = 90_000;

export const ANALYSIS_MESSAGES = {
  limited: "Paul a déjà beaucoup lu aujourd'hui : revenez plus tard pour la lecture de votre entreprise. Vous pouvez continuer dès maintenant et compléter vous-même l'étape suivante.",
  busy: "Paul lit déjà votre entreprise. Patientez quelques secondes.",
  missing: "Lancez d'abord « Découvrir mon entreprise ».",
  partial: "Paul n'a pas pu tout lire. Vous compléterez ce qui manque à l'étape suivante.",
} as const;

export function emptyFindings(): AnalysisFindings {
  return { trade: null, servingArea: null, targetClients: null, offers: null, tone: null, contacts: [], palette: null, logo: null, google: null, pages: [] };
}

export function newAnalysis(input: AnalysisInput, runId: string, now = new Date(), status: DraftAnalysis["status"] = "running"): DraftAnalysis {
  const pending: Rubric = { status: "pending" };
  const rubrics: Record<RubricKey, Rubric> = status === "limited"
    ? { site: { status: "unavailable", reason: "service" }, google: { status: "unavailable", reason: "service" }, zone: { status: "unavailable", reason: "service" }, identity: { status: "unavailable", reason: "service" } }
    : { site: input.website ? pending : { status: "unavailable", reason: "no_site" }, google: pending, zone: pending, identity: input.website ? pending : { status: "unavailable", reason: "no_site" } };
  return {
    runId, status, startedAt: now.toISOString(), finishedAt: status === "limited" ? now.toISOString() : null,
    input: { ...input }, rubrics, findings: emptyFindings(), cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
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
  return current.input.companyName !== input.companyName || current.input.location !== input.location || current.input.website !== input.website;
}

/** Message affiché sous les rubriques, s'il y a lieu (quota, service indisponible, site illisible ou refusé). */
export function analysisNotice(analysis: DraftAnalysis | null): string | null {
  if (!analysis || analysis.status === "running") return null;
  if (analysis.status === "limited") return ANALYSIS_MESSAGES.limited;
  return RUBRIC_KEYS.some((key) => analysis.rubrics[key].status === "unavailable" && analysis.rubrics[key].reason !== "no_site") ? ANALYSIS_MESSAGES.partial : null;
}

const provenanceSchema = z.union([
  z.object({ kind: z.literal("observed"), source: z.string().max(600), readAt: z.string().max(40) }),
  z.object({ kind: z.literal("hypothesis") }),
  z.object({ kind: z.literal("declared") }),
]);
const findingSchema = z.object({ value: z.string().max(600), provenance: provenanceSchema });
const rubricSchema = z.object({ status: z.enum(["pending", "read", "unavailable", "not_found"]), reason: z.enum(["no_site", "unreadable", "refused", "service"]).optional() });
const analysisSchema = z.object({
  runId: z.string().max(100),
  status: z.enum(["running", "done", "limited"]),
  startedAt: z.string().max(40),
  finishedAt: z.string().max(40).nullable(),
  input: z.object({ companyName: z.string(), location: z.string(), website: z.string() }),
  rubrics: z.object({ site: rubricSchema, google: rubricSchema, zone: rubricSchema, identity: rubricSchema }),
  findings: z.object({
    trade: findingSchema.nullable(), servingArea: findingSchema.nullable(), targetClients: findingSchema.nullable(), offers: findingSchema.nullable(),
    tone: findingSchema.nullable(), contacts: z.array(findingSchema).max(10), palette: z.object({ value: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).max(10), provenance: provenanceSchema }).nullable(),
    logo: findingSchema.nullable(), google: findingSchema.nullable(), pages: z.array(z.object({ url: z.string().max(600), readAt: z.string().max(40) })).max(5),
  }),
  cost: z.object({ usd: z.number(), inputTokens: z.number(), outputTokens: z.number() }),
});

/** Lecture défensive de la colonne `analysis` : toute valeur illisible vaut « pas d'analyse ». */
export function readAnalysis(raw: unknown): DraftAnalysis | null {
  const parsed = analysisSchema.safeParse(raw);
  return parsed.success ? (parsed.data as DraftAnalysis) : null;
}

/** Vue publique de la progression (GET), sans l'entrée ni le coût. */
export function analysisView(analysis: DraftAnalysis | null, now = new Date()) {
  const shown = effectiveAnalysis(analysis, now);
  if (!shown) return null;
  return {
    status: shown.status,
    finished: analysisFinished(shown, now),
    rubrics: RUBRIC_KEYS.map((key) => ({ key, name: RUBRIC_NAMES[key], status: shown.rubrics[key].status, label: rubricLabel(shown.rubrics[key]) })),
    notice: analysisNotice(shown),
  };
}
export type AnalysisView = NonNullable<ReturnType<typeof analysisView>>;
