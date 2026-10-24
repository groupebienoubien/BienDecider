import { prisma } from "@/lib/prisma";
import { refreshGoogleAccessToken } from "@/lib/oauth/google";
import { decryptGoogleToken, encryptGoogleToken } from "@/lib/oauth/google-token";

const CHANNEL = "google_business_profile";
const RENEW_BEFORE_MS = 60_000;

export type GoogleAccessResult =
  | { status: "ok"; accessToken: string; expiresAt: Date }
  | { status: "not_connected" }
  | { status: "reauthorization_required" }
  | { status: "unavailable" };

/**
 * Jeton d'accès GBP prêt à l'emploi, renouvelé si besoin. Le verrou de ligne sérialise les appels
 * concurrents, y compris entre instances : le second relit le jeton déjà renouvelé sans rappeler Google.
 */
export async function getGoogleBusinessProfileAccess(
  companyId: string,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<GoogleAccessResult> {
  const now = options.now ?? Date.now;
  try {
    return await prisma.$transaction(async (tx): Promise<GoogleAccessResult> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ChannelConnection" WHERE "companyId" = ${companyId} AND "channel" = ${CHANNEL} FOR UPDATE`;
      if (locked.length !== 1) return { status: "not_connected" };
      const connection = await tx.channelConnection.findUniqueOrThrow({ where: { id: locked[0].id } });
      if (connection.status === "erreur") return { status: "reauthorization_required" };
      if (connection.status !== "connecte" || !connection.accessToken) return { status: "not_connected" };
  
      let accessToken: string;
      let refreshToken: string | null = null;
      try {
        accessToken = decryptGoogleToken(connection.accessToken, companyId);
        if (connection.refreshToken) refreshToken = decryptGoogleToken(connection.refreshToken, companyId);
      } catch {
        // Enveloppe illisible (clé changée, altération, autre entreprise) : jamais une connexion valide.
        await tx.channelConnection.update({ where: { id: connection.id }, data: { status: "erreur" } });
        return { status: "reauthorization_required" };
      }
  
      if (connection.expiresAt && connection.expiresAt.getTime() - now() > RENEW_BEFORE_MS) {
        return { status: "ok", accessToken, expiresAt: connection.expiresAt };
      }
      if (!refreshToken) return { status: "reauthorization_required" };
  
      const refreshed = await refreshGoogleAccessToken(refreshToken, options.fetchImpl);
      if (refreshed.status === "reauthorization_required") {
        await tx.channelConnection.update({ where: { id: connection.id }, data: { status: "erreur", accessToken: null, refreshToken: null, expiresAt: null } });
        return refreshed;
      }
      if (refreshed.status === "unavailable") return refreshed;
  
      const expiresAt = new Date(now() + refreshed.expiresIn * 1000);
      await tx.channelConnection.update({ where: { id: connection.id }, data: { accessToken: encryptGoogleToken(refreshed.accessToken, companyId), expiresAt } });
      return { status: "ok", accessToken: refreshed.accessToken, expiresAt };
    }, { maxWait: 5000, timeout: 20000 });
  } catch {
    // Verrou ou transaction en délai, base indisponible : la connexion n'est pas modifiée, réessayer plus tard.
    console.error("Renouvellement Google Business Profile indisponible.");
    return { status: "unavailable" };
  }
}
