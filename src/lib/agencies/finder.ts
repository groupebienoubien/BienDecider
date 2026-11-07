import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { reserveUsageBudget } from "@/lib/agent-runs";
import { recordUsage, type UsageLike } from "@/lib/usage";
import { AGENCY_SEARCH_MAX } from "@/lib/agencies/rules";
import { companyFocusText } from "@/lib/company-profile";

/** Ce que Paul reçoit pour chercher des prescripteurs : l'entreprise et les agences déjà connues, à ne pas reproposer. */
export type AgencySearchRequest = {
  companyId: string;
  company: { name: string; trade: string; servingArea: string; description: string | null; targetClients?: string | null; offers?: string | null };
  known: string[];
};

/** Rend les agences telles que Paul les a données ; le service ne retient que celles qui passent `readFoundAgency`. */
export type AgencyFinder = (request: AgencySearchRequest) => Promise<unknown[]>;

export function buildAgencySearchPrompt(request: AgencySearchRequest): string {
  const focus = companyFocusText(request.company);
  const lines = [
    `Entreprise : ${request.company.name} — ${request.company.trade}, zone : ${request.company.servingArea}.${request.company.description ? ` Activité : ${request.company.description.slice(0, 500)}.` : ""}${focus ? ` ${focus}` : ""}`,
    `Cherche sur le web jusqu'à ${AGENCY_SEARCH_MAX} agences de cette zone qui peuvent recommander cette entreprise à leurs clients (agences immobilières, syndics, architectes, maîtres d'œuvre, gestionnaires de biens… selon le métier).`,
    "Pour chacune : son nom, son secteur, son e-mail professionnel tel qu'il est publié par l'agence elle-même (par exemple contact@ ou agence@), la page web où tu l'as lu, et en une phrase pourquoi elle peut recommander l'entreprise.",
    "Règles : uniquement des organisations réelles et des informations publiques et professionnelles, jamais l'adresse personnelle d'une personne. N'invente aucune agence ni aucune adresse : une agence sans e-mail publié est laissée de côté.",
  ];
  if (request.known.length) lines.push(`Déjà connues, à ne pas reproposer : ${request.known.join(", ")}.`);
  return lines.join("\n\n");
}

const RECORD_TOOL: Anthropic.Tool = {
  name: "record_agencies",
  description: "Rends la liste des agences trouvées, avec leurs sources.",
  input_schema: {
    type: "object",
    properties: {
      agencies: {
        type: "array",
        maxItems: AGENCY_SEARCH_MAX,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom de l'agence." },
            sector: { type: "string", description: "Secteur en quelques mots, par exemple « Agence immobilière »." },
            email: { type: "string", description: "E-mail professionnel publié par l'agence." },
            source: { type: "string", description: "Adresse de la page où l'e-mail a été lu." },
            reason: { type: "string", description: "Pourquoi elle peut recommander l'entreprise, en une phrase." },
          },
          required: ["name", "sector", "email", "source", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["agencies"],
    additionalProperties: false,
  },
};

const MAX_CALLS = 4;

/** Paul cherche avec la recherche web, sous la réservation de budget de l'entreprise ; le coût mesuré est enregistré, même en cas d'échec. */
export const anthropicAgencyFinder: AgencyFinder = async (request) => {
  const reservation = await reserveUsageBudget(request.companyId, "agency_search");
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const add = (measured: UsageLike) => {
    usage.input_tokens += measured?.input_tokens ?? 0;
    usage.output_tokens += measured?.output_tokens ?? 0;
    usage.cache_creation_input_tokens += measured?.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += measured?.cache_read_input_tokens ?? 0;
  };
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildAgencySearchPrompt(request) }];
  try {
    for (let call = 0; call < MAX_CALLS; call++) {
      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 4000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, RECORD_TOOL],
        // Ce modèle refuse un outil imposé : la consigne système demande l'outil, une réponse sans lui ne retient aucune agence.
        system: "Tu es Paul, l'associé IA d'une petite entreprise. Tu cherches avec web_search, puis tu réponds en appelant l'outil record_agencies une seule fois, sans texte autour.",
        messages,
      });
      add(response.usage);
      const block = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use" && item.name === RECORD_TOOL.name);
      if (block) {
        const list = (block.input as { agencies?: unknown }).agencies;
        return Array.isArray(list) ? list : [];
      }
      // Recherche longue interrompue par l'API : on la reprend là où elle s'est arrêtée.
      if (response.stop_reason !== "pause_turn") return [];
      messages.push({ role: "assistant", content: response.content });
    }
    return [];
  } finally {
    await recordUsage({ companyId: request.companyId, reservationId: reservation.id, agent: "agency_search", model: AGENT_MODEL, usage }).catch((error: unknown) => {
      console.error("[agencies] coût non enregistré", error instanceof Error ? error.message : error);
    });
  }
};
