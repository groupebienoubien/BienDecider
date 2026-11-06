import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { MissionNotFoundError } from "@/lib/missions/service";
import { saveMissionReport } from "@/lib/missions/results";

// Bilan déclaré d'une mission (#294, spécification §7.1), pour l'entreprise de la session.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour renseigner un bilan." }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  try {
    const report = await saveMissionReport(company.id, id, body);
    return NextResponse.json({ id: report.id, publicationCount: report.publicationCount }, { status: 201 });
  } catch (error) {
    if (error instanceof MissionNotFoundError) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
