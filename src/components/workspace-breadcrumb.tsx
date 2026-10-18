"use client";

import Link from "next/link";
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
  let parentHref = "/dashboard";
  let current = fallback;

  if (pathname === "/dashboard") {
    current = ACTIVITY_LABELS[view] ?? "À décider";
  } else if (pathname === "/diagnostic") {
    current = "Diagnostic";
  } else if (pathname === "/prospection") {
    current = "Prospection";
  } else if (pathname === "/rapport") {
    current = "Résultats";
  } else if (pathname === "/entreprise" || pathname === "/equipe" || pathname === "/connexions") {
    parent = "Mon entreprise";
    parentHref = "/entreprise";
    current = pathname === "/equipe" ? "Équipe" : pathname === "/connexions" ? "Connexions" : "Informations";
    if (pathname === "/entreprise" && searchParams.get("tab") === "objectifs") current = "Objectifs";
  } else if (pathname === "/compte") {
    parent = "Mon compte";
    parentHref = "/compte?tab=acces";
    const tab = searchParams.get("tab");
    current = tab === "budget" ? "Budget IA" : tab === "confidentialite" ? "Confidentialité" : "Accès";
  } else if (pathname === "/admin" || pathname === "/admin/risques") {
    parent = "Administration";
    parentHref = "/admin";
    current = pathname === "/admin/risques" ? "Risques" : "Vue d’ensemble";
  } else if (pathname === "/cgu") {
    parent = "Informations";
    parentHref = "/dashboard";
    current = "Conditions générales";
  } else if (pathname === "/confidentialite") {
    parent = "Informations";
    parentHref = "/dashboard";
    current = "Confidentialité";
  } else if (pathname === "/mentions-legales") {
    parent = "Informations";
    parentHref = "/dashboard";
    current = "Mentions légales";
  }

  return (
    <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-2 text-sm">
      <Link href={parentHref} className="shrink-0 text-slate-500 hover:text-slate-800">{parent}</Link>
      <span aria-hidden="true" className="text-slate-400">/</span>
      <span aria-current="page" className="truncate font-medium text-slate-800">{current}</span>
    </nav>
  );
}