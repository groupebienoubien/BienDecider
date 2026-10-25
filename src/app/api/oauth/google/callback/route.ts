import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { verifyAndClearOAuthState } from "@/lib/oauth/state";
import { exchangeGoogleCode } from "@/lib/oauth/google";
import { persistGoogleBusinessProfileConnection } from "@/lib/oauth/google-connection";
import { handleGoogleOAuthCallback } from "@/lib/oauth/google-callback";

export async function GET(request: NextRequest) {
  return handleGoogleOAuthCallback(request, {
    getSessionEmail,
    findCompany: async (ownerEmail) => prisma.company.findUnique({ where: { ownerEmail }, select: { id: true } }),
    verifyAndClearOAuthState,
    exchangeGoogleCode,
    persistConnection: persistGoogleBusinessProfileConnection,
  });
}
