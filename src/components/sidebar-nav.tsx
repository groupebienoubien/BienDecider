"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const ITEMS: { href: string; label: string; icon: IconName; counter?: boolean }[] = [
  { href: "/dashboard", label: "À décider", icon: "inbox", counter: true },
  { href: "/diagnostic", label: "Diagnostic", icon: "scan-line" },
  { href: "/dashboard?view=plan", label: "Plan d’action", icon: "list-ordered" },
  { href: "/dashboard?view=validation", label: "Productions", icon: "panels-top-left" },
  { href: "/prospection", label: "Prospection", icon: "contact-round" },
  { href: "/dashboard?view=historique", label: "Historique", icon: "history" },
];

const SETTINGS: { href: string; label: string; icon: IconName; paths: string[] }[] = [
  { href: "/entreprise", label: "Mon entreprise", icon: "settings-2", paths: ["/entreprise", "/equipe", "/connexions"] },
  { href: "/compte", label: "Mon compte", icon: "circle-user-round", paths: ["/compte"] },
  { href: "/admin", label: "Administration", icon: "shield-check", paths: ["/admin"] },
];

/** Navigation principale de la maquette : six étapes du parcours, le compteur indique les décisions attendues. */
export function SidebarNav({ decisionCount = 0 }: { decisionCount?: number }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view") ?? "";
  return (
    <nav aria-label="Navigation principale">
      {ITEMS.map((item) => {
        const [itemPath, query] = item.href.split("?");
        const itemView = new URLSearchParams(query).get("view") ?? "";
        const active = itemPath === "/dashboard"
          ? pathname === itemPath && view === itemView
          : pathname === itemPath || pathname.startsWith(itemPath + "/");
        const current = active || (item.label === "Historique" && pathname === "/rapport");
        return (
          <Link key={item.href} href={item.href} className={current ? "active" : undefined} aria-current={current ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.label}
            {item.counter && decisionCount > 0 && <span className="nav-count">{decisionCount}<span className="sr-only"> décision(s) en attente</span></span>}
          </Link>
        );
      })}
      <Link className="phone-only" href="/entreprise">Entreprise</Link>
      <Link className="phone-only" href="/compte">Compte</Link>
    </nav>
  );
}

/** Liens du bas de la barre latérale : entreprise, compte et administration. */
export function SidebarSettingsLinks() {
  const pathname = usePathname();
  return (
    <>
      {SETTINGS.map((item) => {
        const current = item.paths.some((path) => pathname === path || pathname.startsWith(path + "/"));
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}