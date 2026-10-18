import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AgentRunConflictError, AgentRunQuotaError, enqueuePlanRun } from "@/lib/agent-runs";
import { isPlanAgent } from "@/lib/agents/plan-items";
import { getSessionCompany } from "@/lib/session";

export const maxDuration = 300;

const launchSchema = z.object({ retryRunId: z.string().cuid().optional() }).strict();

/**
 * Lance l'agent correspondant à une action du plan de Paul, EN LUI PASSANT
 * L'ACTION COMME BRIEF (titre + justification). Avant ce correctif, l'agent
 * était lancé à vide et proposait autre chose que ce que Paul avait décidé.
 * Les propositions créées sont rattachées à l'action (planItemId).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (_request.headers.get("origin") !== _request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.actionPlanItem.findUnique({ where: { id } });
  if (!item || item.companyId !== company.id) {
    return NextResponse.json({ error: "Action introuvable" }, { status: 404 });
  }
  const parsed = launchSchema.safeParse(await _request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Demande de lancement invalide." }, { status: 400 });
  if (!['propose', 'en_cours'].includes(item.status)) {
    return NextResponse.json({ error: "Action déjà lancée ou écartée" }, { status: 409 });
  }

  const agent = item.agent;
  if (!isPlanAgent(agent)) {
    return NextResponse.json({ error: `Agent inconnu : ${agent}` }, { status: 400 });
  }

  try {
    const run = await enqueuePlanRun({ companyId: company.id, item: { ...item, agent }, retryRunId: parsed.data.retryRunId });
    if (run.status === "failed") return NextResponse.json({ error: run.errorMessage ?? "L'agent a échoué. Relancez explicitement l'action.", run: { id: run.id, status: run.status } }, { status: 409 });
    return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 202 });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof AgentRunConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Erreur mise en file de l'action du plan:", error);
    return NextResponse.json({ error: "Impossible de lancer cette action. Réessayez." }, { status: 500 });
  }
}
