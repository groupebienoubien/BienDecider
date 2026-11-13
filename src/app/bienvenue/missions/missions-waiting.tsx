"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INTELLIGENCE_MESSAGES, type IntelligenceView } from "@/lib/onboarding/intelligence-rules";
import { FormError, PRIMARY_BUTTON, useDraftAction } from "../journey-client";

const POLL_MS = 1200;

export function PrepareMissions() {
  const { busy, error, errors, send } = useDraftAction();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send({ action: "prepare_missions" });
  }, [send]);
  return (
    <div className="flex flex-col gap-4">
      <p role="status">Votre analyse est prête. Paul prépare maintenant les actions adaptées à votre objectif.</p>
      <FormError error={error} errors={errors} />
      {error && <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void send({ action: "prepare_missions" })}>Réessayer la préparation</button>}
    </div>
  );
}

/**
 * Attente de la recherche réelle de marché (#364) : tant qu'elle tourne, un message annoncé (lecteurs d'écran),
 * interrogé toutes les 1,2 s comme l'analyse de l'étape 1 (`DiscoveryStep`, `src/app/bienvenue/step-forms.tsx`).
 * Dès qu'elle est terminée (faits trouvés, plafonnée ou en échec), une seule actualisation relit les pistes à jour.
 */
export function MissionsIntelligenceWatcher({ initial }: { initial: IntelligenceView | null }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const refreshed = useRef(initial?.finished ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!view || view.finished) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/bienvenue/intelligence", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (stopped) return;
        if (response.ok && data && (data.intelligence === null || typeof data.intelligence === "object")) {
          setError(null);
          if (data.intelligence === null) {
            stopped = true;
            window.clearInterval(timer);
            router.refresh();
          }
          setView(data.intelligence as IntelligenceView | null);
          return;
        }
        setError("La progression de la recherche ne peut pas être actualisée. Une nouvelle tentative aura lieu automatiquement.");
        if ([401, 404, 409].includes(response.status)) {
          stopped = true;
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {
        if (!stopped) setError("Connexion interrompue. La progression sera actualisée dès que le réseau sera rétabli.");
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [view, router]);

  useEffect(() => {
    if (view?.finished && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [view, router]);

  const notice = !view ? INTELLIGENCE_MESSAGES.missing : view.finished ? view.notice : null;
  if (notice) return <p role="status" className="rounded-md border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-3 text-sm text-[var(--bd-ink)]">{notice}</p>;
  if (view?.finished) return null;
  return (
    <div className="flex flex-col gap-2">
      <p role="status" aria-live="polite" className="rounded-md border border-[var(--bd-line-strong)] bg-[var(--bd-cream)] p-3 text-sm font-semibold text-[var(--bd-ink)]">
        Paul recherche votre secteur, puis compare et prépare les missions à partir des constats et de votre objectif. Vos pistes seront affichées à la fin de cette préparation.
      </p>
      {error && <p role="alert" className="text-sm text-[var(--bd-error)]">{error}</p>}
    </div>
  );
}
