import { NextRequest, NextResponse, after } from "next/server";
import { setSessionEmail } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { readJsonObject } from "@/lib/request-body";
import { readSignupControl, releaseSignupSlot, reserveSignupSlot, todaySignupCount } from "@/lib/signup-control";
import { sendVerificationEmail } from "@/lib/email-verification";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE, secondsUntilNextSignupDay, signupAvailability } from "@/lib/signup-rules";

function signupFull() {
  return NextResponse.json({ error: SIGNUP_FULL_MESSAGE }, { status: 429, headers: { "Retry-After": String(secondsUntilNextSignupDay(new Date())) } });
}

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const { password } = body;

  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 1024) {
    return NextResponse.json({ error: "Mot de passe requis (6 caractères minimum)" }, { status: 400 });
  }

  const control = await readSignupControl();
  const availability = signupAvailability(control, await todaySignupCount());
  if (availability === "closed") return NextResponse.json({ error: SIGNUP_CLOSED_MESSAGE }, { status: 403 });
  if (availability === "full") return signupFull();

  const ipAttempt = await consumeIpAttempt(request, "signup");
  if (ipAttempt?.limited) {
    return NextResponse.json(
      { error: "Trop de tentatives d'inscription depuis cette connexion. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipAttempt.retryAfterSeconds) } },
    );
  }

  const existing = await prisma.company.findUnique({ where: { ownerEmail: email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email. Connectez-vous." }, { status: 409 });
  }

  // Un e-mail déjà inscrit (409) ne consomme pas d'emplacement : la réservation vient après ce contrôle.
  const slotDay = await reserveSignupSlot(control.dailyCap);
  if (!slotDay) return signupFull();

  let company;
  try {
    company = await prisma.company.create({
      data: {
        ownerEmail: email,
        passwordHash: await hashPassword(password),
        name: "",
        trade: "",
        servingArea: "",
        // Story 6.4 : seule l'inscription crée un compte non confirmé (le défaut de la colonne confirme les autres).
        emailVerifiedAt: null,
      },
    });
  } catch (error) {
    await releaseSignupSlot(slotDay);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email. Connectez-vous." }, { status: 409 });
    }
    throw error;
  }

  company = await prisma.company.update({
    where: { id: company.id },
    data: { loginCount: { increment: 1 }, lastLoginAt: new Date() },
  });
  await setSessionEmail(email);

  // Le lien part après la réponse : un envoi lent ou impossible ne retarde ni ne fait échouer l'inscription (le bandeau permet de le renvoyer).
  const recipient = { id: company.id, ownerEmail: company.ownerEmail };
  after(async () => {
    try { await sendVerificationEmail(recipient); } catch { console.warn("Lien de confirmation non envoyé après l'inscription."); }
  });

  return NextResponse.json({ hasCompany: Boolean(company.name), companyId: company.id }, { status: 201 });
}