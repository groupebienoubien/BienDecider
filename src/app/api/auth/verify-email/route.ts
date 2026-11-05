import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { consumeEmailToken } from "@/lib/email-tokens";
import { readJsonObject } from "@/lib/request-body";

const INVALID_LINK_MESSAGE = "Ce lien est invalide ou a expiré.";

// Confirmation d'adresse par le lien reçu par e-mail. Pas de session requise : le jeton à usage unique fait foi,
// et le lien peut être ouvert dans un autre navigateur que celui de l'inscription.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const attempt = await consumeIpAttempt(request, "token");
  if (attempt?.limited) {
    return NextResponse.json({ error: "Trop de tentatives depuis cette connexion. Réessayez plus tard." }, { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } });
  }

  // Lien inconnu, expiré ou déjà utilisé : même réponse, pour ne rien révéler.
  const claimed = await consumeEmailToken(body.token, "verify_email");
  if (!claimed) return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 });

  await prisma.company.updateMany({ where: { id: claimed.companyId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  return NextResponse.json({ verified: true });
}
