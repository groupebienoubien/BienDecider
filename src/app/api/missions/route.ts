import { NextRequest, NextResponse, after } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { createMission, listMissions } from "@/lib/missions/service";
import { prepareFirstDraftQuietly } from "@/lib/contents/service";
import { IdeaNotFoundError } from "@/lib/ideas";

export const maxDuration = 60;

export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour voir vos missions." }, { status: 401 });
  return NextResponse.json({ missions: await listMissions(company.id) });
}

// Création d'une mission (story 9.2, #314) : rattachée à l'entreprise de la session, 0 crédit, aucune diffusion autorisée.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour créer une mission." }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  // Mission qui cadre une idée (US #312) : l'idée doit être ouverte et de cette entreprise, sinon 404 et rien n'est créé.
  if (body.ideaId !== undefined && body.ideaId !== null && (typeof body.ideaId !== "string" || body.ideaId === "")) {
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  }
  const ideaId = typeof body.ideaId === "string" ? body.ideaId : undefined;
  try {
    const mission = await createMission(company.id, body, ideaId);
    // La création produit un premier brouillon (§2.2), préparé par Paul après la réponse ; s'il échoue, l'atelier propose de réessayer.
    after(() => prepareFirstDraftQuietly(company.id, mission.id));
    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    if (error instanceof IdeaNotFoundError) return NextResponse.json({ error: "Cette idée n'est plus à cadrer." }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
