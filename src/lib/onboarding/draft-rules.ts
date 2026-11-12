import { MISSION_TEMPLATES, availableTemplates, enabledChannels, type TemplateKey } from "@/lib/missions/templates";
import { ANALYSIS_MESSAGES, RUBRIC_KEYS, RUBRIC_NAMES, analysisFinished, analysisRunning, readAnalysis, type DraftAnalysis, type Provenance } from "@/lib/onboarding/analysis-rules";
import { EMPTY_TERMS, REINTERPRET_MESSAGE, capLabel, readAmbitionTerms, type AmbitionTerms } from "@/lib/ambition-rules";
import type { ResponsibleAgent } from "@/lib/missions/rules";

/** Vérifie le jeton d'une interprétation (`verifyInterpretation` côté serveur) ; injecté, car ce module est aussi lu par le client. */
export type InterpretationVerifier = (text: string, terms: AmbitionTerms, token: unknown) => boolean;
const refuseAll: InterpretationVerifier = () => false;

/**
 * Règles pures du parcours d'entrée en cinq étapes (#279, spécification §1.1, §1.2, §11, §12, §14).
 * Le serveur les applique à chaque transition ; l'interface les reflète. Depuis #280, « Découvrir » lance une
 * analyse publique (§1.3) gardée dans le brouillon ; « Voir les constats » ouvre l'étape 2 une fois l'analyse terminée.
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
export type DraftAmbition = { text: string; terms: AmbitionTerms; retained?: string[]; retainedCost?: RetainedCost };

export type DraftState = {
  step: DraftStep;
  profile: DraftProfile;
  ambition: DraftAmbition | null;
  profileConfirmed: boolean;
  diagnosticReady: boolean;
  /** Analyse publique de l'étape 1 (#280), écrite à part : jamais enregistrée par `saveDraft`. */
  analysis: DraftAnalysis | null;
};

export const STEP_TITLES: Record<DraftStep, string> = {
  1: "Votre entreprise. Notre point de départ.",
  2: "Paul semble avoir compris votre entreprise.",
  3: "Qu'aimeriez-vous changer ?",
  4: "Un cap. Trois premières pistes.",
  5: "Retrouvez votre stratégie.",
};

export const STEP_LABELS: Record<DraftStep, { name: string; subtitle: string }> = {
  1: { name: "Découverte", subtitle: "Votre point de départ" },
  2: { name: "Premiers constats", subtitle: "Les signes que Paul a compris" },
  3: { name: "Ambition", subtitle: "Votre cap et vos limites" },
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
export type OnboardingCode = keyof typeof ONBOARDING_MESSAGES | "M-16" | "markup" | "analysis" | "reinterpret";

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
  return { step: 1, profile: emptyProfile(), ambition: null, profileConfirmed: false, diagnosticReady: false, analysis: null };
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
  /** Une analyse est en cours : pas de second lancement, pas d'étape 2 avant sa fin (409). */
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

/** Étape 1 : prénom, entreprise, localisation, site facultatif (M-01, M-03, M-04). */
export function checkDiscovery(input: Record<string, unknown>): { ok: true; values: Pick<DraftProfile, "firstName" | "companyName" | "location" | "website"> } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const values = { firstName: text(input.firstName), companyName: text(input.companyName), location: text(input.location), website: text(input.website) };
  const failure = checkFields([
    { field: "firstName", value: values.firstName, max: LIMITS.firstName, missing: "M-01" },
    { field: "companyName", value: values.companyName, max: LIMITS.companyName, missing: "M-03-company" },
    { field: "location", value: values.location, max: LIMITS.location, missing: "M-03-location" },
    { field: "website", value: values.website, max: LIMITS.website, missing: "M-04", optional: true },
  ]);
  return failure ? { ok: false, ...failure } : { ok: true, values };
}

function discoveryDone(profile: DraftProfile): boolean {
  return checkDiscovery(profile).ok;
}

