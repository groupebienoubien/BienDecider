import { MISSION_TEMPLATES, availableTemplates, enabledChannels, type TemplateKey } from "@/lib/missions/templates";

/**
 * Règles pures du parcours d'entrée en cinq étapes (#279, spécification §1.1, §1.2, §11, §12, §14).
 * Le serveur les applique à chaque transition ; l'interface les reflète. Version minimale décidée le
 * 2026-11-06 : ni analyse, ni reformulation de l'ambition, ni appel à Paul pendant le parcours.
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

export type DraftState = {
  step: DraftStep;
  profile: DraftProfile;
  ambition: string | null;
  profileConfirmed: boolean;
  diagnosticReady: boolean;
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
export type OnboardingCode = keyof typeof ONBOARDING_MESSAGES | "M-16" | "markup";

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
  return { step: 1, profile: emptyProfile(), ambition: null, profileConfirmed: false, diagnosticReady: false };
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
  | { ok: false; kind: "wrong_step"; step: DraftStep };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const hasMarkup = (value: string) => /[<>]/.test(value);

function lengthMessage(field: keyof DraftProfile, max: number): string {
  return `${FIELD_NAMES[field]} doit être compris entre 1 et ${max} caractères.`;
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
  | { action: "confirm_profile"; trade?: unknown; servingArea?: unknown; targetClients?: unknown; offers?: unknown }
  | { action: "confirm_ambition"; ambition?: unknown }
  | { action: "interested" }
  | { action: "back"; step: unknown }
  | { action: "goto"; step: unknown };

export const DRAFT_ACTIONS = ["discover", "confirm_profile", "confirm_ambition", "interested", "back", "goto"] as const;

/** Demande lisible, ou null (400). */
export function parseDraftAction(body: Record<string, unknown>): DraftAction | null {
  const action = DRAFT_ACTIONS.find((candidate) => candidate === body.action);
  if (!action) return null;
  if (action === "back" || action === "goto") return { action, step: body.step };
  return { ...body, action } as DraftAction;
}

/** Revenir à l'étape n (n < étape courante) : si n < 4, le diagnostic n'est plus prêt ; les saisies restent. */
function back(state: DraftState, step: DraftStep): DraftState {
  return { ...state, step, diagnosticReady: step < 4 ? false : state.diagnosticReady };
}

/** L'étape n est-elle ouverte depuis l'étape n - 1 (étape précédente confirmée) ? */
function previousConfirmed(state: DraftState, step: DraftStep): boolean {
  if (step === 1) return true;
  if (step === 2) return discoveryDone(state.profile);
  if (step === 3) return state.profileConfirmed;
  return state.diagnosticReady;
}

/**
 * Transitions de la spécification §1.2. Chaque étape ne s'ouvre que si la précédente est confirmée ;
 * une action demandée depuis une autre étape renvoie à l'étape courante (`wrong_step`).
 */
