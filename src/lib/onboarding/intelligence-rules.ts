import { z } from "zod";

/**
 * Règles pures de la recherche réelle avant compte (#361, #362) : un concurrent et une opportunité trouvés par
 * recherche web, jamais inventés. Même mécanique que l'analyse publique de l'étape 1 (#280, `analysis-rules.ts`),
 * en plus simple : deux faits au lieu de quatre rubriques, et aucune extraction du site.
 */

export type IntelligenceInput = { companyName?: string; location?: string; website?: string; trade: string; servingArea: string; offers: string; targetClients: string; ambitionText: string };

export type CompetitorFact = { name: string; fact: string; source: string };
export type OpportunityFact = { title: string; description: string; source: string; isEvent: boolean; eventEndDate: string | null };

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
  opportunity: OpportunityFact | null;
  /** `model` : modèle réellement appelé, repris dans le `UsageEvent` du compte à l'inscription ; absent si rien n'a été appelé. */
  cost: { usd: number; inputTokens: number; outputTokens: number; model?: string };
  limit?: IntelligenceLimit;
};

/** Une recherche « en cours » plus vieille que ce délai a été interrompue (durée maximale de la route). */
export const INTELLIGENCE_STALE_MS = 90_000;

export const INTELLIGENCE_MESSAGES = {
  limited: "Paul a atteint sa limite de recherches pour aujourd'hui : ce n'est pas une panne. Vos pistes restent fondées sur ce que vous avez déjà confirmé.",
  busy: "Paul recherche déjà votre secteur. Patientez quelques secondes.",
  failed: "La recherche de marché n'a pas abouti. Les pistes ci-dessous restent exploratoires, fondées sur votre profil : elles ne constituent pas une analyse approfondie.",
  missing: "Aucune recherche de marché à jour n'est disponible pour ce profil. Les pistes ci-dessous restent exploratoires ; revenez à votre ambition pour relancer la recherche.",
} as const;

export function newIntelligence(input: IntelligenceInput, runId: string, now = new Date(), status: DraftIntelligence["status"] = "running", limit?: IntelligenceLimit): DraftIntelligence {
  return {
    runId, status, startedAt: now.toISOString(), finishedAt: status === "running" ? null : now.toISOString(),
    input: { ...input }, competitor: null, opportunity: null, cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    ...(status === "limited" && limit ? { limit } : {}),
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
  return !sameIntelligenceInput(current.input, input);
}

export function sameIntelligenceInput(left: IntelligenceInput, right: IntelligenceInput): boolean {
  const fields = ["companyName", "location", "website", "trade", "servingArea", "offers", "targetClients", "ambitionText"] as const;
  return fields.every((field) => (left[field] ?? "") === (right[field] ?? ""));
}

function limitScope(limit: IntelligenceLimit): string {
  return limit.scope === "ip" ? `depuis cette connexion (${INTELLIGENCE_PER_IP_DAILY_LIMIT} recherches par jour)` : "pour l'ensemble des visiteurs";
}

export function intelligenceNotice(intelligence: DraftIntelligence | null, now = new Date()): string | null {
  const shown = effectiveIntelligence(intelligence, now);
  if (!shown || shown.status === "running") return null;
  if (shown.status === "limited") return `Limite de recherches du jour atteinte ${shown.limit ? limitScope(shown.limit) : "pour l'ensemble des visiteurs"} : ${INTELLIGENCE_MESSAGES.limited}`;
  if (shown.status === "failed") return INTELLIGENCE_MESSAGES.failed;
  if (!shown.competitor && !shown.opportunity) return "La recherche n'a retenu aucun repère de marché suffisamment solide. Les pistes restent fondées sur votre profil, pas sur une comparaison concurrentielle.";
  return null;
}

/** Vue publique de la progression (GET), sans l'entrée ni le coût. */
export function intelligenceView(intelligence: DraftIntelligence | null, now = new Date()) {
  const shown = effectiveIntelligence(intelligence, now);
  if (!shown) return null;
  return {
    status: shown.status,
    finished: intelligenceFinished(shown, now),
    hasCompetitor: shown.competitor !== null,
    hasOpportunity: shown.opportunity !== null,
    notice: intelligenceNotice(intelligence, now),
  };
}
export type IntelligenceView = NonNullable<ReturnType<typeof intelligenceView>>;

const competitorSchema = z.object({ name: z.string().max(100), fact: z.string().max(300), source: z.string().max(600) });
const opportunitySchema = z.object({
  title: z.string().max(120), description: z.string().max(300), source: z.string().max(600),
  isEvent: z.boolean(), eventEndDate: z.string().max(20).nullable(),
});
const intelligenceSchema = z.object({
  runId: z.string().max(100),
  status: z.enum(["running", "done", "limited", "failed"]),
  startedAt: z.string().max(40),
  finishedAt: z.string().max(40).nullable(),
  input: z.object({ companyName: z.string().optional(), location: z.string().optional(), website: z.string().optional(), trade: z.string(), servingArea: z.string(), offers: z.string(), targetClients: z.string(), ambitionText: z.string() }),
  competitor: competitorSchema.nullable(),
  opportunity: opportunitySchema.nullable(),
  cost: z.object({ usd: z.number(), inputTokens: z.number(), outputTokens: z.number(), model: z.string().max(100).optional() }),
  limit: z.object({ scope: z.enum(["ip", "global"]), retryAt: z.string().max(40) }).optional(),
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
