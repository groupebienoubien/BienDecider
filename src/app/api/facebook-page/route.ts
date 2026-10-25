import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionCompany } from "@/lib/session";
import { canonicalFacebookPageUrl } from "@/lib/facebook-page-url";
import { confirmFacebookPage, declineFacebookPage, removeFacebookPage } from "@/lib/facebook-page";

const pageUrl = z.string().refine((value) => canonicalFacebookPageUrl(value) !== null, "Lien de Page invalide");
const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), url: pageUrl }).strict(),
  z.object({ action: z.literal("decline"), url: pageUrl }).strict(),
  z.object({ action: z.literal("remove") }).strict(),
]);

/** Page Facebook proposée au dirigeant : le lien seul, sans aucun appel à Facebook. */
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  return NextResponse.json({ candidate: company.facebookPageCandidateUrl ? { url: company.facebookPageCandidateUrl } : null });
}

/** Confirmer, refuser ou retirer la Page : jamais sans geste du dirigeant, et seulement pour le lien déjà proposé. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  const decision = parsed.data;
  const done = decision.action === "confirm" ? await confirmFacebookPage(company.id, decision.url)
    : decision.action === "decline" ? await declineFacebookPage(company.id, decision.url)
    : await removeFacebookPage(company.id);
  if (!done) return NextResponse.json({ error: "Cette proposition n'est plus d'actualité." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
