import type Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd, type UsageLike } from "@/lib/usage";
import { eventEndDateIssue } from "@/lib/agents/personas";
import type { CompetitorFact, DraftIntelligence, IntelligenceInput, OpportunityFact } from "@/lib/onboarding/intelligence-rules";

/**
 * Recherche réelle avant compte (#362) : un concurrent réel et proche, une opportunité réelle et récente
 * (événement à venir ou partenariat local), chacun avec sa source — jamais inventés. Lancée après la réponse
 * de « C'est bien ça » (confirmation de l'ambition), comme l'analyse publique de l'étape 1 (#280).
 */

export const INTELLIGENCE_MAX_TOKENS = 4000;
const MODEL_TIMEOUT_MS = 30_000;
const MAX_CALLS = 4;

export type SearchResult = { competitor: CompetitorFact | null; opportunity: OpportunityFact | null; usage: UsageLike; model: string } | null;
export type IntelligenceSearcher = (input: IntelligenceInput, now: Date) => Promise<SearchResult>;

const RECORD_TOOL: Anthropic.Tool = {
  name: "record_market_facts",
  description: "Rends ce que tu as trouvé sur le marché local de cette entreprise : un concurrent et une opportunité, ou null pour l'un ou l'autre si rien de solide et sourcé n'a été trouvé.",
  input_schema: {
    type: "object",
    properties: {
      competitor: {
        type: ["object", "null"],
        description: "Un concurrent réel et proche (même métier, zone proche), avec un fait précis et vérifiable à son sujet. Null si aucun concurrent avec un fait solide et sourcé n'a été trouvé.",
        properties: {
          name: { type: "string", description: "Nom du concurrent." },
          fact: { type: "string", description: "Un fait précis et vérifiable (note et nombre d'avis Google, spécialité, ancienneté, taille…), jamais une comparaison vague." },
          source: { type: "string", description: "Adresse de la page où le fait a été lu." },
        },
        required: ["name", "fact", "source"],
        additionalProperties: false,
      },
      opportunity: {
        type: ["object", "null"],
        description: "Une opportunité réelle pour cette entreprise : un événement local à venir (salon, marché, foire…) ou un partenariat local plausible avec une organisation réelle. Null si rien de solide et sourcé n'a été trouvé.",
        properties: {
          title: { type: "string", description: "Titre court de l'opportunité." },
          description: { type: "string", description: "En une phrase, ce que c'est et pourquoi c'est pertinent pour cette entreprise." },
          source: { type: "string", description: "Adresse de la page où l'opportunité a été lue." },
          isEvent: { type: "boolean", description: "true si c'est un événement daté (salon, foire, marché…), false pour un partenariat ou une autre opportunité." },
          eventEndDate: { type: ["string", "null"], description: "Date de fin de l'événement, au format AAAA-MM-JJ, obligatoire si isEvent vaut true ; null sinon." },
        },
        required: ["title", "description", "source", "isEvent", "eventEndDate"],
        additionalProperties: false,
      },
    },
    required: ["competitor", "opportunity"],
    additionalProperties: false,
  },
};

function buildPrompt(input: IntelligenceInput): string {
  return [
    `Entreprise : ${input.trade}, zone : ${input.servingArea}. Offres : ${input.offers}. Clientèle visée : ${input.targetClients}.${input.ambitionText ? ` Ambition : ${input.ambitionText}.` : ""}`,
    "Cherche sur le web, pour cette entreprise précise (pas une liste générique de son métier) :",
    "1. Un concurrent réel et proche d'elle (même métier, zone proche), avec un fait précis et vérifiable à son sujet.",
    "2. Une opportunité réelle et récente : un événement local à venir, ou une organisation locale avec qui un partenariat ferait sens.",
    "Règles : uniquement des faits publics et vérifiables, chacun avec sa source (une page web réellement consultée). N'invente rien : laisse null la case correspondante si tu ne trouves rien de solide et sourcé. Un événement déjà terminé ne compte pas.",
  ].join("\n\n");
}

