import { NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { consumeIpAttempt } from "@/lib/auth-throttle";
import { applyDraftAction, emptyDraft, parseDraftAction, stepHref } from "@/lib/onboarding/draft-rules";
import { createDraft, loadDraft, saveDraft } from "@/lib/onboarding/draft";

/**
 * Parcours d'entrée anonyme (#279, spécification §1.2) : POST `{ action, … }`.
 * Le serveur contrôle chaque transition ; refus → 422 avec le code M, autre étape → 409 avec la page de l'étape courante.
 * Aucune analyse ni appel à un modèle pendant le parcours.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  // Une session ouverte ne repasse jamais par le parcours : « Retourner à mon espace ».
  if (await getSessionEmail()) return NextResponse.json({ error: "Vous êtes déjà connecté.", href: "/strategie" }, { status: 409 });
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const action = parseDraftAction(body);
  if (!action) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const draft = await loadDraft();
  // Sans brouillon (premier passage ou brouillon expiré), seule l'étape 1 est possible : le brouillon naît à sa première validation.
  if (!draft && action.action !== "discover") return NextResponse.json({ error: "Reprenez à la première étape.", step: 1, href: stepHref(1) }, { status: 409 });

  const result = applyDraftAction(draft?.state ?? emptyDraft(), action);
  if (!result.ok) {
    if (result.kind === "wrong_step") return NextResponse.json({ error: "Cette étape n'est pas encore ouverte.", step: result.step, href: stepHref(result.step) }, { status: 409 });
    return NextResponse.json({ error: result.error, code: result.code, errors: result.errors }, { status: 422 });
  }

  if (draft) {
    if (!(await saveDraft(draft.id, result.state))) return NextResponse.json({ error: "Reprenez à la première étape.", step: 1, href: stepHref(1) }, { status: 409 });
  } else {
    const attempt = await consumeIpAttempt(request, "draft");
    if (attempt?.limited) {
      return NextResponse.json(
        { error: "Trop de parcours commencés depuis cette connexion. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } },
      );
    }
    await createDraft(result.state);
  }
  return NextResponse.json({ step: result.state.step, href: stepHref(result.state.step) });
}
