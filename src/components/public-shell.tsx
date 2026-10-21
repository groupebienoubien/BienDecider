import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

export const SECONDARY_LINK = "rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200";

/** En-tête et pied des pages publiques (accueil, canaux) : la même marque, les mêmes liens. */
export function PublicShell({ headerAction, children }: { headerAction?: ReactNode; children: ReactNode }) {
  return (
    <main className="landing-page min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link>
          {headerAction ?? <Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>}
        </header>
        {children}
        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <Link href="/canaux" className="py-1 hover:underline">Ce que fait chaque canal</Link>
          <Link href="/cgu" className="py-1 hover:underline">Conditions d&apos;utilisation</Link>
          <Link href="/confidentialite" className="py-1 hover:underline">Confidentialité</Link>
          <Link href="/mentions-legales" className="py-1 hover:underline">Mentions légales</Link>
          <a href="mailto:contact@biendecider.com" className="py-1 hover:underline">Contact</a>
        </footer>
      </div>
    </main>
  );
}
