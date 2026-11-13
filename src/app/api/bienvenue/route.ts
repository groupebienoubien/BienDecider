import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";
import { consumeGlobalAnalysis, consumeGlobalIntelligence, consumeIpAttempt, refundIpAttempt, type ThrottleResult } from "@/lib/auth-throttle";
import { applyDraftAction, checkInterpretation, emptyDraft, intelligenceInputFor, parseDraftAction, stepHref, type DraftState } from "@/lib/onboarding/draft-rules";
import { signInterpretation, verifyInterpretation } from "@/lib/ambition-token";
import { anonymousAmbitionModel, interpretAmbition } from "@/lib/ambition";
import { ANALYSIS_MESSAGES, analysisRunning, analysisView, googlePlaceCandidateIds, limitedNotice, needsNewAnalysis, newAnalysis } from "@/lib/onboarding/analysis-rules";
import { needsNewIntelligence, newIntelligence } from "@/lib/onboarding/intelligence-rules";
import { createDraft, loadDraft, saveAnalysis, saveDraft, saveIntelligence, startAnalysis, startIntelligence } from "@/lib/onboarding/draft";
import { errorLabel, runDraftAnalysis } from "@/lib/onboarding/analysis";
import { runDraftIntelligence } from "@/lib/onboarding/intelligence";

// L'analyse publique (#280) se déroule après la réponse, dans la durée de la route.
export const maxDuration = 180;

/**
 * Parcours d'entrée anonyme (#279, spécification §1.2) : POST `{ action, … }`.
 * Le serveur contrôle chaque transition ; refus → 422 avec le code M, autre étape → 409 avec la page de l'étape courante.
 * « Découvrir » (#280) enregistre les saisies et lance l'analyse publique, plafonnée par IP et pour tous ;
 * une analyse en cours refuse un second lancement (409) ; au-delà du plafond, 429 et l'étape 2 reste ouverte.
 * « Interpréter » (#282) répond sans rien enregistrer ; « C'est bien ça » exige le jeton de cette interprétation.
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
  if (action.action === "interpret_ambition" && draft) return interpret(request, draft.state, action);
  const result = applyDraftAction(draft?.state ?? emptyDraft(), action, now, verifyInterpretation);
  if (!result.ok) {
    if (result.kind === "wrong_step") return NextResponse.json({ error: "Cette étape n'est pas encore ouverte.", step: result.step, href: stepHref(result.step) }, { status: 409 });
    if (result.kind === "busy") return NextResponse.json({ error: result.error, code: "busy", analysis: analysisView(draft?.state.analysis ?? null, now) }, { status: 409 });
    return NextResponse.json({ error: result.error, code: result.code, errors: result.errors }, { status: 422 });
  }

  const state = result.state;

  let draftId: string;
  if (draft) {
    if (!(await saveDraft(draft.id, state, draft.furthestStep))) return NextResponse.json({ error: "Reprenez à la première étape.", step: 1, href: stepHref(1) }, { status: 409 });
    draftId = draft.id;
  } else {
    const attempt = await consumeIpAttempt(request, "draft");
    if (attempt?.limited) {
      return NextResponse.json(
        { error: "Trop de parcours commencés depuis cette connexion. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } },
      );
    }
    draftId = (await createDraft(state)).id;
  }
  if (action.action === "discover" || action.action === "update_sources" || (action.action === "confirm_profile" && state.step === 2) || (action.action === "back" && state.step === 1)) {
    return launchAnalysis(request, draftId, state, now);
  }
  // Recherche réelle de marché avant compte (#361, #362) : jamais bloquante pour cette transition, contrairement à l'analyse.
  if ((action.action === "confirm_ambition" || action.action === "prepare_missions") && !analysisRunning(state.analysis, now)) {
    try {
      await launchIntelligence(request, draftId, state, now);
    } catch (error) {
      console.error(`Recherche de marché non lancée pour le brouillon ${draftId} : ${errorLabel(error)}.`);
      return NextResponse.json({ error: "La préparation des missions n'a pas pu démarrer. Réessayez dans un instant." }, { status: 503 });
    }
  }
  return NextResponse.json({ step: state.step, href: stepHref(state.step) });
}

/**
 * « Interpréter » (#282) : jamais enregistré. Le modèle sert 10 fois par IP et par 24 h (portée `ambition`) ;
 * sans clé ou au-delà, l'analyseur de secours répond, sans message d'erreur. Réponse : l'interprétation et son jeton.
 */
