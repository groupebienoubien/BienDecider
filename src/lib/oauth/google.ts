/**
 * OAuth Google (Google Business Profile). Jamais de mot de passe utilisateur
 * — cf. docs/backlog.md. Nécessite un projet Google Cloud avec l'API
 * "Business Profile API" activée et un écran de consentement OAuth
 * configuré (démarche externe à faire par le CEO, cf. docs/backlog.md).
 */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
// openid donne l'identifiant stable du compte (sub), seule preuve qu'un refresh token conservé reste au même compte.
const GOOGLE_SCOPES = `openid ${GOOGLE_SCOPE}`;

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
    scope: GOOGLE_SCOPES,
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
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
  };
  // Le consentement granulaire permet de n'accorder que openid : sans la gestion de la fiche, rien n'est enregistré.
  if (typeof tokens.scope === "string" && !tokens.scope.split(" ").includes(GOOGLE_SCOPE)) {
    throw new Error("Échange OAuth Google refusé.");
  }
  return tokens;
}

/** Identifiant du compte Google. Le jeton vient directement du point d'accès Google en HTTPS : sa signature n'est pas revérifiée. */
export function googleSubject(idToken: string | null | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; aud?: unknown; iss?: unknown };
    const issuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    return issuer && claims.aud === process.env.GOOGLE_OAUTH_CLIENT_ID && typeof claims.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

export type GoogleRefreshResult =
  | { status: "ok"; accessToken: string; expiresIn: number; subject: string | null }
  | { status: "reauthorization_required" }
  | { status: "unavailable" };

/**
 * Renouvelle le jeton d'accès. Seul `invalid_grant` (refresh révoqué, expiré ou limite Testing de 7 jours)
 * exige une réautorisation ; panne, limite, `invalid_client` ou réponse illisible laissent la connexion intacte.
 * Le corps de la réponse n'est jamais journalisé ni renvoyé.
 */
export async function refreshGoogleAccessToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<GoogleRefreshResult> {
  if (googleOAuthConfigurationError()) return { status: "unavailable" };
  let res: Response;
  try {
    res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { status: "unavailable" };
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown; access_token?: unknown; expires_in?: unknown; id_token?: unknown } | null;
  if (!res.ok) return res.status === 400 && body?.error === "invalid_grant" ? { status: "reauthorization_required" } : { status: "unavailable" };
  if (typeof body?.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number" || !(body.expires_in > 0)) return { status: "unavailable" };
  return { status: "ok", accessToken: body.access_token, expiresIn: body.expires_in, subject: googleSubject(typeof body.id_token === "string" ? body.id_token : null) };
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
