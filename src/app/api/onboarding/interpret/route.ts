import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { getSessionCompany } from "@/lib/session";
import { recordUsage } from "@/lib/usage";
import { AgentRunQuotaError, reserveUsageBudget } from "@/lib/agent-runs";
import { classifyRunError } from "@/lib/agents/agent-errors";

export const maxDuration = 60;

const profileSchema = z.object({
  name: z.string().max(160),
  trade: z.string().max(160),
  servingArea: z.string().max(240),
  objective: z.string().max(500),
});

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const sentence = z.object({ sentence: z.string().trim().min(8).max(1200) }).safeParse(body);
  if (!sentence.success) {
    return NextResponse.json({ error: "Décrivez votre activité et votre objectif en une phrase (8 à 1 200 caractères)." }, { status: 400 });
  }

  try {
    const reservation = await reserveUsageBudget(company.id, "onboarding_interpret");
    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: 500,
      tools: [{
        name: "extract_company_profile",
        description: "Extrais les éléments explicitement mentionnés, sans jamais inventer une information absente.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom commercial explicitement cité ; sinon chaîne vide." },
            trade: { type: "string", description: "Métier ou activité ; formulation concise, sans ajouter de spécialité non dite." },
            servingArea: { type: "string", description: "Zone de chalandise citée ; sinon chaîne vide." },
            objective: { type: "string", description: "Objectif business formulé ; sinon chaîne vide." },
          },
          required: ["name", "trade", "servingArea", "objective"],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: "tool", name: "extract_company_profile" },
      messages: [{
        role: "user",
        content: `À partir de cette phrase, retourne uniquement les informations explicitement présentes. Si un champ n'est pas indiqué, retourne une chaîne vide. N'invente jamais un nom commercial, un métier, une zone ni un objectif.\n\nPhrase : ${sentence.data.sentence}`,
      }],
    });
    await recordUsage({ companyId: company.id, reservationId: reservation.id, agent: "onboarding", model: AGENT_MODEL, usage: response.usage });

    const extracted = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const parsed = profileSchema.safeParse(extracted?.input);
    if (!parsed.success) {
      return NextResponse.json({ error: "Impossible d'interpréter cette phrase. Complétez le formulaire manuellement." }, { status: 502 });
    }

    return NextResponse.json({ profile: parsed.data });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    return NextResponse.json({ error: "Interprétation indisponible. Vous pouvez compléter le formulaire manuellement." }, { status: 503 });
  }
}