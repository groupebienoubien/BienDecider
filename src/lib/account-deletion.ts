import { prisma } from "@/lib/prisma";
import { revokeGmailConnection } from "@/lib/oauth/gmail";
import { revokeGoogleToken } from "@/lib/oauth/google";
import { decryptGoogleToken, isGoogleTokenEncryptionConfigured } from "@/lib/oauth/google-token";
import { decryptFacebookAccount, revokeFacebookAuthorization } from "@/lib/oauth/meta";

export type RevocationReport = Record<string, "revoque" | "non_revoque">;

const REVOCATION_TIMEOUT_MS = 10_000;

function withTimeout(task: Promise<boolean>): Promise<boolean> {
  return Promise.race([task, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), REVOCATION_TIMEOUT_MS))]);
}

/**
 * Retire chez Google et Meta les autorisations de l'entreprise, au mieux : un échec est
 * rapporté mais n'empêche jamais l'effacement. LinkedIn n'offre pas de retrait côté fournisseur ici.
 */
export async function revokeCompanyAuthorizations(companyId: string): Promise<RevocationReport> {
  const connections = await prisma.channelConnection.findMany({ where: { companyId } });
  const report: RevocationReport = {};
  await Promise.all(connections.map(async (connection) => {
    let revoked = false;
    if (connection.channel === "gmail") {
      revoked = await withTimeout(revokeGmailConnection(connection, companyId));
    } else if (connection.channel === "google_business_profile") {
      const encrypted = connection.refreshToken ?? connection.accessToken;
      let token: string | null = null;
      try {
        token = encrypted ? decryptGoogleToken(encrypted, companyId) : null;
      } catch {
        const reason = isGoogleTokenEncryptionConfigured() ? "enveloppe GBP invalide" : "clé GBP absente ou invalide";
        console.error(`Révocation Google ignorée: ${reason}.`);
        token = null;
      }
      revoked = token ? await withTimeout(revokeGoogleToken(token)) : false;
    } else if (connection.channel === "facebook" && connection.accessToken) {
      try {
        revoked = await withTimeout(revokeFacebookAuthorization(decryptFacebookAccount(connection.accessToken, companyId)));
      } catch {
        revoked = false;
      }
    }
    report[connection.channel] = revoked ? "revoque" : "non_revoque";
  }));
  return report;
}
