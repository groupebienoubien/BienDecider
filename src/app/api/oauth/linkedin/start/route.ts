import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildLinkedInAuthUrl, hashLinkedInState, isLinkedInConfigured, LINKEDIN_CALLBACK, LINKEDIN_STATE_COOKIE } from "@/lib/oauth/linkedin";
import { canUseChannel, readChannelAccess } from "@/lib/channel-access";

export async function GET(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  if (!isLinkedInConfigured()) return NextResponse.redirect(new URL("/connexions?error=linkedin_config", request.url));
  if (!canUseChannel(await readChannelAccess(company.id, "linkedin"))) return NextResponse.redirect(new URL("/connexions?error=channel_unavailable", request.url));
  const store = await cookies();
  const session = store.get("pepito_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  try {
    const state = randomBytes(32).toString("base64url");
    const nonce = "";
    const redirectUri = new URL(LINKEDIN_CALLBACK, request.url).toString();
    await prisma.$transaction([
      prisma.linkedInAuthorization.deleteMany({ where: { OR: [{ companyId: company.id }, { expiresAt: { lte: new Date() } }] } }),
      prisma.linkedInAuthorization.create({ data: {
        stateHash: hashLinkedInState(state), companyId: company.id, sessionHash: hashLinkedInState(session),
        nonce, redirectUri, expiresAt: new Date(Date.now() + 600000),
      } }),
    ]);
    store.set(LINKEDIN_STATE_COOKIE, state, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/oauth/linkedin", maxAge: 600,
    });
    return NextResponse.redirect(buildLinkedInAuthUrl(redirectUri, state, nonce));
  } catch {
    return NextResponse.redirect(new URL("/connexions?error=linkedin_start", request.url));
  }
}