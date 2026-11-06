import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { createOAuthState } from "@/lib/oauth/state";
import { buildGoogleAuthUrl, googleOAuthConfigurationError } from "@/lib/oauth/google";
import { isChannelEnabled } from "@/lib/missions/channels";

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
  if (!isChannelEnabled("google_business_profile")) return NextResponse.redirect(new URL("/connexions?error=channel_unavailable", request.url));

  const state = await createOAuthState();
  const redirectUri = new URL("/api/oauth/google/callback", request.url).toString();
  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
}