function readFact(raw: unknown, now: Date): { competitor: CompetitorFact | null; opportunity: OpportunityFact | null } {
  const value = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const competitorRaw = value.competitor;
  const competitor = competitorRaw !== null && typeof competitorRaw === "object"
    ? (() => {
        const item = competitorRaw as Record<string, unknown>;
        return typeof item.name === "string" && typeof item.fact === "string" && typeof item.source === "string" && item.name.trim() && item.fact.trim() && item.source.trim()
          ? { name: item.name.trim().slice(0, 100), fact: item.fact.trim().slice(0, 300), source: item.source.trim().slice(0, 600) }
          : null;
      })()
    : null;
  const opportunityRaw = value.opportunity;
  const opportunity = opportunityRaw !== null && typeof opportunityRaw === "object"
    ? (() => {
        const item = opportunityRaw as Record<string, unknown>;
        if (typeof item.title !== "string" || typeof item.description !== "string" || typeof item.source !== "string" || !item.title.trim() || !item.description.trim() || !item.source.trim()) return null;
        const isEvent = item.isEvent === true;
        const endDate = typeof item.eventEndDate === "string" ? item.eventEndDate.trim() : "";
        // Un événement sans date de fin valable, déjà terminé ou trop lointain n'est jamais retenu.
        if (isEvent && (!endDate || eventEndDateIssue(endDate, now) !== null)) return null;
        return {
          title: item.title.trim().slice(0, 120), description: item.description.trim().slice(0, 300), source: item.source.trim().slice(0, 600),
          isEvent, eventEndDate: isEvent ? endDate : null,
        };
      })()
    : null;
  return { competitor, opportunity };
}

/** Recherche par le modèle, avec web_search réelle : même discipline que `src/lib/agencies/finder.ts` (boucle bornée, aucune donnée inventée). */
export const searchWithModel: IntelligenceSearcher = async (input, now) => {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const { anthropic, AGENT_MODEL } = await import("@/lib/anthropic");
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const add = (measured: UsageLike) => {
    usage.input_tokens += measured?.input_tokens ?? 0;
    usage.output_tokens += measured?.output_tokens ?? 0;
    usage.cache_creation_input_tokens += measured?.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += measured?.cache_read_input_tokens ?? 0;
  };
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(input) }];
  try {
    for (let call = 0; call < MAX_CALLS; call++) {
      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: INTELLIGENCE_MAX_TOKENS,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, RECORD_TOOL],
        // Ce modèle refuse un outil imposé : la consigne système demande l'outil, une réponse sans lui ne retient aucun fait.
        system: "Tu es Paul, l'associé IA d'une petite entreprise qui n'a pas encore de compte. Tu cherches avec web_search, puis tu réponds en appelant l'outil record_market_facts une seule fois, sans texte autour.",
        messages,
      }, { timeout: MODEL_TIMEOUT_MS, maxRetries: 0 });
      add(response.usage);
      const block = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use" && item.name === RECORD_TOOL.name);
      if (block) return { ...readFact(block.input, now), usage, model: AGENT_MODEL };
      // Recherche longue interrompue par l'API : on la reprend là où elle s'est arrêtée.
      if (response.stop_reason !== "pause_turn") return { competitor: null, opportunity: null, usage, model: AGENT_MODEL };
      messages.push({ role: "assistant", content: response.content });
    }
    return { competitor: null, opportunity: null, usage, model: AGENT_MODEL };
  } catch (error) {
    console.error(`Recherche de marché avant compte impossible : ${error instanceof Error ? error.message : "erreur inconnue"}.`);
    return { competitor: null, opportunity: null, usage, model: AGENT_MODEL };
  }
};

function addUsage(intelligence: DraftIntelligence, usage: UsageLike, model: string | undefined): DraftIntelligence {
  if (!usage || !model) return intelligence;
  const tokens = { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0 };
  return { ...intelligence, cost: { usd: estimateCostUsd(model, tokens), inputTokens: tokens.input + tokens.cacheWrite + tokens.cacheRead, outputTokens: tokens.output, model: model.slice(0, 100) } };
}

export type IntelligenceDeps = { save: (intelligence: DraftIntelligence) => Promise<boolean>; search?: IntelligenceSearcher; now?: () => Date };

/** Déroule la recherche `intelligence` (déjà posée « en cours ») et l'écrit une fois terminée. */
export async function runDraftIntelligence(draftId: string, deps: IntelligenceDeps & { intelligence: DraftIntelligence }): Promise<DraftIntelligence> {
  const now = deps.now ?? (() => new Date());
  const search = deps.search ?? searchWithModel;
  let intelligence = deps.intelligence;
  try {
    const result = await search(intelligence.input, now());
    if (result) {
      intelligence = addUsage({ ...intelligence, competitor: result.competitor, opportunity: result.opportunity }, result.usage, result.model);
    }
    intelligence = { ...intelligence, status: "done", finishedAt: now().toISOString() };
  } catch (error) {
    console.error(`Recherche du brouillon ${draftId} interrompue : ${error instanceof Error ? error.message : "erreur inconnue"}.`);
    intelligence = { ...intelligence, status: "failed", finishedAt: now().toISOString() };
  }
  await deps.save(intelligence).catch(() => false);
  return intelligence;
}
