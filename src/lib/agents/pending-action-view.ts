import { z } from "zod";
import { PAUL_PROFILE_FIELDS, PROFILE_FIELD_LABELS, PROFILE_TEXT_LIMITS, cleanProfileText, profileTextIssue, type PaulProfileField } from "@/lib/company-profile";
import { MISSION_CHANNELS, channelLabel } from "@/lib/missions/channels";
import { MISSION_TEMPLATES, TEMPLATE_KEYS } from "@/lib/missions/templates";
import { scopeSummary } from "@/lib/missions/scope";

/**
 * Partie pure des propositions de Paul (cartes « Paul · proposition à confirmer », spécification §16.3) :
 * schémas, lignes affichées et libellés. Sans accès base, donc utilisable par le panneau de Paul
 * et les tests sans base — cf. pending-actions.ts.
 */

export const PENDING_ACTION_TYPES = [
  "update_profile",
  "mission_priority",
  "mission_scope",
  "mission_pause",
  "mission_dismiss",
  "mission_restore",
  "mission_create",
  "mission_launch",
] as const;
export type PendingActionType = (typeof PENDING_ACTION_TYPES)[number];
export function isPendingActionType(type: string): type is PendingActionType {
  return (PENDING_ACTION_TYPES as readonly string[]).includes(type);
}
/** superseded = remplacée par une carte plus récente du même type et de même cible, sans geste du dirigeant. */
export const PENDING_ACTION_STATUSES = ["pending", "confirmed", "cancelled", "expired", "superseded"] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

/** Une carte non décidée expire 24 h après sa création. */
export const PENDING_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const EXPIRED_MESSAGE = "Cette proposition a expiré. Redites votre demande à Paul.";
const PROFILE_EXPIRED_MESSAGE = "Cette proposition a expiré. Redites à Paul ce qu'il faut enregistrer dans votre profil.";
/** Message d'une carte expirée, selon ce qu'elle proposait. */
export function expiredMessage(type: string): string {
  return type === "update_profile" ? PROFILE_EXPIRED_MESSAGE : EXPIRED_MESSAGE;
}
export const INACTIVE_MESSAGE = "Cette proposition n'est plus active.";

/** Refuser une proposition (§16.3) : le bouton et la réponse fixe de Paul, enregistrée dans le fil de la carte. */
export const KEEP_COURSE_LABEL = "Garder le cap actuel";
export const KEEP_COURSE_REPLY = "Nous gardons le cap actuel. Aucun changement appliqué.";

const CONFIRMED_TEXT: Record<PendingActionType, string> = {
  update_profile: "C’est enregistré.",
  mission_priority: "Priorité retenue. Aucune mission lancée.",
  mission_scope: "Périmètre modifié.",
  mission_pause: "Mission mise en pause.",
  mission_dismiss: "Mission écartée du plan.",
  mission_restore: "Mission remise au plan.",
  mission_create: "Mission créée, à décider : rien n'est lancé.",
  mission_launch: "Confirmez le cadre de la mission pour la lancer.",
};

/** Texte affiché sous une carte décidée, selon son statut et son type (vide tant qu'elle est en attente). */
export function decidedText(status: PendingActionStatus, type: string): string {
  switch (status) {
    case "pending": return "";
    case "confirmed": return isPendingActionType(type) ? CONFIRMED_TEXT[type] : "C’est fait.";
    case "cancelled": return "Proposition écartée : rien n'a changé.";
    case "expired": return expiredMessage(type);
    case "superseded": return "Remplacée par une proposition plus récente.";
  }
}

/** Adresse où mène une proposition de lancement acceptée : le dialogue « Confirmer le cadre de la mission », jamais un lancement direct. */
export function launchFrameHref(missionId: string): string {
  return `/missions/${encodeURIComponent(missionId)}?cadre=1`;
}

