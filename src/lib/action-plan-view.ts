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