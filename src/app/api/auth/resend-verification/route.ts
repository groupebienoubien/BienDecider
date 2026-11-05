import { NextRequest, NextResponse } from "next/server";
import { getSessionCompany } from "@/lib/session";
import { secondsUntilNextEmail } from "@/lib/email-tokens";
import { sendVerificationEmail } from "@/lib/email-verification";
import { isServiceMailConfigured } from "@/lib/service-mail";

// Renvoi du lien de confirmation depuis le bandeau : session requise, au plus un envoi par minute et par compte.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (company.emailVerifiedAt) return NextResponse.json({ alreadyVerified: true });
  if (!isServiceMailConfigured()) return NextResponse.json({ error: "L'envoi d'e-mails n'est pas disponible pour le moment. Réessayez plus tard." }, { status: 503 });

  const wait = await secondsUntilNextEmail(company.id, "verify_email");
  if (wait > 0) {
    return NextResponse.json({ error: `Un lien vient d'être envoyé. Réessayez dans ${wait} seconde${wait > 1 ? "s" : ""}.` }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  const result = await sendVerificationEmail(company);
  if (result !== "sent") return NextResponse.json({ error: "Le lien n'a pas pu être envoyé. Réessayez dans un instant." }, { status: 502 });
  return NextResponse.json({ sent: true });
}
