import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { decryptFacebookAccount, revokeFacebookAuthorization } from "@/lib/oauth/meta";
import { cancelScheduledPublications } from "@/lib/contents/publish";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return NextResponse.json({ error: "Confirmez le retrait de Facebook." }, { status: 400 });

  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } });
  // Révocation chez Meta au mieux : une ligne illisible ou un jeton expiré n'empêchent jamais l'effacement local.
  let revoked = false;
  if (connection?.accessToken) {
    try {
      revoked = await revokeFacebookAuthorization(decryptFacebookAccount(connection.accessToken, company.id));
    } catch {
      revoked = false;
    }
  }
  await prisma.$transaction(async (tx) => {
    await cancelScheduledPublications(tx, { companyId: company.id, channel: "facebook" }, "Page Facebook déconnectée", "owner");
    await tx.channelConnection.deleteMany({ where: { companyId: company.id, channel: "facebook" } });
  });
  return NextResponse.json({ disconnected: true, revoked });
}
