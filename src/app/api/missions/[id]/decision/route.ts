import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { MissionNotFoundError } from "@/lib/missions/service";
import { decideMission, parseDecisionBody } from "@/lib/missions/results";

// Décision de suite d'une mission (#52, spécification §7.2) : poursuivre ou arrêter ; « Adapter avec Paul » n'écrit rien.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour décider de la suite." }, { status: 401 });
  const parsed = parseDecisionBody(await readJsonObject(request));
  if (!parsed) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  try {
    const decision = await decideMission(company.id, id, parsed.choice, parsed.expectedVersion);
    return NextResponse.json({ choice: decision.choice });
  } catch (error) {
    if (error instanceof MissionNotFoundError) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
