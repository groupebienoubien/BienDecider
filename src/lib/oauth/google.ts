/**
 * OAuth Google (Google Business Profile). Jamais de mot de passe utilisateur
 * — cf. docs/backlog.md. Nécessite un projet Google Cloud avec l'API
 * "Business Profile API" activée et un écran de consentement OAuth
 * configuré (démarche externe à faire par le CEO, cf. docs/backlog.md).
 */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";

export function googleOAuthConfigurationError(): string | null {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return "GOOGLE_OAUTH_CLIENT_ID manquant.";
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) return "GOOGLE_OAUTH_CLIENT_SECRET manquant.";
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "";
  if (!key) return "GOOGLE_TOKEN_ENCRYPTION_KEY manquante.";
  if (!/^[a-f0-9]{64}$/i.test(key)) return "GOOGLE_TOKEN_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.";
  return null;
}

export function isGoogleOAuthConfigured(): boolean {
  return googleOAuthConfigurationError() === null;
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error("Échange OAuth Google refusé.");
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

/** Retire l'autorisation chez Google. Ne lève jamais : l'effacement local ne doit pas en dépendre. */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