export function applyDraftAction(state: DraftState, request: DraftAction): TransitionResult {
  switch (request.action) {
    case "discover": {
      if (state.step !== 1) return { ok: false, kind: "wrong_step", step: state.step };
      const checked = checkDiscovery(request);
      if (!checked.ok) return invalid(checked);
      const changed = (Object.keys(checked.values) as (keyof typeof checked.values)[]).some((key) => state.profile[key] !== checked.values[key]);
      // Un profil modifié se reconfirme à l'étape 2.
      return { ok: true, state: { ...state, step: 2, profile: { ...state.profile, ...checked.values }, profileConfirmed: changed ? false : state.profileConfirmed } };
    }
    case "confirm_profile": {
      if (state.step !== 2) return { ok: false, kind: "wrong_step", step: state.step };
      const checked = checkProfile(request);
      if (!checked.ok) return invalid(checked);
      return { ok: true, state: { ...state, step: 3, profile: { ...state.profile, ...checked.values }, profileConfirmed: true } };
    }
    case "confirm_ambition": {
      if (state.step !== 3) return { ok: false, kind: "wrong_step", step: state.step };
      if (!state.profileConfirmed) return invalidCode("M-07");
      const checked = checkAmbition(request.ambition);
      if (!checked.ok) return invalid(checked);
      return { ok: true, state: { ...state, step: 4, ambition: checked.ambition, diagnosticReady: true } };
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
      if (request.step === state.step + 1 && previousConfirmed(state, request.step)) return { ok: true, state: { ...state, step: request.step } };
      return { ok: false, kind: "wrong_step", step: state.step };
    }
  }
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

/** Ordre fixe des modèles de l'étape 4 (décision du 2026-11-07) ; les trois premiers disponibles sont retenus. */
export const STARTER_TEMPLATE_ORDER: readonly TemplateKey[] = ["google_profile", "social_post", "site_page", "review_reply", "custom"];

export function pickStarterTemplates(available: readonly TemplateKey[] = availableTemplates().map((template) => template.key)): TemplateKey[] {
  return STARTER_TEMPLATE_ORDER.filter((key) => available.includes(key)).slice(0, 3);
}

/** Texte rogné à `max` caractères, coupé sur un espace et terminé par « … ». */
export function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type StarterMission = {
  template: TemplateKey;
  channel: string | null;
  title: string;
  outcome: string;
  finding: string;
  scope: Record<string, unknown>;
  stopRuleDays?: number;
};

const STARTER_TITLES: Record<TemplateKey, string> = {
  google_profile: "Mettre à jour votre fiche Google",
  social_post: "Publier une première actualité",
  site_page: "Présenter votre offre sur votre site vitrine",
  review_reply: "Répondre à vos avis Google",
  custom: "Une première action sur mesure",
  agencies: "Ouvrir la porte des agences locales",
  leads: "Renouer avec d'anciens contacts",
  proof: "Faire parler une réalisation",
};

/**
 * Mission « À décider » tirée du catalogue pour l'étape 4 : ce que le dirigeant a déclaré en est le constat.
 * Le corps suit les règles de création (`validateNewMission`) : titre 5-80, résultat 5-120, constat 10-300, sans balise.
 */
export function starterMission(key: TemplateKey, profile: DraftProfile, ambition: string): StarterMission {
  const template = MISSION_TEMPLATES[key];
  const finding = clip(`Vos offres : ${clip(profile.offers, 60)}. Vos clients : ${clip(profile.targetClients, 60)}. Votre zone : ${clip(profile.servingArea, 60)}. Votre ambition : ${ambition}`, 300);
  if (key === "custom") {
    return {
      template: key, channel: null, title: STARTER_TITLES.custom, outcome: "Un premier pas concret vers votre ambition", finding,
      scope: { description: clip(`Une action que vous menez vous-même vers votre ambition : ${ambition}`, 300) }, stopRuleDays: 30,
    };
  }
  return { template: key, channel: enabledChannels(template)[0] ?? null, title: STARTER_TITLES[key], outcome: template.defaultOutcome, finding, scope: {} };
}

export function starterMissions(profile: DraftProfile, ambition: string, available?: readonly TemplateKey[]): StarterMission[] {
  return pickStarterTemplates(available).map((key) => starterMission(key, profile, ambition));
}

/** Lecture défensive du brouillon stocké : toute valeur illisible redevient vide. */
export function readDraftState(row: { step: number; profile: unknown; ambition: unknown; profileConfirmed: boolean; diagnosticReady: boolean }): DraftState {
  const raw = row.profile !== null && typeof row.profile === "object" && !Array.isArray(row.profile) ? (row.profile as Record<string, unknown>) : {};
  const profile = emptyProfile();
  for (const key of Object.keys(profile) as (keyof DraftProfile)[]) profile[key] = typeof raw[key] === "string" ? (raw[key] as string) : "";
  const ambitionRaw = row.ambition !== null && typeof row.ambition === "object" && !Array.isArray(row.ambition) ? (row.ambition as Record<string, unknown>).text : undefined;
  return {
    step: isDraftStep(row.step) ? row.step : 1,
    profile,
    ambition: typeof ambitionRaw === "string" ? ambitionRaw : null,
    profileConfirmed: row.profileConfirmed,
    diagnosticReady: row.diagnosticReady,
  };
}
