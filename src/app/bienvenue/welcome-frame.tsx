import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { STEP_TITLES, type DraftStep } from "@/lib/onboarding/draft-rules";
import { BackButton, SECONDARY_BUTTON, StepColumn, StepHeading } from "./journey-client";

/**
 * Cadre d'une étape du parcours d'entrée (spécification §1.1) : en tête « Retour » (ou « Revoir le concept »
 * à l'étape 1) et « n sur 5 », à gauche les cinq étapes, puis le titre de l'étape qui reçoit le focus.
 */
export function WelcomeFrame({ step, intro, children }: { step: DraftStep; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--bd-cream)] font-sans text-[var(--bd-ink)]">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bd-line)] pb-4">
          <Link href="/" aria-label="BienDecider, accueil"><BrandLogo /></Link>
          <div className="flex items-center gap-3">
            {step === 1 ? <Link href="/" className={SECONDARY_BUTTON}>Revoir le concept</Link> : <BackButton step={step} />}
            <p className="text-sm font-semibold text-[var(--bd-ink)]">{step} sur 5</p>
          </div>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          <aside className="rounded-lg bg-white p-3 lg:self-start">
            <StepColumn current={step} />
          </aside>
          <section aria-labelledby="step-title" className="min-w-0 rounded-lg bg-white p-5 sm:p-8">
            <div id="step-title" key={step}>
              <StepHeading>{STEP_TITLES[step]}</StepHeading>
            </div>
            {intro && <div className="mt-3 text-base text-[var(--bd-ink)]">{intro}</div>}
            <div className="mt-6">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
