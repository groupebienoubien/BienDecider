import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { ContentNotFoundError, applyContentAction, parseContentBody } from "@/lib/contents/service";

export const maxDuration = 60;

// Décisions de l'atelier (stories 11.1 à 11.3, #289 #22 #179) : retouche, reprise, variante de Paul, validation, refus motivé.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour modifier un contenu." }, { status: 401 });
  const parsed = parseContentBody(await readJsonObject(request));
  if (!parsed) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await applyContentAction(company.id, id, parsed));
  } catch (error) {
    if (error instanceof ContentNotFoundError) return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
