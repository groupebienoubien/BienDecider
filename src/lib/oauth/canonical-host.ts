import { NextRequest, NextResponse } from "next/server";

/**
 * Google et Meta n'acceptent que l'adresse de retour enregistrée (APP_BASE_URL, www.biendecider.com). Un flux lancé depuis
 * une autre adresse publique (biendecider.com sans www, alias `*.vercel.app`) repart de l'adresse enregistrée,
 * où la session et le cookie d'état seront posés. Le poste local n'est jamais renvoyé.
 */
export function canonicalOAuthStart(request: NextRequest): NextResponse | null {
  const host = request.nextUrl.hostname;
  if (host === "localhost" || host === "[::1]" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured) return null;
  let canonical: URL;
  try {
    canonical = new URL(configured);
  } catch {
    return null;
  }
  if (canonical.protocol !== "https:" || canonical.host === request.nextUrl.host) return null;
  return NextResponse.redirect(new URL(request.nextUrl.pathname, canonical));
}
