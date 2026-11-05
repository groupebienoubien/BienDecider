import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { reserveUsageBudget } from "@/lib/agent-runs";
import { recordUsage } from "@/lib/usage";
import { channelLabel, type MissionChannel } from "@/lib/missions/channels";
import { BODY_MAX, TITLE_MAX, channelBodyLimit, titleLabel, variantLabel, type ContentFormat, type VariantRequest } from "@/lib/contents/rules";

/** Ce que Paul reçoit pour écrire : l'entreprise, la mission, le canal, la version de départ et les refus motivés à respecter. */
export type DraftRequest = {
  companyId: string;
  company: { name: string; trade: string; servingArea: string; ownerName: string | null; website: string | null };
  mission: { title: string; outcome: string; finding: string; scopeSummary: string };
  channel: MissionChannel | null;
  format: ContentFormat;
  base: { title: string; body: string } | null;
  variant: VariantRequest | null;
  rejections: string[];
};

export type DraftResult = { title: string; body: string };
export type DraftWriter = (request: DraftRequest) => Promise<DraftResult>;

const FORMAT_GUIDE: Record<ContentFormat, string> = {
  social_post: "une publication de réseau social : une accroche courte, puis un texte simple, chaleureux, qui finit par une invitation claire à prendre contact",
  email: "un e-mail individuel, sobre et personnel : l'objet, puis le corps signé du dirigeant, sans formule commerciale appuyée",
  site_page: "une page de site complète : le titre de la page, puis le texte en paragraphes courts, avec des intertitres simples sur leur propre ligne",
  google_post: "une publication de fiche Google : une accroche, puis un texte bref et concret",
  text: "un texte que le dirigeant diffusera lui-même : une accroche, puis le texte",
};

const draftSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX), body: z.string().trim().min(1).max(BODY_MAX) });

export function buildDraftPrompt(request: DraftRequest): string {
  const limit = Math.min(channelBodyLimit(request.channel), BODY_MAX);
  const lines = [
    `Tu es Paul, l'associé IA d'une petite entreprise. Écris ${FORMAT_GUIDE[request.format]}.`,
    `Entreprise : ${request.company.name} — ${request.company.trade}, ${request.company.servingArea}.${request.company.ownerName ? ` Dirigeant : ${request.company.ownerName}.` : ""}${request.company.website ? ` Site : ${request.company.website}.` : ""}`,
    `Mission : ${request.mission.title}. Résultat recherché : ${request.mission.outcome}. Constat : ${request.mission.finding}. Périmètre : ${request.mission.scopeSummary}.`,
    `Canal : ${request.channel ? channelLabel(request.channel) : "hors canal, diffusé par le dirigeant"}.`,
    `Règles : en français, au nom de l'entreprise (jamais au nom de Paul). N'invente aucun prix, aucune date, aucun chiffre, aucune promesse ni aucune coordonnée absents des informations ci-dessus : laisse plutôt un repère entre crochets à compléter, par exemple [prix] ou [date]. ${titleLabel(request.format)} de ${TITLE_MAX} caractères au plus ; texte de ${limit} caractères au plus.`,
  ];
  if (request.rejections.length) lines.push(`Le dirigeant a refusé des versions précédentes pour ces raisons, à respecter : ${request.rejections.map((reason) => `« ${reason} »`).join(" ; ")}.`);
  if (request.base) lines.push(`Version de départ :\n${titleLabel(request.format)} : ${request.base.title}\nTexte :\n${request.base.body}`);
  if (request.variant) lines.push(`Retravaille cette version : ${variantLabel(request.variant)}. Garde les faits, change seulement ce qui est demandé.`);
  return lines.join("\n\n");
}

/** Paul écrit avec le modèle, sous la réservation de budget de l'entreprise, et le coût mesuré est enregistré. */
export const anthropicDraftWriter: DraftWriter = async (request) => {
  const reservation = await reserveUsageBudget(request.companyId, "mission_content");
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: 2000,
      tools: [{
        name: "write_content",
        description: "Rends le contenu prêt à relire par le dirigeant.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: `${titleLabel(request.format)}, ${TITLE_MAX} caractères au plus.` },
            body: { type: "string", description: "Le texte, sans balise HTML ni Markdown." },
          },
          required: ["title", "body"],
          additionalProperties: false,
        },
      }],
      // Ce modèle refuse un outil imposé (tool_choice « tool » ou « any ») : la consigne système demande l'outil, une réponse sans lui est refusée plus bas.
      system: "Tu réponds uniquement en appelant l'outil write_content, une seule fois, sans texte autour.",
      messages: [{ role: "user", content: buildDraftPrompt(request) }],
    });
  } catch (error) {
    // Rien n'a été produit : la réservation est libérée pour ne pas bloquer le budget du jour.
    await recordUsage({ companyId: request.companyId, reservationId: reservation.id, agent: "content", model: AGENT_MODEL, usage: { input_tokens: 0, output_tokens: 0 } }).catch(() => undefined);
    throw error;
  }
  await recordUsage({ companyId: request.companyId, reservationId: reservation.id, agent: "content", model: AGENT_MODEL, usage: response.usage });
  const block = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use");
  const parsed = draftSchema.safeParse(block?.input);
  if (!parsed.success) throw new Error("Contenu illisible");
  return parsed.data;
};
