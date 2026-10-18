/**
 * Plan d'action suggéré par un constat d'audit (cf. docs/backlog.md,
 * "lisibilité des constats") — même forme que `ActionPlanItem` (agent,
 * title, rationale) pour pouvoir être ajouté au plan de Paul en un clic,
 * sans appel modèle supplémentaire (cf. src/app/api/action-plan/route.ts).
 * Stocké en `Json` (pas de table dédiée : ce sont des suggestions, pas
 * encore des actions réelles tant qu'elles n'ont pas été ajoutées au plan).
 */
export const FINDING_ACTION_AGENTS = ["marketing", "contenu", "demarchage"] as const;
export type FindingActionAgent = (typeof FINDING_ACTION_AGENTS)[number];

export type FindingActionItem = {
  agent: FindingActionAgent;
  title: string;
  rationale: string;
  theme?: "Visibilité" | "Conversion" | "Prospection";
  priority?: number;
};

/** Parsing défensif : une colonne Json n'est pas vérifiée par Prisma à la lecture. */
export function parseFindingActionItems(value: unknown): FindingActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is FindingActionItem => {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return (
      typeof o.title === "string" &&
      typeof o.rationale === "string" &&
      typeof o.agent === "string" &&
      (FINDING_ACTION_AGENTS as readonly string[]).includes(o.agent)
    );
  });
}
