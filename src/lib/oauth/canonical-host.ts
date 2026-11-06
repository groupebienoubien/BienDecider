import { NextRequest, NextResponse } from "next/server";

/**
 * Google et Meta n'acceptent que l'adresse de retour enregistrée (www.biendecider.com). Un flux lancé depuis un alias
 * Vercel (`*.vercel.app`) repart de l'adresse publique, où la session et le cookie d'état seront posés.
 */
export function canonicalOAuthStart(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.hostname.endsWith(".vercel.app")) return null;
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