/** Étape 2 : activité, zone, clients et offres (M-05). */
export function checkProfile(input: Record<string, unknown>): { ok: true; values: Pick<DraftProfile, "trade" | "servingArea" | "targetClients" | "offers"> } | { ok: false; code: OnboardingCode; error: string; errors: FieldErrors } {
  const values = { trade: text(input.trade), servingArea: text(input.servingArea), targetClients: text(input.targetClients), offers: text(input.offers) };
  const failure = checkFields([
    { field: "trade", value: values.trade, max: LIMITS.trade, missing: "M-05" },
    { field: "servingArea", value: values.servingArea, max: LIMITS.servingArea, missing: "M-05" },
    { field: "targetClients", value: values.targetClients, max: LIMITS.targetClients, missing: "M-05" },
    { field: "offers", value: values.offers, max: LIMITS.offers, missing: "M-05" },
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
  | { action: "confirm_profile"; trade?: unknown; servingArea?: unknown; targetClients?: unknown; offers?: unknown }
  | { action: "interpret_ambition"; ambition?: unknown }
  | { action: "confirm_ambition"; ambition?: unknown; terms?: unknown; token?: unknown }
  | { action: "interested" }
  | { action: "back"; step: unknown }
  | { action: "goto"; step: unknown };

export const DRAFT_ACTIONS = ["discover", "see_findings", "confirm_profile", "interpret_ambition", "confirm_ambition", "interested", "back", "goto"] as const;

/** Demande lisible, ou null (400). */
export function parseDraftAction(body: Record<string, unknown>): DraftAction | null {
  const action = DRAFT_ACTIONS.find((candidate) => candidate === body.action);
  if (!action) return null;
  if (action === "back" || action === "goto") return { action, step: body.step };
  return { ...body, action } as DraftAction;
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
  return input !== undefined && input.companyName === state.profile.companyName && input.location === state.profile.location && input.website === state.profile.website;
}

/** L'étape n est-elle ouverte depuis l'étape n - 1 (étape précédente confirmée) ? */
function previousConfirmed(state: DraftState, step: DraftStep, now: Date): boolean {
  if (step === 1) return true;
  if (step === 2) return discoveryDone(state.profile) && analysisFinished(state.analysis, now) && analysisMatchesProfile(state);
  if (step === 3) return state.profileConfirmed;
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
      const checked = checkDiscovery(request);
      if (!checked.ok) return invalid(checked);
      const changed = (Object.keys(checked.values) as (keyof typeof checked.values)[]).some((key) => state.profile[key] !== checked.values[key]);
      // L'étape 1 reste affichée le temps de l'analyse ; un profil modifié se reconfirme à l'étape 2.
      return { ok: true, state: { ...state, step: 1, profile: { ...state.profile, ...checked.values }, profileConfirmed: changed ? false : state.profileConfirmed } };
    }
    case "see_findings": {
      if (state.step !== 1) return { ok: false, kind: "wrong_step", step: state.step };
      const checked = checkDiscovery(state.profile);
      if (!checked.ok) return invalid(checked);
      if (analysisRunning(state.analysis, now)) return { ok: false, kind: "busy", error: ANALYSIS_MESSAGES.busy };
      // L'analyse doit porter sur l'entreprise saisie : sinon, il faut relancer la découverte.
      if (!analysisMatchesProfile(state)) return invalid({ code: "analysis", error: ANALYSIS_MESSAGES.missing, errors: {} });
      return { ok: true, state: { ...state, step: 2 } };
    }
    case "confirm_profile": {
      if (state.step !== 2) return { ok: false, kind: "wrong_step", step: state.step };
      const checked = checkProfile(request);
      if (!checked.ok) return invalid(checked);
      return { ok: true, state: { ...state, step: 3, profile: { ...state.profile, ...checked.values }, profileConfirmed: true } };
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
      return { ok: true, state: { ...state, step: 4, ambition: { text: checked.ambition, terms: confirmed.terms, ...(previousCost ? { retainedCost: previousCost } : {}) }, diagnosticReady: true } };
    }
    case "interested": {
      if (state.step !== 4 || !state.diagnosticReady) return state.step === 4 ? invalidCode("M-08") : { ok: false, kind: "wrong_step", step: state.step };
      return { ok: true, state: { ...state, step: 5 } };
    }
    case "back": {
      if (!isDraftStep(request.step) || request.step >= state.step) return { ok: false, kind: "wrong_step", step: state.step };
      return { ok: true, state: back(state, request.step) };
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
export function checkDraftForAccount(state: DraftState): { ok: true } | { ok: false; code: OnboardingCode; error: string; step: DraftStep } {
  if (!state.profile.firstName) return { ok: false, code: "M-09", error: ONBOARDING_MESSAGES["M-09"], step: 1 };
  if (!state.profile.companyName) return { ok: false, code: "M-03-company", error: ONBOARDING_MESSAGES["M-03-company"], step: 1 };
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
export type StarterOrigin = typeof ORIGIN_SITE | typeof ORIGIN_DECLARED;
export const FIRST_BADGE = "À examiner en premier";
export const SITE_NOT_READ_NOTICE = "Paul n'a pas pu lire votre site : ce qui suit repose sur ce que vous nous avez dit.";
export const SITE_NOT_GIVEN_NOTICE = "Sans site indiqué, Paul s'est fondé sur vos réponses.";
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

/** L'ambition vise-t-elle des demandes (devis, appels, rendez-vous, nouveaux clients) ? */
export function ambitionTargetsRequests(text: string): boolean {
  return /\b(demandes?|devis|appels?|contacts?|rendez-vous|prospects?|nouveaux clients|nouvelles clientes?)\b/i.test(text);
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

/** Ce qui manque à l'ambition pour être une cible chiffrée (gain, horizon). */
function missingTerms(terms: AmbitionTerms | undefined): string[] {
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
  if (!state.profile.website) reserves.push("aucun site indiqué");
  else if (!analysis) reserves.push("votre site n'a pas été lu");
  else if (unread.length) reserves.push(`rubriques non lues (${unread.join(", ")})`);
  const toConfirm = (Object.keys(PROFILE_FIELD_WORDS) as ProfileField[]).filter((field) => confirmedOrigin(state, field) === "hypothesis").map((field) => PROFILE_FIELD_WORDS[field]);
  if (toConfirm.length) reserves.push(`valeurs à confirmer (${toConfirm.join(", ")})`);
  const missing = missingTerms(state.ambition?.terms);
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
};

export type StarterRecap = { companyName: string; location: string; trade: string; servingArea: string; details: string[]; cap: string; notes: string[] };

const noAngles = (value: string) => value.replace(/[<>]/g, "");
export type StarterPlan = { recap: StarterRecap; retained: string[]; missions: StarterMission[] };

/**
 * Rang des modèles de l'étape 4 (Design Notes de #284), parmi les modèles disponibles sans les agences :
 * la page du site d'abord si le site n'a pas été lu ou si l'ambition vise des demandes ; puis la publication ;
 * puis la fiche Google et les avis si leur canal s'ouvre ; « Sur mesure » en dernier recours. Trois au plus.
 */
export function rankStarterTemplates(state: DraftState, available: readonly TemplateKey[] = availableTemplates().map((template) => template.key)): TemplateKey[] {
  const sitePriority = !siteWasRead(state) || ambitionTargetsRequests(state.ambition?.text ?? "");
  const order: TemplateKey[] = [...(sitePriority ? ["site_page" as const] : []), "social_post", "google_profile", "review_reply", ...(sitePriority ? [] : ["site_page" as const]), "custom"];
  return order.filter((key) => available.includes(key) && !STARTER_EXCLUDED.includes(key)).slice(0, 3);
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

/** Corps d'une mission de l'étape 4 : constat, déduction, titre, résultat et périmètre propres au modèle. */
function starterBody(key: TemplateKey, state: DraftState): Pick<StarterMission, "title" | "outcome" | "finding" | "scope" | "deduction" | "origin"> & { stopRuleDays?: number } {
  const { profile } = state;
  const offer = firstOffer(profile.offers) || profile.trade;
  const offerShort = clip(offer, 60);
  const ambitionText = state.ambition?.text ?? "";
  const cap = endPunctuation(capLabel(ambitionText, state.ambition?.terms));
  switch (key) {
    case "site_page": {
      const read = siteWasRead(state);
      const situation = !profile.website ? "Vous n'avez pas indiqué de site internet." : read ? `Vous visez : ${clip(cap, 150)}.` : "Paul n'a pas pu lire votre site.";
      const deduction = !profile.website
        ? `Vous visez ${clip(cap, 100)} : vous n'avez pas encore de page qui présente ${offerShort}, pourtant le premier point d'entrée de vos clients.`
        : !read
          ? `Vous visez ${clip(cap, 100)} : votre site n'a pas pu être lu, mais une page claire sur ${offerShort} reste le premier point d'entrée de vos clients.`
          : ambitionTargetsRequests(ambitionText)
            ? `Vous visez ${clip(cap, 100)} : une page claire sur ${offerShort} donne à vos clients un point d'entrée direct pour vous contacter.`
            : `Vous visez ${clip(cap, 100)} : une page dédiée à ${offerShort} donne à vos clients de ${clip(profile.servingArea || profile.location, 50)} un point d'entrée de plus.`;
      return {
        title: `Présenter ${clip(offer, 45)} sur votre site vitrine`, outcome: MISSION_TEMPLATES.site_page.defaultOutcome,
        finding: clip(`Vos offres : ${clip(profile.offers, 100)}. ${situation}`, 300), scope: { page: clip(offer, 80) },
        deduction: clip(deduction, 300), origin: originOf(state, ["offers"]),
      };
    }
    case "social_post": {
      // Une deuxième offre distincte évite de republier le même sujet que la page du site vitrine (#169).
      const alt = secondOffer(profile.offers);
      const topicOffer = alt ?? offer;
      const topicShort = clip(topicOffer, 60);
      const topic = topicOffer.length >= 5 ? clip(topicOffer, 120) : clip(`Présenter ${topicOffer}`, 120);
      const deduction = alt
        ? `Vous visez ${clip(cap, 90)} : une publication sur ${topicShort} montre une autre facette de votre savoir-faire à ${clip(profile.targetClients, 60)}, sans dépense.`
        : ambitionTargetsRequests(ambitionText)
          ? `Vous visez ${clip(cap, 90)} : une publication sur ${topicShort} donne à ${clip(profile.targetClients, 60)} une raison concrète de vous contacter maintenant.`
          : `Vous visez ${clip(cap, 90)} : une publication sur ${topicShort} montre votre savoir-faire à ${clip(profile.targetClients, 60)}, sans dépense.`;
      return {
        title: `Une publication sur ${clip(topicOffer, 55)}`, outcome: MISSION_TEMPLATES.social_post.defaultOutcome,
        finding: clip(`Vos clients : ${clip(profile.targetClients, 100)}. Votre offre : ${clip(topicOffer, 100)}.`, 300), scope: { topic },
        deduction: clip(deduction, 300),
        origin: originOf(state, ["targetClients", "offers"]),
      };
    }
    case "google_profile":
      return {
        title: "Mettre à jour votre fiche Google", outcome: MISSION_TEMPLATES.google_profile.defaultOutcome,
        finding: clip(`Votre activité : ${clip(profile.trade, 100)}, sur ${clip(profile.servingArea, 100)}.`, 300), scope: {},
        deduction: clip(`Vous visez ${clip(cap, 90)} : les clients de ${clip(profile.servingArea, 60)} cherchent souvent sur Google, une fiche complète les aide à vous trouver.`, 300),
        origin: originOf(state, ["trade", "servingArea"]),
      };
    case "review_reply":
      return {
        title: "Répondre à vos avis Google", outcome: MISSION_TEMPLATES.review_reply.defaultOutcome,
        finding: clip(`Vos clients : ${clip(profile.targetClients, 100)}, sur ${clip(profile.servingArea, 100)}.`, 300), scope: {},
        deduction: clip(`Vous visez ${clip(cap, 110)} : répondre aux avis rassure les clients qui comparent avant de vous contacter.`, 300),
        origin: originOf(state, ["targetClients", "servingArea"]),
      };
    default: {
      const locality = clip(profile.servingArea || profile.location, 50);
      return {
        title: clip(`Une première action pour ${offer} à ${locality}`, 80), outcome: "Un premier pas concret vers votre ambition",
        finding: clip(`Votre ambition : ${ambitionText || cap}. Vos clients : ${clip(profile.targetClients, 100)}.`, 300),
        scope: { description: clip(`Une action que vous menez vous-même, ciblée sur ${clip(profile.targetClients, 60)} à ${locality}, vers votre ambition : ${ambitionText || cap}`, 300) }, stopRuleDays: 30,
        deduction: clip(`Aucun modèle ne couvre encore ${clip(cap, 90)} : une action que vous menez vous-même, ciblée sur votre clientèle de ${locality}, permet de la tester sans attendre.`, 300),
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
  if (!profile.website) notes.push(SITE_NOT_GIVEN_NOTICE);
  else if (!siteWasRead(state)) notes.push(SITE_NOT_READ_NOTICE);
  const missing = missingTerms(state.ambition?.terms);
  if (missing.length) notes.push(`La cible reste à préciser : ${missing.join(" et ")} ${missing.length > 1 ? "ne sont pas indiqués" : "n'est pas indiqué"}.`);
  const missions = rankStarterTemplates(state, available).map((key, index): StarterMission => {
    const template = MISSION_TEMPLATES[key];
    const raw = starterBody(key, state);
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
    };
  });
  // Rappel : sans partie vide, et sans la zone quand elle répète la localisation.
  const details = [profile.location, profile.trade, profile.servingArea === profile.location ? "" : profile.servingArea].filter(Boolean);
  return {
    recap: { companyName: profile.companyName, location: profile.location, trade: profile.trade, servingArea: profile.servingArea, details, cap: capLabel(state.ambition?.text, state.ambition?.terms), notes },
    retained: state.ambition?.retained ?? retainedFromRules(state),
    missions,
  };
}

/** Lecture défensive du brouillon stocké : toute valeur illisible redevient vide. */
export function readDraftState(row: { step: number; profile: unknown; ambition: unknown; profileConfirmed: boolean; diagnosticReady: boolean; analysis?: unknown }): DraftState {
  const raw = row.profile !== null && typeof row.profile === "object" && !Array.isArray(row.profile) ? (row.profile as Record<string, unknown>) : {};
  const profile = emptyProfile();
  for (const key of Object.keys(profile) as (keyof DraftProfile)[]) profile[key] = typeof raw[key] === "string" ? (raw[key] as string) : "";
  const ambitionRaw = row.ambition !== null && typeof row.ambition === "object" && !Array.isArray(row.ambition) ? (row.ambition as Record<string, unknown>) : {};
  // « Ce que nous retenons » et son coût (#284) : illisibles, ils sont ignorés (les règles prennent le relais à l'étape 4).
  const retained = readRetained(ambitionRaw.retained);
  const retainedCost = readRetainedCost(ambitionRaw.retainedCost);
  return {
    step: isDraftStep(row.step) ? row.step : 1,
    profile,
    // Une ambition d'avant #282 (texte seul) garde des éléments vides.
    ambition: typeof ambitionRaw.text === "string"
      ? { text: ambitionRaw.text, terms: readAmbitionTerms(ambitionRaw.terms) ?? { ...EMPTY_TERMS }, ...(retained ? { retained } : {}), ...(retainedCost ? { retainedCost } : {}) }
      : null,
    profileConfirmed: row.profileConfirmed,
    diagnosticReady: row.diagnosticReady,
    analysis: readAnalysis(row.analysis ?? null),
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
    const found = state.analysis?.findings[field];
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
