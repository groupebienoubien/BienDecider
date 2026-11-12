import { MISSION_CHANNELS, isChannelEnabled, type MissionChannel } from "@/lib/missions/channels";
import type { MissionMessageCode } from "@/lib/missions/messages";
import type { ResponsibleAgent } from "@/lib/missions/rules";

/**
 * Catalogue des modèles d'action, décrit en données (spécification §6.1, addendum §2.4, décision D9).
 * Ajouter un modèle, c'est ajouter une entrée et ses tests : les règles communes (statuts, crédits) ne changent pas.
 */
export const TEMPLATE_KEYS = ["agencies", "leads", "proof", "social_post", "google_profile", "review_reply", "site_page", "custom"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type ScopeResult = { ok: true; scope: Record<string, unknown> } | { ok: false; code: MissionMessageCode };

export type MissionTemplate = {
  key: TemplateKey;
  label: string;
  channels: readonly MissionChannel[];
  /** Format du contenu préparé par Paul. */
  contentFormat: string;
  defaultOutcome: string;
  /** Règle d'arrêt en jours ; null pour « Sur mesure », fixée au cadrage (7 à 90). */
  stopRuleDays: number | null;
  /** Faux tant que la source de son périmètre ou une condition d'ouverture manque : agences (#316), réalisations (#317), fichier de prospection (#69). */
  open: boolean;
  validateScope: (scope: unknown) => ScopeResult;
  /** Agent responsable par défaut (#284), repris à l'étape 4 du parcours d'entrée ; Paul le choisit lui-même ensuite. */
  defaultAgent: ResponsibleAgent;
  /** Risque ou limite par défaut (#284), 10 à 200 caractères : dit ce que le test ne garantit pas, sans rien promettre. */
  defaultRisk: string;
};

const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function distinctIds(value: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 80);
  if (ids.length !== value.length || new Set(ids).size !== ids.length || ids.length < min || ids.length > max) return null;
  return ids;
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max && !/[<>]/.test(text) ? text : null;
}

const idsScope = (key: string, min: number, max: number, code: MissionMessageCode) => (scope: unknown): ScopeResult => {
  const ids = distinctIds(asObject(scope)[key], min, max);
  return ids ? { ok: true, scope: { [key]: ids } } : { ok: false, code };
};

const textScope = (key: string, min: number, max: number, code: MissionMessageCode) => (scope: unknown): ScopeResult => {
  const text = boundedText(asObject(scope)[key], min, max);
  return text ? { ok: true, scope: { [key]: text } } : { ok: false, code };
};

const SOCIAL: readonly MissionChannel[] = ["facebook", "instagram", "linkedin"];

