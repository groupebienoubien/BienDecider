import { z } from "zod";

/**
 * Règles pures de la recherche réelle avant compte (#361, #362, #370) : des comparables et une opportunité trouvés par
 * recherche web, jamais inventés. Même mécanique que l'analyse publique de l'étape 1 (#280, `analysis-rules.ts`),
 * en plus simple : deux faits au lieu de quatre rubriques, et aucune extraction du site.
 */

export type ExcludedCompetitor = { name: string; source: string };
export const planningEvidenceSchema = z.object({
  id: z.string().min(1).max(100), fact: z.string().min(1).max(300),
  kind: z.enum(["observed", "declared"]),
  topic: z.enum(["profile", "site_web", "fiche_google", "opportunite"]),
  source: z.string().max(600).nullable(), readAt: z.string().max(40).nullable(),
}).strict();
const planningContextSchema = z.object({
  approachVersion: z.literal(2).optional(),
  analysisRunId: z.string().max(100).nullable(),
  evidence: z.array(planningEvidenceSchema).max(30),
  limitations: z.array(z.string().max(600)).max(30),
  hypotheses: z.array(z.string().max(300)).max(10).optional(),
  mediaBudgetPerMonth: z.number().nullable(),
  recruitment: z.enum(["possible", "no", "unspecified"]),
  socialProfiles: z.array(z.object({ platform: z.enum(["facebook", "instagram", "linkedin"]), url: z.string().max(600) })).max(10),
});
export type PlanningContext = z.infer<typeof planningContextSchema>;
export type IntelligenceInput = { companyName?: string; location?: string; website?: string; trade: string; servingArea: string; offers: string; targetClients: string; ambitionText: string; excludedCompetitors?: ExcludedCompetitor[]; planningContext?: PlanningContext };

const planningSchema = z.object({
  status: z.enum(["running", "done", "failed"]),
  proposal: z.json().optional(),
  notice: z.string().max(600).optional(),
  cost: z.object({ usd: z.number(), inputTokens: z.number(), outputTokens: z.number(), model: z.string().max(100).optional() }),
});
export type DraftMissionPlanning = z.infer<typeof planningSchema>;

export type CompetitorDimension = "trade" | "servingArea" | "offers" | "targetClients";
export type CompetitorComparison = { dimension: CompetitorDimension; businessValue: string; competitorValue: string };
export type CompetitorFact = {
  name: string;
  fact: string;
  source: string;
  relationship?: "direct" | "indirect";
  comparabilityReason?: string;
  readAt?: string;
  comparisons?: CompetitorComparison[];
};
export type OpportunityFact = { title: string; description: string; source: string; isEvent: boolean; eventEndDate: string | null };
export type CompetitorDecision = { name: string; source: string; decision: "confirmed" | "dismissed" };

function normalizedName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "");
}

function publicHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Ne conserve que des candidats comparés sur des informations des deux côtés et rattachés à une source publique. */
export function readCompetitorFacts(raw: unknown, input: IntelligenceInput, now: Date): CompetitorFact[] {
  if (!Array.isArray(raw)) return [];
  const businessValues: Record<CompetitorDimension, string> = {
    trade: input.trade,
    servingArea: input.servingArea,
    offers: input.offers,
    targetClients: input.targetClients,
  };
  const companyName = normalizedName(input.companyName ?? "");
  const ownHost = input.website ? (() => {
    try { return new URL(input.website).hostname.toLocaleLowerCase("fr").replace(/^www\./, ""); } catch { return ""; }
  })() : "";
  const excludedNames = new Set((input.excludedCompetitors ?? []).map((item) => normalizedName(item.name)));
  const seen = new Set<string>();
  const result: CompetitorFact[] = [];

  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.fact !== "string" || typeof item.comparabilityReason !== "string") continue;
    if (item.relationship !== "direct" && item.relationship !== "indirect") continue;
    const name = item.name.trim().replace(/\s*\(.*$/, "").split(",")[0]?.trim() ?? "";
    const normalized = normalizedName(name);
    const source = publicHttpUrl(item.source);
    const fact = item.fact.trim();
    const comparabilityReason = item.comparabilityReason.trim();
    if (!name || !normalized || normalized === companyName || excludedNames.has(normalized) || seen.has(normalized)) continue;
    if (!source || !fact || !comparabilityReason) continue;
    if (ownHost && new URL(source).hostname.toLocaleLowerCase("fr").replace(/^www\./, "") === ownHost) continue;
    if (!Array.isArray(item.comparisons)) continue;

    const dimensions = new Set<CompetitorDimension>();
    const comparisons: CompetitorComparison[] = [];
    for (const rawComparison of item.comparisons) {
      if (!rawComparison || typeof rawComparison !== "object" || Array.isArray(rawComparison)) continue;
      const comparison = rawComparison as Record<string, unknown>;
      const dimension = comparison.dimension;
      const competitorValue = typeof comparison.competitorValue === "string" ? comparison.competitorValue.trim() : "";
      if (!(dimension === "trade" || dimension === "servingArea" || dimension === "offers" || dimension === "targetClients")) continue;
      const businessValue = businessValues[dimension].trim();
      if (!businessValue || !competitorValue || dimensions.has(dimension)) continue;
      dimensions.add(dimension);
      comparisons.push({ dimension, businessValue: businessValue.slice(0, 200), competitorValue: competitorValue.slice(0, 300) });
    }
    if (comparisons.length === 0) continue;
    seen.add(normalized);
    result.push({
      name: name.slice(0, 100),
      fact: fact.slice(0, 300),
      source,
      relationship: item.relationship,
      comparabilityReason: comparabilityReason.slice(0, 300),
      readAt: now.toISOString(),
      comparisons,
    });
  }
  return result;
}

/** Recherches anonymes par connexion (IP) et par 24 h, comme l'analyse (#280, D2). */
export const INTELLIGENCE_PER_IP_DAILY_LIMIT = 3;
/** Lecture refusée par un plafond : celui de la connexion ou celui de tous les visiteurs, et l'heure où il se libère. */
export type IntelligenceLimit = { scope: "ip" | "global"; retryAt: string };

export type DraftIntelligence = {
  runId: string;
  status: "running" | "done" | "limited" | "failed";
  startedAt: string;
  finishedAt: string | null;
  input: IntelligenceInput;
  competitor: CompetitorFact | null;
  competitors?: CompetitorFact[];
  opportunity: OpportunityFact | null;
  /** `model` : modèle réellement appelé, repris dans le `UsageEvent` du compte à l'inscription ; absent si rien n'a été appelé. */
  cost: { usd: number; inputTokens: number; outputTokens: number; model?: string };
  limit?: IntelligenceLimit;
  planning?: DraftMissionPlanning;
};

/** Une recherche « en cours » plus vieille que ce délai a été interrompue (durée maximale de la route). */
export const INTELLIGENCE_STALE_MS = 180_000;

export const INTELLIGENCE_MESSAGES = {
  limited: "Paul a atteint sa limite de recherches pour aujourd'hui : ce n'est pas une panne. Vos pistes restent fondées sur ce que vous avez déjà confirmé.",
  busy: "Paul recherche déjà votre secteur. Patientez quelques secondes.",
  failed: "La recherche de marché n'a pas abouti. Les pistes ci-dessous restent exploratoires, fondées sur votre profil : elles ne constituent pas une analyse approfondie.",
  missing: "Aucune recherche de marché à jour n'est disponible pour ce profil. Les pistes ci-dessous restent exploratoires ; revenez à votre ambition pour relancer la recherche.",
  planningFailed: "La préparation des missions n'a pas abouti. Aucune proposition générique ne la remplace ; revenez à votre ambition pour réessayer.",
} as const;

