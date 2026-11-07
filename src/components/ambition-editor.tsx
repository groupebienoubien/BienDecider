"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AMBITION_BOUNDS, AMBITION_REFINE_INTRO, AMBITION_TARGET_NOTICE, type AmbitionInterpretation } from "@/lib/ambition-rules";

/**
 * Ambition dite avec ses mots et reformulée par Paul (#282, spécification §11). Une seule mécanique pour l'étape 3
 * du parcours d'entrée (`/api/bienvenue`) et pour Entreprise (`/api/entreprise/ambition`) :
 * « Interpréter » envoie le texte, Paul répond sans rien enregistrer ; « C'est bien ça » enregistre le texte tel quel
 * et les éléments retenus. Modifier le texte après l'interprétation la retire : il faut interpréter de nouveau.
 */

type Target = "bienvenue" | "entreprise";
type FieldErrors = Partial<Record<string, string>>;

const INPUT_CLASS = "min-h-11 w-full rounded-md border border-[var(--bd-line-strong)] bg-white px-3 py-2 text-base text-[var(--bd-ink)]";
const PRIMARY_BUTTON = "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--bd-brand)] px-5 py-2 text-base font-semibold text-white hover:bg-[var(--bd-brand-hover)] disabled:opacity-60";
const SECONDARY_OUTLINE = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--bd-line-strong)] bg-white px-5 py-2 text-base font-semibold text-[var(--bd-ink)] hover:bg-[var(--bd-cream-deep)] disabled:opacity-60";
const LABEL = "text-sm font-semibold text-[var(--bd-ink)]";
const HINT = "text-sm text-[var(--bd-muted)]";
const GENERIC_ERROR = "Paul n'a pas pu lire votre ambition. Réessayez dans un instant.";
const SAVE_ERROR = "Votre ambition n'a pas pu être enregistrée. Réessayez dans un instant.";

const ENDPOINTS: Record<Target, string> = { bienvenue: "/api/bienvenue", entreprise: "/api/entreprise/ambition" };
const ACTIONS: Record<Target, { interpret: string; confirm: string }> = {
  bienvenue: { interpret: "interpret_ambition", confirm: "confirm_ambition" },
  entreprise: { interpret: "interpret", confirm: "confirm" },
};

function isInterpretation(value: unknown): value is AmbitionInterpretation {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.text === "string" && typeof item.reformulation === "string" && Array.isArray(item.found) && Array.isArray(item.notes) && Array.isArray(item.questions) && typeof item.terms === "object" && item.terms !== null;
}

export function AmbitionEditor({ target, initialText }: { target: Target; initialText: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialText);
  const [interpretation, setInterpretation] = useState<{ value: string; data: AmbitionInterpretation; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const fieldError = errors.ambition;
  const describedBy = ["ambition-hint", fieldError ? "ambition-error" : null].filter(Boolean).join(" ");

  function go(href: string) {
    if (href === pathname) router.refresh();
    else router.push(href);
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch(ENDPOINTS[target], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { response, data: data !== null && typeof data === "object" ? (data as Record<string, unknown>) : null };
  }

  function showRefusal(data: Record<string, unknown> | null, fallback: string) {
    setErrors(data && typeof data.errors === "object" && data.errors !== null ? (data.errors as FieldErrors) : {});
    setError(data && typeof data.error === "string" ? data.error : fallback);
  }

  async function interpret() {
    setBusy(true);
    setError(null);
    setErrors({});
    setSaved(false);
    try {
      const sent = value;
      const { response, data } = await post({ action: ACTIONS[target].interpret, ambition: sent });
      if (response.ok && data && isInterpretation(data.interpretation) && typeof data.token === "string") {
        setInterpretation({ value: sent, data: data.interpretation, token: data.token });
        return;
      }
      if (response.status === 409 && data && typeof data.href === "string") {
        go(data.href);
        return;
      }
      showRefusal(data, GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!interpretation || interpretation.value !== value) return;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const { response, data } = await post({ action: ACTIONS[target].confirm, ambition: value, terms: interpretation.data.terms, token: interpretation.token });
      if ((response.ok || response.status === 409) && data && typeof data.href === "string") {
        go(data.href);
        return;
      }
      if (response.ok) {
        setInterpretation(null);
        setSaved(true);
        router.refresh();
        return;
      }
      // Le serveur ne reconnaît plus cette interprétation : elle disparaît, avec « C'est bien ça ».
      if (data?.code === "reinterpret") setInterpretation(null);
      showRefusal(data, SAVE_ERROR);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function edit(next: string) {
    setValue(next);
    setSaved(false);
    // Le texte n'est plus celui que Paul a lu : la reformulation et « C'est bien ça » disparaissent.
    if (interpretation && next !== interpretation.value) setInterpretation(null);
  }

  // Une réponse arrivée après une modification du texte porte sur l'ancien texte : elle n'est pas montrée.
  const shown = interpretation && interpretation.value === value ? interpretation.data : undefined;
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (!busy) void interpret(); }}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ambition" className={LABEL}>Votre ambition</label>
        <p id="ambition-hint" className={HINT}>En une ou deux phrases, avec vos mots. Par exemple : « +20 % de chiffre d&apos;affaires en 12 mois, sans embaucher ».</p>
        <textarea
          id="ambition" name="ambition" rows={4} maxLength={AMBITION_BOUNDS.textMax} required value={value}
          aria-invalid={fieldError ? true : undefined} aria-describedby={describedBy}
          onChange={(event) => edit(event.target.value)} className={INPUT_CLASS}
        />
        {fieldError && <p id="ambition-error" role="alert" className="text-sm font-medium text-[var(--bd-error)]">{fieldError}</p>}
      </div>
      <div>
        <button type="submit" className={shown ? SECONDARY_OUTLINE : PRIMARY_BUTTON} disabled={busy}>Interpréter</button>
      </div>
      <div aria-live="polite">
        {shown && (
          <section aria-label="Ce que Paul comprend" className="flex flex-col gap-3 rounded-lg border-l-4 border-[var(--bd-brand)] bg-[var(--bd-cream)] p-4 text-sm text-[var(--bd-ink)]">
            <p className="text-base">Voici ce que je comprends. {shown.reformulation}.</p>
            {shown.found.length > 0 && (
              <div>
                <h3 className="font-semibold">Ce que j&apos;ai retenu</h3>
                <ul className="mt-1 list-disc pl-5">{shown.found.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {shown.notes.length > 0 && (
              <div>
                <h3 className="font-semibold">Mes notes</h3>
                <ul className="mt-1 list-disc pl-5">{shown.notes.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {shown.questions.length > 0 && (
              <div>
                <p className="font-semibold">{AMBITION_REFINE_INTRO}</p>
                <ul className="mt-1 list-disc pl-5">{shown.questions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            <p>{AMBITION_TARGET_NOTICE}</p>
          </section>
        )}
        {saved && <p role="status" className="text-sm font-semibold text-[var(--bd-brand)]">Votre ambition est enregistrée.</p>}
      </div>
      {error && !fieldError && <p role="alert" className="text-sm font-medium text-[var(--bd-error)]">{error}</p>}
      {shown && (
        <div>
          <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void confirm()}>C&apos;est bien ça</button>
        </div>
      )}
    </form>
  );
}
