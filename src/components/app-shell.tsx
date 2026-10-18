import Link from "next/link";
import { Suspense } from "react";
import { SidebarNav, SidebarSettingsLinks } from "@/components/sidebar-nav";
import { PaulPanel } from "@/components/paul-panel";
import { BrandLogo } from "@/components/brand-logo";
import { WorkspaceBreadcrumb } from "@/components/workspace-breadcrumb";

const MONEY = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Coque commune des pages connectées, fidèle à la maquette : barre latérale, bandeau, contenu, pied de page et Paul. */
export function AppShell({
  companyName,
  companyTrade,
  companyArea,
  objective,
  ownerEmail,
  decisionCount = 0,
  budget,
  paul = Boolean(companyName),
  children,
}: {
  companyName?: string;
  companyTrade?: string | null;
  companyArea?: string | null;
  objective?: string | null;
  ownerEmail?: string;
  decisionCount?: number;
  budget?: { spentUsd: number; limitUsd: number };
  paul?: boolean;
  children: React.ReactNode;
}) {
  const companyInitials = companyName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase())
    .join("");
  const companyDescriptor = [companyTrade, companyArea].filter(Boolean).join(" · ");

  return (
    <div className="mq">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-green-900">Aller au contenu</a>
      <aside className="sidebar" aria-label="Barre latérale">
        <Link className="brand" href="/dashboard"><BrandLogo /></Link>
        {companyName && (
          <div className="company">
            <span aria-hidden="true" className="company-avatar">{companyInitials}</span>
            <div><strong>{companyName}</strong>{companyDescriptor && <small>{companyDescriptor}</small>}</div>
          </div>
        )}
        <div className="nav-label">MON ACTIVITÉ</div>
        <Suspense fallback={null}><SidebarNav decisionCount={decisionCount} /></Suspense>
        <div className="sidebar-bottom">
          <Suspense fallback={null}><SidebarSettingsLinks /></Suspense>
          {budget && (
            <div className="credit">
              <span>Budget IA du mois</span>
              <strong>{MONEY.format(budget.spentUsd)} $ <small>/ {MONEY.format(budget.limitUsd)} $</small></strong>
              <progress value={Math.min(budget.spentUsd, budget.limitUsd)} max={budget.limitUsd} aria-label="Budget IA consommé" />
            </div>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Suspense fallback={<span className="breadcrumb">{companyName || "Votre espace BienDecider"}</span>}>
            <WorkspaceBreadcrumb fallback={companyName || "Votre espace BienDecider"} />
          </Suspense>
          <div>
            {paul && <Suspense fallback={null}><PaulPanel /></Suspense>}
            {ownerEmail && <span className="user-avatar" title={ownerEmail}>{ownerEmail[0]}</span>}
          </div>
        </header>
        <main id="contenu" tabIndex={-1}>{children}</main>
        <footer className="workspace-footer">
          <span>{companyName ? `${companyName}${objective ? ` · Objectif : ${objective}` : ""}` : "BienDecider"}</span>
          <span className="footer-links">
            <Link href="/cgu">CGU</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/mentions-legales">Mentions légales</Link>
            <a href="mailto:contact@biendecider.com">Contact</a>
            {(companyName || ownerEmail) && <form action="/api/auth/logout" method="post"><button type="submit">Déconnexion</button></form>}
          </span>
        </footer>
      </div>
    </div>
  );
}
