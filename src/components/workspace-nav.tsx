"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { BrandLogo } from "@/components/brand-logo";
import { FeedbackDialog } from "@/components/feedback-dialog";

/** Les quatre pages du parcours V5.2 (FR-12) ; Entreprise et Mon compte sont hors parcours. */
export const WORKSPACE_PAGES: { href: string; label: string; icon: IconName; paths: string[] }[] = [
  { href: "/strategie", label: "Stratégie", icon: "compass", paths: ["/strategie"] },
  { href: "/missions", label: "Missions", icon: "flag", paths: ["/missions"] },
  { href: "/atelier", label: "Atelier", icon: "panels-top-left", paths: ["/atelier", "/studio"] },
  { href: "/resultats", label: "Résultats", icon: "chart-no-axes-column", paths: ["/resultats"] },
];

const OTHER_PAGES: { label: string; paths: string[] }[] = [
  { label: "Entreprise", paths: ["/entreprise", "/diagnostic", "/connexions", "/canaux"] },
  { label: "Mon compte", paths: ["/compte"] },
  { label: "Administration", paths: ["/admin"] },
];

const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

/** Nom de la page courante pour le fil d'Ariane « Votre espace › … ». */
export function workspacePageLabel(pathname: string): string {
  if (pathname === "/missions/nouvelle") return "Nouvelle mission";
  return [...WORKSPACE_PAGES, ...OTHER_PAGES].find((page) => page.paths.some((path) => under(pathname, path)))?.label ?? "Votre espace";
}

export function WorkspaceBreadcrumb() {
  const label = workspacePageLabel(usePathname());
  return <span className="breadcrumb">Votre espace <Icon name="arrow-right" /> <strong>{label}</strong></span>;
}

type Props = {
  companyName: string;
  companyDescriptor: string;
  companyInitials: string;
  activeMissions: number;
  credits: number;
  cap: string | null;
  ownerInitial: string;
  isAdmin: boolean;
};

/**
 * Barre latérale de l'espace V5.2. Sur téléphone, c'est un menu repliable : ouvert, il garde le focus,
 * se ferme par Échap ou en naviguant, et rend la page derrière inerte.
 */
export function WorkspaceNav({ companyName, companyDescriptor, companyInitials, activeMissions, credits, cap, ownerInitial, isAdmin }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const toggle = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  // Une navigation ferme le menu (état dérivé du chemin, sans effet).
  if (open && openedAt !== pathname) setOpen(false);

  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".mq .workspace");
    if (page) page.inert = open;
    if (!open) return;
    firstLink.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (page) page.inert = false;
    };
  }, [open, close]);

  return (
    <>
      <button ref={toggle} type="button" className="workspace-menu-button" aria-expanded={open} aria-controls="workspace-nav" onClick={() => { setOpenedAt(pathname); setOpen(true); }}>
        <Icon name="menu" /><span className="sr-only">Ouvrir le menu</span>
      </button>
      {open && <div className="workspace-overlay" onClick={close} aria-hidden="true" />}
      <aside id="workspace-nav" className={`sidebar workspace-sidebar${open ? " open" : ""}`} aria-label="Navigation">
        <div className="workspace-sidebar-top">
          <Link className="brand" href="/strategie" aria-label="BienDecider, Stratégie"><BrandLogo /></Link>
          <button type="button" className="icon-button workspace-menu-close" onClick={close} aria-label="Fermer le menu"><Icon name="x" /></button>
        </div>
        <Link ref={firstLink} href="/entreprise" className="company workspace-company" aria-current={OTHER_PAGES[0].paths.some((path) => under(pathname, path)) ? "page" : undefined}>
          <span aria-hidden="true" className="company-avatar">{companyInitials}</span>
          <span><strong>{companyName}</strong><small>{companyDescriptor || "Voir mon entreprise"}</small></span>
        </Link>
        <nav aria-label="Pages">
          {WORKSPACE_PAGES.map((page) => {
            const current = page.paths.some((path) => under(pathname, path));
            return (
              <Link key={page.href} href={page.href} className={current ? "active" : undefined} aria-current={current ? "page" : undefined}>
                <Icon name={page.icon} />
                {page.label}
                {page.href === "/missions" && activeMissions > 0 && <span className="nav-count">{activeMissions}<span className="sr-only"> mission(s) en cours</span></span>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="goal-mini">
            <div className="eyebrow">Votre cap</div>
            <strong>{cap ?? "—"}</strong>
            <small>Horizon : — · Recrutement : —</small>
          </div>
          <FeedbackDialog label="Laisser un avis" />
          {isAdmin && <Link href="/admin" aria-current={under(pathname, "/admin") ? "page" : undefined}><Icon name="shield-check" />Administration</Link>}
          <Link href="/compte" className="account-link" aria-current={under(pathname, "/compte") ? "page" : undefined}>
            <span aria-hidden="true" className="user-avatar">{ownerInitial}</span>
            <span>Mon compte<small>{credits} crédit{credits > 1 ? "s" : ""}</small></span>
          </Link>
        </div>
      </aside>
    </>
  );
}