export function newIntelligence(input: IntelligenceInput, runId: string, now = new Date(), status: DraftIntelligence["status"] = "running", limit?: IntelligenceLimit): DraftIntelligence {
  return {
    runId, status, startedAt: now.toISOString(), finishedAt: status === "running" ? null : now.toISOString(),
    input: { ...input, ...(input.excludedCompetitors ? { excludedCompetitors: input.excludedCompetitors.map((item) => ({ ...item })) } : {}) },
    competitor: null, competitors: [], opportunity: null, cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    ...(status === "limited" && limit ? { limit } : {}),
    ...(input.planningContext ? {
      planning: {
        status: status === "running" ? "running" as const : "failed" as const,
        cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
        ...(status !== "running" ? { notice: INTELLIGENCE_MESSAGES.planningFailed } : {}),
      },
    } : {}),
  };
}

export function intelligenceRunning(intelligence: DraftIntelligence | null, now = new Date()): boolean {
  return intelligence?.status === "running" && now.getTime() - Date.parse(intelligence.startedAt) < INTELLIGENCE_STALE_MS;
}

/** Recherche terminée, lue ou interrompue (une recherche interrompue compte pour terminée, comme l'analyse). */
export function intelligenceFinished(intelligence: DraftIntelligence | null, now = new Date()): boolean {
  return intelligence !== null && !intelligenceRunning(intelligence, now);
}

/** Recherche telle qu'affichée : une recherche interrompue au-delà du délai passe « échouée ». */
export function effectiveIntelligence(intelligence: DraftIntelligence | null, now = new Date()): DraftIntelligence | null {
  if (!intelligence || intelligence.status !== "running" || intelligenceRunning(intelligence, now)) return intelligence;
  return { ...intelligence, status: "failed", finishedAt: intelligence.finishedAt ?? now.toISOString() };
}

/** Faut-il lancer une nouvelle recherche ? Non si la même entreprise a déjà été cherchée ; oui après un refus de quota ou un échec. */
export function needsNewIntelligence(current: DraftIntelligence | null, input: IntelligenceInput, now = new Date()): boolean {
  if (!current) return true;
  if (intelligenceRunning(current, now)) return false;
  if (current.status === "limited" || current.status === "running" || current.status === "failed") return true;
  if (current.planning?.status === "failed") return true;
  return !sameIntelligenceInput(current.input, input);
}

export function sameIntelligenceInput(left: IntelligenceInput, right: IntelligenceInput): boolean {
  const fields = ["companyName", "location", "website", "trade", "servingArea", "offers", "targetClients", "ambitionText"] as const;
  if (!fields.every((field) => (left[field] ?? "") === (right[field] ?? ""))) return false;
  if (JSON.stringify(left.planningContext ?? null) !== JSON.stringify(right.planningContext ?? null)) return false;
  const exclusions = (input: IntelligenceInput) => (input.excludedCompetitors ?? [])
    .map(({ name, source }) => `${name.trim().toLocaleLowerCase("fr")}\u0000${source.trim()}`)
    .sort()
    .join("\u0001");
  return exclusions(left) === exclusions(right);
}

function limitScope(limit: IntelligenceLimit): string {
  return limit.scope === "ip" ? `depuis cette connexion (${INTELLIGENCE_PER_IP_DAILY_LIMIT} recherches par jour)` : "pour l'ensemble des visiteurs";
}

export function intelligenceNotice(intelligence: DraftIntelligence | null, now = new Date()): string | null {
  const shown = effectiveIntelligence(intelligence, now);
  if (!shown || shown.status === "running") return null;
  if (shown.planning && shown.planning.status !== "done") return INTELLIGENCE_MESSAGES.planningFailed;
  if (shown.status === "limited") return `Limite de recherches du jour atteinte ${shown.limit ? limitScope(shown.limit) : "pour l'ensemble des visiteurs"} : ${INTELLIGENCE_MESSAGES.limited}`;
  if (shown.status === "failed") return INTELLIGENCE_MESSAGES.failed;
  if (!(shown.competitors?.length || shown.competitor) && !shown.opportunity) return "La recherche n'a retenu aucun repère de marché suffisamment solide. Les pistes restent fondées sur votre profil, pas sur une comparaison concurrentielle.";
  return null;
}

