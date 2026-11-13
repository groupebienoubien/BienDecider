import { MISSION_TEMPLATES, availableTemplates, enabledChannels, type TemplateKey } from "@/lib/missions/templates";
import { ANALYSIS_MESSAGES, RUBRIC_KEYS, RUBRIC_NAMES, analysisSourcesReady, analysisRunning, googlePlaceCandidateIds, readAnalysis, type DraftAnalysis, type Provenance } from "@/lib/onboarding/analysis-rules";
import { EMPTY_TERMS, REINTERPRET_MESSAGE, capLabel, readAmbitionTerms, type AmbitionTerms } from "@/lib/ambition-rules";
import { INTELLIGENCE_MESSAGES, intelligenceRunning, readIntelligence, sameIntelligenceInput, type CompetitorDecision, type CompetitorFact, type DraftIntelligence, type IntelligenceInput, type OpportunityFact } from "@/lib/onboarding/intelligence-rules";
import type { ResponsibleAgent } from "@/lib/missions/rules";
import { createMissionDecisionPlan, type MissionDecisionPlan, type MissionEvidence } from "@/lib/missions/decision-plan";
import { checkMissionProposal } from "@/lib/onboarding/mission-planning-rules";
import { ambitionTargetsRequests, evaluateMissionObjective, hasNoAdditionalTime, hasNoAvailableCapacity, hasSatisfactoryBookingPage, needsWeekdayClarification } from "@/lib/missions/decision-rules";
import { safeSourceUrl } from "@/lib/findings/certainty";
import { declaredSocialSources, decideSocialSources, readSocialSourceDecisions, type SocialSourceDecision } from "@/lib/onboarding/public-sources";
import { isPlaceId } from "@/lib/google-places";

/** Vérifie le jeton d'une interprétation (`verifyInterpretation` côté serveur) ; injecté, car ce module est aussi lu par le client. */
export type InterpretationVerifier = (text: string, terms: AmbitionTerms, token: unknown) => boolean;
const refuseAll: InterpretationVerifier = () => false;

/**
 * Règles pures du parcours d'entrée en cinq étapes (#279, spécification §1.1, §1.2, §11, §12, §14).
 * Le serveur les applique à chaque transition ; l'interface les reflète. Depuis #280, « Découvrir » lance une
 * analyse publique gardée dans le brouillon ; la confirmation des liens précède l'objectif, sans attendre le modèle.
 */

export const DRAFT_STEPS = [1, 2, 3, 4, 5] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

export type DraftProfile = {
  firstName: string;
  companyName: string;
  location: string;
  website: string;
  trade: string;
  servingArea: string;
  targetClients: string;
  offers: string;
};

/** Coût d'un appel de modèle anonyme, repris au compte à l'inscription (`UsageEvent`). */
export type RetainedCost = { usd: number; inputTokens: number; outputTokens: number; model?: string };

/**
 * Ambition confirmée à l'étape 3 (#282) : le texte tel quel et les éléments retenus avec Paul.
 * `retained` (#284) : « Ce que nous retenons », 2 ou 3 phrases écrites au clic « C'est bien ça », effacées par un retour
 * avant l'étape 4 ; `retainedCost` : coût cumulé de ces rédactions, repris au compte à l'inscription.
 */
export type DraftAmbition = { text: string; terms: AmbitionTerms; retained?: string[]; retainedCost?: RetainedCost; planningVersion?: 1 | 2 };

export type DraftState = {
  step: DraftStep;
  profile: DraftProfile;
  socialSourceDecisions: SocialSourceDecision[];
  competitorDecisions: CompetitorDecision[];
  googlePlaceChoice: GooglePlaceChoice | null;
  websiteRejected: boolean;
  ambition: DraftAmbition | null;
  profileConfirmed: boolean;
  diagnosticReady: boolean;
  /** Analyse publique de l'étape 1 (#280), écrite à part : jamais enregistrée par `saveDraft`. */
  analysis: DraftAnalysis | null;
  /** Recherche réelle de marché avant compte (#361, #362), écrite à part comme l'analyse ci-dessus. */
  intelligence: DraftIntelligence | null;
};

export type GooglePlaceChoice = { status: "confirmed"; placeId: string } | { status: "rejected" };

export const STEP_TITLES: Record<DraftStep, string> = {
  1: "Votre entreprise. Notre point de départ.",
  2: "Vérifions votre entreprise.",
  3: "Qu'aimeriez-vous changer ?",
  4: "Des actions concrètes pour votre objectif.",
  5: "Retrouvez votre stratégie.",
};

export const STEP_LABELS: Record<DraftStep, { name: string; subtitle: string }> = {
  1: { name: "Votre entreprise", subtitle: "Un nom et une ville" },
  2: { name: "Découverte", subtitle: "Confirmer vos liens" },
  3: { name: "Votre objectif", subtitle: "Ce que vous voulez changer" },
  4: { name: "Mes premières missions", subtitle: "Du concret à décider" },
  5: { name: "Votre compte", subtitle: "Retrouver votre stratégie" },
};

/** Messages de la spécification §14 ; les bornes de longueur suivent la forme de M-16. */
export const ONBOARDING_MESSAGES = {
  "M-01": "Indiquez votre prénom.",
  "M-03-company": "Renseignez le nom de votre entreprise.",
  "M-03-location": "Indiquez la localisation de votre entreprise.",
  "M-04": "Utilisez une adresse commençant par https:// ou http://.",
  "M-05": "Complétez chaque information avant de confirmer.",
  "M-06": "Décrivez votre ambition en une ou deux phrases (10 caractères au moins).",
  "M-07": "Confirmez votre profil et votre ambition avant le diagnostic.",
  "M-08": "Consultez d'abord le résumé du diagnostic.",
  "M-09": "Indiquez votre prénom pour que Paul puisse vous parler.",
  "M-10": "Consultez le diagnostic, puis confirmez « Ça m'intéresse » avant de créer votre compte.",
  "M-11": "Indiquez une adresse e-mail valide.",
  "M-12": "Le mot de passe doit contenir au moins 8 caractères.",
  "M-13": "Les deux mots de passe ne correspondent pas.",
} as const;
export type OnboardingCode = keyof typeof ONBOARDING_MESSAGES | "M-16" | "markup" | "analysis" | "intelligence" | "reinterpret";

/** Adresse déjà utilisée (FR-9 prévaut sur M-14) : le message ne dit pas qu'un compte existe. */
export const ADDRESS_UNAVAILABLE_MESSAGE = "Nous ne pouvons pas créer de compte avec cette adresse. Si vous avez déjà un compte, retrouvez-le avec la connexion.";
export const MARKUP_MESSAGE = "Retirez les signes < et > de ce champ.";
export const RECOVER_ACCOUNT_HREF = "/login";

export const LIMITS = {
  firstName: 40,
  companyName: 100,
  location: 100,
  website: 500,
  trade: 100,
  servingArea: 100,
  targetClients: 100,
  offers: 100,
  ambitionMin: 10,
  ambitionMax: 600,
  email: 120,
} as const;

const FIELD_NAMES: Record<keyof DraftProfile, string> = {
  firstName: "Le prénom",
  companyName: "Le nom de l'entreprise",
  location: "La localisation",
  website: "L'adresse du site",
  trade: "L'activité",
  servingArea: "La zone",
  targetClients: "La description de vos clients",
  offers: "La description de vos offres",
};

export function emptyProfile(): DraftProfile {
  return { firstName: "", companyName: "", location: "", website: "", trade: "", servingArea: "", targetClients: "", offers: "" };
}

export function emptyDraft(): DraftState {
  return { step: 1, profile: emptyProfile(), socialSourceDecisions: [], competitorDecisions: [], googlePlaceChoice: null, websiteRejected: false, ambition: null, profileConfirmed: false, diagnosticReady: false, analysis: null, intelligence: null };
}

/** Page de l'étape courante (spécification §1.4, addendum §9). */
export function stepHref(step: DraftStep): string {
  if (step === 4) return "/bienvenue/missions";
  if (step === 5) return "/bienvenue/compte";
  return "/bienvenue";
}

export function isDraftStep(value: unknown): value is DraftStep {
  return typeof value === "number" && (DRAFT_STEPS as readonly number[]).includes(value);
}

export type FieldErrors = Partial<Record<string, string>>;

export type TransitionResult =
  | { ok: true; state: DraftState }
  | { ok: false; kind: "invalid"; code: OnboardingCode; error: string; errors: FieldErrors }
  | { ok: false; kind: "wrong_step"; step: DraftStep }
  /** Une lecture empêche un changement de sources ou une préparation prématurée (409). */
  | { ok: false; kind: "busy"; error: string };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const hasMarkup = (value: string) => /[<>]/.test(value);

function lengthMessage(field: keyof DraftProfile, max: number): string {
  return `${FIELD_NAMES[field]} doit être compris entre 1 et ${max} caractères.`;
}

/**
 * Écart d'une valeur rognée aux règles des étapes 1 et 2 (balise, longueur), repris par « Corriger mon profil » (#169) :
 * le message du champ, ou null si elle est acceptable (vide comprise : l'obligation se vérifie à part).
 */
