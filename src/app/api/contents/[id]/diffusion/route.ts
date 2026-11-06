import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { MissionError } from "@/lib/missions/messages";
import { ContentNotFoundError } from "@/lib/contents/service";
import { declareContentDiffusion, publishContentNow, resolveUncertainDiffusion } from "@/lib/contents/publish";

export const maxDuration = 60;

// Diffusion d'une version (stories 12.1 et 12.2, #315 #295) : maintenant par BienDecider, déclarée par vous, ou résultat incertain vérifié.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour diffuser un contenu." }, { status: 401 });
  const body = await readJsonObject(request);
  const number = body?.number;
  if (!body || typeof number !== "number" || !Number.isInteger(number) || number < 1) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const { id } = await params;
  try {
    switch (body.action) {
      case "publish":
        return NextResponse.json(await publishContentNow(company.id, id, { number, confirmed: body.confirmed === true }));
      case "declare":
        return NextResponse.json(await declareContentDiffusion(company.id, id, { number, channel: body.channel, date: body.date, confirmed: body.confirmed === true }));
      case "resolve":
        if (typeof body.sent !== "boolean") return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
        return NextResponse.json(await resolveUncertainDiffusion(company.id, id, { number, sent: body.sent }));
      default:
        return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ContentNotFoundError) return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
