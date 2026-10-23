import { z } from "zod";
import { clientsToMonthly, formatDecimal, formatEuros, toMonthly, type Period } from "@/lib/business-target";
import { PERSONAS } from "@/lib/agents/personas";
import { PAUL_PROFILE_FIELDS, PROFILE_FIELD_LABELS, PROFILE_TEXT_LIMITS, cleanProfileText, profileTextIssue, type PaulProfileField } from "@/lib/company-profile";

/**
 * Partie pure des intentions de Paul (cartes de confirmation) : schémas,
 * conversion et lignes affichées. Sans accès base, donc utilisable par le
 * panneau de Paul et les tests sans base — cf. pending-actions.ts.
 */

export const PENDING_ACTION_TYPES = ["update_objective", "update_profile", "launch_plan_item"] as const;
export type PendingActionType = (typeof PENDING_ACTION_TYPES)[number];
export function isPendingActionType(type: string): type is PendingActionType {
  return (PENDING_ACTION_TYPES as readonly string[]).includes(type);
}
/** superseded = remplacée par une carte plus récente du même type, sans geste du dirigeant. */
export const PENDING_ACTION_STATUSES = ["pending", "confirmed", "cancelled", "expired", "superseded"] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

/** Une carte non décidée expire 24 h après sa création. */
export const PENDING_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
export const EXPIRED_MESSAGE = "Cette proposition a expiré. Redites votre objectif à Paul.";
const EXPIRED_MESSAGES: Record<PendingActionType, string> = {
  update_objective: EXPIRED_MESSAGE,
  update_profile: "Cette proposition a expiré. Redites à Paul ce qu'il faut enregistrer dans votre profil.",
  launch_plan_item: "Cette proposition a expiré. L'action reste dans votre plan : lancez-la depuis le plan ou redemandez-la à Paul.",
};
const NEUTRAL_EXPIRED_MESSAGE = "Cette proposition a expiré. Redites votre demande à Paul.";
/** Message d'une carte expirée, selon ce qu'elle proposait. */
export function expiredMessage(type: string): string {
  return isPendingActionType(type) ? EXPIRED_MESSAGES[type] : NEUTRAL_EXPIRED_MESSAGE;
}

/** Texte affiché sous une carte décidée, selon son statut et son type (vide tant qu'elle est en attente). */
export function decidedText(status: PendingActionStatus, type: string, result?: LaunchResult): string {
  const launch = type === "launch_plan_item";
  switch (status) {
    case "pending": return "";
    case "confirmed": return launch ? (result?.message ?? LAUNCH_UNKNOWN_MESSAGE) : "C’est enregistré.";
    case "cancelled": return launch ? "Plus tard : l’action reste dans votre plan, à lancer." : "Proposition annulée. Dites à Paul ce qu’il faut corriger.";
    case "expired": return expiredMessage(type);
    case "superseded": return "Remplacée par une proposition plus récente.";
  }
}
/** Carte de lancement confirmée dont le résultat n'est pas (encore) connu. */
export const LAUNCH_UNKNOWN_MESSAGE = "Lancement en cours de vérification…";
export const INACTIVE_MESSAGE = "Cette proposition n'est plus active.";

// Mêmes bornes que la page Entreprise (entiers 32 bits en base).
export const MAX_AMOUNT = 1_000_000_000;
const amount = z.number().finite().min(0).max(MAX_AMOUNT);
const period = z.enum(["month", "year"]);

/**
 * Ce que dit le dirigeant, tel quel : chaque montant avec la période dans
 * laquelle il l'a dit (la valeur d'un client n'en a pas). Le code convertit.
 */
export const updateObjectivePayloadSchema = z.object({
  revenueTarget: amount,
  targetPeriod: period,
  currentRevenue: amount.optional(),
  currentPeriod: period.optional(),
  averageClientValue: amount.optional(),
  newClients: amount.optional(),
  newClientsPeriod: period.optional(),
  /** Échéance « AAAA-MM », enregistrée en fin de mois comme sur la page Entreprise. */
  targetDate: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),
}).strict().superRefine((payload, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (payload.currentRevenue != null && !payload.currentPeriod) issue("currentPeriod", "Période du chiffre d'affaires actuel manquante");
  if (payload.newClients != null && !payload.newClientsPeriod) issue("newClientsPeriod", "Période du nombre de clients manquante");
  // Un montant qui, converti au mois, arrondit sous 1 € ne peut pas être enregistré.
  if (toMonthly(payload.revenueTarget, payload.targetPeriod) < 1) issue("revenueTarget", "Objectif inférieur à 1 € par mois");
  if (payload.currentRevenue != null && payload.currentPeriod && toMonthly(payload.currentRevenue, payload.currentPeriod) < 1) {
    issue("currentRevenue", "Chiffre d'affaires actuel inférieur à 1 € par mois");
  }
  if (payload.averageClientValue != null && Math.round(payload.averageClientValue) < 1) issue("averageClientValue", "Valeur d'un client inférieure à 1 €");
});
export type UpdateObjectivePayload = z.infer<typeof updateObjectivePayloadSchema>;

