import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { createEmailToken, secondsUntilNextEmail } from "@/lib/email-tokens";
import { readJsonObject } from "@/lib/request-body";
import { sendServiceEmail } from "@/lib/service-mail";
import { passwordResetEmail, passwordResetLink } from "@/lib/service-mail-templates";

const GENERIC_MESSAGE = "Si un compte existe pour cette adresse, un lien vient d'être envoyé.";

// Demande de lien de réinitialisation. La réponse est identique que le compte existe ou non, et l'envoi se fait
// après la réponse : ni le contenu ni le temps de réponse ne révèlent l'existence d'un compte.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@") || email.length > 254) return NextResponse.json({ error: "Indiquez une adresse e-mail valide." }, { status: 400 });

  const attempt = await consumeIpAttempt(request, "reset");
  if (attempt?.limited) {
    return NextResponse.json({ error: "Trop de demandes depuis cette connexion. Réessayez plus tard." }, { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } });
  }

  const company = await prisma.company.findUnique({ where: { ownerEmail: email }, select: { id: true, ownerEmail: true } });
  if (company) {
    after(async () => {
      try {
        // Un seul lien par minute et par compte : une rafale de demandes ne remplit pas une boîte de réception.
        if ((await secondsUntilNextEmail(company.id, "reset_password")) > 0) return;
        const token = await createEmailToken(company.id, "reset_password");
        await sendServiceEmail({ to: company.ownerEmail, ...passwordResetEmail(passwordResetLink(token)) });
      } catch {
        console.warn("Lien de réinitialisation non envoyé.");
      }
    });
  }
  return NextResponse.json({ sent: true, message: GENERIC_MESSAGE });
}
