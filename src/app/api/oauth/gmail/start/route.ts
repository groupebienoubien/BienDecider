import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { buildGmailAuthUrl, GMAIL_CALLBACK, isGmailConfigured } from "@/lib/oauth/gmail";
import { canUseChannel, readChannelAccess } from "@/lib/channel-access";

export async function GET(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  if (!isGmailConfigured()) return NextResponse.redirect(new URL("/connexions?error=gmail_config", request.url));
  if (!canUseChannel(await readChannelAccess(company.id, "gmail"))) return NextResponse.redirect(new URL("/connexions?error=channel_unavailable", request.url));
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const store = await cookies();
  store.set("biendecider_gmail_oauth", JSON.stringify({ state, verifier, companyId: company.id }), {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/oauth/gmail", maxAge: 600,
  });
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return NextResponse.redirect(buildGmailAuthUrl(new URL(GMAIL_CALLBACK, request.url).toString(), state, challenge));
}