/** Vue publique de la progression (GET), sans l'entrée ni le coût. */
export function intelligenceView(intelligence: DraftIntelligence | null, now = new Date()) {
  const shown = effectiveIntelligence(intelligence, now);
  if (!shown) return null;
  return {
    status: shown.status,
    finished: intelligenceFinished(shown, now),
    hasCompetitor: Boolean(shown.competitors?.length || shown.competitor),
    hasOpportunity: shown.opportunity !== null,
    notice: intelligenceNotice(intelligence, now),
  };
}
export type IntelligenceView = NonNullable<ReturnType<typeof intelligenceView>>;

const comparisonSchema = z.object({
  dimension: z.enum(["trade", "servingArea", "offers", "targetClients"]),
  businessValue: z.string().max(200),
  competitorValue: z.string().max(300),
});
const competitorSchema = z.object({
  name: z.string().max(100), fact: z.string().max(300), source: z.string().max(600),
  relationship: z.enum(["direct", "indirect"]).optional(),
  comparabilityReason: z.string().max(300).optional(),
  readAt: z.string().max(40).optional(),
  comparisons: z.array(comparisonSchema).max(4).optional(),
});
const opportunitySchema = z.object({
  title: z.string().max(120), description: z.string().max(300), source: z.string().max(600),
  isEvent: z.boolean(), eventEndDate: z.string().max(20).nullable(),
});
const intelligenceSchema = z.object({
  runId: z.string().max(100),
  status: z.enum(["running", "done", "limited", "failed"]),
  startedAt: z.string().max(40),
  finishedAt: z.string().max(40).nullable(),
  input: z.object({
    companyName: z.string().optional(), location: z.string().optional(), website: z.string().optional(),
    trade: z.string(), servingArea: z.string(), offers: z.string(), targetClients: z.string(), ambitionText: z.string(),
    excludedCompetitors: z.array(z.object({ name: z.string(), source: z.string() })).optional(),
    planningContext: planningContextSchema.optional(),
  }),
  competitor: competitorSchema.nullable(),
  competitors: z.array(competitorSchema).optional(),
  opportunity: opportunitySchema.nullable(),
  cost: z.object({ usd: z.number(), inputTokens: z.number(), outputTokens: z.number(), model: z.string().max(100).optional() }),
  limit: z.object({ scope: z.enum(["ip", "global"]), retryAt: z.string().max(40) }).optional(),
  planning: planningSchema.optional(),
});

/** Lecture défensive de la colonne `intelligence` : toute valeur illisible vaut « pas de recherche ». */
export function readIntelligence(raw: unknown): DraftIntelligence | null {
  const parsed = intelligenceSchema.safeParse(raw);
  return parsed.success ? (parsed.data as DraftIntelligence) : null;
}

export const INTELLIGENCE_USAGE_AGENT = "onboarding_intelligence";

/** Coût de la recherche anonyme à reprendre au compte créé, comme `analysisUsage`/`synthesisUsage` : seulement s'il est positif et le modèle connu. */
export function intelligenceUsage(intelligence: DraftIntelligence | null): { agent: string; model: string; inputTokens: number; outputTokens: number; costUsd: number } | null {
  const cost = intelligence?.cost;
  if (!cost || !cost.model || !Number.isFinite(cost.usd) || cost.usd <= 0) return null;
  const tokens = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  return { agent: INTELLIGENCE_USAGE_AGENT, model: cost.model, inputTokens: tokens(cost.inputTokens), outputTokens: tokens(cost.outputTokens), costUsd: cost.usd };
}

export function missionPlanningUsage(intelligence: DraftIntelligence | null): ReturnType<typeof intelligenceUsage> {
  const cost = intelligence?.planning?.cost;
  if (!cost || !cost.model || !Number.isFinite(cost.usd) || cost.usd <= 0) return null;
  return { agent: "onboarding_mission_planning", model: cost.model, inputTokens: Math.round(cost.inputTokens), outputTokens: Math.round(cost.outputTokens), costUsd: cost.usd };
}
