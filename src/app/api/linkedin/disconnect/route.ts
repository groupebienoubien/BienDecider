import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { cancelScheduledPublications } from "@/lib/contents/publish";
import { channelJournalParams, writeJournal } from "@/lib/journal";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return NextResponse.json({ error: "Confirmez le retrait de LinkedIn." }, { status: 400 });
  // Comme Facebook et Gmail : les programmations LinkedIn sont annulées (J-23), puis la déconnexion est tracée (J-07).
  await prisma.$transaction(async (tx) => {
    const cancelled = await cancelScheduledPublications(tx, { companyId: company.id, channel: "linkedin" }, "LinkedIn déconnecté", "owner");
    // J-07 seulement si le canal était réellement connecté (pas une autorisation en attente ou en erreur) ; toutes les lignes sont effacées.
    const wasConnected = (await tx.channelConnection.count({ where: { companyId: company.id, channel: "linkedin", status: "connecte" } })) > 0;
    await tx.channelConnection.deleteMany({ where: { companyId: company.id, channel: "linkedin" } });
    await tx.linkedInAuthorization.deleteMany({ where: { companyId: company.id } });
    if (wasConnected) await writeJournal(tx, { companyId: company.id, code: "J-07", params: channelJournalParams("linkedin", cancelled) });
  });
  return NextResponse.json({ disconnected: true, revoked: false });
}