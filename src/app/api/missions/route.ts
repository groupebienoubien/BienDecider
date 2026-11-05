import { NextRequest, NextResponse, after } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { createMission, listMissions } from "@/lib/missions/service";
import { prepareFirstDraftQuietly } from "@/lib/contents/service";

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
  try {
    const mission = await createMission(company.id, body);
    // La création produit un premier brouillon (§2.2), préparé par Paul après la réponse ; s'il échoue, l'atelier propose de réessayer.
    after(() => prepareFirstDraftQuietly(company.id, mission.id));
    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
