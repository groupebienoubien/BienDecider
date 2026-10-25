import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionCompany } from "@/lib/session";
import { googlePlacesConfigured, isPlaceId } from "@/lib/google-places";
import { confirmGooglePlace, declineGooglePlace, getGoogleCandidateView, removeGooglePlace } from "@/lib/google-place";

const placeId = z.string().refine(isPlaceId, "Identifiant de fiche invalide");
const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), placeId }).strict(),
  z.object({ action: z.literal("decline"), placeId }).strict(),
  z.object({ action: z.literal("remove") }).strict(),
]);

/** Fiche Google proposée au dirigeant, lue en direct (nom, adresse, lien) pour qu'il la confirme. */
export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!googlePlacesConfigured()) return NextResponse.json({ configured: false, candidate: null });
  const view = await getGoogleCandidateView(company);
  if (!view) return NextResponse.json({ configured: true, candidate: null });
  if (!view.ok) return NextResponse.json({ configured: true, candidate: null, unavailable: view.reason === "unavailable" });
  const { id, name, address, link } = view.value;
  return NextResponse.json({ configured: true, candidate: { placeId: id, name, address, link } });
}

/** Confirmer, refuser ou retirer la fiche : jamais sans geste du dirigeant, et seulement pour l'identifiant déjà proposé. */
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
  const done = decision.action === "confirm" ? await confirmGooglePlace(company.id, decision.placeId)
    : decision.action === "decline" ? await declineGooglePlace(company.id, decision.placeId)
    : await removeGooglePlace(company.id);
  if (!done) return NextResponse.json({ error: "Cette proposition n'est plus d'actualité." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
