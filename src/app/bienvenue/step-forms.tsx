"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeCombobox } from "@/components/trade-combobox";
import { AmbitionEditor } from "@/components/ambition-editor";
import { LIMITS, profileOriginLabel, type DraftProfile, type ProfilePrefill } from "@/lib/onboarding/draft-rules";
import type { AnalysisView } from "@/lib/onboarding/analysis-rules";
import { FieldError, FormError, INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, useDraftAction, type FieldErrors } from "./journey-client";

/** Bouton secondaire bordé : « Découvrir » une fois les constats prêts (un seul bouton principal par écran). */
const SECONDARY_OUTLINE = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--bd-line-strong)] bg-white px-5 py-2 text-base font-semibold text-[var(--bd-ink)] hover:bg-[var(--bd-cream-deep)] disabled:opacity-60";

const LABEL = "text-sm font-semibold text-[var(--bd-ink)]";
const HINT = "text-sm text-[var(--bd-muted)]";

function TextField({ id, label, hint, example, value, onChange, errors, max, required = true, type = "text", autoComplete }: {
  id: keyof DraftProfile; label: string; hint?: string; example?: string; value: string; onChange: (value: string) => void; errors: FieldErrors; max: number; required?: boolean; type?: string; autoComplete?: string;
}) {
  const error = errors[id];
  // L'exemple aide à remplir un champ vide ; il s'efface dès la saisie.
  const shownExample = example && !value.trim() ? example : undefined;
  const describedBy = [hint ? `${id}-hint` : null, shownExample ? `${id}-example` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {hint && <p id={`${id}-hint`} className={HINT}>{hint}</p>}
      {shownExample && <p id={`${id}-example`} className={HINT}>{shownExample}</p>}
      <input
        id={id} name={id} type={type} value={value} maxLength={max} required={required} autoComplete={autoComplete}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const DISCOVERY_ERROR = "La découverte n'a pas pu être lancée. Réessayez dans un instant.";
const POLL_MS = 1_200;

const CLIENT_SUGGESTIONS = ["Particuliers", "Familles", "Professionnels", "Entreprises", "Touristes"];

/** Choix rapides ajoutés au champ, séparés par des virgules ; un second clic les retire. */
function Suggestions({ label, options, value, onChange, max }: { label: string; options: string[]; value: string; onChange: (value: string) => void; max: number }) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const chosen = (option: string) => parts.some((part) => part.toLowerCase() === option.toLowerCase());
  const toggle = (option: string) => {
    const next = chosen(option) ? parts.filter((part) => part.toLowerCase() !== option.toLowerCase()) : [...parts, option];
    onChange(next.join(", ").slice(0, max));
  };
  return (
    <div role="group" aria-label={label} className="-mt-2 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option} type="button" aria-pressed={chosen(option)} onClick={() => toggle(option)}
          className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${chosen(option) ? "border-[var(--bd-brand)] bg-[var(--bd-brand)] text-white" : "border-[var(--bd-line-strong)] bg-white text-[var(--bd-ink)] hover:bg-[var(--bd-cream-deep)]"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Les quatre rubriques de l'analyse, annoncées aux lecteurs d'écran à chaque changement. */
function RubricList({ analysis }: { analysis: AnalysisView }) {
  return (
    <section aria-labelledby="rubrics-title" className="flex flex-col gap-3 rounded-lg bg-[var(--bd-cream)] p-4">
      <h2 id="rubrics-title" className="text-base font-semibold text-[var(--bd-ink)]">Ce que Paul lit</h2>
      <ul aria-live="polite" className="flex flex-col gap-2">
        {analysis.rubrics.map((rubric) => (
          <li key={rubric.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className="font-semibold text-[var(--bd-ink)]">{rubric.name}</span>
            <span className={rubric.status === "read" ? "font-semibold text-[var(--bd-brand)]" : "text-[var(--bd-muted)]"}>{rubric.label}</span>
          </li>
        ))}
      </ul>
      {analysis.notice && <p role="status" className="text-sm text-[var(--bd-ink)]">{analysis.notice}</p>}
    </section>
  );
}

/**
 * Étape 1 (#280) : prénom, entreprise, localisation, site facultatif. « Découvrir mon entreprise » enregistre et lance
 * l'analyse publique ; la progression des quatre rubriques est relue toutes les 1,2 s ; une fois l'analyse terminée,
 * « Voir mes premiers constats » ouvre l'étape 2 et reçoit le focus.
 */
export function DiscoveryStep({ profile, analysis: initial }: { profile: DraftProfile; analysis: AnalysisView | null }) {
  const router = useRouter();
  const findings = useDraftAction();
  const [values, setValues] = useState({ firstName: profile.firstName, companyName: profile.companyName, location: profile.location, website: profile.website });
  const [analysis, setAnalysis] = useState<AnalysisView | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const seeRef = useRef<HTMLButtonElement>(null);
  const focusOnFinish = useRef(false);
  // Saisies enregistrées par le dernier « Découvrir » : toute modification depuis demande une nouvelle découverte.
  const [saved, setSaved] = useState(values);
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const running = analysis?.finished === false;
  const edited = (Object.keys(values) as (keyof typeof values)[]).some((key) => values[key].trim() !== saved[key].trim());
  const finished = analysis?.finished === true && !edited;

  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/bienvenue/analyse", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (stopped) return;
        if (response.ok && data && typeof data.analysis === "object" && data.analysis !== null) {
          setAnalysis(data.analysis as AnalysisView);
          return;
        }
        // Plus d'analyse, brouillon expiré ou session ouverte : on arrête d'interroger, puis une seule navigation.
        if (!response.ok && !(data && typeof data.href === "string")) return;
        stopped = true;
        window.clearInterval(timer);
        setAnalysis(null);
        const href = data && typeof data.href === "string" ? data.href : "/bienvenue";
        if (href === "/bienvenue") router.refresh();
        else router.push(href);
      } catch {
        // Réseau coupé : la prochaine interrogation réessaie.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [running, router]);

  useEffect(() => {
    if (finished && focusOnFinish.current) {
      focusOnFinish.current = false;
      seeRef.current?.focus();
    }
  }, [finished, analysis]);

  async function discover(website: string) {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const response = await fetch("/api/bienvenue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discover", ...values, website }) });
      const data = await response.json().catch(() => null);
      // Enregistrées : réponse acceptée, ou quota atteint (le brouillon les garde quand même).
      if (response.ok || data?.code === "limited") setSaved({ ...values, website });
      if (data && typeof data.analysis === "object" && data.analysis !== null) {
        focusOnFinish.current = true;
        setAnalysis(data.analysis as AnalysisView);
      }
      if (response.ok) return;
      // 409 sans analyse : autre étape ou session ouverte, le serveur dit où aller.
      if (response.status === 409 && data && typeof data.href === "string") {
        findings.go(data.href);
        return;
      }
      setErrors(data && typeof data.errors === "object" && data.errors !== null ? data.errors : {});
      // Quota atteint : le message est déjà sous les rubriques.
      if (data?.code !== "limited") setError(data && typeof data.error === "string" ? data.error : DISCOVERY_ERROR);
    } catch {
      setError(DISCOVERY_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (!running) void discover(values.website); }}>
        <TextField id="firstName" label="Votre prénom" value={values.firstName} onChange={set("firstName")} errors={errors} max={LIMITS.firstName} autoComplete="given-name" />
        <TextField id="companyName" label="Le nom de votre entreprise" value={values.companyName} onChange={set("companyName")} errors={errors} max={LIMITS.companyName} autoComplete="organization" />
        <TextField id="location" label="Sa localisation" hint="La ville ou le code postal de votre entreprise." value={values.location} onChange={set("location")} errors={errors} max={LIMITS.location} autoComplete="address-level2" />
        <TextField id="website" label="Votre site (facultatif)" hint="Une adresse commençant par https:// ou http://." value={values.website} onChange={set("website")} errors={errors} max={LIMITS.website} required={false} type="url" autoComplete="url" />
        <p className={HINT}>Paul lit seulement ce qui est public : votre site et votre fiche Google. Aucun mot de passe ni accès privé nécessaire.</p>
        <FormError error={error} errors={errors} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={finished ? SECONDARY_OUTLINE : PRIMARY_BUTTON} disabled={busy || running}>Découvrir mon entreprise</button>
          <button
            type="button" className={SECONDARY_BUTTON} disabled={busy || running}
            onClick={() => { setValues((current) => ({ ...current, website: "" })); void discover(""); }}
          >
            Je n&apos;ai pas de site
          </button>
        </div>
      </form>
      {analysis && <RubricList analysis={analysis} />}
      {finished && (
        <div className="flex flex-col gap-3">
          <FormError error={findings.error} errors={findings.errors} />
          <div>
            <button ref={seeRef} type="button" className={PRIMARY_BUTTON} disabled={findings.busy} onClick={() => findings.send({ action: "see_findings" })}>
              Voir mes premiers constats
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Étape 2 : activité, zone, clients prioritaires et offres principales, préremplis par l'analyse, chacun avec son origine
 * (FR-5), à vérifier puis confirmer. « Non, corriger mes informations » revient à la découverte sans rien effacer (#281).
 */
export function ProfileForm({ prefill }: { prefill: ProfilePrefill }) {
  const { busy, error, errors, send } = useDraftAction();
  const correct = useDraftAction();
  const [values, setValues] = useState(prefill.values);
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  // Une valeur modifiée par le dirigeant est la sienne : l'étiquette d'origine disparaît.
  const origin = (key: keyof typeof values) => (values[key] === prefill.values[key] ? profileOriginLabel(prefill.origins[key]) ?? undefined : undefined);
  const tradeOrigin = origin("trade");
  const pending = busy || correct.busy;
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void send({ action: "confirm_profile", ...values }); }}>
      <div className="flex flex-col gap-1.5">
        <TradeCombobox id="trade" label="Votre activité" value={values.trade} onChange={set("trade")} invalid={Boolean(errors.trade)} describedBy={[tradeOrigin ? "trade-origin" : null, errors.trade ? "trade-error" : null].filter(Boolean).join(" ") || undefined} />
        {tradeOrigin && <p id="trade-origin" className={HINT}>{tradeOrigin}</p>}
        <FieldError id="trade-error" message={errors.trade} />
      </div>
      <TextField id="servingArea" label="Votre zone d'intervention" hint={origin("servingArea")} value={values.servingArea} onChange={set("servingArea")} errors={errors} max={LIMITS.servingArea} />
      <TextField id="targetClients" label="Vos clients" hint={origin("targetClients")} example="Qui vous achète ? Quelques mots suffisent, ou choisissez ci-dessous." value={values.targetClients} onChange={set("targetClients")} errors={errors} max={LIMITS.targetClients} />
      <Suggestions label="Exemples de clients" options={CLIENT_SUGGESTIONS} value={values.targetClients} onChange={set("targetClients")} max={LIMITS.targetClients} />
      <TextField id="offers" label="Ce que vous proposez" hint={origin("offers")} example="Vos principaux produits ou services, séparés par des virgules. Par exemple : menu du jour, plats à emporter ; ou : dépannage, rénovation de salle de bain." value={values.offers} onChange={set("offers")} errors={errors} max={LIMITS.offers} />
      <FormError error={error ?? correct.error} errors={errors} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={PRIMARY_BUTTON} disabled={pending}>Oui, c&apos;est bien moi</button>
        <button type="button" className={SECONDARY_BUTTON} disabled={pending} onClick={() => correct.send({ action: "back", step: 1 })}>Non, corriger mes informations</button>
      </div>
    </form>
  );
}

/** Étape 3 (#282) : l'ambition dite avec vos mots, reformulée par Paul, puis confirmée telle quelle. */
export function AmbitionForm({ ambition }: { ambition: string }) {
  return <AmbitionEditor target="bienvenue" initialText={ambition} />;
}

/** Étape 4 : « Ça m'intéresse » ouvre la création du compte. */
export function InterestButton() {
  const { busy, error, errors, send } = useDraftAction();
  return (
    <div className="flex flex-col gap-3">
      <FormError error={error} errors={errors} />
      <div><button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => send({ action: "interested" })}>Ça m&apos;intéresse</button></div>
    </div>
  );
}

const ACCOUNT_ERROR = "Création du compte impossible. Réessayez dans un instant.";

/** Étape 5 : e-mail et mot de passe saisi deux fois ; le compte est créé en dernier. */
export function AccountForm() {
  const router = useRouter();
  const { go } = useDraftAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; message: string; recover?: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, passwordConfirmation }) });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        // Le bouton reste désactivé jusqu'à la stratégie : pas de second envoi.
        router.push(typeof data?.href === "string" ? data.href : "/strategie");
        return;
      }
      if (response.status === 409 && typeof data?.href === "string") {
        go(data.href);
        setBusy(false);
        return;
      }
      setError({ field: typeof data?.field === "string" ? data.field : null, message: typeof data?.error === "string" ? data.error : ACCOUNT_ERROR, recover: typeof data?.recoverHref === "string" ? data.recoverHref : undefined });
    } catch {
      setError({ field: null, message: ACCOUNT_ERROR });
    }
    setBusy(false);
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : undefined);
  const described = (field: string) => (error?.field === field ? `${field}-error` : undefined);
  const type = showPassword ? "text" : "password";
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL}>Adresse e-mail</label>
        <input id="email" type="email" autoComplete="email" required maxLength={LIMITS.email} value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={fieldError("email") ? true : undefined} aria-describedby={described("email")} className={INPUT_CLASS} />
        <FieldError id="email-error" message={fieldError("email")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={LABEL}>Mot de passe</label>
        <p id="password-hint" className={HINT}>De 8 à 128 caractères.</p>
        <input id="password" type={type} autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={fieldError("password") ? true : undefined} aria-describedby={["password-hint", described("password")].filter(Boolean).join(" ")} className={INPUT_CLASS} />
        <FieldError id="password-error" message={fieldError("password")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="passwordConfirmation" className={LABEL}>Confirmez le mot de passe</label>
        <input id="passwordConfirmation" type={type} autoComplete="new-password" required maxLength={128} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} aria-invalid={fieldError("passwordConfirmation") ? true : undefined} aria-describedby={described("passwordConfirmation")} className={INPUT_CLASS} />
        <FieldError id="passwordConfirmation-error" message={fieldError("passwordConfirmation")} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--bd-ink)]">
        <input type="checkbox" className="h-5 w-5" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
        Afficher le mot de passe
      </label>
      {error && !error.field && (
        <div role="alert" className="flex flex-col gap-1 text-sm font-medium text-[var(--bd-error)]">
          <p>{error.message}</p>
          {error.recover && <p><Link href={error.recover} className="font-semibold text-[var(--bd-brand)] underline">Retrouver mon compte</Link></p>}
        </div>
      )}
      <div><button type="submit" className={PRIMARY_BUTTON} disabled={busy}>{busy ? "Création…" : "Créer mon compte"}</button></div>
      <p className="text-sm text-[var(--bd-ink)]">Déjà un compte ? <Link href="/login" className="font-semibold text-[var(--bd-brand)] underline">Retrouver mon compte</Link></p>
    </form>
  );
}