async function interpret(request: NextRequest, state: DraftState, action: { ambition?: unknown }) {
  const checked = checkInterpretation(state, action);
  if (!checked.ok) {
    if (checked.kind === "wrong_step") return NextResponse.json({ error: "Cette étape n'est pas encore ouverte.", step: checked.step, href: stepHref(checked.step) }, { status: 409 });
    if (checked.kind === "busy") return NextResponse.json({ error: checked.error }, { status: 409 });
    return NextResponse.json({ error: checked.error, code: checked.code, errors: checked.errors }, { status: 422 });
  }
  const model = await anonymousAmbitionModel(() => consumeIpAttempt(request, "ambition"));
  const { interpretation } = await interpretAmbition(checked.text, { model });
  return NextResponse.json({ interpretation, token: signInterpretation(interpretation.text, interpretation.terms) });
}

async function refund(...attempts: ThrottleResult[]) {
  for (const attempt of attempts) await refundIpAttempt(attempt).catch(() => undefined);
}

/** Lance l'analyse de l'étape 1 : 3 par IP et par jour, plafond global du jour, jamais deux à la fois. */
async function launchAnalysis(request: NextRequest, draftId: string, state: DraftState, now: Date) {
  const sameIdentity = state.analysis?.input.companyName === state.profile.companyName
    && state.analysis.input.location === state.profile.location;
  const input = {
    companyName: state.profile.companyName,
    location: state.profile.location,
    website: state.profile.website,
    googlePlaceId: state.googlePlaceChoice?.status === "confirmed" ? state.googlePlaceChoice.placeId : null,
    googlePlaceCandidateIds: sameIdentity ? googlePlaceCandidateIds(state.analysis) : [],
    websiteRejected: state.websiteRejected,
  };
  const href = stepHref(state.step);
  // La même entreprise déjà lue : rien à relancer, les constats restent.
  if (!needsNewAnalysis(state.analysis, input, now)) return NextResponse.json({ step: state.step, href, analysis: analysisView(state.analysis, now) });

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
    const limit = { scope: limited === perIp ? "ip" as const : "global" as const, retryAt: new Date(now.getTime() + limited.retryAfterSeconds * 1000).toISOString() };
    const refused = newAnalysis(input, runId, now, "limited", limit);
    await startAnalysis(draftId, refused, now);
    return NextResponse.json(
      { error: limitedNotice(limit, now), code: "limited", step: state.step, href, analysis: analysisView(refused, now) },
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
  return NextResponse.json({ step: state.step, href, analysis: analysisView(analysis, now) });
}

/**
 * Lance la recherche réelle de marché pour l'étape 4 (#361, #362) : plafonnée par IP et pour tous, comme l'analyse.
 * À la différence de l'analyse, un refus (plafond, conflit) ne bloque jamais la confirmation de l'ambition : la
 * recherche et planification restent absentes avec un avertissement explicite ; pas de nouvelles missions génériques.
 */
async function launchIntelligence(request: NextRequest, draftId: string, state: DraftState, now: Date): Promise<void> {
  const input = intelligenceInputFor(state);
  // Le même profil déjà cherché : rien à relancer, les faits restent.
  if (!needsNewIntelligence(state.intelligence, input, now)) return;

  const runId = randomUUID();
  const perIp = await consumeIpAttempt(request, "intelligence");
  let limited = perIp?.limited ? perIp : null;
  let global: ThrottleResult = null;
  if (!limited) {
    global = await consumeGlobalIntelligence();
    if (global?.limited) {
      await refund(perIp);
      limited = global;
    }
  }
  if (limited) {
    // Le quota couvre la recherche et la planification : aucune inférence supplémentaire après un refus.
    const limit = { scope: limited === perIp ? "ip" as const : "global" as const, retryAt: new Date(now.getTime() + limited.retryAfterSeconds * 1000).toISOString() };
    await startIntelligence(draftId, newIntelligence(input, runId, now, "limited", limit), now);
    return;
  }

  const intelligence = newIntelligence(input, runId, now);
  let started: Awaited<ReturnType<typeof startIntelligence>>;
  try {
    started = await startIntelligence(draftId, intelligence, now);
  } catch (error) {
    await refund(perIp, global);
    throw error;
  }
  if (started !== "started") {
    await refund(perIp, global);
    return;
  }
  after(() => runDraftIntelligence(draftId, { intelligence, save: (next) => saveIntelligence(draftId, next) })
    .catch((error: unknown) => console.error(`Recherche de marché du brouillon ${draftId} en échec : ${errorLabel(error)}.`)));
}
