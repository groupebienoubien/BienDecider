import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { isPlanAgent } from "@/lib/agents/plan-items";
import { REVISION_INSTRUCTION_MAX } from "@/lib/agents/pending-action-view";
import { startRevisionFromCard } from "@/lib/agents/revision";
import { studioLock } from "@/lib/proposal-studio";
import { STUDIO_LOCK_MESSAGES } from "@/lib/proposal-studio-shared";

/**
 * Demande de modification en langage naturel (US #258) : l'agent auteur écrit
 * la version suivante (révision, quota et budget comme tout lancement). Le
 * dirigeant qui écrit sa demande dans le Studio la confirme : aucune carte de Paul.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.agentProposal.findFirst({ where: { id, companyId: company.id } });
  if (!proposal) return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });

  const body = await readJsonObject(request);
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const expectedVersion = body?.expectedVersion;
  if (!instruction) return NextResponse.json({ error: "Écrivez ce que vous souhaitez changer." }, { status: 400 });
  if (instruction.length > REVISION_INSTRUCTION_MAX) {
    return NextResponse.json({ error: `La demande est limitée à ${REVISION_INSTRUCTION_MAX.toLocaleString("fr-FR")} caractères.` }, { status: 400 });
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version attendue est obligatoire." }, { status: 400 });
  }
  if (expectedVersion !== proposal.version) {
    return NextResponse.json({ error: "Cette production a changé depuis son ouverture. Rechargez le Studio pour voir la dernière version." }, { status: 409 });
  }
  const lock = studioLock(proposal);
  if (lock || !isPlanAgent(proposal.agent)) {
    return NextResponse.json({ error: STUDIO_LOCK_MESSAGES[lock ?? "agent"] }, { status: 409 });
  }

  const result = await startRevisionFromCard(company.id, {
    proposalId: proposal.id,
    agent: proposal.agent,
    title: proposal.title,
    fromVersion: proposal.version,
    instruction,
  });
  if (!result.ok) {
    const status = result.reason === "already_running" ? 409 : result.reason ? 503 : 409;
    return NextResponse.json({ error: result.message, runId: result.runId ?? null }, { status });
  }
  return NextResponse.json({ runId: result.runId ?? null, message: result.message }, { status: 202 });
}
