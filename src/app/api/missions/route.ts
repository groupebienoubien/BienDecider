import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { createMission, listMissions } from "@/lib/missions/service";

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
    return NextResponse.json({ mission: await createMission(company.id, body) }, { status: 201 });
  } catch (error) {
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
