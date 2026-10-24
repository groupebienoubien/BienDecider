import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { createOAuthState } from "@/lib/oauth/state";
import { buildGoogleAuthUrl, googleOAuthConfigurationError } from "@/lib/oauth/google";

export async function GET(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const configurationError = googleOAuthConfigurationError();
  if (configurationError) {
    return NextResponse.json(
      { error: configurationError },
      { status: 503 },
    );
  }

  const state = await createOAuthState();
  const redirectUri = new URL("/api/oauth/google/callback", request.url).toString();
  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
}
