import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { MissionError } from "@/lib/missions/messages";
import { ContentNotFoundError, prepareFirstDraft } from "@/lib/contents/service";

export const maxDuration = 60;

// Premier brouillon d'une mission (story 11.1, #289) : préparé par Paul sans crédit ; rend le contenu existant s'il y en a déjà un.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour préparer un contenu." }, { status: 401 });
  const { id } = await params;
  try {
    const content = await prepareFirstDraft(company.id, id);
    return NextResponse.json({ contentId: content.id, currentNumber: content.currentNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentNotFoundError) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
