import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { consumeGlobalAnalysis, consumeIpAttempt, refundIpAttempt, type ThrottleResult } from "@/lib/auth-throttle";
import { applyDraftAction, emptyDraft, parseDraftAction, stepHref, type DraftState } from "@/lib/onboarding/draft-rules";
import { ANALYSIS_MESSAGES, analysisView, needsNewAnalysis, newAnalysis } from "@/lib/onboarding/analysis-rules";
import { createDraft, loadDraft, saveAnalysis, saveDraft, startAnalysis } from "@/lib/onboarding/draft";
import { errorLabel, runDraftAnalysis } from "@/lib/onboarding/analysis";

// L'analyse publique (#280) se déroule après la réponse, dans la durée de la route.
export const maxDuration = 60;

/**
 * Parcours d'entrée anonyme (#279, spécification §1.2) : POST `{ action, … }`.
 * Le serveur contrôle chaque transition ; refus → 422 avec le code M, autre étape → 409 avec la page de l'étape courante.
 * « Découvrir » (#280) enregistre les saisies et lance l'analyse publique, plafonnée par IP et pour tous ;
 * une analyse en cours refuse un second lancement (409) ; au-delà du plafond, 429 et l'étape 2 reste ouverte.
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

  const now = new Date();
  const result = applyDraftAction(draft?.state ?? emptyDraft(), action, now);
  if (!result.ok) {
    if (result.kind === "wrong_step") return NextResponse.json({ error: "Cette étape n'est pas encore ouverte.", step: result.step, href: stepHref(result.step) }, { status: 409 });
    if (result.kind === "busy") return NextResponse.json({ error: result.error, code: "busy", analysis: analysisView(draft?.state.analysis ?? null, now) }, { status: 409 });
    return NextResponse.json({ error: result.error, code: result.code, errors: result.errors }, { status: 422 });
  }

  let draftId: string;
  if (draft) {
    if (!(await saveDraft(draft.id, result.state))) return NextResponse.json({ error: "Reprenez à la première étape.", step: 1, href: stepHref(1) }, { status: 409 });
    draftId = draft.id;
  } else {
    const attempt = await consumeIpAttempt(request, "draft");
    if (attempt?.limited) {
      return NextResponse.json(
        { error: "Trop de parcours commencés depuis cette connexion. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } },
      );
    }
    draftId = (await createDraft(result.state)).id;
  }
  if (action.action === "discover") return launchAnalysis(request, draftId, result.state, now);
  return NextResponse.json({ step: result.state.step, href: stepHref(result.state.step) });
}

async function refund(...attempts: ThrottleResult[]) {
  for (const attempt of attempts) await refundIpAttempt(attempt).catch(() => undefined);
}

/** Lance l'analyse de l'étape 1 : 3 par IP et par jour, plafond global du jour, jamais deux à la fois. */
async function launchAnalysis(request: NextRequest, draftId: string, state: DraftState, now: Date) {
  const input = { companyName: state.profile.companyName, location: state.profile.location, website: state.profile.website };
  const href = stepHref(1);
  // La même entreprise déjà lue : rien à relancer, les constats restent.
  if (!needsNewAnalysis(state.analysis, input, now)) return NextResponse.json({ step: 1, href, analysis: analysisView(state.analysis, now) });

  const runId = randomUUID();
  const perIp = await consumeIpAttempt(request, "analysis");
  let limited = perIp?.limited ? perIp : null;
  let global: ThrottleResult = null;
  if (!limited) {
    global = await consumeGlobalAnalysis();
    if (global?.limited) {
      await refund(perIp);
      limited = global;
    }
  }
  if (limited) {
    // Pas d'analyse : le brouillon le garde, l'étape 2 s'ouvre sans constats.
    const refused = newAnalysis(input, runId, now, "limited");
    await startAnalysis(draftId, refused, now);
    return NextResponse.json(
      { error: ANALYSIS_MESSAGES.limited, code: "limited", step: 1, analysis: analysisView(refused, now) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const analysis = newAnalysis(input, runId, now);
  let started: Awaited<ReturnType<typeof startAnalysis>>;
  try {
    started = await startAnalysis(draftId, analysis, now);
  } catch (error) {
    await refund(perIp, global);
    throw error;
  }
  if (started !== "started") {
    await refund(perIp, global);
    if (started === "busy") {
      // Le client suit l'analyse déjà en cours, comme pour l'autre refus « busy ».
      const current = (await loadDraft())?.state.analysis ?? null;
      return NextResponse.json({ error: ANALYSIS_MESSAGES.busy, code: "busy", analysis: analysisView(current) }, { status: 409 });
    }
    return NextResponse.json({ error: "Reprenez à la première étape.", step: 1, href }, { status: 409 });
  }
  after(() => runDraftAnalysis(draftId, input, { analysis, save: (next) => saveAnalysis(draftId, next) })
    .catch((error: unknown) => console.error(`Analyse du brouillon ${draftId} en échec : ${errorLabel(error)}.`)));
  return NextResponse.json({ step: 1, href, analysis: analysisView(analysis, now) });
}
