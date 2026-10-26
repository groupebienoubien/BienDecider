export const PAUL_ELEMENT_TYPES = ["proposal", "finding", "lead"] as const;
export type PaulElementType = (typeof PAUL_ELEMENT_TYPES)[number];
export type PaulElement = { type: PaulElementType; id: string; title: string };

export const PAUL_OPEN_EVENT = "paul:open";

export const PAUL_ELEMENT_LABELS: Record<PaulElementType, string> = {
  proposal: "Production",
  finding: "Constat",
  lead: "Prospect",
};

const PAGE_LABELS: Record<string, string> = {
  "/diagnostic": "Diagnostic",
  "/equipe": "Équipe",
  "/prospection": "Prospection",
  "/rapport": "Rapport des résultats",
  "/connexions": "Connexions",
  "/entreprise": "Mon entreprise",
  "/compte": "Mon compte",
};

export function describePage(path: string, view?: string | null): string {
  if (path === "/dashboard") {
    if (view === "validation") return "Productions à valider";
    if (view === "historique") return "Historique des productions";
    return view === "plan" ? "Plan d'action" : "Mon objectif (accueil)";
  }
  return PAGE_LABELS[path] ?? (path.startsWith("/studio/") ? "Studio d'une production" : "une page de BienDecider");
}

/** Ouvre la discussion avec Paul, éventuellement centrée sur l'élément consulté. */
export function openPaul(element?: PaulElement) {
  window.dispatchEvent(new CustomEvent<PaulElement | null>(PAUL_OPEN_EVENT, { detail: element ?? null }));
}
