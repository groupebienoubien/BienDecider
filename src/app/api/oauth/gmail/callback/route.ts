import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionCompany } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { encryptGmailToken, gmailClient, GMAIL_CALLBACK, GMAIL_SCOPE } from "@/lib/oauth/gmail";
import { channelJournalParams, writeJournal } from "@/lib/journal";

const stateSchema = z.object({ state: z.string().min(1), verifier: z.string().min(43), companyId: z.string().min(1) });

export async function GET(request: NextRequest) {
  const store = await cookies();
  const rawState = store.get("biendecider_gmail_oauth")?.value;
  store.set("biendecider_gmail_oauth", "", { path: "/api/oauth/gmail", maxAge: 0 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  const fail = (error: string) => NextResponse.redirect(new URL(`/connexions?error=${error}`, request.url));
  try {
    const saved = stateSchema.safeParse(JSON.parse(rawState ?? "null"));
    if (!saved.success || saved.data.companyId !== company.id || saved.data.state !== request.nextUrl.searchParams.get("state")) return fail("gmail_state");
    if (request.nextUrl.searchParams.has("error")) return fail("gmail_denied");
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return fail("gmail_state");
    const client = gmailClient(new URL(GMAIL_CALLBACK, request.url).toString());
    const { tokens } = await client.getToken({ code, codeVerifier: saved.data.verifier });
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date || !tokens.id_token) return fail("gmail_tokens");
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GMAIL_OAUTH_CLIENT_ID });
    const identity = ticket.getPayload();
    if (!identity?.email || !identity.email_verified) return fail("gmail_identity");
    const info = await client.getTokenInfo(tokens.access_token);
    if (!info.scopes.includes(GMAIL_SCOPE)) return fail("gmail_scope");
    const accessToken = encryptGmailToken(tokens.access_token, company.id);
    const refreshToken = encryptGmailToken(JSON.stringify({ token: tokens.refresh_token, email: identity.email }), company.id);
    const expiresAt = new Date(tokens.expiry_date);
    // La connexion et sa trace (J-07) existent ensemble, ou aucune.
    await prisma.$transaction(async (tx) => {
      const previous = await tx.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "gmail" } }, select: { status: true } });
      await tx.channelConnection.upsert({
        where: { companyId_channel: { companyId: company.id, channel: "gmail" } },
        create: { companyId: company.id, channel: "gmail", status: "connecte", accessToken, refreshToken, expiresAt },
        update: { status: "connecte", accessToken, refreshToken, expiresAt },
      });
      if (previous?.status !== "connecte") await writeJournal(tx, { companyId: company.id, code: "J-07", params: channelJournalParams("gmail") });
    });
    return NextResponse.redirect(new URL("/connexions?connected=gmail", request.url));
  } catch {
    return fail("gmail_exchange");
  }
}