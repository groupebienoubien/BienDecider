"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TradeCombobox } from "@/components/trade-combobox";
import { LIMITS, type DraftProfile } from "@/lib/onboarding/draft-rules";
import { FieldError, FormError, INPUT_CLASS, PRIMARY_BUTTON, useDraftAction, type FieldErrors } from "./journey-client";

const LABEL = "text-sm font-semibold text-[var(--bd-ink)]";
const HINT = "text-sm text-[var(--bd-muted)]";

function TextField({ id, label, hint, value, onChange, errors, max, required = true, type = "text", autoComplete }: {
  id: keyof DraftProfile; label: string; hint?: string; value: string; onChange: (value: string) => void; errors: FieldErrors; max: number; required?: boolean; type?: string; autoComplete?: string;
}) {
  const error = errors[id];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {hint && <p id={`${id}-hint`} className={HINT}>{hint}</p>}
      <input
        id={id} name={id} type={type} value={value} maxLength={max} required={required} autoComplete={autoComplete}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Étape 1 : prénom, entreprise, localisation, site facultatif. */
export function DiscoveryForm({ profile }: { profile: DraftProfile }) {
  const { busy, error, errors, send } = useDraftAction();
  const [values, setValues] = useState({ firstName: profile.firstName, companyName: profile.companyName, location: profile.location, website: profile.website });
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void send({ action: "discover", ...values }); }}>
      <TextField id="firstName" label="Votre prénom" value={values.firstName} onChange={set("firstName")} errors={errors} max={LIMITS.firstName} autoComplete="given-name" />
      <TextField id="companyName" label="Le nom de votre entreprise" value={values.companyName} onChange={set("companyName")} errors={errors} max={LIMITS.companyName} autoComplete="organization" />
      <TextField id="location" label="Sa localisation" hint="La ville ou le code postal de votre entreprise." value={values.location} onChange={set("location")} errors={errors} max={LIMITS.location} autoComplete="address-level2" />
      <TextField id="website" label="Votre site (facultatif)" hint="Une adresse commençant par https:// ou http://." value={values.website} onChange={set("website")} errors={errors} max={LIMITS.website} required={false} type="url" autoComplete="url" />
      <FormError error={error} errors={errors} />
      <div><button type="submit" className={PRIMARY_BUTTON} disabled={busy}>Continuer</button></div>
    </form>
  );
}

/** Étape 2 : activité, zone, clients et offres, à confirmer. */
export function ProfileForm({ profile }: { profile: DraftProfile }) {
  const { busy, error, errors, send } = useDraftAction();
  const [values, setValues] = useState({ trade: profile.trade, servingArea: profile.servingArea || profile.location, targetClients: profile.targetClients, offers: profile.offers });
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void send({ action: "confirm_profile", ...values }); }}>
      <div className="flex flex-col gap-1.5">
        <TradeCombobox id="trade" label="Votre activité" value={values.trade} onChange={set("trade")} invalid={Boolean(errors.trade)} describedBy={errors.trade ? "trade-error" : undefined} />
        <FieldError id="trade-error" message={errors.trade} />
      </div>
      <TextField id="servingArea" label="Votre zone d'intervention" value={values.servingArea} onChange={set("servingArea")} errors={errors} max={LIMITS.servingArea} />
      <TextField id="targetClients" label="Vos clients" hint="Par exemple : des particuliers propriétaires de maisons anciennes." value={values.targetClients} onChange={set("targetClients")} errors={errors} max={LIMITS.targetClients} />
      <TextField id="offers" label="Vos offres" hint="Par exemple : rénovation de salles de bain, dépannage." value={values.offers} onChange={set("offers")} errors={errors} max={LIMITS.offers} />
      <FormError error={error} errors={errors} />
      <div><button type="submit" className={PRIMARY_BUTTON} disabled={busy}>Oui, c&apos;est bien moi</button></div>
    </form>
  );
}

/** Étape 3 : l'ambition en texte libre, conservée telle quelle. */
export function AmbitionForm({ ambition }: { ambition: string }) {
  const { busy, error, errors, send } = useDraftAction();
  const [value, setValue] = useState(ambition);
  const describedBy = ["ambition-hint", errors.ambition ? "ambition-error" : null].filter(Boolean).join(" ");
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void send({ action: "confirm_ambition", ambition: value }); }}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ambition" className={LABEL}>Votre ambition</label>
        <p id="ambition-hint" className={HINT}>En une ou deux phrases. Par exemple : « +20 % de chiffre d&apos;affaires en 12 mois, sans embaucher ».</p>
        <textarea
          id="ambition" name="ambition" rows={4} maxLength={LIMITS.ambitionMax} required value={value}
          aria-invalid={errors.ambition ? true : undefined} aria-describedby={describedBy}
          onChange={(event) => setValue(event.target.value)} className={INPUT_CLASS}
        />
        <FieldError id="ambition-error" message={errors.ambition} />
      </div>
      <p className={HINT}>C&apos;est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment.</p>
      <FormError error={error} errors={errors} />
      <div><button type="submit" className={PRIMARY_BUTTON} disabled={busy}>C&apos;est bien ça</button></div>
    </form>
  );
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
