import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";
import { isMissionChannel } from "@/lib/missions/channels";
import { setChannelRollout, setCompanyChannelAccess } from "@/lib/channel-access";

// Ouverture des canaux et accès par entreprise (story 13.2, #301) : réservé aux administrateurs.
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const email = await getSessionEmail();
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || !isMissionChannel(body.channel) || body.channel === "site") return NextResponse.json({ error: "Canal inconnu." }, { status: 400 });
  if (typeof body.openToAll === "boolean") {
    await setChannelRollout(body.channel, body.openToAll, email!);
    return NextResponse.json({ channel: body.channel, openToAll: body.openToAll });
  }
  if (typeof body.companyId === "string" && typeof body.granted === "boolean") {
    const company = await prisma.company.findUnique({ where: { id: body.companyId }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    await setCompanyChannelAccess(company.id, body.channel, body.granted, email!);
    return NextResponse.json({ channel: body.channel, companyId: company.id, granted: body.granted });
  }
  return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
}
