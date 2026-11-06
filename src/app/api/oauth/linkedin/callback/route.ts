import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { channelJournalParams, writeJournal } from "@/lib/journal";
import { encryptLinkedInAccount, exchangeLinkedInCode, hashLinkedInState, LinkedInOAuthError, LINKEDIN_CALLBACK, LINKEDIN_STATE_COOKIE } from "@/lib/oauth/linkedin";

export async function GET(request: NextRequest) {
  const store = await cookies();
  const state = store.get(LINKEDIN_STATE_COOKIE)?.value;
  store.set(LINKEDIN_STATE_COOKIE, "", { path: "/api/oauth/linkedin", maxAge: 0 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  const fail = (error: string) => NextResponse.redirect(new URL(`/connexions?error=${error}`, request.url));
  const session = store.get("pepito_session")?.value;
  if (!state || !session || state !== request.nextUrl.searchParams.get("state")) return fail("linkedin_state");
  try {
    const where = { stateHash: hashLinkedInState(state), companyId: company.id,
      sessionHash: hashLinkedInState(session), expiresAt: { gt: new Date() },
      redirectUri: new URL(LINKEDIN_CALLBACK, request.url).toString() };
    const authorization = await prisma.linkedInAuthorization.findFirst({ where });
    if (!authorization) return fail("linkedin_state");
    if (request.nextUrl.searchParams.has("error")) {
      const consumed = await prisma.linkedInAuthorization.deleteMany({ where });
      return fail(consumed.count === 1 ? "linkedin_denied" : "linkedin_state");
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 10000) {
      await prisma.linkedInAuthorization.deleteMany({ where });
      return fail("linkedin_state");
    }
    const { account, expiresAt } = await exchangeLinkedInCode(code, authorization.redirectUri, authorization.nonce);
    const accessToken = encryptLinkedInAccount(account, company.id);
    const accepted = await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.linkedInAuthorization.deleteMany({ where: { ...where, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) return false;
      const previous = await transaction.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "linkedin" } }, select: { status: true } });
      await transaction.channelConnection.upsert({
        where: { companyId_channel: { companyId: company.id, channel: "linkedin" } },
        create: { companyId: company.id, channel: "linkedin", status: "connecte", accessToken, expiresAt },
        update: { status: "connecte", accessToken, refreshToken: null, expiresAt },
      });
      if (previous?.status !== "connecte") await writeJournal(transaction, { companyId: company.id, code: "J-07", params: channelJournalParams("linkedin") });
      return true;
    });
    return accepted ? NextResponse.redirect(new URL("/connexions?connected=linkedin", request.url)) : fail("linkedin_state");
  } catch (error) {
    await prisma.linkedInAuthorization.deleteMany({ where: { stateHash: hashLinkedInState(state), companyId: company.id } }).catch(() => {});
    return fail(error instanceof LinkedInOAuthError ? error.diagnostic : "linkedin_storage");
  }
}