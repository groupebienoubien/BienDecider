/** Partagé client/serveur : échéance des actions créées depuis une demande faite à Paul dans le chat. */
export const CHAT_REQUEST_TIMING = "Demandé dans le chat";

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