// ---------------------------------------------------------------------------
// Profil (gardé, addendum §8)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Missions (§16.3) : la carte ne porte que la cible et ce qui est proposé ; les contrôles
// sont ceux du service des missions, refaits à l'acceptation sur la version courante.
// ---------------------------------------------------------------------------

const missionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Priorité, pause, écarter, remettre au plan, lancer : une mission et son titre au moment de la proposition. */
export const missionRefPayloadSchema = z.object({ missionId, title: shortText(80) }).strict();
export type MissionRefPayload = z.infer<typeof missionRefPayloadSchema>;

/** Périmètre proposé, avec son résumé d'une ligne (§6.3) calculé à la proposition. */
export const missionScopePayloadSchema = z.object({
  missionId,
  title: shortText(80),
  scope: z.record(z.string(), z.unknown()),
  summary: shortText(300),
}).strict();
export type MissionScopePayload = z.infer<typeof missionScopePayloadSchema>;

/** Mission à créer (§2.2 Créer), tout modèle du catalogue, y compris « Sur mesure » ; jamais lancée. */
export const missionCreatePayloadSchema = z.object({
  template: z.enum(TEMPLATE_KEYS),
  channel: z.enum(MISSION_CHANNELS).nullable(),
  title: shortText(80),
  outcome: shortText(120),
  finding: shortText(300),
  scope: z.record(z.string(), z.unknown()),
  stopRuleDays: z.number().int().min(7).max(90).optional(),
}).strict();
export type MissionCreatePayload = z.infer<typeof missionCreatePayloadSchema>;

export type PayloadFor = {
  update_profile: UpdateProfilePayload;
  mission_priority: MissionRefPayload;
  mission_scope: MissionScopePayload;
  mission_pause: MissionRefPayload;
  mission_dismiss: MissionRefPayload;
  mission_restore: MissionRefPayload;
  mission_create: MissionCreatePayload;
  mission_launch: MissionRefPayload;
};

export const PAYLOAD_SCHEMAS: { [K in PendingActionType]: z.ZodType<PayloadFor[K]> } = {
  update_profile: updateProfilePayloadSchema,
  mission_priority: missionRefPayloadSchema,
  mission_scope: missionScopePayloadSchema,
  mission_pause: missionRefPayloadSchema,
  mission_dismiss: missionRefPayloadSchema,
  mission_restore: missionRefPayloadSchema,
  mission_create: missionCreatePayloadSchema,
  mission_launch: missionRefPayloadSchema,
};

/** Bouton d'acceptation de chaque proposition (§16.3). */
export const CONFIRM_LABELS: Record<PendingActionType, string> = {
  update_profile: "Enregistrer dans mon profil",
  mission_priority: "Retenir cette priorité",
  mission_scope: "Modifier le périmètre",
  mission_pause: "Mettre en pause",
  mission_dismiss: "Écarter",
  mission_restore: "Remettre au plan",
  mission_create: "Créer la mission",
  mission_launch: "Lancer",
};

export type PendingActionDescription = { title: string; lines: string[]; confirmLabel: string; cancelLabel: string };

const card = (type: PendingActionType, title: string, lines: string[]): PendingActionDescription => ({ title, lines, confirmLabel: CONFIRM_LABELS[type], cancelLabel: KEEP_COURSE_LABEL });

type Describer = (payload: unknown) => PendingActionDescription | null;

function describeRef(type: PendingActionType, title: (mission: string) => string, line: string): Describer {
  return (payload) => {
    const parsed = missionRefPayloadSchema.safeParse(payload);
    return parsed.success ? card(type, title(parsed.data.title), [line]) : null;
  };
}

