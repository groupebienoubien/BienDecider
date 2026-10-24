import { PLAN_THEMES, type PlanTheme } from "@/lib/plan-themes";

export type PlanThemeGroup<T> = { theme: PlanTheme | "À classer"; items: T[] };

const THEME_ORDER: (PlanTheme | "À classer")[] = [...PLAN_THEMES, "À classer"];

export function groupPlanItems<T extends { theme: string | null; priority: number | null; createdAt: Date | string }>(items: T[]): PlanThemeGroup<T>[] {
  const groups = new Map<PlanTheme | "À classer", T[]>();
  for (const item of items) {
    const theme = (PLAN_THEMES as readonly string[]).includes(item.theme ?? "") ? item.theme as PlanTheme : "À classer";
    groups.set(theme, [...(groups.get(theme) ?? []), item]);
  }

  return THEME_ORDER.flatMap((theme) => {
    const groupedItems = groups.get(theme);
    if (!groupedItems?.length) return [];
    groupedItems.sort((left, right) => {
      const priorityDifference = (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
      if (priorityDifference) return priorityDifference;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
    return [{ theme, items: groupedItems }];
  });
}

export type PlanItemStatus = "propose" | "en_cours" | "lance" | "termine" | "ecarte";

export type PlanItemStatusView = {
  label: "À lancer" | "En cours" | "À décider" | "Terminée" | "Écartée";
  cta: { label: string; href?: string } | null;
};

const PLAN_ITEM_STATUSES: readonly string[] = ["propose", "en_cours", "lance", "termine", "ecarte"] satisfies PlanItemStatus[];

function isPlanItemStatus(status: string): status is PlanItemStatus {
  return PLAN_ITEM_STATUSES.includes(status);
}

// Glossaire validé : un seul libellé par statut d'action, partagé par l'accueil et le plan.
// « Valider » reste réservé aux productions.
export function planItemStatusView(status: string, lastRunStatus: string | null | undefined, pendingCount: number): PlanItemStatusView {
  // Statut inconnu : libellé neutre, jamais « Terminée » par défaut.
  if (!isPlanItemStatus(status)) return { label: "En cours", cta: null };
  switch (status) {
    case "propose":
      return { label: "À lancer", cta: { label: lastRunStatus === "failed" ? "Relancer l’action" : "Examiner et lancer" } };
    case "en_cours":
      return { label: "En cours", cta: null };
    case "lance":
      return pendingCount > 0
        ? { label: "À décider", cta: { label: `${pendingCount} à examiner`, href: "/dashboard?view=validation" } }
        : { label: "Terminée", cta: { label: "Voir la production", href: "/dashboard?view=historique" } };
    case "termine":
      return { label: "Terminée", cta: null };
    case "ecarte":
      return { label: "Écartée", cta: null };
  }
}

export type PlanTab = "a_faire" | "menees";

/** Onglet du plan demandé par l'URL (`?onglet=menees`) ; « À faire » par défaut (story 5.3). */
export function planTabFromParam(value: string | null | undefined): PlanTab {
  return value === "menees" ? "menees" : "a_faire";
}

/**
 * Story 5.3 : « À faire » = actions à lancer ; « En cours et menées » = actions en cours ou exécutées
 * (statut inconnu compris, affiché « En cours »). Terminées et écartées restent dans l'historique.
 */
export function splitPlanItems<T extends { status: string }>(items: T[]): Record<PlanTab, T[]> {
  const open = items.filter((item) => item.status !== "termine" && item.status !== "ecarte");
  return {
    a_faire: open.filter((item) => item.status === "propose"),
    menees: open.filter((item) => item.status !== "propose"),
  };
}
