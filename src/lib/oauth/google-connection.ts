import { prisma } from "@/lib/prisma";
import { encryptGoogleConnectionTokens, type GoogleBusinessProfileTokens } from "@/lib/oauth/google-token";

export async function persistGoogleBusinessProfileConnection(companyId: string, tokens: GoogleBusinessProfileTokens) {
  const encryptedTokens = encryptGoogleConnectionTokens(tokens, companyId);
  const connectionData = {
    status: "connecte",
    ...encryptedTokens,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };

  return prisma.channelConnection.upsert({
    where: { companyId_channel: { companyId, channel: "google_business_profile" } },
    create: { companyId, channel: "google_business_profile", ...connectionData },
    update: connectionData,
  });
}