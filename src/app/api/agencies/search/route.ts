import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { MissionError } from "@/lib/missions/messages";
import { AgentRunQuotaError } from "@/lib/agents/agent-errors";
import { searchAgencies } from "@/lib/agencies/service";

// Recherche de prescripteurs (#316, FR-45) : Paul ajoute des agences de la zone à la liste des Partenariats ; rien n'est envoyé.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour chercher des agences." }, { status: 401 });
  try {
    return NextResponse.json(await searchAgencies(company.id));
  } catch (error) {
    if (error instanceof MissionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message }, { status: error.reason === "email_not_verified" || error.reason === "suspended" ? 403 : 429 });
    throw error;
  }
}
