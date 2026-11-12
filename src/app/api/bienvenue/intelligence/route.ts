import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { loadDraft } from "@/lib/onboarding/draft";
import { intelligenceView } from "@/lib/onboarding/intelligence-rules";

/**
 * Progression de la recherche réelle de marché de l'étape 4 (#361, #362) : lue avec le cookie du brouillon, sans
 * session. Ne renvoie que le statut et quels faits ont été trouvés, jamais l'entrée, le contenu ni le coût.
 */
export async function GET() {
  if (await getSessionEmail()) return NextResponse.json({ error: "Vous êtes déjà connecté.", href: "/strategie" }, { status: 409 });
  const draft = await loadDraft();
  if (!draft) return NextResponse.json({ error: "Reprenez à la première étape.", href: "/bienvenue" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ step: draft.state.step, intelligence: intelligenceView(draft.state.intelligence) }, { headers: { "Cache-Control": "no-store" } });
}
