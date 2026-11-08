import type { MissionMessageCode } from "@/lib/missions/messages";
import { channelLabel, isChannelEnabled, isMissionChannel, type MissionChannel } from "@/lib/missions/channels";
import { MISSION_TEMPLATES, availableTemplates, isTemplateKey, resolveStopRuleDays, type MissionTemplate, type TemplateKey } from "@/lib/missions/templates";

/** Règles pures des missions (spécification §2.2) : le serveur les applique, l'interface et Paul n'en ont aucune qui leur soit propre. */
export const LAUNCH_COST_CREDITS = 3;
export const MAX_OPEN_OWNER_MISSIONS = 10;

export const MISSION_STATUSES = ["proposed", "active", "paused", "stopped", "dismissed"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export type MissionFailure = { ok: false; code: MissionMessageCode; params?: Record<string, string | number> };

const failure = (code: MissionMessageCode, params?: Record<string, string | number>): MissionFailure => ({ ok: false, code, params });
const hasMarkup = (text: string) => /[<>]/.test(text);
const inRange = (text: string, min: number, max: number) => text.length >= min && text.length <= max && !hasMarkup(text);
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Canal d'une mission : permis par le modèle (M-69), puis actif (M-67) ; « Sur mesure » peut n'avoir aucun canal. */
function checkChannel(template: MissionTemplate, channel: unknown): { ok: true; channel: MissionChannel | null } | MissionFailure {
  if (channel === null || channel === undefined || channel === "") {
    if (template.key === "custom") return { ok: true, channel: null };
    const only = template.channels.filter(isChannelEnabled);
    return only.length === 1 ? { ok: true, channel: only[0] } : failure("M-68");
  }
  if (!isMissionChannel(channel) || !template.channels.includes(channel)) return failure("M-69");
  if (!isChannelEnabled(channel)) return failure("M-67", { canal: channelLabel(channel) });
  return { ok: true, channel };
}

export type NewMission = { template: TemplateKey; channel: MissionChannel | null; title: string; outcome: string; finding: string; scope: Record<string, unknown>; stopRuleDays: number };

export function validateNewMission(body: unknown, openOwnerMissions: number): { ok: true; value: NewMission } | MissionFailure {
  const input = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (!isTemplateKey(input.template) || !availableTemplates().some((template) => template.key === input.template)) return failure("M-76");
  const template = MISSION_TEMPLATES[input.template];
  const title = trimmed(input.title);
  const outcome = trimmed(input.outcome);
  const finding = trimmed(input.finding);
  if (!inRange(title, 5, 80) || !inRange(outcome, 5, 120) || !inRange(finding, 10, 300)) return failure("M-20");
  if (openOwnerMissions >= MAX_OPEN_OWNER_MISSIONS) return failure("M-75");
  const channel = checkChannel(template, input.channel);
  if (!channel.ok) return channel;
  const stop = resolveStopRuleDays(template, input.stopRuleDays);
  if (!stop.ok) return failure(stop.code);
  const given = input.scope !== null && typeof input.scope === "object" && !Array.isArray(input.scope) ? (input.scope as Record<string, unknown>) : {};
  // Hors « Sur mesure », le périmètre peut se compléter avant le lancement ; s'il est donné, il doit être valide.
  const scope = template.key !== "custom" && Object.keys(given).length === 0 ? { ok: true as const, scope: {} } : template.validateScope(given);
  if (!scope.ok) return failure(scope.code);
  return { ok: true, value: { template: template.key, channel: channel.channel, title, outcome, finding, scope: scope.scope, stopRuleDays: stop.days } };
}

/**
 * Déduction de Paul (#168) : facultative ; donnée, elle suit les règles du constat (10 à 300 caractères après
 * nettoyage des espaces, sans balise), sinon M-20.
 */
export function validateDeduction(value: unknown): { ok: true; deduction: string | null } | MissionFailure {
  if (value === undefined || value === null) return { ok: true, deduction: null };
  const deduction = trimmed(value);
  return typeof value === "string" && inRange(deduction, 10, 300) ? { ok: true, deduction } : failure("M-20");
}

/** Agents qu'une mission peut nommer comme responsables (#284) : les clés de `PERSONAS` (vérifié par les tests). */
export const RESPONSIBLE_AGENTS = ["co_ceo", "marketing", "contenu", "demarchage"] as const;
export type ResponsibleAgent = (typeof RESPONSIBLE_AGENTS)[number];

export function isResponsibleAgent(value: unknown): value is ResponsibleAgent {
  return typeof value === "string" && (RESPONSIBLE_AGENTS as readonly string[]).includes(value);
}

/**
 * Libellé visible de l'agent responsable (#284). La charte ne montre que Paul (D3, FR-55) : l'agent se lit comme
 * le rôle que Paul tient pour cette mission, jamais comme un autre personnage.
 */
export const RESPONSIBLE_LABELS: Record<ResponsibleAgent, string> = {
  co_ceo: "Paul, qui coordonne la mission",
  marketing: "Paul, pour votre présence en ligne",
  contenu: "Paul, pour vos contenus et votre site",
  demarchage: "Paul, pour la prospection",
};

export function responsibleLabel(agent: string | null | undefined): string | null {
  return isResponsibleAgent(agent) ? RESPONSIBLE_LABELS[agent] : null;
}

/** Agent responsable (#284) : facultatif ; donné, une clé de `PERSONAS`, sinon M-20. */
export function validateResponsibleAgent(value: unknown): { ok: true; agent: ResponsibleAgent | null } | MissionFailure {
  if (value === undefined || value === null) return { ok: true, agent: null };
  return isResponsibleAgent(value) ? { ok: true, agent: value } : failure("M-20");
}

export const RISK_MIN = 10;
export const RISK_MAX = 200;

/** Promesse de résultat (#284) : « garanti », « assuré », « certain », « promesse », « à coup sûr »… lettres accentuées comprises. */
const PROMISE = /(?<![\p{L}])(garanti\p{L}*|assur[ée]\p{L}*|promesse|promet|certaine?|à coup sûr)(?![\p{L}])/iu;

/** Le texte contient-il une promesse de résultat ? Un résultat recherché est une cible, jamais une promesse. */
export function containsPromise(text: string): boolean {
  return PROMISE.test(text);
}

/** Risque ou limite de la mission (#284) : facultatif ; donné, 10 à 200 caractères après nettoyage des espaces, sans balise, sinon M-20. */
export function validateRisk(value: unknown): { ok: true; risk: string | null } | MissionFailure {
  if (value === undefined || value === null) return { ok: true, risk: null };
  const risk = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return typeof value === "string" && inRange(risk, RISK_MIN, RISK_MAX) ? { ok: true, risk } : failure("M-20");
}

export type MissionSnapshot = {
  template: TemplateKey;
  channel: MissionChannel | null;
  status: MissionStatus;
  previousStatus: MissionStatus | null;
  scope: Record<string, unknown>;
  contactsConfirmedAt: Date | null;
  firstLaunchedAt: Date | null;
  hasValidatedVersion: boolean;
};

export type MissionAction =
  | { action: "launch" | "resume" | "pause" | "dismiss" | "restore" | "confirm_contacts" | "set_priority" }
  | { action: "set_channel"; channel: unknown }
  | { action: "set_outcome"; outcome: unknown }
  | { action: "set_scope"; scope: unknown };

export type MissionPatch = Partial<{ status: MissionStatus; previousStatus: MissionStatus | null; channel: MissionChannel | null; outcome: string; scope: Record<string, unknown>; contactsConfirmedAt: Date | null; firstLaunchedAt: Date }>;

/** `debit` : crédits à débiter dans la même transaction ; `noop` : rien à écrire (transition idempotente). */
export type TransitionResult = { ok: true; patch: MissionPatch; debit: number; noop: boolean } | MissionFailure;

const done = (patch: MissionPatch, debit = 0): TransitionResult => ({ ok: true, patch, debit, noop: false });
const same: TransitionResult = { ok: true, patch: {}, debit: 0, noop: true };

function contactIds(scope: Record<string, unknown>): unknown[] {
  return Array.isArray(scope.contactIds) ? scope.contactIds : [];
}

function checkLaunch(mission: MissionSnapshot, now: Date): TransitionResult {
  if (mission.status === "stopped") return failure("M-40");
  if (mission.status === "dismissed") return failure("M-21");
  if (mission.status === "active") return same;
  const template = MISSION_TEMPLATES[mission.template];
  if (!template.open) return failure("M-76");
  if (mission.channel === null && mission.template !== "custom") return failure("M-68");
  if (mission.channel !== null && !isChannelEnabled(mission.channel)) return failure("M-67", { canal: channelLabel(mission.channel) });
  if (mission.template === "leads" && contactIds(mission.scope).length === 0) return failure("M-41");
  const scope = template.validateScope(mission.scope);
  if (!scope.ok) return failure(scope.code);
  if (mission.template === "leads" && !mission.contactsConfirmedAt) return failure("M-42");
  // Le premier lancement débite ; une reprise après pause ne débite jamais.
  const first = mission.firstLaunchedAt === null;
  return done(first ? { status: "active", firstLaunchedAt: now } : { status: "active" }, first ? LAUNCH_COST_CREDITS : 0);
}

export function checkTransition(mission: MissionSnapshot, request: MissionAction, now = new Date()): TransitionResult {
  switch (request.action) {
    case "launch":
    case "resume":
      return checkLaunch(mission, now);
    case "pause":
      return mission.status === "active" ? done({ status: "paused" }) : failure("M-43");
    case "dismiss":
      if (mission.status === "dismissed") return same;
      if (mission.status === "active") return failure("M-22");
      if (mission.status === "stopped") return failure("M-23");
      return done({ status: "dismissed", previousStatus: mission.status });
    case "restore":
      if (mission.status !== "dismissed") return failure("M-24");
      return done({ status: mission.previousStatus === "paused" ? "paused" : "proposed", previousStatus: null });
    case "set_channel": {
      if (mission.status === "stopped") return failure("M-23");
      if (mission.status === "dismissed") return failure("M-21");
      if (mission.hasValidatedVersion) return failure("M-19");
      const channel = checkChannel(MISSION_TEMPLATES[mission.template], request.channel);
      return channel.ok ? done({ channel: channel.channel }) : channel;
    }
    case "set_outcome": {
      if (mission.status === "stopped") return failure("M-26");
      const outcome = trimmed(request.outcome);
      return inRange(outcome, 5, 120) ? done({ outcome }) : failure("M-25");
    }
    case "set_scope": {
      if (mission.status === "stopped") return failure("M-23");
      if (mission.status === "dismissed") return failure("M-21");
      const scope = MISSION_TEMPLATES[mission.template].validateScope(request.scope);
      if (!scope.ok) return failure(scope.code);
      // Changer la sélection de contacts retire la confirmation des contacts.
      const changed = mission.template === "leads" && JSON.stringify(scope.scope) !== JSON.stringify(mission.scope);
      return done(changed ? { scope: scope.scope, contactsConfirmedAt: null } : { scope: scope.scope });
    }
    case "set_priority":
      // Changer la priorité (§2.2) : ni Écartée ni Arrêtée ; rien n'est lancé ni suspendu, la mission elle-même ne change pas.
      if (mission.status === "dismissed") return failure("M-21");
      if (mission.status === "stopped") return failure("M-23");
      return same;
    case "confirm_contacts":
      if (mission.status === "stopped") return failure("M-23");
      if (mission.status === "dismissed") return failure("M-21");
      if (mission.template !== "leads" || contactIds(mission.scope).length === 0) return failure("M-41");
      return done({ contactsConfirmedAt: now });
  }
}