/** Valeurs mensuelles écrites dans Company à la confirmation ; un champ absent n'est pas modifié. */
export type ObjectiveUpdate = {
  revenueTarget: number;
  monthlyRevenue?: number;
  averageClientValue?: number;
  newClientsPerMonth?: number;
  targetDate?: Date;
  objective: string;
};

const PERIOD_WORD: Record<Period, string> = { month: "par mois", year: "par an" };
const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Fin du mois « AAAA-MM » (dernier jour, minuit UTC). */
export function endOfMonth(month: string): Date {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
}

export function objectiveUpdateValues(payload: UpdateObjectivePayload): ObjectiveUpdate {
  const target = formatEuros(payload.revenueTarget);
  const hasCurrent = payload.currentRevenue != null && payload.currentPeriod != null;
  let objective: string;
  if (hasCurrent && payload.currentPeriod === payload.targetPeriod) {
    objective = `Passer de ${formatEuros(payload.currentRevenue!)} à ${target} de chiffre d'affaires ${PERIOD_WORD[payload.targetPeriod]}`;
  } else if (hasCurrent) {
    objective = `Passer de ${formatEuros(payload.currentRevenue!)} ${PERIOD_WORD[payload.currentPeriod!]} à ${target} ${PERIOD_WORD[payload.targetPeriod]} de chiffre d'affaires`;
  } else {
    objective = `Atteindre ${target} de chiffre d'affaires ${PERIOD_WORD[payload.targetPeriod]}`;
  }
  if (payload.targetDate) objective += ` d'ici ${MONTH_LABEL.format(endOfMonth(payload.targetDate))}`;
  return {
    revenueTarget: toMonthly(payload.revenueTarget, payload.targetPeriod),
    ...(hasCurrent ? { monthlyRevenue: toMonthly(payload.currentRevenue!, payload.currentPeriod!) } : {}),
    // La valeur d'un client ne dépend pas d'une période : gardée telle quelle, arrondie à l'euro.
    ...(payload.averageClientValue != null ? { averageClientValue: Math.round(payload.averageClientValue) } : {}),
    ...(payload.newClients != null && payload.newClientsPeriod ? { newClientsPerMonth: clientsToMonthly(payload.newClients, payload.newClientsPeriod) } : {}),
    ...(payload.targetDate ? { targetDate: endOfMonth(payload.targetDate) } : {}),
    objective,
  };
}

/**
 * Saisie de l'outil de Paul : seuls prénom et nom du dirigeant, site, comptes
 * sociaux, téléphone, horaires et description sont annoncés au modèle. null = non fourni. Les autres clés
 * sont tolérées par le schéma (pas d'erreur brute du SDK) puis écartées par
 * readProfileToolInput, qui signale nom, métier ou zone à Paul.
 */
export const profileUpdateToolSchema = z.object({
  ownerName: z.string().nullable().optional().describe(`${PROFILE_FIELD_LABELS.ownerName} : prénom et nom du dirigeant, tels qu'il les a dits (${PROFILE_TEXT_LIMITS.ownerName} caractères au plus)`),
  website: z.string().nullable().optional().describe(`${PROFILE_FIELD_LABELS.website} (adresse du site, ${PROFILE_TEXT_LIMITS.website} caractères au plus)`),
  socialHandles: z.string().nullable().optional().describe(`${PROFILE_FIELD_LABELS.socialHandles} (ex. @atelier, ${PROFILE_TEXT_LIMITS.socialHandles} caractères au plus)`),
  phone: z.string().nullable().optional().describe(`${PROFILE_FIELD_LABELS.phone} (${PROFILE_TEXT_LIMITS.phone} caractères au plus)`),
  openingHours: z.string().nullable().optional().describe(`${PROFILE_FIELD_LABELS.openingHours} (${PROFILE_TEXT_LIMITS.openingHours} caractères au plus)`),
  description: z.string().nullable().optional().describe(`Description de l'entreprise, de son savoir-faire et de ce qui la différencie (${PROFILE_TEXT_LIMITS.description} caractères au plus)`),
}).loose();

