import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revokeGmailConnection } from "@/lib/oauth/gmail";
import { cancelScheduledPublications } from "@/lib/contents/publish";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "gmail" } } });
  const revoked = await revokeGmailConnection(connection, company.id);
  await prisma.$transaction(async (tx) => {
    await cancelScheduledPublications(tx, { companyId: company.id, channel: "gmail" }, "Gmail déconnecté", "owner");
    await tx.channelConnection.deleteMany({ where: { companyId: company.id, channel: "gmail" } });
  });
  return NextResponse.json({ disconnected: true, revoked });
}