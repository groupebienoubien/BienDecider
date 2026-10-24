import { NextRequest, NextResponse } from "next/server";
import type { GoogleBusinessProfileTokens } from "@/lib/oauth/google-token";

type GoogleCallbackCompany = { id: string };

export type GoogleCallbackDependencies = {
  getSessionEmail: () => Promise<string | null>;
  findCompany: (ownerEmail: string) => Promise<GoogleCallbackCompany | null>;
  verifyAndClearOAuthState: (state: string | null) => Promise<boolean>;
  exchangeGoogleCode: (code: string, redirectUri: string) => Promise<GoogleBusinessProfileTokens>;
  persistConnection: (companyId: string, tokens: GoogleBusinessProfileTokens) => Promise<unknown>;
};

export async function handleGoogleOAuthCallback(request: NextRequest, dependencies: GoogleCallbackDependencies) {
  const ownerEmail = await dependencies.getSessionEmail();
  if (!ownerEmail) return NextResponse.redirect(new URL("/login", request.url));

  const company = await dependencies.findCompany(ownerEmail);
  if (!company) return NextResponse.redirect(new URL("/onboarding", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const validState = await dependencies.verifyAndClearOAuthState(state);
  if (validState && request.nextUrl.searchParams.get("error") === "access_denied") {
    return NextResponse.redirect(new URL("/connexions?error=google_denied", request.url));
  }
  if (validState && !code && request.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL("/connexions?error=oauth_exchange", request.url));
  }
  if (!code || !validState) return NextResponse.redirect(new URL("/connexions?error=oauth_state", request.url));

  try {
    const redirectUri = new URL("/api/oauth/google/callback", request.url).toString();
    const tokens = await dependencies.exchangeGoogleCode(code, redirectUri);
    await dependencies.persistConnection(company.id, tokens);
  } catch {
    console.error("Erreur callback OAuth Google.");
    return NextResponse.redirect(new URL("/connexions?error=oauth_exchange", request.url));
  }

  return NextResponse.redirect(new URL("/connexions?connected=google_business_profile", request.url));
}