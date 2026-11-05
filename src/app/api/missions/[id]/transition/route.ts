import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { MissionNotFoundError, applyMissionTransition, parseTransitionBody } from "@/lib/missions/service";

// Transition d'une mission (story 9.1, spécification §2.2) : une seule porte, appliquée par le serveur sur l'entreprise de la session.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour modifier une mission." }, { status: 401 });
  const parsed = parseTransitionBody(await readJsonObject(request));
  if (!parsed) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await applyMissionTransition(company.id, id, parsed.request, parsed.expectedVersion));
  } catch (error) {
    if (error instanceof MissionNotFoundError) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