export function profileFieldIssue(field: keyof DraftProfile, value: string): string | null {
  if (!value) return null;
  if (hasMarkup(value)) return MARKUP_MESSAGE;
  if (value.length > LIMITS[field]) return lengthMessage(field, LIMITS[field]);
  return null;
}

/** Site facultatif : vide, ou une adresse http(s) lisible. */
export function isValidWebsite(value: string): boolean {
  if (value === "") return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

type Check = { field: keyof DraftProfile; value: string; max: number; missing: string; optional?: boolean };

function checkFields(checks: Check[]): { code: OnboardingCode; errors: FieldErrors; error: string } | null {
  const errors: FieldErrors = {};
  let first: { code: OnboardingCode; error: string } | null = null;
  const fail = (field: string, code: OnboardingCode, error: string) => {
    if (errors[field]) return;
    errors[field] = error;
    first ??= { code, error };
  };
  for (const check of checks) {
    if (!check.value) {
      if (!check.optional) fail(check.field, check.missing as OnboardingCode, ONBOARDING_MESSAGES[check.missing as keyof typeof ONBOARDING_MESSAGES]);
      continue;
    }
    if (hasMarkup(check.value)) fail(check.field, "markup", MARKUP_MESSAGE);
    else if (check.value.length > check.max) fail(check.field, "M-16", lengthMessage(check.field, check.max));
    else if (check.field === "website" && !isValidWebsite(check.value)) fail(check.field, "M-04", ONBOARDING_MESSAGES["M-04"]);
  }
  if (!first) return null;
  const found = first as { code: OnboardingCode; error: string };
  return { code: found.code, error: found.error, errors };
}

const invalid = (failure: { code: OnboardingCode; error: string; errors: FieldErrors }): TransitionResult => ({ ok: false, kind: "invalid", ...failure });
const invalidCode = (code: keyof typeof ONBOARDING_MESSAGES, field?: string): TransitionResult =>
  invalid({ code, error: ONBOARDING_MESSAGES[code], errors: field ? { [field]: ONBOARDING_MESSAGES[code] } : {} });

/** Entreprise et localisation obligatoires ; les anciens brouillons gardent prénom et site. */
export function checkDiscovery(input: Record<string, unknown>): { ok: true; values: Pick<DraftProfile, "firstName" | "companyName" | "location" | "website"> } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const values = { firstName: text(input.firstName), companyName: text(input.companyName), location: text(input.location), website: text(input.website) };
  const failure = checkFields([
    { field: "firstName", value: values.firstName, max: LIMITS.firstName, missing: "M-01", optional: true },
    { field: "companyName", value: values.companyName, max: LIMITS.companyName, missing: "M-03-company" },
    { field: "location", value: values.location, max: LIMITS.location, missing: "M-03-location" },
    { field: "website", value: values.website, max: LIMITS.website, missing: "M-04", optional: true },
  ]);
  return failure ? { ok: false, ...failure } : { ok: true, values };
}

function discoveryDone(profile: DraftProfile): boolean {
  return checkDiscovery(profile).ok;
}

/** Les informations inconnues restent vides ; les valeurs renseignées sont contrôlées. */
export function checkProfile(input: Record<string, unknown>): { ok: true; values: Pick<DraftProfile, "trade" | "servingArea" | "targetClients" | "offers"> } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const values = { trade: text(input.trade), servingArea: text(input.servingArea), targetClients: text(input.targetClients), offers: text(input.offers) };
  const failure = checkFields([
    { field: "trade", value: values.trade, max: LIMITS.trade, missing: "M-05", optional: true },
    { field: "servingArea", value: values.servingArea, max: LIMITS.servingArea, missing: "M-05", optional: true },
    { field: "targetClients", value: values.targetClients, max: LIMITS.targetClients, missing: "M-05", optional: true },
    { field: "offers", value: values.offers, max: LIMITS.offers, missing: "M-05", optional: true },
  ]);
  return failure ? { ok: false, ...failure } : { ok: true, values };
}

/** Étape 3 : ambition en texte libre, conservée telle quelle (§11 : 10 à 600 caractères, M-06). */
export function checkAmbition(value: unknown): { ok: true; ambition: string } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const ambition = text(value);
  if (ambition.length < LIMITS.ambitionMin || ambition.length > LIMITS.ambitionMax) {
    const error = ambition.length > LIMITS.ambitionMax ? `L'ambition doit être comprise entre ${LIMITS.ambitionMin} et ${LIMITS.ambitionMax} caractères.` : ONBOARDING_MESSAGES["M-06"];
    return { ok: false, code: ambition.length > LIMITS.ambitionMax ? "M-16" : "M-06", error, errors: { ambition: error } };
  }
  if (hasMarkup(ambition)) return { ok: false, code: "markup", error: MARKUP_MESSAGE, errors: { ambition: MARKUP_MESSAGE } };
  return { ok: true, ambition };
}

export type DraftAction =
  | { action: "discover"; firstName?: unknown; companyName?: unknown; location?: unknown; website?: unknown }
  | { action: "see_findings" }
  | { action: "confirm_profile" | "update_sources"; trade?: unknown; servingArea?: unknown; targetClients?: unknown; offers?: unknown; website?: unknown; websiteRejected?: unknown; googlePlaceChoice?: unknown; socialSourceDecisions?: unknown; declaredSocialProfiles?: unknown }
  | { action: "interpret_ambition"; ambition?: unknown }
  | { action: "confirm_ambition"; ambition?: unknown; terms?: unknown; token?: unknown }
  | { action: "prepare_missions" }
  | { action: "competitor_decision"; name?: unknown; source?: unknown; decision?: unknown }
  | { action: "interested" }
  | { action: "back"; step: unknown; website?: unknown; websiteRejected?: unknown }
  | { action: "goto"; step: unknown };

export const DRAFT_ACTIONS = ["discover", "see_findings", "confirm_profile", "update_sources", "interpret_ambition", "confirm_ambition", "prepare_missions", "competitor_decision", "interested", "back", "goto"] as const;

/** Demande lisible, ou null (400). */
export function parseDraftAction(body: Record<string, unknown>): DraftAction | null {
  const action = DRAFT_ACTIONS.find((candidate) => candidate === body.action);
  if (!action) return null;
  if (action === "back") return {
    action,
    step: body.step,
    ...("website" in body ? { website: body.website } : {}),
    ...("websiteRejected" in body ? { websiteRejected: body.websiteRejected } : {})
  };
  if (action === "goto") return { action, step: body.step };
  return { ...body, action } as DraftAction;
}

function readGooglePlaceChoice(value: unknown): GooglePlaceChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.status === "rejected") return { status: "rejected" };
  if (raw.status === "confirmed" && isPlaceId(raw.placeId)) {
    return { status: "confirmed", placeId: raw.placeId };
  }
  return null;
}

/** L'ambition sans « Ce que nous retenons » ; le coût déjà dépensé reste, pour être repris au compte. */
function withoutRetained(ambition: DraftAmbition): DraftAmbition {
  return { text: ambition.text, terms: ambition.terms, ...(ambition.retainedCost ? { retainedCost: ambition.retainedCost } : {}) };
}

/**
 * Revenir à l'étape n (n < étape courante) : si n < 4, le diagnostic n'est plus prêt et « Ce que nous retenons » est
 * effacé (#284), recalculé à la prochaine confirmation ; les saisies restent.
 */
function back(state: DraftState, step: DraftStep): DraftState {
  if (step >= 4) return { ...state, step };
  return { ...state, step, diagnosticReady: false, ambition: state.ambition ? withoutRetained(state.ambition) : null };
}

/** L'analyse porte-t-elle sur l'entreprise saisie (nom, localisation, site) ? */
export function analysisMatchesProfile(state: DraftState): boolean {
  const input = state.analysis?.input;
  if (
    input?.googlePlaceId === undefined ||
    input.googlePlaceCandidateIds === undefined ||
    input.websiteRejected === undefined
  ) return false;
  if (state.profileConfirmed && !state.profile.website && discoveredWebsite(state.analysis)) return false;
  return input !== undefined && input.companyName === state.profile.companyName && input.location === state.profile.location
    && (input.website === state.profile.website || (!input.website && discoveredWebsite(state.analysis) === state.profile.website))
    && (input.googlePlaceId ?? null) === (state.googlePlaceChoice?.status === "confirmed" ? state.googlePlaceChoice.placeId : null)
    && (input.websiteRejected ?? false) === state.websiteRejected;
}

function discoveredWebsite(analysis: DraftAnalysis | null): string {
  const url = analysis && (analysis.status === "done" || analysis.sourcesReady === true) && analysis.rubrics.site.status === "read" ? analysis.findings.pages[0]?.url : "";
  return url && url.length <= LIMITS.website && isValidWebsite(url) ? url : "";
}

export function prefillWebsite(state: DraftState): string {
  return state.profile.website || (!state.websiteRejected && !state.profileConfirmed && analysisMatchesProfile(state) ? discoveredWebsite(state.analysis) : "");
}

