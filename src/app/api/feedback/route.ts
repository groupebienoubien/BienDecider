import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { listAdminEmails } from "@/lib/admin";
import { readJsonObject } from "@/lib/request-body";
import { appBaseUrl, sendServiceEmail } from "@/lib/service-mail";
import { FEEDBACK_HOURLY_LIMIT, feedbackEmail, parseFeedbackInput } from "@/lib/feedback";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Signalement d'un dirigeant (story 7.4). Rattaché à l'entreprise de la session, jamais à un identifiant du corps.
 * Limite : 10 par heure et par entreprise. L'e-mail aux administrateurs part après la réponse et ne conditionne pas l'enregistrement.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Connectez-vous pour envoyer un signalement." }, { status: 401 });
  const parsed = parseFeedbackInput(await readJsonObject(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const since = new Date(Date.now() - HOUR_MS);
  const recent = await prisma.feedback.findMany({ where: { companyId: company.id, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: FEEDBACK_HOURLY_LIMIT, select: { createdAt: true } });
  if (recent.length >= FEEDBACK_HOURLY_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((recent[0].createdAt.getTime() + HOUR_MS - Date.now()) / 1000));
    return NextResponse.json({ error: "Vous avez envoyé beaucoup de signalements. Réessayez plus tard." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const feedback = await prisma.feedback.create({ data: { companyId: company.id, ...parsed.value } });
  const content = feedbackEmail({ ...parsed.value, companyLabel: company.name || company.ownerEmail }, `${appBaseUrl()}/admin`);
  after(async () => {
    for (const to of listAdminEmails()) {
      try {
        await sendServiceEmail({ to, ...content });
      } catch (error) {
        console.error("Signalement : e-mail aux administrateurs non envoyé :", error instanceof Error ? error.message : "erreur inconnue");
      }
    }
  });
  return NextResponse.json({ id: feedback.id }, { status: 201 });
}
