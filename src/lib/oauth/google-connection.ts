import { prisma } from "@/lib/prisma";
import { googleSubject, refreshGoogleAccessToken } from "@/lib/oauth/google";
import { decryptGoogleToken, encryptGoogleConnectionTokens, type GoogleBusinessProfileTokens } from "@/lib/oauth/google-token";

const CHANNEL = "google_business_profile";

/**
 * Enregistre les jetons d'une autorisation. Un nouveau refresh token remplace l'ancien. Sans nouveau refresh,
 * l'ancien n'est conservé que si Google confirme le même compte (sub identique) ; sinon il est effacé.
 */
export async function persistGoogleBusinessProfileConnection(
  companyId: string,
  tokens: GoogleBusinessProfileTokens,
  options: { fetchImpl?: typeof fetch } = {},
) {
  const encryptedTokens = encryptGoogleConnectionTokens(tokens, companyId);
  const connectionData = {
    status: "connecte",
    ...encryptedTokens,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
  const where = { companyId_channel: { companyId, channel: CHANNEL } };
  if (tokens.refresh_token) {
    return prisma.channelConnection.upsert({ where, create: { companyId, channel: CHANNEL, ...connectionData }, update: connectionData });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChannelConnection" WHERE "companyId" = ${companyId} AND "channel" = ${CHANNEL} FOR UPDATE`;
    const existing = await tx.channelConnection.findUnique({ where });
    let sameAccount = false;
    if (existing?.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(decryptGoogleToken(existing.refreshToken, companyId), options.fetchImpl);
        const subject = googleSubject(tokens.id_token);
        sameAccount = refreshed.status === "ok" && subject !== null && refreshed.subject === subject;
      } catch {
        sameAccount = false;
      }
    }
    return tx.channelConnection.upsert({
      where,
      create: { companyId, channel: CHANNEL, ...connectionData },
      update: { ...connectionData, ...(existing?.refreshToken && !sameAccount ? { refreshToken: null } : {}) },
    });
  }, { maxWait: 5000, timeout: 20000 });
}