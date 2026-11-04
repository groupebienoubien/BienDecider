import { NextRequest, NextResponse } from "next/server";
import { setSessionEmail } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { consumeIpAttempt, MAX_ATTEMPTS, recordFailedAttempt, refundIpAttempt } from "@/lib/auth-throttle";
import { readJsonObject } from "@/lib/request-body";

/**
 * Connexion par email + mot de passe. L'inscription est un flux séparé : une
 * faute de frappe ne doit jamais créer une entreprise vide.
 * Un compte antérieur sans passwordHash accepte encore son premier mot de
 * passe, pour préserver la migration en douceur des comptes existants.
 *
 * Anti-force-brute (cf. docs/archives/backlog.md, point P0) : 5 échecs consécutifs
 * verrouillent le compte 15 minutes. Stocké en base (pas en mémoire) pour
 * rester valable entre plusieurs instances serverless. Une limite par adresse IP
 * (src/lib/auth-throttle.ts) empêche en plus un tiers de verrouiller des comptes
 * ou d'énumérer des emails en masse ; seuls les échecs comptent contre l'IP.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const { password } = body;

  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 6 || password.length > 1024) {
    return NextResponse.json({ error: "Mot de passe requis (6 caractères minimum)" }, { status: 400 });
  }

  const ipAttempt = await consumeIpAttempt(request, "login");
  if (ipAttempt?.limited) {
    return NextResponse.json(
      { error: "Trop de tentatives depuis cette connexion. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipAttempt.retryAfterSeconds) } },
    );
  }

  let company = await prisma.company.findUnique({ where: { ownerEmail: email } });

  if (company?.lockedUntil && company.lockedUntil > new Date()) {
    const minutes = Math.ceil((company.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Trop de tentatives échouées. Réessayez dans ${minutes} minute(s).` },
      { status: 429 },
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "Aucun compte associé à cet email. Créez un compte pour continuer." },
      { status: 404 },
    );
  }

  if (!company.passwordHash) {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
    });
  } else if (!(await verifyPassword(password, company.passwordHash))) {
    const attempts = await recordFailedAttempt(company.id);
    const remaining = MAX_ATTEMPTS - attempts;
    return NextResponse.json(
      {
        error:
          remaining > 0
            ? `Mot de passe incorrect (${remaining} tentative(s) restante(s))`
            : "Trop de tentatives échouées. Compte verrouillé 15 minutes.",
      },
      { status: remaining > 0 ? 401 : 429 },
    );
  }

  await refundIpAttempt(ipAttempt);
  await setSessionEmail(email);
  company = await prisma.company.update({
    where: { id: company.id },
    data: { loginCount: { increment: 1 }, lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });

  return NextResponse.json({
    hasCompany: Boolean(company.name),
    companyId: company.id,
  });
}