/** Lignes de chaque carte, construites depuis l'intention enregistrée (jamais depuis le texte de Paul). */
const DESCRIBERS: Record<PendingActionType, Describer> = {
  update_profile: (payload) => {
    const parsed = updateProfilePayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    const lines = Object.entries(profileUpdateValues(parsed.data)).map(([field, value]) =>
      `${PROFILE_FIELD_LABELS[field as PaulProfileField]} : ${value ?? "(effacé)"}`);
    return card("update_profile", "Enregistrer dans votre profil", lines);
  },
  mission_priority: describeRef("mission_priority", (mission) => `Faire de « ${mission} » la priorité`, "Change la priorité ; ne lance ni ne suspend aucune mission."),
  mission_scope: (payload) => {
    const parsed = missionScopePayloadSchema.safeParse(payload);
    return parsed.success ? card("mission_scope", `Modifier le périmètre de « ${parsed.data.title} »`, [`Nouveau périmètre : ${parsed.data.summary}`]) : null;
  },
  mission_pause: describeRef("mission_pause", (mission) => `Mettre en pause « ${mission} »`, "La préparation s'arrête et ses programmations sont annulées. Vous pourrez la reprendre sans frais."),
  mission_dismiss: describeRef("mission_dismiss", (mission) => `Écarter « ${mission} » du plan`, "Rien n'est effacé : elle reste sous « Écartées » et pourra être remise au plan."),
  mission_restore: describeRef("mission_restore", (mission) => `Remettre « ${mission} » au plan`, "Elle redevient à décider, ou en pause si elle l'était. Rien n'est lancé."),
  mission_create: (payload) => {
    const parsed = missionCreatePayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    const { template, channel, outcome, finding, title, scope, stopRuleDays } = parsed.data;
    // Ce que l'acceptation écrira : périmètre et règle d'arrêt (celle du modèle hors « Sur mesure »).
    const days = template === "custom" ? stopRuleDays : MISSION_TEMPLATES[template].stopRuleDays;
    return card("mission_create", `Créer la mission « ${title} »`, [
      `${MISSION_TEMPLATES[template].label} · ${channel ? channelLabel(channel) : "Hors canal, diffusion déclarée"}`,
      `Résultat recherché : ${outcome}`,
      `Constat : ${finding}`,
      `Périmètre : ${scopeSummary(template, scope)} · Règle d'arrêt : ${days ? `${days} jours` : "—"}`,
      "Elle sera à décider : rien n'est lancé sans votre confirmation du cadre.",
    ]);
  },
  mission_launch: describeRef("mission_launch", (mission) => `Lancer « ${mission} »`, "J'ouvre le cadre de la mission : vous confirmez le coût et le périmètre avant tout lancement."),
};

export function describePendingAction(action: { type: string; payload: unknown }): PendingActionDescription | null {
  // Anciennes cartes (lancement d'agents, révision, objectif) : ignorées à l'affichage.
  return isPendingActionType(action.type) ? DESCRIBERS[action.type](action.payload) : null;
}

/** Mission visée par une carte, ou null (profil, création). */
export function pendingActionMissionId(action: { type: string; payload: unknown }): string | null {
  if (!isPendingActionType(action.type) || action.type === "update_profile" || action.type === "mission_create") return null;
  const parsed = z.object({ missionId }).loose().safeParse(action.payload);
  return parsed.success ? parsed.data.missionId : null;
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
  return { id: action.id, type: action.type, status, ...description, expiresAt: action.expiresAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Révision d'une production (ancien parcours, page Studio) : plus proposée par Paul,
// gardée pour la route de révision tant que l'atelier (#289) ne la remplace pas.
// ---------------------------------------------------------------------------

/** Longueur maximale de la consigne d'une révision. */
export const REVISION_INSTRUCTION_MAX = 1000;

/** Résultat d'une révision demandée depuis le Studio (motifs typés de l'épopée 1). */
export const launchResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(["already_running", "quota_runs", "quota_budget", "email_not_verified", "suspended", "no_result", "outage"]).optional(),
  message: z.string(),
  runId: z.string().optional(),
}).strict();
export type LaunchResult = z.infer<typeof launchResultSchema>;
