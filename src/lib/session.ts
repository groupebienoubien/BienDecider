import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken, getSessionCookieOptions, verifySessionToken } from "@/lib/session-token";

const COOKIE_NAME = "pepito_session";

/**
 * Cookie de session SIGNÉ (HMAC) — corrige une faille critique trouvée en
 * conditions réelles le 2026-10-05 : l'ancienne version stockait l'email en
 * clair, non vérifié, dans le cookie. N'importe qui pouvait forger
 * `pepito_session_email=victime@email.com` à la main et accéder à son
 * compte sans jamais connaître le mot de passe. Le cookie contient des
 * claims signés et horodatés ; sa version est comparée à celle du compte
 * pour révoquer toutes les sessions après déconnexion ou changement du mot
 * de passe.
 * Nécessite SESSION_SECRET dans l'environnement (généré une fois,
 * identique en local et en prod ; voir docs/archives/backlog.md).
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET manquant dans l'environnement — généré une fois, requis pour signer les sessions. Voir README.md, section « Démarrer en local ».",
    );
  }
  return secret;
}

export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const claims = verifySessionToken(value, getSecret());
  if (!claims) return null;
  const company = await prisma.company.findUnique({
    where: { ownerEmail: claims.email },
    select: { sessionVersion: true },
  });
  return company?.sessionVersion === claims.sessionVersion ? claims.email : null;
}

export async function setSessionEmail(email: string) {
  const store = await cookies();
  const company = await prisma.company.findUniqueOrThrow({
    where: { ownerEmail: email },
    select: { sessionVersion: true },
  });
  const now = Date.now();
  store.set(COOKIE_NAME, createSessionToken(email, company.sessionVersion, getSecret(), now), getSessionCookieOptions(now, process.env.NODE_ENV));
}

export async function clearSession() {
  const store = await cookies();
  const email = await getSessionEmail();
  if (email) {
    await prisma.company.updateMany({
      where: { ownerEmail: email },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  store.delete(COOKIE_NAME);
}

/**
 * Source de vérité unique de l'isolation entre entreprises : toute route API
 * qui lit/écrit des données d'une entreprise doit dériver son ID d'ICI, et
 * ne jamais faire confiance à un companyId envoyé par le client (cf. audit
 * du 2026-10-05 — aucune route ne vérifiait l'appartenance avant ce correctif).
 */
export async function getSessionCompany() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) return null;
  return prisma.company.findUnique({ where: { ownerEmail } });
}
