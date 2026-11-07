"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { STEP_LABELS, type DraftStep } from "@/lib/onboarding/draft-rules";

export type FieldErrors = Partial<Record<string, string>>;

/** Classes communes du parcours : cibles de 44 px, focus visible, contraste 4,5:1 (charte §8). */
export const INPUT_CLASS = "min-h-11 w-full rounded-md border border-[var(--bd-line-strong)] bg-white px-3 py-2 text-base text-[var(--bd-ink)]";
export const PRIMARY_BUTTON = "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--bd-brand)] px-5 py-2 text-base font-semibold text-white hover:bg-[var(--bd-brand-hover)] disabled:opacity-60";
export const SECONDARY_BUTTON = "inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--bd-ink)] hover:bg-[var(--bd-cream-deep)]";

const GENERIC_ERROR = "Cette étape n'a pas pu être enregistrée. Réessayez dans un instant.";

/** Envoie une transition au serveur, puis affiche la page de l'étape qu'il renvoie. */
export function useDraftAction() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  function go(href: string) {
    if (href === pathname) router.refresh();
    else router.push(href);
  }

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const response = await fetch("/api/bienvenue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null);
      // 409 : autre étape ou session ouverte, le serveur dit où aller.
      if ((response.ok || response.status === 409) && data && typeof data.href === "string") {
        go(data.href);
        return;
      }
      setErrors(data && typeof data.errors === "object" && data.errors !== null ? data.errors : {});
      setError(data && typeof data.error === "string" ? data.error : GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, errors, send, go };
}

/** Titre de l'étape : reçoit le focus à chaque étape affichée (clavier, lecteur d'écran). */
export function StepHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-[family-name:var(--font-sora)] text-2xl font-bold leading-tight text-[var(--bd-ink)] focus:outline-none sm:text-3xl">
      {children}
    </h1>
  );
}

/** « Retour » à l'étape précédente ; les saisies restent. */
export function BackButton({ step }: { step: DraftStep }) {
  const { busy, send } = useDraftAction();
  return (
    <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => send({ action: "back", step: step - 1 })}>
      <span aria-hidden="true">←&nbsp;</span>Retour
    </button>
  );
}

/** Colonne des cinq étapes : la courante marquée, les passées cochées (et rouvrables), les suivantes en attente. */
export function StepColumn({ current }: { current: DraftStep }) {
  const { busy, send } = useDraftAction();
  const steps = Object.entries(STEP_LABELS).map(([key, label]) => ({ step: Number(key) as DraftStep, ...label }));
  return (
    <nav aria-label="Étapes du parcours">
      <ol className="flex flex-row flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
        {steps.map(({ step, name, subtitle }) => {
          const done = step < current;
          const isCurrent = step === current;
          const content = (
            <>
              <span aria-hidden="true" className={`inline-flex h-6 w-6 lg:mt-0.5 flex-none items-center justify-center rounded-full text-sm font-bold ${isCurrent ? "bg-[var(--bd-brand)] text-white" : done ? "bg-[var(--bd-brand-light)] text-[var(--bd-brand)]" : "bg-[var(--bd-cream-deep)] text-[var(--bd-ink)]"}`}>
                {done ? "✓" : step}
              </span>
              <span className="flex flex-col items-start text-left">
                <span className={`text-sm ${isCurrent ? "font-bold" : "sr-only font-medium lg:not-sr-only"} text-[var(--bd-ink)]`}>
                  {name}
                  {done && <span className="sr-only"> (terminée)</span>}
                </span>
                <span className="hidden text-sm text-[var(--bd-muted)] lg:block">{subtitle}</span>
              </span>
            </>
          );
          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined}>
              {done ? (
                <button type="button" disabled={busy} onClick={() => send({ action: "back", step })} className="flex min-h-11 min-w-11 items-center gap-3 lg:items-start rounded-md px-2 py-1.5 hover:bg-[var(--bd-cream-deep)] lg:w-full">
                  {content}
                </button>
              ) : (
                <div className={`flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 lg:items-start ${isCurrent ? "bg-[var(--bd-cream)]" : ""}`}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Message d'un champ, annoncé aux lecteurs d'écran. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-sm font-medium text-[var(--bd-error)]">{message}</p>;
}

/** Message général, s'il ne se rattache à aucun champ. */
export function FormError({ error, errors }: { error: string | null; errors: FieldErrors }) {
  if (!error || Object.keys(errors).length > 0) return null;
  return <p role="alert" className="text-sm font-medium text-[var(--bd-error)]">{error}</p>;
}
