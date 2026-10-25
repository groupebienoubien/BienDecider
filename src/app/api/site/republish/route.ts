import { NextRequest, NextResponse } from "next/server";
import { AgentRunQuotaError } from "@/lib/agent-runs";
import { classifyRunError } from "@/lib/agents/agent-errors";
import { PublishRefusedError } from "@/lib/execution-error";
import { readJsonObject } from "@/lib/request-body";
import { getSessionCompany } from "@/lib/session";
import { SiteReviewRequiredError, republishSite } from "@/lib/site/publish";

export const maxDuration = 60;

/**
 * « Republier avec les photos » (story 5.5) : régénère le site déjà publié depuis son dernier brief
 * approuvé, avec les photos actuelles. Compte comme un lancement ; jamais déclenché par un ajout de photo.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await readJsonObject(request);
  const acknowledged = body?.acknowledgedReviewIds;
  const acknowledgedReviewIds = Array.isArray(acknowledged) && acknowledged.every((value) => typeof value === "string") ? acknowledged as string[] : [];
  try {
    const { slug } = await republishSite(company.id, acknowledgedReviewIds);
    return NextResponse.json({ url: `/site/${slug}`, message: "Site republié avec vos photos. Vérifiez la page publique." });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    if (error instanceof SiteReviewRequiredError) return NextResponse.json({ error: error.message, reviewPoints: error.points }, { status: 409 });
    if (error instanceof PublishRefusedError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur republication du site:", error);
    return NextResponse.json({ error: "Le site n’a pas pu être republié. Réessayez dans un instant." }, { status: 502 });
  }
}