/** Champs que Paul ne modifie jamais : il renvoie vers la page Entreprise. */
const PAGE_ONLY_FIELDS = ["name", "trade", "servingArea"] as const;
export const PROFILE_PAGE_ONLY_MESSAGE = "Nom commercial, métier et zone se modifient sur la page Entreprise.";

/** Sépare la saisie de l'outil : champs admis (null écarté) et champs réservés à la page Entreprise. */
export function readProfileToolInput(input: Record<string, unknown>): { payload: Partial<Record<PaulProfileField, string>>; pageOnly: boolean } {
  const payload: Partial<Record<PaulProfileField, string>> = {};
  for (const field of PAUL_PROFILE_FIELDS) {
    const value = input[field];
    if (typeof value === "string") payload[field] = value;
  }
  return { payload, pageOnly: PAGE_ONLY_FIELDS.some((field) => input[field] != null) };
}

/**
 * Intention enregistrée : champs admis seulement (strict), mêmes limites que la
 * page Entreprise ; un texte vide efface le champ.
 */
export const updateProfilePayloadSchema = z.object({
  ownerName: z.string().optional(),
  website: z.string().optional(),
  socialHandles: z.string().optional(),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  description: z.string().optional(),
}).strict().superRefine((payload, context) => {
  const fields = PAUL_PROFILE_FIELDS.filter((field) => payload[field] !== undefined);
  if (fields.length === 0) context.addIssue({ code: "custom", message: "Aucun champ du profil à enregistrer" });
  for (const field of fields) {
    if (profileTextIssue(field, payload[field]) === "too_long") {
      context.addIssue({ code: "custom", path: [field], message: `« ${PROFILE_FIELD_LABELS[field]} » est limité à ${PROFILE_TEXT_LIMITS[field]} caractères` });
    }
  }
});
export type UpdateProfilePayload = z.infer<typeof updateProfilePayloadSchema>;

/** Une nouvelle carte de profil reprend les champs de la carte en attente qu'elle remplace ; ses valeurs l'emportent. */
export function mergeProfilePayloads(previous: UpdateProfilePayload, next: UpdateProfilePayload): UpdateProfilePayload {
  return { ...previous, ...next };
}

/** Valeurs écrites dans Company à la confirmation, nettoyées comme sur la page Entreprise ; un champ absent n'est pas modifié. */
export function profileUpdateValues(payload: UpdateProfilePayload): Partial<Record<PaulProfileField, string | null>> {
  const values: Partial<Record<PaulProfileField, string | null>> = {};
  for (const field of PAUL_PROFILE_FIELDS) {
    const value = cleanProfileText(field, payload[field]);
    if (value !== undefined) values[field] = value;
  }
  return values;
}

/** Agents qu'une carte de lancement peut faire travailler (mêmes que PLAN_AGENTS, sans accès base). */
/** Longueur maximale d'une actualité ou d'une description de prospects transmise à l'agent. */
export const LAUNCH_EXTRA_MAX = 1000;
const LAUNCH_AGENTS = ["marketing", "contenu", "demarchage"] as const;

/** Résultat du lancement, enregistré sur la carte au clic « Lancer » (motifs typés de l'épopée 1). */
export const launchResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(["already_running", "quota_runs", "quota_budget", "no_result", "outage"]).optional(),
  message: z.string(),
  runId: z.string().optional(),
}).strict();
export type LaunchResult = z.infer<typeof launchResultSchema>;

/**
 * Lancement proposé par Paul : l'action du plan (créée ou reprise au statut
 * « à lancer ») et ce que l'agent doit recevoir. Rien n'est lancé avant le clic.
 */
