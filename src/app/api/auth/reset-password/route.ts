import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { passwordPolicyError } from "@/lib/password-policy";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { consumeEmailToken } from "@/lib/email-tokens";
import { readJsonObject } from "@/lib/request-body";

const INVALID_LINK_MESSAGE = "Ce lien est invalide ou a expiré. Demandez-en un nouveau.";

// Nouveau mot de passe par le lien reçu par e-mail : le jeton fait foi (usage unique, une heure), sans session.
// Le mot de passe est validé AVANT de consommer le jeton : une faute de frappe ne brûle pas le lien.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const attempt = await consumeIpAttempt(request, "token");
  if (attempt?.limited) {
    return NextResponse.json({ error: "Trop de tentatives depuis cette connexion. Réessayez plus tard." }, { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } });
  }

  const policyError = passwordPolicyError(body.password);
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

  const claimed = await consumeEmailToken(body.token, "reset_password");
  if (!claimed) return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 });

  const passwordHash = await hashPassword(body.password as string);
  await prisma.$transaction([
    // Toutes les sessions ouvertes sont fermées ; le verrouillage après échecs est levé : le lien prouve l'accès à la boîte.
    prisma.company.update({ where: { id: claimed.companyId }, data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null } }),
    // Recevoir ce lien prouve aussi l'accès à l'adresse : elle est confirmée si elle ne l'était pas.
    prisma.company.updateMany({ where: { id: claimed.companyId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailToken.deleteMany({ where: { companyId: claimed.companyId, kind: "reset_password", usedAt: null } }),
  ]);
  return NextResponse.json({ reset: true });
}