export const MISSION_TEMPLATES: Record<TemplateKey, MissionTemplate> = {
  agencies: {
    key: "agencies", defaultAgent: "demarchage", defaultRisk: "Un partenaire peut ne pas répondre : le test s'arrête après un refus clair ou 30 jours sans réponse.", label: "Partenariats", channels: ["gmail"], contentFormat: "E-mail individuel, sans relance automatique",
    defaultOutcome: "Une réponse d'un partenaire de votre zone", stopRuleDays: 30, open: true, validateScope: idsScope("agencyIds", 1, 2, "M-30"),
  },
  leads: {
    key: "leads", defaultAgent: "demarchage", defaultRisk: "Un ancien contact peut ne pas souhaiter être recontacté : chaque e-mail lui propose de ne plus l'être.", label: "Réactivation", channels: ["gmail"], contentFormat: "E-mail individuel qui propose de ne plus être recontacté",
    defaultOutcome: "Un rendez-vous avec un ancien contact", stopRuleDays: 30, open: false, validateScope: idsScope("contactIds", 1, 8, "M-31"),
  },
  proof: {
    key: "proof", defaultAgent: "contenu", defaultRisk: "Sans photo ni accord du client, la réalisation ne peut pas être publiée.", label: "Réalisation", channels: SOCIAL, contentFormat: "Publication avec visuel",
    defaultOutcome: "Des demandes qualifiées à partir d'une réalisation", stopRuleDays: 7, open: false,
    validateScope: (scope) => (typeof asObject(scope).proofId === "string" && boundedText(asObject(scope).proofId, 1, 80) ? { ok: true, scope: { proofId: asObject(scope).proofId } } : { ok: false, code: "M-32" }),
  },
  social_post: {
    key: "social_post", defaultAgent: "contenu", defaultRisk: "Une seule publication donne un signal, pas une preuve : le bilan à 7 jours dira ce qu'elle a apporté.", label: "Publication", channels: SOCIAL, contentFormat: "Publication (actualité, offre, conseil)",
    defaultOutcome: "Des réactions et des demandes à partir d'une publication", stopRuleDays: 7, open: true, validateScope: textScope("topic", 5, 120, "M-17"),
  },
  google_profile: {
    key: "google_profile", defaultAgent: "marketing", defaultRisk: "Une fiche à jour ne garantit aucun appel : le bilan à 30 jours dira ce qu'elle a apporté.", label: "Fiche Google à jour", channels: ["google_business_profile"], contentFormat: "Informations de la fiche ou publication Google",
    defaultOutcome: "Une fiche Google complète et à jour", stopRuleDays: 30, open: true, validateScope: () => ({ ok: true, scope: {} }),
  },
  review_reply: {
    key: "review_reply", defaultAgent: "marketing", defaultRisk: "Une réponse publiée reste visible de tous : chacune est relue et validée par vous avant d'être diffusée.", label: "Réponse aux avis", channels: ["google_business_profile"], contentFormat: "Une réponse par avis",
    defaultOutcome: "Tous les avis récents ont une réponse", stopRuleDays: 30, open: true, validateScope: idsScope("reviewIds", 1, 5, "M-64"),
  },
  site_page: {
    key: "site_page", defaultAgent: "contenu", defaultRisk: "Une page en ligne ne suffit pas seule : elle n'apporte des demandes que si vos clients la trouvent.", label: "Page du site vitrine", channels: ["site"], contentFormat: "Page (titre, textes, photos)",
    defaultOutcome: "Une page du site qui présente votre offre", stopRuleDays: 30, open: true,
    validateScope: (scope) => {
      const page = asObject(scope).page;
      if (page === undefined) return { ok: true, scope: {} };
      const text = boundedText(page, 1, 80);
      return text ? { ok: true, scope: { page: text } } : { ok: false, code: "M-20" };
    },
  },
  custom: {
    key: "custom", defaultAgent: "co_ceo", defaultRisk: "Vous menez cette action vous-même : Paul ne mesure que ce que vous déclarez.", label: "Sur mesure", channels: MISSION_CHANNELS, contentFormat: "Texte, visuel facultatif",
    defaultOutcome: "", stopRuleDays: null, open: true, validateScope: textScope("description", 10, 300, "M-18"),
  },
};

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && (TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** Canaux actifs d'un modèle ; « Sur mesure » peut aussi se mener hors canal. */
export function enabledChannels(template: MissionTemplate): MissionChannel[] {
  return template.channels.filter(isChannelEnabled);
}

/** Modèles proposés au dirigeant et à Paul : ouverts et avec au moins un canal actif, plus « Sur mesure » (toujours possible hors canal). */
export function availableTemplates(): MissionTemplate[] {
  return TEMPLATE_KEYS.map((key) => MISSION_TEMPLATES[key]).filter((template) => template.open && (template.key === "custom" || enabledChannels(template).length > 0));
}

/** Règle d'arrêt d'une mission : fixée par le modèle, ou choisie de 7 à 90 jours pour « Sur mesure ». */
export function resolveStopRuleDays(template: MissionTemplate, input: unknown): { ok: true; days: number } | { ok: false; code: MissionMessageCode } {
  if (template.stopRuleDays !== null) return { ok: true, days: template.stopRuleDays };
  return typeof input === "number" && Number.isInteger(input) && input >= 7 && input <= 90 ? { ok: true, days: input } : { ok: false, code: "M-18" };
}