export const launchPlanItemPayloadSchema = z.object({
  planItemId: z.string().min(1),
  agent: z.enum(LAUNCH_AGENTS),
  title: z.string().min(1),
  outcome: z.string().optional(),
  extras: z.object({ newsContext: z.string().max(LAUNCH_EXTRA_MAX).optional(), prospectDescription: z.string().max(LAUNCH_EXTRA_MAX).optional() }).strict().optional(),
  /** Action active déjà au plan (même agent, même thème) reprise au lieu d'en créer une seconde. */
  reused: z.literal(true).optional(),
  result: launchResultSchema.optional(),
}).strict();
export type LaunchPlanItemPayload = z.infer<typeof launchPlanItemPayloadSchema>;

/** Ligne d'une carte qui reprend une action déjà au plan au lieu d'en créer une seconde (le titre est déjà dans l'en-tête). */
export const REUSED_LAUNCH_LINE = "Je reprends l'action déjà au plan.";

function describeLaunch(payload: unknown): PendingActionDescription | null {
  const parsed = launchPlanItemPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { agent, title, outcome, reused } = parsed.data;
  return {
    title: `Lancer ${PERSONAS[agent].name} : ${title}`,
    lines: [
      ...(reused ? [REUSED_LAUNCH_LINE] : []),
      ...(outcome?.trim() ? [outcome.trim()] : []),
    ],
    confirmLabel: "Lancer",
    cancelLabel: "Plus tard",
  };
}

export type PendingActionDescription = { title: string; lines: string[]; confirmLabel: string; cancelLabel: string };

/** Lignes de la carte, construites depuis l'intention enregistrée (jamais depuis le texte de Paul). */
export function describePendingAction(action: { type: string; payload: unknown }): PendingActionDescription | null {
  if (action.type === "update_profile") return describeProfileUpdate(action.payload);
  if (action.type === "launch_plan_item") return describeLaunch(action.payload);
  if (action.type !== "update_objective") return null;
  const parsed = updateObjectivePayloadSchema.safeParse(action.payload);
  if (!parsed.success) return null;
  const values = objectiveUpdateValues(parsed.data);
  const lines = [`${formatEuros(values.revenueTarget)}/mois visés`];
  if (values.monthlyRevenue != null) lines.push(`${formatEuros(values.monthlyRevenue)}/mois actuels`);
  if (values.averageClientValue != null) lines.push(`${formatEuros(values.averageClientValue)} par client`);
  if (values.newClientsPerMonth != null) {
    lines.push(`${formatDecimal(values.newClientsPerMonth)} ${values.newClientsPerMonth >= 2 ? "clients" : "client"}/mois aujourd'hui`);
  }
  if (values.targetDate) lines.push(`Échéance : ${MONTH_LABEL.format(values.targetDate)}`);
  return { title: `Enregistrer votre objectif : ${values.objective}`, lines, confirmLabel: "Confirmer", cancelLabel: "Corriger" };
}

function describeProfileUpdate(payload: unknown): PendingActionDescription | null {
  const parsed = updateProfilePayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const lines = Object.entries(profileUpdateValues(parsed.data)).map(([field, value]) =>
    `${PROFILE_FIELD_LABELS[field as PaulProfileField]} : ${value ?? "(effacé)"}`);
  return { title: "Enregistrer dans votre profil", lines, confirmLabel: "Confirmer", cancelLabel: "Corriger" };
}

export type PendingActionView = {
  id: string;
  type: string;
  status: PendingActionStatus;
  title: string;
  lines: string[];
  confirmLabel: string;
  cancelLabel: string;
  expiresAt: string;
  /** Carte de lancement confirmée : ce que le lancement a donné (lancé, ou motif en clair). */
  result?: LaunchResult;
};

/** Vue affichable ; une carte encore « pending » dont l'échéance est passée est montrée expirée. */
export function toPendingActionView(
  action: { id: string; type: string; status: string; payload: unknown; expiresAt: Date },
  now: Date = new Date(),
): PendingActionView | null {
  const description = describePendingAction(action);
  if (!description) return null;
  const known = (PENDING_ACTION_STATUSES as readonly string[]).includes(action.status) ? (action.status as PendingActionStatus) : "expired";
  const status = known === "pending" && action.expiresAt.getTime() <= now.getTime() ? "expired" : known;
  const launched = action.type === "launch_plan_item" ? launchPlanItemPayloadSchema.safeParse(action.payload) : null;
  const result = launched?.success ? launched.data.result : undefined;
  return { id: action.id, type: action.type, status, ...description, expiresAt: action.expiresAt.toISOString(), ...(result ? { result } : {}) };
}
