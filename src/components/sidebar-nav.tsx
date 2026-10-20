"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { JOURNEY, SETTINGS_PAGES, locateJourney } from "@/lib/journey-nav";

function useJourneyLocation() {
  const pathname = usePathname();
  const view = useSearchParams().get("view") ?? "";
  return { pathname, located: locateJourney(pathname, view) };
}

function DecisionCount({ count, className }: { count: number; className: string }) {
  if (count <= 0) return null;
  return <span className={className}>{count}<span className="sr-only"> décision(s) en attente</span></span>;
}

/** Navigation principale : les quatre temps du parcours (charte, section 2), chacun avec ses pages. */
export function SidebarNav({ decisionCount = 0 }: { decisionCount?: number }) {
  const { located } = useJourneyLocation();
  return (
    <nav aria-label="Navigation principale" className="journey-nav">
      {JOURNEY.map((stage, index) => (
        <div key={stage.key} className={`journey-stage${located?.stage.key === stage.key ? " current" : ""}`}>
          <div className="journey-stage-label">
            <span className="journey-step" aria-hidden="true">{index + 1}</span>
            {stage.label}
            {stage.counter && <DecisionCount count={decisionCount} className="nav-count" />}
          </div>
          {stage.pages.map((page) => {
            const current = located?.page.href === page.href;
            return <Link key={page.href} href={page.href} className={current ? "active" : undefined} aria-current={current ? "page" : undefined}>{page.label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}

/** Barre du bas sur téléphone : les quatre temps, utilisable d'une main. */
export function JourneyTabBar({ decisionCount = 0 }: { decisionCount?: number }) {
  const { located } = useJourneyLocation();
  return (
    <nav aria-label="Parcours" className="journey-tabbar">
      {JOURNEY.map((stage) => {
        const current = located?.stage.key === stage.key;
        return (
          <Link key={stage.key} href={stage.pages[0].href} aria-current={current ? "true" : undefined} className={current ? "active" : undefined}>
            <Icon name={stage.icon} />
            <span>{stage.label}</span>
            {stage.counter && <DecisionCount count={decisionCount} className="tab-count" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Onglets des pages du temps en cours, sur téléphone, quand ce temps en compte plusieurs. */
export function StageTabs() {
  const { located } = useJourneyLocation();
  if (!located || located.stage.pages.length < 2) return null;
  return (
    <nav aria-label={`Pages : ${located.stage.label}`} className="stage-tabs">
      {located.stage.pages.map((page) => {
        const current = page.href === located.page.href;
        return <Link key={page.href} href={page.href} className={current ? "active" : undefined} aria-current={current ? "page" : undefined}>{page.label}</Link>;
      })}
    </nav>
  );
}

/** Réglages, hors du parcours : entreprise, compte et administration. */
export function SidebarSettingsLinks() {
  const pathname = usePathname();
  return (
    <>
      {SETTINGS_PAGES.map((item) => {
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
