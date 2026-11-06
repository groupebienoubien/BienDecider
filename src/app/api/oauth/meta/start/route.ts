import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { buildMetaAuthUrl, createMetaState, isMetaOAuthConfigured, META_CALLBACK, META_STATE_COOKIE } from "@/lib/oauth/meta";
import { canUseChannel, readChannelAccess } from "@/lib/channel-access";

export async function GET(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  if (!isMetaOAuthConfigured()) return NextResponse.redirect(new URL("/connexions?error=meta_config", request.url));
  if (!canUseChannel(await readChannelAccess(company.id, "facebook"))) return NextResponse.redirect(new URL("/connexions?error=channel_unavailable", request.url));
  const store = await cookies();
  const session = store.get("pepito_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  try {
    const redirectUri = new URL(META_CALLBACK, request.url).toString();
    const state = createMetaState({ companyId: company.id, session, redirectUri });
    store.set(META_STATE_COOKIE, state, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/oauth/meta", maxAge: 600,
    });
    return NextResponse.redirect(buildMetaAuthUrl(redirectUri, state));
  } catch {
    return NextResponse.redirect(new URL("/connexions?error=meta_start", request.url));
  }
}
