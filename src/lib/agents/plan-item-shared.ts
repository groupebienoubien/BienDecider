/** Partagé client/serveur : échéance des actions créées depuis une demande faite à Paul dans le chat. */
export const CHAT_REQUEST_TIMING = "Demandé dans le chat";

/** Titre comparable : sans accents, sans majuscules, ponctuation et espaces réduits. */
export function normalizePlanTitle(title: string) {
  return title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const AUDIT_TITLE = /^(?:(?:faire|refaire|lancer|realiser|nouvel|nouveau|un|le|l)\s+)*(?:audit|diagnostic)s?(?:\s|$)/;

/**
 * Story 5.2 : une action de Martine dont la tâche est de faire l'audit ou le
 * diagnostic (« Audit de… », « Refaire le diagnostic »), quelles que soient
 * majuscules et accents. Les suites d'un audit (« Corriger les points relevés
 * par l'audit ») et les autres actions de Martine restent à lancer.
 */
export function isAuditPlanItemTitle(title: string) {
  return AUDIT_TITLE.test(normalizePlanTitle(title));
}

/** Story 5.2 : une action dont le titre équivaut à celui d'une action déjà au plan n'est pas recréée. */
export function isPlanTitleAlreadyTaken(title: string, existingTitles: readonly string[]) {
  const normalized = normalizePlanTitle(title);
  return normalized.length > 0 && existingTitles.some((existing) => normalizePlanTitle(existing) === normalized);
}

export type PlanLaunchExtras = { newsContext?: string; prospectDescription?: string };
export const PLAN_LAUNCH_EXTRA_MAX = 1000;

/** Même normalisation pour la demande, sa carte et tous les points de lancement. */
export function cleanPlanLaunchExtras(value: unknown): PlanLaunchExtras {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const clean: PlanLaunchExtras = {};
  for (const key of ["newsContext", "prospectDescription"] as const) {
    const text = source[key];
    if (typeof text !== "string") continue;
    const normalized = text.trim();
    if (normalized && normalized.length <= PLAN_LAUNCH_EXTRA_MAX) clean[key] = normalized;
  }
  return clean;
}
