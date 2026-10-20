import type { IconName } from "@/components/icon";

/**
 * Parcours en quatre temps (docs/charte.md, section 2) : source unique de la
 * navigation latérale, de la barre mobile, des onglets et du fil d'Ariane.
 * Les URL existantes sont conservées : chaque page est seulement rangée dans son temps.
 */
export type JourneyPage = { href: string; label: string };
export type JourneyStage = { key: "objectif" | "plan" | "decisions" | "resultats"; label: string; icon: IconName; counter?: boolean; pages: JourneyPage[] };

export const JOURNEY: JourneyStage[] = [
  { key: "objectif", label: "Objectif", icon: "target", pages: [
    { href: "/dashboard", label: "Mon objectif" },
    { href: "/diagnostic", label: "Diagnostic" },
  ] },
  { key: "plan", label: "Plan", icon: "list-ordered", pages: [
    { href: "/dashboard?view=plan", label: "Plan d’action" },
  ] },
  { key: "decisions", label: "Décisions", icon: "inbox", counter: true, pages: [
    { href: "/dashboard?view=validation", label: "Productions" },
    { href: "/prospection", label: "Prospection" },
  ] },
  { key: "resultats", label: "Résultats", icon: "chart-no-axes-column", pages: [
    { href: "/rapport", label: "Synthèse" },
    { href: "/dashboard?view=historique", label: "Historique" },
  ] },
];

export const SETTINGS_PAGES: { href: string; label: string; icon: IconName; paths: string[] }[] = [
  { href: "/entreprise", label: "Mon entreprise", icon: "settings-2", paths: ["/entreprise", "/equipe", "/connexions"] },
  { href: "/compte", label: "Mon compte", icon: "circle-user-round", paths: ["/compte"] },
  { href: "/admin", label: "Administration", icon: "shield-check", paths: ["/admin"] },
];

function matches(page: JourneyPage, pathname: string, view: string) {
  const [path, query] = page.href.split("?");
  if (path === "/dashboard") return pathname === path && view === (new URLSearchParams(query).get("view") ?? "");
  return pathname === path || pathname.startsWith(path + "/");
}

/** Temps et page du parcours correspondant à l'URL, ou null hors parcours (réglages, pages légales). */
export function locateJourney(pathname: string, view: string): { stage: JourneyStage; page: JourneyPage } | null {
  for (const stage of JOURNEY) {
    const page = stage.pages.find((candidate) => matches(candidate, pathname, view));
    if (page) return { stage, page };
  }
  return null;
}
