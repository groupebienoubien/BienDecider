"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntelligenceView } from "@/lib/onboarding/intelligence-rules";

const POLL_MS = 1200;

/**
 * Attente de la recherche réelle de marché (#364) : tant qu'elle tourne, un message annoncé (lecteurs d'écran),
 * interrogé toutes les 1,2 s comme l'analyse de l'étape 1 (`DiscoveryStep`, `src/app/bienvenue/step-forms.tsx`).
 * Dès qu'elle est terminée (faits trouvés, plafonnée ou en échec), une seule actualisation relit les pistes à jour.
 */
export function MissionsIntelligenceWatcher({ initial }: { initial: IntelligenceView | null }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!view || view.finished) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/bienvenue/intelligence", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (stopped) return;
        if (response.ok && data && (data.intelligence === null || typeof data.intelligence === "object")) {
          setView(data.intelligence as IntelligenceView | null);
          return;
        }
        // Brouillon disparu ou session ouverte : on arrête d'interroger, l'actualisation suivante réglera l'affichage.
        stopped = true;
        window.clearInterval(timer);
      } catch {
        // Réseau coupé : la prochaine interrogation réessaie.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [view]);

  useEffect(() => {
    if (view?.finished && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [view, router]);

  if (!view || view.finished) return null;
  return (
    <p role="status" aria-live="polite" className="rounded-md border border-[var(--bd-line-strong)] bg-[var(--bd-cream)] p-3 text-sm font-semibold text-[var(--bd-ink)]">
      Paul recherche votre secteur, vos concurrents et les opportunités du moment…
    </p>
  );
}
