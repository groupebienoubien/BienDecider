import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildMissionPlanningPrompt, checkMissionProposal, missionProposalSchema } from "@/lib/onboarding/mission-planning-rules";
import type { DraftIntelligence, DraftMissionPlanning } from "@/lib/onboarding/intelligence-rules";
import { estimateCostUsd, type UsageLike } from "@/lib/usage";

export type MissionPlanningResult = { proposal: unknown; usage: UsageLike; model: string } | null;
export type MissionPlanner = (intelligence: DraftIntelligence) => Promise<MissionPlanningResult>;

const planWithModel: MissionPlanner = async (intelligence) => {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error("Clé Anthropic absente pour la préparation des missions.");
  const { anthropic, MISSION_PLANNING_MODEL } = await import("@/lib/anthropic");
  const tool: Anthropic.Tool = {
    name: "record_mission_plan",
    description: "Enregistre le plan comparé, personnalisé et étayé, sans créer ni lancer de mission.",
    input_schema: { ...z.toJSONSchema(missionProposalSchema), type: "object" },
  };
  const response = await anthropic.messages.create({
    model: MISSION_PLANNING_MODEL,
    max_tokens: 6500,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: "Tu es Paul, associé stratégique d'une petite entreprise. Tu raisonnes à partir des preuves et de l'objectif, puis tu appelles record_mission_plan une seule fois. Aucun texte autour.",
    tools: [tool],
    messages: [{ role: "user", content: buildMissionPlanningPrompt(intelligence) }],
  }, { timeout: 60_000, maxRetries: 0 });
  const block = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use" && item.name === tool.name);
  if (!block) console.error(`Préparation des missions : aucun plan reçu du modèle (arrêt : ${response.stop_reason ?? "inconnu"}).`);
  return { proposal: block?.input, usage: response.usage, model: MISSION_PLANNING_MODEL };
};

export async function prepareMissionPlanning(intelligence: DraftIntelligence, planner: MissionPlanner = planWithModel): Promise<DraftMissionPlanning> {
  let cost: DraftMissionPlanning["cost"] = { usd: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const result = await planner(intelligence);
    if (!result) throw new Error("Service de préparation des missions indisponible.");
    const tokens = {
      input: result.usage?.input_tokens ?? 0, output: result.usage?.output_tokens ?? 0,
      cacheWrite: result.usage?.cache_creation_input_tokens ?? 0, cacheRead: result.usage?.cache_read_input_tokens ?? 0,
    };
    cost = {
      usd: estimateCostUsd(result.model, tokens),
      inputTokens: tokens.input + tokens.cacheWrite + tokens.cacheRead, outputTokens: tokens.output, model: result.model,
    };
    const checked = checkMissionProposal(result.proposal, intelligence);
    if (!checked.ok) throw new Error(checked.error);
    const proposal = z.json().parse(result.proposal);
    return { status: "done", proposal, cost };
  } catch (error) {
    console.error(`Préparation des missions impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    return { status: "failed", cost };
  }
}
