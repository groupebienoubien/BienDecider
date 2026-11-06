import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revokeGmailConnection } from "@/lib/oauth/gmail";
import { cancelScheduledPublications } from "@/lib/contents/publish";
import { channelJournalParams, writeJournal } from "@/lib/journal";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "gmail" } } });
  const revoked = await revokeGmailConnection(connection, company.id);
  await prisma.$transaction(async (tx) => {
    const cancelled = await cancelScheduledPublications(tx, { companyId: company.id, channel: "gmail" }, "Gmail déconnecté", "owner");
    // J-07 seulement si le canal était réellement connecté (pas une autorisation en attente ou en erreur) ; toutes les lignes sont effacées.
    const wasConnected = (await tx.channelConnection.count({ where: { companyId: company.id, channel: "gmail", status: "connecte" } })) > 0;
    await tx.channelConnection.deleteMany({ where: { companyId: company.id, channel: "gmail" } });
    if (wasConnected) await writeJournal(tx, { companyId: company.id, code: "J-07", params: channelJournalParams("gmail", cancelled) });
  });
  return NextResponse.json({ disconnected: true, revoked });
}