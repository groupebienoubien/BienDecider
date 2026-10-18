import Link from "next/link";
import { Suspense } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { PaulPanel } from "@/components/paul-panel";
import { BrandLogo } from "@/components/brand-logo";

/** Coque commune des pages connectées : barre latérale (parcours lisible) + contenu + discussion avec Paul. */
export function AppShell({
  companyName,
  pendingCount = 0,
  paul = Boolean(companyName),
  children,
}: {
  companyName?: string;
  pendingCount?: number;
  paul?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="app-frame flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-indigo-800">Aller au contenu</a>
      <aside className="app-sidebar hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/dashboard" className="mb-6 block px-2 pt-2">
          <BrandLogo />
          {companyName && (
            <span className="mt-6 block truncate border-t border-slate-200 pt-4 text-sm text-slate-600">{companyName}</span>
          )}
        </Link>
        <Suspense fallback={null}><SidebarNav pendingCount={pendingCount} /></Suspense>
        <form action="/api/auth/logout" method="post" className="mt-auto px-3 pt-6">
          <button type="submit" className="min-h-11 text-sm text-slate-600 hover:text-slate-900">
            Déconnexion
          </button>
        </form>
        <div className="flex flex-wrap gap-x-3 px-3 pt-2 text-xs text-slate-600">
          <Link href="/cgu" className="inline-flex min-h-11 items-center hover:text-slate-900">CGU</Link>
          <Link href="/confidentialite" className="inline-flex min-h-11 items-center hover:text-slate-900">Confidentialité</Link>
          <Link href="/mentions-legales" className="inline-flex min-h-11 items-center hover:text-slate-900">Mentions légales</Link>
          <a href="mailto:contact@biendecider.com" className="inline-flex min-h-11 items-center hover:text-slate-900">Contact</a>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="workspace-heading px-4 py-3 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="font-semibold md:hidden"><BrandLogo /></Link>
          <div className="hidden min-w-0 md:block"><p className="truncate">{companyName || "Votre espace BienDecider"}</p></div>
          <div className="flex items-center gap-4"><p className="hidden lg:block">Vous décidez. Votre activité avance.</p>{paul && <Suspense fallback={null}><PaulPanel inlineLauncher /></Suspense>}</div>
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            {companyName && <span className="max-w-28 truncate text-xs text-slate-500">{companyName}</span>}
            <Link href="/dashboard?view=validation" aria-describedby={pendingCount > 0 ? "pending-description" : undefined} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded border border-indigo-200 px-3 text-sm font-medium text-indigo-700">
              À valider
              {pendingCount > 0 && <span aria-hidden="true" className="rounded-full bg-indigo-700 px-2 text-xs font-semibold text-white">{pendingCount}</span>}
            </Link>
            {pendingCount > 0 && <span id="pending-description" className="sr-only">{pendingCount} production(s) attendent votre décision</span>}
          </div>
          </div>
          <details className="mt-3 md:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center py-1 text-sm font-medium text-slate-700">Menu</summary>
            <Suspense fallback={null}><SidebarNav pendingCount={pendingCount} /></Suspense>
            <form action="/api/auth/logout" method="post" className="px-3 py-4"><button className="min-h-11 text-sm text-slate-700">Déconnexion</button></form>
          </details>
        </header>
        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-6xl break-words p-4 pb-24 focus:outline-none sm:p-6 sm:pb-24 md:p-8 md:pb-24">{children}</main>
      </div>
    </div>
  );
}