export function intelligenceInputFor(state: DraftState): IntelligenceInput {
  const { profile } = state;
  const excludedCompetitors = state.competitorDecisions.filter((item) => item.decision === "dismissed").map(({ name, source }) => ({ name, source }));
  const analysis = analysisMatchesProfile(state) && state.analysis?.status === "done" ? state.analysis : null;
  const evidence: MissionEvidence[] = [];
  for (const key of ["trade", "servingArea", "offers", "targetClients"] as const) {
    if (profile[key].trim()) evidence.push({
      id: `profile:${key}`, fact: clip(`${PROFILE_FIELD_WORDS[key]} : ${profile[key]}`.replace(/[<>]/g, ""), 300),
      kind: "declared", topic: "profile", source: null, readAt: null,
    });
  }
  for (const [index, finding] of (analysis?.constats ?? []).entries()) {
    if (finding.certainty !== "observe" || !finding.source || !safeSourceUrl(finding.source) || !finding.readAt || finding.topic === "reseaux_sociaux") continue;
    evidence.push({
      id: `analysis:${index}`, fact: finding.fact, kind: "observed",
      topic: finding.topic, source: finding.source, readAt: finding.readAt,
    });
  }
  for (const key of ["trade", "servingArea", "offers", "targetClients", "tone"] as const) {
    const finding = analysis?.findings[key];
    if (!finding || finding.provenance.kind !== "observed" || !safeSourceUrl(finding.provenance.source)) continue;
    evidence.push({
      id: `extraction:${key}`, fact: clip(`${key === "tone" ? "Présentation" : PROFILE_FIELD_WORDS[key]} : ${finding.value}`.replace(/[<>]/g, ""), 300),
      kind: "observed", topic: "site_web", source: finding.provenance.source, readAt: finding.provenance.readAt,
    });
  }
  for (const [index, finding] of (analysis?.findings.contacts ?? []).entries()) {
    if (finding.provenance.kind !== "observed" || !safeSourceUrl(finding.provenance.source)) continue;
    evidence.push({
      id: `contact:${index}`, fact: clip(`Contact lu : ${finding.value}`.replace(/[<>]/g, ""), 300),
      kind: "observed", topic: "site_web", source: finding.provenance.source, readAt: finding.provenance.readAt,
    });
  }
  return {
    companyName: profile.companyName, location: profile.location, website: prefillWebsite(state),
    trade: profile.trade, servingArea: profile.servingArea, offers: profile.offers,
    targetClients: profile.targetClients, ambitionText: state.ambition?.text ?? "",
    ...(excludedCompetitors.length ? { excludedCompetitors } : {}),
    planningContext: {
      ...(state.ambition?.planningVersion === 2 ? { approachVersion: 2 as const } : {}),
      analysisRunId: analysis?.runId ?? null, evidence: evidence.slice(0, 30),
      limitations: [
        "Les publications sociales n'ont pas été lues ; les liens de profils ne prouvent ni leur activité ni leur performance.",
        ...(analysis ? RUBRIC_KEYS.filter((key) => analysis.rubrics[key].status !== "read").map((key) => `${RUBRIC_NAMES[key]} : non lu.`) : ["Aucune analyse publique à jour."]),
        ...(analysis?.findings.readLimitations ?? []).map((item) => clip(`${item.url} : ${item.reason}`, 600)),
      ].slice(0, 30),
      hypotheses: (analysis?.constats ?? []).map((finding) => clip(finding.consequence, 300)),
      mediaBudgetPerMonth: state.ambition?.terms.mediaBudgetPerMonth ?? null,
      recruitment: state.ambition?.terms.recruitment ?? "unspecified",
      socialProfiles: state.socialSourceDecisions.flatMap((item) =>
        item.status === "confirmed" && item.confirmedUrl ? [{ platform: item.platform, url: item.confirmedUrl }] : []),
    },
  };
}

export function matchingIntelligence(state: DraftState): DraftIntelligence | null {
  if (!state.intelligence) return null;
  const stored = { ...state.intelligence.input, excludedCompetitors: undefined };
  const current = { ...intelligenceInputFor(state), excludedCompetitors: undefined };
  // Les anciens brouillons ne possèdent pas encore de dossier de planification ; leur prochaine recherche le crée.
  if (!stored.planningContext && state.ambition?.planningVersion !== 2) current.planningContext = undefined;
  return sameIntelligenceInput(stored, current) ? state.intelligence : null;
}

/** L'étape n est-elle ouverte depuis l'étape n - 1 (étape précédente confirmée) ? */
function previousConfirmed(state: DraftState, step: DraftStep, now: Date): boolean {
  if (step === 1) return true;
  if (step === 2) return discoveryDone(state.profile);
  if (step === 3) return state.profileConfirmed;
  if (step === 5 && (analysisRunning(state.analysis, now) || intelligenceRunning(state.intelligence, now))) return false;
  if (step === 5 && state.ambition?.planningVersion && !matchingIntelligence(state)) return false;
  return state.diagnosticReady;
}

/**
 * Transitions de la spécification §1.2. Chaque étape ne s'ouvre que si la précédente est confirmée ;
 * une action demandée depuis une autre étape renvoie à l'étape courante (`wrong_step`).
 */
