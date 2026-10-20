"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { locateJourney } from "@/lib/journey-nav";

/** Pages hors parcours : réglages et informations. */
const OTHER_PAGES: Record<string, [string, string]> = {
  "/entreprise": ["Réglages", "Mon entreprise"],
  "/equipe": ["Mon entreprise", "Équipe"],
  "/connexions": ["Mon entreprise", "Connexions"],
  "/compte": ["Réglages", "Mon compte"],
  "/admin": ["Réglages", "Administration"],
  "/admin/risques": ["Administration", "Risques"],
  "/cgu": ["Informations", "Conditions générales"],
  "/confidentialite": ["Informations", "Confidentialité"],
  "/mentions-legales": ["Informations", "Mentions légales"],
};

export function WorkspaceBreadcrumb({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view") ?? "";
  const located = locateJourney(pathname, view);
  const [parent, current] = located
    ? [located.stage.label, located.page.label]
    : OTHER_PAGES[pathname] ?? ["Mon activité", fallback];

  return (
    <span role="navigation" aria-label="Fil d’Ariane" className="breadcrumb">
      {parent} / <span aria-current="page">{current}</span>
    </span>
  );
}
