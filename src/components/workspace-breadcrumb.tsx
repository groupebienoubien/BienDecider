"use client";

import { usePathname, useSearchParams } from "next/navigation";

const ACTIVITY_LABELS: Record<string, string> = {
  "": "À décider",
  plan: "Plan d’action",
  validation: "Productions",
  historique: "Historique",
};

export function WorkspaceBreadcrumb({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "";

  let parent = "Mon activité";
  let current = fallback;

  if (pathname === "/dashboard") {
    current = ACTIVITY_LABELS[view] ?? "À décider";
  } else if (pathname === "/diagnostic") {
    current = "Diagnostic";
  } else if (pathname === "/prospection") {
    current = "Prospection";
  } else if (pathname === "/rapport") {
    current = "Résultats";
  } else if (pathname === "/entreprise") {
    current = "Mon entreprise";
  } else if (pathname === "/equipe" || pathname === "/connexions") {
    parent = "Mon entreprise";
    current = pathname === "/equipe" ? "Équipe" : "Connexions";
  } else if (pathname === "/compte") {
    current = "Mon compte";
  } else if (pathname === "/admin") {
    current = "Administration";
  } else if (pathname === "/admin/risques") {
    parent = "Administration";
    current = "Risques";
  } else if (pathname === "/cgu") {
    parent = "Informations";
    current = "Conditions générales";
  } else if (pathname === "/confidentialite") {
    parent = "Informations";
    current = "Confidentialité";
  } else if (pathname === "/mentions-legales") {
    parent = "Informations";
    current = "Mentions légales";
  }

  return (
    <span role="navigation" aria-label="Fil d’Ariane" className="breadcrumb">
      {parent} / <span aria-current="page">{current}</span>
    </span>
  );
}