export function applyDraftAction(state: DraftState, request: DraftAction, now = new Date(), verify: InterpretationVerifier = refuseAll): TransitionResult {
  switch (request.action) {
    case "discover": {
      if (state.step !== 1) return { ok: false, kind: "wrong_step", step: state.step };
      if (analysisRunning(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      const checked = checkDiscovery({ ...state.profile, ...request });
      if (!checked.ok) return invalid(checked);
      const changed = (Object.keys(checked.values) as (keyof typeof checked.values)[]).some((key) => state.profile[key] !== checked.values[key]);
      const identityChanged = state.profile.companyName !== checked.values.companyName || state.profile.location !== checked.values.location;
      // La confirmation s'ouvre aussitôt ; elle suit la découverte des liens sans attendre le modèle.
      return {
        ok: true,
        state: {
          ...state,
          step: 2,
          profile: { ...(identityChanged ? emptyProfile() : state.profile), ...checked.values, ...(identityChanged && request.website === undefined ? { website: "" } : {}) },
          profileConfirmed: changed ? false : state.profileConfirmed,
          ...(identityChanged ? { googlePlaceChoice: null, socialSourceDecisions: [], competitorDecisions: [] } : {}),
          ...(identityChanged || state.profile.website !== checked.values.website
            ? { websiteRejected: false, socialSourceDecisions: [] }
            : {}),
        }
      };
    }
    case "see_findings": {
      if (state.step !== 1 && state.step !== 2) return { ok: false, kind: "wrong_step", step: state.step };
      const checked = checkDiscovery(state.profile);
      if (!checked.ok) return invalid(checked);
      if (analysisRunning(state.analysis, now) && !analysisSourcesReady(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      // L'analyse doit porter sur l'entreprise saisie : sinon, il faut relancer la découverte.
      if (!analysisMatchesProfile(state)) return invalid({ code: "analysis", error: ANALYSIS_MESSAGES.missing, errors: {} });
      return { ok: true, state: { ...state, step: 2 } };
    }
    case "update_sources":
    case "confirm_profile": {
      if (state.step !== 2) return { ok: false, kind: "wrong_step", step: state.step };
      if (analysisRunning(state.analysis, now) && !analysisSourcesReady(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      const checked = checkProfile(request.action === "update_sources" ? state.profile : request);
      if (!checked.ok) return invalid(checked);
      const website = request.website === undefined ? prefillWebsite(state) : text(request.website);
      const failure = checkFields([{ field: "website", value: website, max: LIMITS.website, missing: "M-04", optional: true }]);
      if (failure) return invalid(failure);
      if (request.websiteRejected !== undefined && typeof request.websiteRejected !== "boolean") {
        return invalid({ code: "M-05", error: "Vérifiez le choix du site.", errors: {} });
      }
      if (request.websiteRejected === true && website) {
        return invalid({ code: "M-05", error: "Un site renseigné ne peut pas être écarté.", errors: {} });
      }
      const candidateIds = googlePlaceCandidateIds(state.analysis);
      const googlePlaceChoice = request.googlePlaceChoice === undefined
        ? state.googlePlaceChoice
        : readGooglePlaceChoice(request.googlePlaceChoice);
      if (
        (candidateIds.length > 0 && !googlePlaceChoice) ||
        (googlePlaceChoice?.status === "confirmed" && !candidateIds.includes(googlePlaceChoice.placeId)) ||
        (googlePlaceChoice?.status === "rejected" && candidateIds.length === 0)
      ) {
        return invalid({
          code: "M-05",
          error: candidateIds.length
            ? "Choisissez la fiche de votre entreprise ou indiquez qu'aucune ne correspond."
            : "Cette fiche Google n'est plus disponible. Relancez la découverte.",
          errors: {}
        });
      }
      const selectedPlaceId = googlePlaceChoice?.status === "confirmed" ? googlePlaceChoice.placeId : null;
      const analyzedPlaceId = state.analysis?.input.googlePlaceId ?? null;
      const websiteRejected = typeof request.websiteRejected === "boolean" ? request.websiteRejected
        : state.websiteRejected || (request.website !== undefined && !website && Boolean(prefillWebsite(state)));
      const sourceChanged = website !== prefillWebsite(state) || websiteRejected !== state.websiteRejected;
      const declaredProfiles = request.action === "update_sources" || request.declaredSocialProfiles === undefined
        ? state.socialSourceDecisions.filter((item) => item.origin === "declared")
        : declaredSocialSources(request.declaredSocialProfiles);
      if (!declaredProfiles) return invalid({ code: "M-05", error: "Indiquez une adresse de profil officiel Facebook, Instagram ou LinkedIn valide.", errors: {} });
      if (selectedPlaceId !== analyzedPlaceId || sourceChanged) {
        if (analysisRunning(state.analysis, now)) return { ok: false, kind: "busy", error: "La lecture se termine. Patientez avant de changer les sources, puis réessayez." };
        return {
          ok: true,
          state: {
            ...state,
            step: 2,
            profile: { ...state.profile, ...checked.values, website },
            socialSourceDecisions: declaredProfiles,
            googlePlaceChoice,
            profileConfirmed: false,
            websiteRejected
          }
        };
      }
      if (!analysisMatchesProfile(state)) return invalid({ code: "analysis", error: ANALYSIS_MESSAGES.missing, errors: {} });
      if (request.action === "update_sources") {
        return {
          ok: true,
          state: {
            ...state,
            profile: { ...state.profile, ...checked.values, website },
            googlePlaceChoice,
            profileConfirmed: false,
            diagnosticReady: false,
          },
        };
      }
      const socialSourceDecisions = decideSocialSources(
        state.analysis?.findings.publicSources ?? [],
        request.socialSourceDecisions ?? []
      );
      if (!socialSourceDecisions || socialSourceDecisions.length + declaredProfiles.length > 10) {
        return invalid({
          code: "M-05",
          error: "Vérifiez ou écartez chaque lien social repéré.",
          errors: {}
        });
      }
      if (declaredProfiles.some((item) => socialSourceDecisions.some((candidate) => candidate.candidateUrl === item.candidateUrl))) {
        return invalid({ code: "M-05", error: "Ce profil est déjà repéré. Confirmez-le dans les réseaux proposés plutôt que de l'ajouter à nouveau.", errors: {} });
      }
      return {
        ok: true,
        state: {
          ...state,
          step: 3,
          profile: { ...state.profile, ...checked.values, website },
          socialSourceDecisions: [...socialSourceDecisions, ...declaredProfiles],
          googlePlaceChoice,
          websiteRejected: typeof request.websiteRejected === "boolean" ? request.websiteRejected : state.websiteRejected,
          profileConfirmed: true
        }
      };
    }
    case "interpret_ambition": {
      // L'interprétation n'est jamais enregistrée : la route renvoie la reformulation et son jeton, le brouillon reste tel quel.
      const checked = checkInterpretation(state, request);
      return checked.ok ? { ok: true, state } : checked;
    }
    case "confirm_ambition": {
      if (state.step !== 3) return { ok: false, kind: "wrong_step", step: state.step };
      if (!state.profileConfirmed) return invalidCode("M-07");
      const checked = checkAmbition(request.ambition);
      if (!checked.ok) return invalid(checked);
      const confirmed = checkConfirmation(checked.ambition, request.terms, request.token, verify);
      if (!confirmed.ok) return invalid(confirmed);
      // « Ce que nous retenons » est écrit ensuite par la route (#284) ; le coût des rédactions précédentes reste.
      const previousCost = state.ambition?.retainedCost;
      return { ok: true, state: { ...state, step: 4, ambition: { text: checked.ambition, terms: confirmed.terms, planningVersion: 2, ...(previousCost ? { retainedCost: previousCost } : {}) }, diagnosticReady: true } };
    }
    case "prepare_missions": {
      if (state.step !== 4) return { ok: false, kind: "wrong_step", step: state.step };
      if (!state.profileConfirmed || !state.ambition || !state.diagnosticReady) return invalidCode("M-07");
      if (analysisRunning(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      return { ok: true, state };
    }
    case "competitor_decision": {
      if (state.step !== 4 || !state.diagnosticReady) return { ok: false, kind: "wrong_step", step: state.step };
      const intelligence = matchingIntelligence(state);
      if (intelligence?.status !== "done") {
        return invalid({ code: "intelligence", error: "Cette recherche de marché n'est plus à jour. Revenez à votre ambition pour la relancer.", errors: {} });
      }
      const name = text(request.name);
      const source = text(request.source);
      const decision = request.decision;
      if (!name || !source || (decision !== "confirmed" && decision !== "dismissed")) {
        return invalid({ code: "M-05", error: "Choisissez si ce concurrent est comparable ou à écarter.", errors: {} });
      }
      const candidates = intelligence.competitors?.length ? intelligence.competitors : intelligence.competitor ? [intelligence.competitor] : [];
      if (!candidates.some((candidate) => candidate.name === name && candidate.source === source)) {
        return invalid({ code: "M-05", error: "Ce repère de marché n'est plus disponible.", errors: {} });
      }
      const competitorDecisions = state.competitorDecisions.filter((item) => item.name !== name || item.source !== source);
      competitorDecisions.push({ name, source, decision });
      return { ok: true, state: { ...state, competitorDecisions } };
    }
    case "interested": {
      if (state.step !== 4 || !state.diagnosticReady) return state.step === 4 ? invalidCode("M-08") : { ok: false, kind: "wrong_step", step: state.step };
      if (intelligenceRunning(state.intelligence, now)) return { ok: false, kind: "busy", error: INTELLIGENCE_MESSAGES.busy };
      if (analysisRunning(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      if (state.ambition?.planningVersion && !matchingIntelligence(state)) return invalid({ code: "intelligence", error: "Préparez vos missions avant de continuer.", errors: {} });
      return { ok: true, state: { ...state, step: 5 } };
    }
    case "back": {
      if (!isDraftStep(request.step) || request.step >= state.step) return { ok: false, kind: "wrong_step", step: state.step };
      const next = back(state, request.step);
      if (request.step === 1 && request.website !== undefined) {
        const website = text(request.website);
        const failure = checkFields([{ field: "website", value: website, max: LIMITS.website, missing: "M-04", optional: true }]);
        if (failure) return invalid(failure);
        const changed = website !== state.profile.website;
        const websiteRejected = typeof request.websiteRejected === "boolean"
          ? request.websiteRejected
          : !website && Boolean(discoveredWebsite(state.analysis));
        return {
          ok: true,
          state: {
            ...next,
            profile: { ...next.profile, website },
            profileConfirmed: changed ? false : next.profileConfirmed,
            socialSourceDecisions: changed || websiteRejected !== state.websiteRejected ? [] : next.socialSourceDecisions,
            websiteRejected
          }
        };
      }
      return { ok: true, state: next };
    }
    case "goto": {
      if (!isDraftStep(request.step)) return { ok: false, kind: "wrong_step", step: state.step };
      if (request.step < state.step) return { ok: true, state: back(state, request.step) };
      if (request.step === state.step) return { ok: true, state };
      if (request.step === state.step + 1 && previousConfirmed(state, request.step, now)) return { ok: true, state: { ...state, step: request.step } };
      return { ok: false, kind: "wrong_step", step: state.step };
    }
  }
}

type Refusal = Exclude<TransitionResult, { ok: true }>;

/** « Interpréter » (§1.2) : étape 3, profil confirmé (M-07), texte de 10 à 600 caractères sans balise (M-06, M-16). */
export function checkInterpretation(state: DraftState, request: { ambition?: unknown }): { ok: true; text: string } | Refusal {
  if (state.step !== 3) return { ok: false, kind: "wrong_step", step: state.step };
  if (!state.profileConfirmed) return invalidCode("M-07") as Refusal;
  const checked = checkAmbition(request.ambition);
  if (!checked.ok) return { ok: false, kind: "invalid", code: checked.code, error: checked.error, errors: checked.errors };
  return { ok: true, text: checked.ambition };
}

/**
 * « C'est bien ça » : le jeton de l'interprétation doit porter sur ce texte exact et ces éléments.
 * Un texte modifié après l'interprétation, des éléments changés ou un jeton falsifié : « Interprétez de nouveau… ».
 */
export function checkConfirmation(text: string, terms: unknown, token: unknown, verify: InterpretationVerifier): { ok: true; terms: AmbitionTerms } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const read = readAmbitionTerms(terms);
  if (!read || !verify(text, read, token)) return { ok: false, code: "reinterpret", error: REINTERPRET_MESSAGE, errors: { ambition: REINTERPRET_MESSAGE } };
  return { ok: true, terms: read };
}

/** Adresse e-mail de l'étape 5 (§12 : 120 caractères, format valide). */
export function isValidEmail(value: string): boolean {
  return value.length > 0 && value.length <= LIMITS.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

/** Le brouillon permet-il de créer le compte (M-09, M-03, M-10) ? */
export function checkDraftForAccount(state: DraftState, now = new Date()): { ok: true } | { ok: false; code: OnboardingCode; error: string; step: DraftStep } {
  if (!state.profile.companyName) return { ok: false, code: "M-03-company", error: ONBOARDING_MESSAGES["M-03-company"], step: 1 };
  if (analysisRunning(state.analysis, now)) return { ok: false, code: "analysis", error: ANALYSIS_MESSAGES.busy, step: 4 };
  if (intelligenceRunning(state.intelligence, now)) return { ok: false, code: "intelligence", error: INTELLIGENCE_MESSAGES.busy, step: 4 };
  if (state.ambition?.planningVersion && !matchingIntelligence(state)) return { ok: false, code: "intelligence", error: "Préparez vos missions avant de continuer.", step: 4 };
  if (state.step !== 5 || !state.diagnosticReady || !state.profileConfirmed) return { ok: false, code: "M-10", error: ONBOARDING_MESSAGES["M-10"], step: state.step };
  return { ok: true };
}

/** Texte rogné à `max` caractères, coupé sur un espace et terminé par « … ». */
export function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ——— Étape 4 : trois premières missions fondées sur le profil confirmé, l'analyse et l'ambition (#284, FR-8) ———

export const ORIGIN_SITE = "Lu sur le site";
export const ORIGIN_DECLARED = "Vous nous avez dit";
export const ORIGIN_RESEARCH = "Recherche publique, à vérifier";
export type StarterOrigin = typeof ORIGIN_SITE | typeof ORIGIN_DECLARED | typeof ORIGIN_RESEARCH;
export const FIRST_BADGE = "À examiner en premier";
export const SITE_NOT_READ_NOTICE = "Paul n'a pas pu lire votre site : ce qui suit repose sur ce que vous nous avez dit.";
export const SITE_NOT_GIVEN_NOTICE = "Aucun site n'a été lu pour cette analyse. Cela ne signifie pas que votre entreprise n'en possède pas.";
export const TARGET_NOTICE = "C'est une cible, pas une promesse de résultat.";

/** Modèles jamais proposés à l'étape 4 : aucune liste d'agences n'existe avant le compte. */
export const STARTER_EXCLUDED: readonly TemplateKey[] = ["agencies"];

type ProfileField = "trade" | "servingArea" | "targetClients" | "offers";
const PROFILE_FIELD_WORDS: Record<ProfileField, string> = { trade: "activité", servingArea: "zone", targetClients: "clients", offers: "offres" };

/**
 * Origine d'une valeur confirmée à l'étape 2 : celle de l'analyse si le dirigeant l'a gardée telle quelle
 * (« observed » lu sur le site, « hypothesis » à confirmer), sinon déclarée. La zone reprise de la localisation reste à confirmer.
 */
export function confirmedOrigin(state: DraftState, field: ProfileField): ProfileOrigin {
  const value = state.profile[field];
  if (!value) return "missing";
  const found = analysisMatchesProfile(state) ? state.analysis?.findings[field] : null;
  if (found?.value && clip(found.value, LIMITS[field]) === value) return found.provenance.kind;
  if (field === "servingArea" && !found?.value && value === state.profile.location) return "hypothesis";
  return "declared";
}

/** « Lu sur le site » seulement si chaque valeur citée a été observée sur le site ; sinon « Vous nous avez dit ». */
function originOf(state: DraftState, fields: readonly ProfileField[]): StarterOrigin {
  return fields.length > 0 && fields.every((field) => confirmedOrigin(state, field) === "observed") ? ORIGIN_SITE : ORIGIN_DECLARED;
}

/** Le site de l'entreprise a-t-il été lu par l'analyse ? */
export function siteWasRead(state: DraftState): boolean {
  return analysisMatchesProfile(state) && state.analysis?.status === "done" && state.analysis.rubrics.site.status === "read";
}

/** Offres distinctes, dans l'ordre cité, coupées sur virgule, point-virgule, barre ou « et ». */
function offerList(offers: string): string[] {
  return offers.split(/[,;\n/·]|\s+et\s+/).map((part) => part.trim()).filter(Boolean);
}

/** Première offre citée. */
export function firstOffer(offers: string): string {
  return offerList(offers)[0] ?? offers.trim();
}

/** Deuxième offre citée, distincte de la première : évite que deux missions portent sur le même sujet. */
function secondOffer(offers: string): string | null {
  return offerList(offers)[1] ?? null;
}

/** Deuxième segment de clientèle cité, coupé comme les offres : à défaut d'une deuxième offre, une autre façon de varier le sujet. */
function secondSegment(targetClients: string): string | null {
  return targetClients.split(/[,;\n/·]|\s+et\s+/).map((part) => part.trim()).filter(Boolean)[1] ?? null;
}

/** Les éléments chiffrés sont facultatifs dès qu'un objectif libre a été confirmé. */
function missingTerms(text: string | null | undefined, terms: AmbitionTerms | undefined): string[] {
  if (text?.trim()) return [];
  const missing: string[] = [];
  if (!terms || terms.gainPercent === null) missing.push("le gain visé");
  if (!terms || terms.horizonMonths === null) missing.push("l'horizon");
  return missing;
}

const endPunctuation = (value: string) => value.replace(/[\s.!?;:,…]+$/, "");

/** Réserves de Paul : rubriques non lues, valeurs à confirmer, éléments d'ambition manquants. */
export function starterReserves(state: DraftState): string[] {
  const reserves: string[] = [];
  const analysis = analysisMatchesProfile(state) ? state.analysis : null;
  const unread = analysis ? RUBRIC_KEYS.filter((key) => analysis.rubrics[key].status !== "read").map((key) => RUBRIC_NAMES[key]) : [];
  if (!state.profile.website && !siteWasRead(state)) reserves.push("aucun site indiqué");
  else if (!analysis) reserves.push("votre site n'a pas été lu");
  else if (unread.length) reserves.push(`rubriques non lues (${unread.join(", ")})`);
  const toConfirm = (Object.keys(PROFILE_FIELD_WORDS) as ProfileField[]).filter((field) => confirmedOrigin(state, field) === "hypothesis").map((field) => PROFILE_FIELD_WORDS[field]);
  if (toConfirm.length) reserves.push(`valeurs à confirmer (${toConfirm.join(", ")})`);
  const missing = missingTerms(state.ambition?.text, state.ambition?.terms);
  if (missing.length) reserves.push(`${missing.join(" et ")} à préciser`);
  return reserves;
}

/**
 * « Ce que nous retenons » par les règles (#284), quand le modèle n'est pas disponible ou que sa sortie est invalide :
 * phrase 1, l'activité et la zone ; phrase 2, le cap ; phrase 3, les réserves et « C'est une cible, pas une promesse de résultat. ».
 */
export function retainedFromRules(state: DraftState): string[] {
  const { profile } = state;
  const cap = endPunctuation(capLabel(state.ambition?.text, state.ambition?.terms));
  const reserves = starterReserves(state);
  return [
    `${clip(profile.companyName, 60)} : ${clip(profile.trade || "activité à préciser", 70)}, sur la zone ${clip(profile.servingArea || profile.location || "à préciser", 70)}.`,
    `Votre cap : ${clip(cap, 200)}.`,
    reserves.length ? `À vérifier : ${clip(reserves.join(" ; "), 150)}. ${TARGET_NOTICE}` : `Vos premiers bilans diront ce qui fonctionne. ${TARGET_NOTICE}`,
  ];
}

export const RETAINED_SENTENCES = { min: 2, max: 3 } as const;
export const RETAINED_SENTENCE_LENGTH = { min: 20, max: 240 } as const;

/** Phrases de « Ce que nous retenons » lues du modèle ou de la base : 2 ou 3 phrases de 20 à 240 caractères, sans balise ; sinon null. */
export function readRetained(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < RETAINED_SENTENCES.min || value.length > RETAINED_SENTENCES.max) return null;
  const sentences = value.map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""));
  const valid = sentences.every((sentence) => sentence.length >= RETAINED_SENTENCE_LENGTH.min && sentence.length <= RETAINED_SENTENCE_LENGTH.max && !hasMarkup(sentence));
  // Deux fois la même phrase : sortie refusée.
  const distinct = new Set(sentences.map((sentence) => sentence.toLowerCase())).size === sentences.length;
  return valid && distinct ? sentences : null;
}

/** Coût lu de la base : nombres finis et positifs, modèle facultatif ; sinon null. */
export function readRetainedCost(value: unknown): RetainedCost | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const positive = (item: unknown) => typeof item === "number" && Number.isFinite(item) && item >= 0;
  if (!positive(raw.usd) || !positive(raw.inputTokens) || !positive(raw.outputTokens)) return null;
  const model = typeof raw.model === "string" && raw.model.length > 0 && raw.model.length <= 100 ? raw.model : undefined;
  return { usd: raw.usd as number, inputTokens: raw.inputTokens as number, outputTokens: raw.outputTokens as number, ...(model ? { model } : {}) };
}

/** Enregistre « Ce que nous retenons » dans l'ambition, en ajoutant le coût de cette rédaction aux précédentes. */
export function withRetained(state: DraftState, retained: string[], cost: RetainedCost | null): DraftState {
  if (!state.ambition) return state;
  const previous = state.ambition.retainedCost;
  const total = cost || previous
    ? {
        usd: (previous?.usd ?? 0) + (cost?.usd ?? 0),
        inputTokens: (previous?.inputTokens ?? 0) + (cost?.inputTokens ?? 0),
        outputTokens: (previous?.outputTokens ?? 0) + (cost?.outputTokens ?? 0),
        ...((cost?.model ?? previous?.model) ? { model: cost?.model ?? previous?.model } : {}),
      }
    : null;
  return { ...state, ambition: { ...state.ambition, retained, ...(total ? { retainedCost: total } : {}) } };
}

export const SYNTHESIS_USAGE_AGENT = "onboarding_synthesis";

/** Coût de « Ce que nous retenons » à reprendre au compte (#284) : seulement s'il est supérieur à 0 et que le modèle est connu. */
export function synthesisUsage(ambition: DraftAmbition | null): { agent: string; model: string; inputTokens: number; outputTokens: number; costUsd: number } | null {
  const cost = ambition?.retainedCost;
  if (!cost || !cost.model || !Number.isFinite(cost.usd) || cost.usd <= 0) return null;
  return { agent: SYNTHESIS_USAGE_AGENT, model: cost.model, inputTokens: Math.round(cost.inputTokens), outputTokens: Math.round(cost.outputTokens), costUsd: cost.usd };
}

export type StarterMission = {
  template: TemplateKey;
  channel: string | null;
  title: string;
  outcome: string;
  finding: string;
  scope: Record<string, unknown>;
  stopRuleDays?: number;
  /** D'où vient le constat : « Lu sur le site » ou « Vous nous avez dit ». */
  origin: StarterOrigin;
  /** Résumé du périmètre proposé (§6.3). */
  scopeLabel: string;
  /** Pourquoi Paul propose cette mission (10 à 300 caractères). */
  deduction: string;
  /** La première est « À examiner en premier » et devient la priorité à l'inscription. */
  first: boolean;
  responsibleAgent: ResponsibleAgent;
  risk: string;
  decisionPlan: MissionDecisionPlan;
};

export type StarterRecap = { companyName: string; location: string; trade: string; servingArea: string; details: string[]; cap: string; notes: string[] };

const noAngles = (value: string) => value.replace(/[<>]/g, "");
export type StarterPlan = { recap: StarterRecap; retained: string[]; missions: StarterMission[] };

/**
 * Classement déterministe des pistes étayées par les informations confirmées : une lecture de site est nécessaire
 * avant de proposer une page, les déclarations d'offre/clientèle peuvent justifier un test de publication, et une
 * mission sur mesure exige une occasion de marché réellement trouvée. Les modèles sans preuve exploitable sont omis.
 */
export function rankStarterTemplates(state: DraftState, available: readonly TemplateKey[] = availableTemplates().map((template) => template.key)): TemplateKey[] {
  const intelligence = matchingIntelligence(state);
  if (!intelligence?.planning && (state.ambition?.planningVersion || state.intelligence?.planning)) return [];
  if (intelligence?.planning) {
    if (intelligence.planning.status !== "done") return [];
    const checked = checkMissionProposal(intelligence.planning.proposal, intelligence, available);
    return checked.ok ? checked.value.missions.map((mission) => mission.template) : [];
  }
  const ambition = state.ambition?.text ?? "";
  if (!evaluateMissionObjective({ template: "custom", objective: ambition }).allowed) return [];
  const hasOfferAndAudience = Boolean(state.profile.offers.trim() && state.profile.targetClients.trim());
  const requests = ambitionTargetsRequests(ambition);
  const facts = starterFacts(matchingIntelligence(state));
  const order: TemplateKey[] = [
    ...(requests && state.profile.offers.trim() && evaluateMissionObjective({ template: "site_page", objective: ambition }).allowed && siteWasRead(state) ? ["site_page" as const] : []),
    ...(requests && hasOfferAndAudience && evaluateMissionObjective({ template: "social_post", objective: ambition }).allowed ? ["social_post" as const] : []),
    ...(facts.opportunity && evaluateMissionObjective({ template: "custom", objective: ambition }).allowed ? ["custom" as const] : []),
  ];
  return order.filter((key) => available.includes(key) && !STARTER_EXCLUDED.includes(key)).slice(0, 3);
}

function starterSelectionReason(template: TemplateKey, index: number, state: DraftState): string {
  const ambition = state.ambition?.text ?? "";
  const siteRead = siteWasRead(state);
  const satisfactoryPage = hasSatisfactoryBookingPage(ambition);
  if (template === "site_page") {
    return index === 0
      ? "Objectif : demandes ; site lu. La page passe avant une publication comme point d'entrée vérifiable. Fiche/avis : aucun constat ; sur-mesure : aucune occasion trouvée. Contenu à retravailler à confirmer."
      : "Votre objectif vise des demandes et le site a été lu ; cette page reste une piste vérifiable après le premier test.";
  }
  if (template === "social_post") {
    const pageDecision = !siteRead
      ? "Page écartée : site non lu."
      : satisfactoryPage
        ? "Page écartée : réservation déjà satisfaisante."
        : index > 0
          ? "Page prioritaire : point d'entrée vérifiable."
          : "Page non retenue dans ce catalogue.";
    return `Objectif demandes ; offre et clientèle confirmées. ${pageDecision} Fiche/avis : aucun constat ; sur-mesure : aucune occasion trouvée.`;
  }
  return "Cette piste est retenue parce qu'une occasion de marché a été trouvée ; le périmètre et les moyens restent à confirmer avec vous.";
}

/** Résumé du périmètre proposé (§6.3). */
export function starterScopeLabel(template: TemplateKey, scope: Record<string, unknown>): string {
  const text = (key: string) => (typeof scope[key] === "string" ? (scope[key] as string) : "");
  switch (template) {
    case "social_post": return text("topic") || "Sujet à choisir";
    case "google_profile": return "Votre fiche Google";
    case "review_reply": return "Aucun avis choisi";
    case "site_page": return text("page") || "Une page du site";
    case "custom": return text("description") || "À décrire au cadrage";
    default: return "À préciser";
  }
}

/** Faits trouvés par la recherche réelle avant compte (#362, #370), quand la recherche a abouti. */
export type StarterFacts = { competitor: CompetitorFact | null; competitors: CompetitorFact[]; opportunity: OpportunityFact | null };
const NO_FACTS: StarterFacts = { competitor: null, competitors: [], opportunity: null };

/** Faits à utiliser dans les pistes : seulement ceux d'une recherche terminée, jamais une recherche en cours ou interrompue. */
export function starterFacts(intelligence: DraftIntelligence | null): StarterFacts {
  if (intelligence?.status !== "done") return NO_FACTS;
  const competitors = intelligence.competitors?.length ? intelligence.competitors : intelligence.competitor ? [intelligence.competitor] : [];
  return { competitor: competitors[0] ?? null, competitors, opportunity: intelligence.opportunity };
}

export function starterMarketFindings(state: DraftState, now = new Date()) {
  const { competitors } = starterFacts(matchingIntelligence(state));
  const dimensionLabels = { trade: "Activité", servingArea: "Zone", offers: "Offres", targetClients: "Clientèle" };
  return competitors.map((competitor) => {
    const decision = state.competitorDecisions.find((item) => item.name === competitor.name && item.source === competitor.source)?.decision;
    const comparisons = competitor.comparisons?.map((item) => `${dimensionLabels[item.dimension]} : vous, ${item.businessValue} ; ${competitor.name}, ${item.competitorValue}`).join(" · ") ?? "";
    const relationship = competitor.relationship === "indirect" ? "Alternative indirecte." : competitor.relationship === "direct" ? "Concurrent direct." : "";
    const observed = [relationship, competitor.comparabilityReason, competitor.fact, comparisons, competitor.readAt ? `Recherche effectuée le ${competitor.readAt.slice(0, 10)}.` : ""].filter(Boolean).join(" ");
    return {
      category: "concurrence", title: clip(competitor.name, 80), content: observed,
      sourceUrl: safeSourceUrl(competitor.source), sourceStatus: null, certainty: "a_verifier" as const,
      ...(decision === "confirmed" ? { competitorConfirmedAt: now } : {}),
      ...(decision === "dismissed" ? { competitorDismissedAt: now } : {}),
    };
  });
}

export function starterMarketFinding(state: DraftState, now = new Date()) {
  return starterMarketFindings(state, now)[0] ?? null;
}

/** Corps d'une mission de l'étape 4 : constat, déduction, titre, résultat et périmètre propres au modèle. */
function starterBody(key: TemplateKey, state: DraftState, facts: StarterFacts = NO_FACTS): Pick<StarterMission, "title" | "outcome" | "finding" | "scope" | "deduction" | "origin"> & { stopRuleDays?: number } {
  const { profile } = state;
  const offer = firstOffer(profile.offers) || profile.trade;
  const offerShort = clip(offer, 60);
  const ambitionText = state.ambition?.text ?? "";
  const cap = endPunctuation(capLabel(ambitionText, state.ambition?.terms));
  switch (key) {
    case "site_page": {
      const read = siteWasRead(state);
      const situation = read ? `Vous visez : ${clip(cap, 150)}.` : !profile.website ? "Aucun site n'a été lu ; son existence reste à vérifier." : "Paul n'a pas pu lire votre site.";
      const deduction = !read
          ? `Vous visez ${clip(cap, 100)} : vérifiez d'abord si une page présente déjà ${offerShort} et permet de vous contacter, avant d'en créer une.`
          : ambitionTargetsRequests(ambitionText)
            ? `Vous visez ${clip(cap, 100)} : une page claire sur ${offerShort} donne à vos clients un point d'entrée direct pour vous contacter.`
            : `Vous visez ${clip(cap, 100)} : une page dédiée à ${offerShort} donne à vos clients de ${clip(profile.servingArea || profile.location, 50)} un point d'entrée de plus.`;
      return {
        title: `Présenter ${clip(offer, 45)} sur votre site vitrine`, outcome: MISSION_TEMPLATES.site_page.defaultOutcome,
        finding: clip(`Vos offres : ${clip(profile.offers, 100)}. ${situation}`, 300), scope: { page: clip(offer, 80) },
        deduction: clip(deduction, 500), origin: originOf(state, ["offers"]),
      };
    }
    case "social_post": {
      // Variante par rapport à la page du site vitrine, pour ne jamais republier le même sujet (#169) :
      // 1) une deuxième offre distincte si l'entreprise en a déclaré plusieurs ;
      // 2) à défaut, un deuxième segment de clientèle, le même offre mais un message qui lui parle ;
      // 3) à défaut, un angle différent — preuve sociale ou offre limitée dans le temps selon l'ambition.
      const altOffer = secondOffer(profile.offers);
      const altSegment = altOffer ? null : secondSegment(profile.targetClients);
      const urgent = ambitionTargetsRequests(ambitionText);
      const topicOffer = altOffer ?? offer;
      const topicShort = clip(topicOffer, 60);
      let topic: string;
      let title: string;
      let finding: string;
      let deduction: string;
      if (altOffer) {
        topic = topicOffer.length >= 5 ? clip(topicOffer, 120) : clip(`Présenter ${topicOffer}`, 120);
        title = `Une publication sur ${clip(topicOffer, 55)}`;
        finding = clip(`Vos clients : ${clip(profile.targetClients, 100)}. Votre offre : ${clip(topicOffer, 100)}.`, 300);
        deduction = `Vous visez ${clip(cap, 90)} : une publication sur ${topicShort} montre une autre facette de votre savoir-faire à ${clip(profile.targetClients, 60)}, sans dépense.`;
      } else if (altSegment) {
        const segmentShort = clip(altSegment, 50);
        topic = clip(`${offerShort} pour ${altSegment}`, 120);
        title = `Une publication sur ${clip(offer, 40)} pour ${clip(altSegment, 30)}`;
        finding = clip(`Vos clients : ${clip(profile.targetClients, 100)}. Votre offre : ${clip(offer, 100)}.`, 300);
        deduction = `Vous visez ${clip(cap, 80)} : vous visez aussi ${segmentShort}, qui ne lit pas forcément votre page comme vos autres clients — une publication qui s'adresse à eux sur ${topicShort} ouvre cette cible sans dépense.`;
      } else if (urgent) {
        topic = clip(`${offerShort} : une offre limitée dans le temps`, 120);
        title = `Une offre limitée dans le temps sur ${clip(offer, 45)}`;
        finding = clip(`Vos clients : ${clip(profile.targetClients, 100)}. Votre offre : ${clip(offer, 100)}.`, 300);
        deduction = `Vous visez ${clip(cap, 90)} : une offre limitée dans le temps sur ${topicShort} donne une raison d'agir maintenant, là où votre page reste une référence permanente.`;
      } else {
        topic = clip(`Un avis ou une réalisation récente sur ${offerShort}`, 120);
        title = `Partager un avis ou une réalisation sur ${clip(offer, 40)}`;
        finding = clip(`Vos clients : ${clip(profile.targetClients, 100)}. Votre offre : ${clip(offer, 100)}.`, 300);
        deduction = `Vous visez ${clip(cap, 90)} : un avis ou une réalisation récente sur ${topicShort} prouve votre savoir-faire à ${clip(profile.targetClients, 50)}, autrement qu'une page de présentation.`;
      }
      return {
        title: clip(title, 80), outcome: MISSION_TEMPLATES.social_post.defaultOutcome,
        finding, scope: { topic },
        deduction: clip(deduction, 500),
        origin: originOf(state, ["targetClients", "offers"]),
      };
    }
    case "google_profile":
      return {
        title: "Mettre à jour votre fiche Google", outcome: MISSION_TEMPLATES.google_profile.defaultOutcome,
        finding: clip(`Votre activité : ${clip(profile.trade, 100)}, sur ${clip(profile.servingArea, 100)}.`, 300), scope: {},
        deduction: clip(`Vous visez ${clip(cap, 90)} : les clients de ${clip(profile.servingArea, 60)} cherchent souvent sur Google, une fiche complète les aide à vous trouver.`, 500),
        origin: originOf(state, ["trade", "servingArea"]),
      };
    case "review_reply":
      return {
        title: "Répondre à vos avis Google", outcome: MISSION_TEMPLATES.review_reply.defaultOutcome,
        finding: clip(`Vos clients : ${clip(profile.targetClients, 100)}, sur ${clip(profile.servingArea, 100)}.`, 300), scope: {},
        deduction: clip(`Vous visez ${clip(cap, 110)} : répondre aux avis rassure les clients qui comparent avant de vous contacter.`, 500),
        origin: originOf(state, ["targetClients", "servingArea"]),
      };
    default: {
      const locality = clip(profile.servingArea || profile.location, 50);
      // Opportunité réelle trouvée par la recherche (#362) : remplace l'action générique par du concret, daté et sourcé.
      if (facts.opportunity) {
        const { opportunity } = facts;
        const titleVerb = opportunity.isEvent ? "Participer à" : "Contacter";
        const when = opportunity.isEvent && opportunity.eventEndDate ? ` (d'ici le ${opportunity.eventEndDate})` : "";
        return {
          title: clip(`${titleVerb} ${opportunity.title}${when}`, 80), outcome: "Un premier pas concret vers votre ambition",
          finding: clip(`${opportunity.description} Source : ${opportunity.source}`, 300),
          scope: { description: clip(`${opportunity.isEvent ? "Participer à" : "Prendre contact avec"} ${opportunity.title} : ${opportunity.description}`, 300) }, stopRuleDays: 30,
          deduction: clip(`Vous visez ${clip(cap, 100)} : ${opportunity.description}`, 500),
          origin: ORIGIN_RESEARCH,
        };
      }
      return {
        title: clip(`Une première action pour ${offer} à ${locality}`, 80), outcome: "Un premier pas concret vers votre ambition",
        finding: clip(`Votre ambition : ${ambitionText || cap}. Vos clients : ${clip(profile.targetClients, 100)}.`, 300),
        scope: { description: clip(`Une action que vous menez vous-même, ciblée sur ${clip(profile.targetClients, 60)} à ${locality}, vers votre ambition : ${ambitionText || cap}`, 300) }, stopRuleDays: 30,
        deduction: clip(`Aucun modèle ne couvre encore ${clip(cap, 90)} : une action que vous menez vous-même, ciblée sur votre clientèle de ${locality}, permet de la tester sans attendre.`, 500),
        origin: ORIGIN_DECLARED,
      };
    }
  }
}

/**
 * Étape 4 (#284, FR-8), fonction pure : rappel de l'entreprise et du cap, « Ce que nous retenons » (celui du brouillon, ou
 * à défaut les règles) et au plus trois missions de modèles différents, la première « À examiner en premier ».
 * Chaque mission passe `validateNewMission` ; l'inscription les crée dans cet ordre.
 */
export function starterPlan(state: DraftState, available?: readonly TemplateKey[]): StarterPlan {
  const { profile } = state;
  const notes: string[] = [];
  if (!profile.website && !siteWasRead(state)) notes.push(SITE_NOT_GIVEN_NOTICE);
  else if (!siteWasRead(state)) notes.push(SITE_NOT_READ_NOTICE);
  const missing = missingTerms(state.ambition?.text, state.ambition?.terms);
  if (missing.length) notes.push(`La cible reste à préciser : ${missing.join(" et ")} ${missing.length > 1 ? "ne sont pas indiqués" : "n'est pas indiqué"}.`);
  if (state.ambition?.terms.mediaBudgetPerMonth === 0) notes.push("Budget média nul : seules des pistes sans dépense publicitaire sont proposées.");
  if (needsWeekdayClarification(state.ambition?.text ?? "")) notes.push("Pour choisir un test adapté à votre objectif en semaine : quels jours ou créneaux voulez-vous remplir, et quelle capacité avez-vous alors ?");
  else if (hasNoAdditionalTime(state.ambition?.text ?? "")) notes.push("Vous indiquez ne pas avoir de temps supplémentaire : aucune piste nécessitant une action de votre part n'est proposée.");
  else if (hasNoAvailableCapacity(state.ambition?.text ?? "")) notes.push("Votre capacité d'accueil semble atteinte : je n'oriente pas vers une acquisition supplémentaire sans capacité confirmée.");
  if (hasSatisfactoryBookingPage(state.ambition?.text ?? "")) notes.push("Vous indiquez que votre page ou réservation est déjà satisfaisante : elle n'est pas proposée à refaire.");
  const facts = starterFacts(matchingIntelligence(state));
  const intelligence = matchingIntelligence(state);
  const planning = intelligence?.planning;
  const checkedPlan = planning?.status === "done" && intelligence
    ? checkMissionProposal(planning.proposal, intelligence, available)
    : null;
  if ((planning || state.ambition?.planningVersion || state.intelligence?.planning) && (!checkedPlan || !checkedPlan.ok)) notes.push(INTELLIGENCE_MESSAGES.planningFailed);
  if (checkedPlan?.ok && checkedPlan.value.notice) notes.push(checkedPlan.value.notice);
  const templates = rankStarterTemplates(state, available);
  if (templates.length === 0 && !needsWeekdayClarification(state.ambition?.text ?? "") && !hasNoAdditionalTime(state.ambition?.text ?? "") && !hasNoAvailableCapacity(state.ambition?.text ?? "")) {
    notes.push("Je n'ai pas assez d'éléments pour justifier une mission sans supposer un problème. Précisez votre offre, votre clientèle ou la contrainte qui compte le plus avec Paul.");
  }
  const missions = checkedPlan?.ok ? checkedPlan.value.missions.map((mission, index): StarterMission => ({
    ...mission,
    origin: mission.decisionPlan.evidence?.every((item) => item.kind === "declared") ? ORIGIN_DECLARED
      : mission.decisionPlan.evidence?.some((item) => item.topic === "opportunite") ? ORIGIN_RESEARCH : ORIGIN_SITE,
    scopeLabel: starterScopeLabel(mission.template, mission.scope),
    first: index === 0, responsibleAgent: MISSION_TEMPLATES[mission.template].defaultAgent,
  })) : templates.map((key, index): StarterMission => {
    const template = MISSION_TEMPLATES[key];
    const raw = starterBody(key, state, facts);
    // Les textes du brouillon ne portent jamais de chevrons (refusés à la création, qui annulerait l'inscription).
    const body = {
      ...raw, title: noAngles(raw.title), outcome: noAngles(raw.outcome), finding: noAngles(raw.finding), deduction: noAngles(raw.deduction),
      scope: Object.fromEntries(Object.entries(raw.scope).map(([field, value]) => [field, typeof value === "string" ? noAngles(value) : value])),
    };
    // Un périmètre invalide pour son modèle (offre trop courte…) reste à compléter avant le lancement.
    if (key !== "custom" && !template.validateScope(body.scope).ok) body.scope = {};
    return {
      template: key, channel: key === "custom" ? null : enabledChannels(template)[0] ?? null, ...body,
      scopeLabel: starterScopeLabel(key, body.scope), first: index === 0, responsibleAgent: template.defaultAgent, risk: template.defaultRisk,
      decisionPlan: createMissionDecisionPlan(key, body.scope, starterSelectionReason(key, index, state)),
    };
  });
  // Rappel : sans partie vide, et sans la zone quand elle répète la localisation.
  const details = [profile.location, profile.trade, profile.servingArea === profile.location ? "" : profile.servingArea].filter(Boolean);
  return {
    recap: { companyName: profile.companyName, location: profile.location, trade: profile.trade, servingArea: profile.servingArea, details, cap: capLabel(state.ambition?.text, state.ambition?.terms), notes },
    retained: checkedPlan?.ok ? checkedPlan.value.retained : state.ambition?.retained ?? retainedFromRules(state),
    missions,
  };
}

/** Lecture défensive du brouillon stocké : toute valeur illisible redevient vide. */
function readCompetitorDecisions(value: unknown): CompetitorDecision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CompetitorDecision[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 100 ||
      typeof raw.source !== "string" || !safeSourceUrl(raw.source) ||
      (raw.decision !== "confirmed" && raw.decision !== "dismissed")
    ) return [];
    return [{ name: raw.name, source: raw.source, decision: raw.decision }];
  });
}

export function readDraftState(row: { step: number; profile: unknown; ambition: unknown; profileConfirmed: boolean; diagnosticReady: boolean; analysis?: unknown; intelligence?: unknown }): DraftState {
  const raw = row.profile !== null && typeof row.profile === "object" && !Array.isArray(row.profile) ? (row.profile as Record<string, unknown>) : {};
  const profile = emptyProfile();
  for (const key of ["firstName", "companyName", "location", "website", "trade", "servingArea", "targetClients", "offers"] as const) {
    profile[key] = typeof raw[key] === "string" ? (raw[key] as string) : "";
  }
  const socialSourceDecisions = readSocialSourceDecisions(raw.socialSourceDecisions);
  const competitorDecisions = readCompetitorDecisions(raw.competitorDecisions);
  const googlePlaceChoice = readGooglePlaceChoice(raw.googlePlaceChoice);
  const ambitionRaw = row.ambition !== null && typeof row.ambition === "object" && !Array.isArray(row.ambition) ? (row.ambition as Record<string, unknown>) : {};
  // « Ce que nous retenons » et son coût (#284) : illisibles, ils sont ignorés (les règles prennent le relais à l'étape 4).
  const retained = readRetained(ambitionRaw.retained);
  const retainedCost = readRetainedCost(ambitionRaw.retainedCost);
  const planningVersion = ambitionRaw.planningVersion === 1 || ambitionRaw.planningVersion === 2 ? ambitionRaw.planningVersion : undefined;
  return {
    step: isDraftStep(row.step) ? row.step : 1,
    profile,
    socialSourceDecisions,
    competitorDecisions,
    googlePlaceChoice,
    websiteRejected: raw.websiteRejected === true,
    // Une ambition d'avant #282 (texte seul) garde des éléments vides.
    ambition: typeof ambitionRaw.text === "string"
      ? { text: ambitionRaw.text, terms: readAmbitionTerms(ambitionRaw.terms) ?? { ...EMPTY_TERMS }, ...(retained ? { retained } : {}), ...(retainedCost ? { retainedCost } : {}), ...(planningVersion ? { planningVersion } : {}) }
      : null,
    profileConfirmed: row.profileConfirmed,
    diagnosticReady: row.diagnosticReady,
    analysis: readAnalysis(row.analysis ?? null),
    intelligence: readIntelligence(row.intelligence ?? null),
  };
}

export type ProfileOrigin = Provenance["kind"] | "missing";
export type ProfilePrefill = { values: Pick<DraftProfile, "trade" | "servingArea" | "targetClients" | "offers">; origins: Record<"trade" | "servingArea" | "targetClients" | "offers", ProfileOrigin> };

const PROFILE_ORIGIN_LABELS: Record<ProfileOrigin, string | null> = {
  declared: null,
  observed: "Lu sur le site",
  hypothesis: "À confirmer",
  missing: "À renseigner par vous",
};

/**
 * Étiquette d'origine d'un champ de l'étape 2 (FR-5, #281). Seule une valeur observée, avec sa source, est « Lu sur le site »
 * (FR-4) ; une valeur proposée par le modèle sans source est « À confirmer ». Une valeur saisie par le dirigeant n'en a pas.
 */
export function profileOriginLabel(origin: ProfileOrigin): string | null {
  return PROFILE_ORIGIN_LABELS[origin] ?? null;
}

/**
 * Préremplissage de l'étape 2 (#280) : ce que le dirigeant a déjà saisi (déclaré), sinon la valeur de l'analyse avec sa provenance,
 * sinon « À renseigner par vous ». La zone reprend à défaut la localisation déclarée. Rien n'est confirmé ici.
 */
export function prefillProfile(state: DraftState): ProfilePrefill {
  const fields = ["trade", "servingArea", "targetClients", "offers"] as const;
  const values = { trade: "", servingArea: "", targetClients: "", offers: "" };
  const origins = { trade: "missing", servingArea: "missing", targetClients: "missing", offers: "missing" } as ProfilePrefill["origins"];
  for (const field of fields) {
    const found = analysisMatchesProfile(state) ? state.analysis?.findings[field] : null;
    if (state.profile[field]) [values[field], origins[field]] = [state.profile[field], "declared"];
    else if (found?.value) [values[field], origins[field]] = [clip(found.value, LIMITS[field]), found.provenance.kind];
    // Une localisation n'est pas une zone d'intervention : la reprendre est une proposition de Paul, à confirmer.
    else if (field === "servingArea" && state.profile.location) [values[field], origins[field]] = [state.profile.location, "hypothesis"];
  }
  return { values, origins };
}

/** L'étape 2 présente-t-elle au moins un champ venu de l'analyse ou proposé par Paul (lu sur le site ou à confirmer) ? */
export function prefillFromPaul(prefill: ProfilePrefill): boolean {
  return Object.values(prefill.origins).some((origin) => origin === "hypothesis" || origin === "observed");
}
