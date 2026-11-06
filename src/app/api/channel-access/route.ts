import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { isMissionChannel } from "@/lib/missions/channels";
import { requestChannelAccess } from "@/lib/channel-access";

// « Demander l'accès » à un canal réservé (story 13.2, #301) : la demande est visible dans l'administration.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour demander l'accès." }, { status: 401 });
  const body = await readJsonObject(request);
  if (!body || !isMissionChannel(body.channel) || body.channel === "site") return NextResponse.json({ error: "Canal inconnu." }, { status: 400 });
  return NextResponse.json({ state: await requestChannelAccess(company.id, body.channel) });
}
