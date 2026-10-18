export const PLAN_THEMES = ["Visibilité", "Conversion", "Prospection"] as const;
export type PlanTheme = (typeof PLAN_THEMES)[number];