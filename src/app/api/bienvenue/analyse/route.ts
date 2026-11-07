import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { loadDraft } from "@/lib/onboarding/draft";
import { analysisView } from "@/lib/onboarding/analysis-rules";

/**
 * Progression de l'analyse publique de l'étape 1 (#280) : lue avec le cookie du brouillon, sans session.
 * Ne renvoie que l'état des quatre rubriques et le message éventuel, jamais l'entrée ni le coût.
 */
export async function GET() {
  if (await getSessionEmail()) return NextResponse.json({ error: "Vous êtes déjà connecté.", href: "/strategie" }, { status: 409 });
  const draft = await loadDraft();
  if (!draft) return NextResponse.json({ error: "Reprenez à la première étape.", href: "/bienvenue" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ step: draft.state.step, analysis: analysisView(draft.state.analysis) }, { headers: { "Cache-Control": "no-store" } });
}
