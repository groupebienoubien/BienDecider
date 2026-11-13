"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TradeCombobox } from "@/components/trade-combobox";
import { AmbitionEditor } from "@/components/ambition-editor";
import { LIMITS, profileOriginLabel, type DraftProfile, type GooglePlaceChoice, type ProfilePrefill } from "@/lib/onboarding/draft-rules";
import type { AnalysisView, RubricStatus } from "@/lib/onboarding/analysis-rules";
import type { CompetitorDecision, CompetitorDimension, CompetitorFact } from "@/lib/onboarding/intelligence-rules";
import { normalizeSocialProfileUrl, SOCIAL_PLATFORMS, type PublicSourceCandidate, type SocialSourceDecision } from "@/lib/onboarding/public-sources";
import type { PlaceCandidate } from "@/lib/google-places";
import { safeSourceUrl } from "@/lib/findings/certainty";
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

const POLL_MS = 1_200;

const CLIENT_SUGGESTIONS = ["Particuliers", "Familles", "Professionnels", "Entreprises", "Touristes"];
const COMPETITOR_DIMENSION_LABELS: Record<CompetitorDimension, string> = {
  trade: "Activité",
  servingArea: "Zone desservie",
  offers: "Offres",
  targetClients: "Clientèle",
};

/** Comparables sourcés, à confirmer ou écarter par le dirigeant avant leur reprise dans les analyses du compte. */
export function MarketCompetitors({ competitors, decisions }: { competitors: CompetitorFact[]; decisions: CompetitorDecision[] }) {
  const { busy, error, errors, send } = useDraftAction();
  return (
    <section aria-labelledby="market-title" className="rounded-lg border border-[var(--bd-line)] p-4 text-sm text-[var(--bd-ink)]">
      <h2 id="market-title" className="font-semibold">Entreprises comparables à vérifier</h2>
      <p className="mt-1 text-[var(--bd-muted)]">Chaque constat est daté et sourcé. Une information absente n&apos;est ni un zéro ni un désavantage.</p>
      <ul className="mt-3 flex flex-col gap-4">
        {competitors.map((competitor) => {
          const decision = decisions.find((item) => item.name === competitor.name && item.source === competitor.source)?.decision;
          const source = safeSourceUrl(competitor.source);
          const relationshipLabel = competitor.relationship === "indirect"
            ? "alternative indirecte"
            : competitor.relationship === "direct" ? "concurrent direct" : "comparabilité à vérifier";
          return (
            <li key={`${competitor.name}:${competitor.source}`} className="rounded-md bg-[var(--bd-cream)] p-3">
              <h3 className="font-semibold">{competitor.name} <span className="font-normal">· {relationshipLabel}</span></h3>
              {competitor.comparabilityReason && <p className="mt-1">{competitor.comparabilityReason}</p>}
              <p className="mt-1">{competitor.fact}</p>
              {competitor.comparisons && competitor.comparisons.length > 0 && (
                <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                  {competitor.comparisons.map((comparison) => (
                    <div key={comparison.dimension} className="contents">
                      <dt className="font-semibold">{COMPETITOR_DIMENSION_LABELS[comparison.dimension]}</dt>
                      <dd className="break-words">Vous : {comparison.businessValue} · {competitor.name} : {comparison.competitorValue}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {competitor.readAt && <p className="mt-2 text-[var(--bd-muted)]">Consulté le {competitor.readAt.slice(0, 10)}</p>}
              {source && <a href={source} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline">Consulter la source</a>}
              <p className="mt-2 font-semibold" role="status">{decision === "confirmed" ? "Concurrent confirmé" : decision === "dismissed" ? "Concurrent écarté ; il ne sera pas reproposé" : "À vérifier par vous"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={SECONDARY_OUTLINE} disabled={busy || decision === "confirmed"} onClick={() => void send({ action: "competitor_decision", name: competitor.name, source: competitor.source, decision: "confirmed" })}>Confirmer</button>
                <button type="button" className={SECONDARY_OUTLINE} disabled={busy || decision === "dismissed"} onClick={() => void send({ action: "competitor_decision", name: competitor.name, source: competitor.source, decision: "dismissed" })}>Écarter</button>
              </div>
            </li>
          );
        })}
      </ul>
      <FormError error={error} errors={errors} />
    </section>
  );
}

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
      {analysis.notice && (
        <p role="status" className={analysis.status === "limited" ? "rounded-md border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-3 text-sm font-semibold text-[var(--bd-ink)]" : "text-sm text-[var(--bd-ink)]"}>{analysis.notice}</p>
      )}
    </section>
  );
}

export function DiscoveryStep({ profile }: { profile: DraftProfile }) {
  const { busy, error, errors, send } = useDraftAction();
  const [values, setValues] = useState({ companyName: profile.companyName, location: profile.location });
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return (
      <form noValidate className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void send({ action: "discover", ...values }); }}>
        <TextField id="companyName" label="Le nom de votre entreprise" value={values.companyName} onChange={set("companyName")} errors={errors} max={LIMITS.companyName} autoComplete="organization" />
        <TextField id="location" label="Sa localisation" hint="La ville ou le code postal de votre entreprise." value={values.location} onChange={set("location")} errors={errors} max={LIMITS.location} autoComplete="address-level2" />
        <p className={HINT}>Paul recherche votre entreprise. Vous vérifiez ensuite son site et ses réseaux. Aucun mot de passe ni accès privé nécessaire.</p>
        <FormError error={error} errors={errors} />
        <div><button type="submit" className={PRIMARY_BUTTON} disabled={busy}>{busy ? "Recherche…" : "Découvrir mon entreprise"}</button></div>
      </form>
  );
}

export function CompanyConfirmation({ companyName, location, children }: { companyName: string; location: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <div>
      <p className="mb-4 leading-relaxed">Confirmez les informations de {companyName} pour passer à votre objectif.</p>
      <button type="button" className={PRIMARY_BUTTON} onClick={() => setOpen(true)}>Vérifier mon entreprise</button>
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[var(--bd-line)] bg-white p-5 text-[var(--bd-ink)] shadow-xl backdrop:bg-black/40 sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--bd-brand)]">Découverte</p>
            <h2 id={titleId} className="mt-1 text-2xl font-bold">Est-ce bien votre entreprise ?</h2>
            <p className="mt-3 break-words text-lg font-semibold">{companyName}</p>
            <p className={HINT}>{location}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => setOpen(false)} aria-label="Fermer la confirmation">Fermer</button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

/**
 * Étape 2 : activité, zone, clients prioritaires et offres principales, préremplis par l'analyse, chacun avec son origine
 * (FR-5), à vérifier puis confirmer. « Non, corriger mes informations » revient à la découverte sans rien effacer (#281).
 */
export function ProfileForm({
  prefill,
  website: initialWebsite,
  publicSources,
  socialSourceDecisions,
  googlePlaceCandidates,
  googlePlaceChoice: initialGooglePlaceChoice,
  websiteRejected,
  googleStatus,
  analysis,
  analysisRunId,
}: {
  prefill: ProfilePrefill;
  website: string;
  publicSources: PublicSourceCandidate[];
  socialSourceDecisions: SocialSourceDecision[];
  googlePlaceCandidates: PlaceCandidate[];
  googlePlaceChoice: GooglePlaceChoice | null;
  websiteRejected: boolean;
  googleStatus: RubricStatus | null;
  analysis: AnalysisView | null;
  analysisRunId: string | null;
}) {
  const { busy, error, errors, send } = useDraftAction();
  const correct = useDraftAction();
  const sourceAction = useDraftAction();
  const [edits, setEdits] = useState<Partial<ProfilePrefill["values"]>>({});
  const values = { ...prefill.values, ...edits };
  const [websiteEdit, setWebsite] = useState<string>();
  const website = websiteEdit ?? initialWebsite;
  const [placeEdit, setGooglePlaceChoice] = useState<GooglePlaceChoice>();
  const googlePlaceChoice = placeEdit ?? initialGooglePlaceChoice;
  const placeChoiceKey = (choice: GooglePlaceChoice | null) =>
    choice?.status === "confirmed" ? choice.placeId : choice?.status ?? "";
  const googlePlaceChanged = placeChoiceKey(googlePlaceChoice) !== placeChoiceKey(initialGooglePlaceChoice);
  const sourcesChanged = website.trim() !== initialWebsite.trim()
    || (googlePlaceChanged && (googlePlaceChoice?.status === "confirmed" || initialGooglePlaceChoice?.status === "confirmed"));
  const websiteCandidates = publicSources.filter((candidate) => candidate.platform === "website");
  const socialCandidates = publicSources.filter((candidate) => candidate.platform !== "website");
  const [socialEdits, setSocialEdits] = useState<Record<string, { confirmedUrl: string; confirmed: boolean }>>({});
  const socialChoices = socialCandidates.map((candidate) => {
    const saved = socialSourceDecisions.find((decision) => decision.candidateUrl === candidate.url);
    return {
      candidateUrl: candidate.url,
      ...(socialEdits[`${analysisRunId}:${candidate.url}`] ?? {
        confirmedUrl: saved?.confirmedUrl ?? candidate.url,
        confirmed: saved?.status === "confirmed",
      }),
    };
  });
  const [declaredProfiles, setDeclaredProfiles] = useState(() => Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [
    platform,
    socialSourceDecisions.find((item) => item.platform === platform && item.origin === "declared" && !socialCandidates.some((candidate) => candidate.url === item.candidateUrl))?.confirmedUrl ?? "",
  ])));
  const set = (key: keyof typeof values) => (value: string) => setEdits((current) => ({ ...current, [key]: value }));
  // Une valeur modifiée par le dirigeant est la sienne : l'étiquette d'origine disparaît.
  const origin = (key: keyof typeof values) => (values[key] === prefill.values[key] ? profileOriginLabel(prefill.origins[key]) ?? undefined : undefined);
  const tradeOrigin = origin("trade");
  const pending = busy || correct.busy || sourceAction.busy;
  const reading = analysis?.finished === false;
  const sourcePending = sourceAction.busy || (googlePlaceChanged && !sourceAction.error);
  const confirmDisabled = pending || sourcePending || (reading && (!analysis.sourcesReady || sourcesChanged));

  function updateSources(choice: GooglePlaceChoice | null, url: string) {
    void sourceAction.send({
      action: "update_sources",
      googlePlaceChoice: choice,
      website: url.trim(),
      websiteRejected: !url.trim() && (websiteRejected || websiteEdit === ""),
    });
  }

  function selectPlace(choice: GooglePlaceChoice, discoveredSite: string) {
    setGooglePlaceChoice(choice);
    updateSources(choice, websiteEdit ?? discoveredSite);
  }

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => {
      event.preventDefault();
      if (confirmDisabled) return;
      const websiteValue = website.trim();
      const rejectedWebsite = !websiteValue && (websiteRejected || Boolean(initialWebsite.trim()));
      void send({
        action: "confirm_profile",
        ...values,
        website: websiteValue,
        websiteRejected: rejectedWebsite,
        googlePlaceChoice,
        declaredSocialProfiles: Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => {
          const url = normalizeSocialProfileUrl(platform, declaredProfiles[platform]);
          const alreadyConfirmed = url !== null && socialChoices.some((choice) => choice.confirmed
            && normalizeSocialProfileUrl(platform, choice.candidateUrl) === url
            && normalizeSocialProfileUrl(platform, choice.confirmedUrl) === url);
          return [platform, alreadyConfirmed ? "" : declaredProfiles[platform]];
        })),
        socialSourceDecisions: socialChoices.map((choice) => ({
          candidateUrl: choice.candidateUrl,
          confirmedUrl: choice.confirmed ? choice.confirmedUrl : null,
          status: choice.confirmed ? "confirmed" : "rejected"
        }))
      });
    }}>
      <h2 className="text-base font-semibold">Votre présence en ligne</h2>
      <TextField id="website" label="Votre site (facultatif)" value={website} onChange={setWebsite} errors={{ ...sourceAction.errors, ...errors }} max={LIMITS.website} required={false} type="url" />
      {(sourcePending || reading) && (
        <p role="status" className="rounded-md bg-[var(--bd-cream)] p-3 text-sm leading-relaxed">
          Paul complète automatiquement votre site, vos réseaux et votre activité. Vous pouvez continuer à corriger les informations ; vos saisies seront conservées.
        </p>
      )}
      {googlePlaceCandidates.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--bd-line)] p-4">
          <legend className="px-1 text-sm font-semibold">Votre fiche Google</legend>
          {googlePlaceCandidates.map((candidate) => {
            const websiteCandidate = websiteCandidates.find((source) => source.source === candidate.link);
            return (
              <label key={candidate.id} className="flex cursor-pointer flex-col gap-1 border-t border-[var(--bd-line)] pt-3">
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="google-place-choice"
                    value={candidate.id}
                    checked={googlePlaceChoice?.status === "confirmed" && googlePlaceChoice.placeId === candidate.id}
                    disabled={pending || sourcePending || reading}
                    onChange={() => selectPlace({ status: "confirmed", placeId: candidate.id }, candidate.website ?? websiteCandidate?.url ?? "")}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{candidate.name}</span>
                    {candidate.address && <span className={HINT}>{candidate.address}</span>}
                    {candidate.category && <span className={HINT}>Activité indiquée : {candidate.category}</span>}
                    <a href={candidate.link} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-[var(--bd-brand)] underline" onClick={(event) => event.stopPropagation()}>
                      Vérifier cette fiche Google
                    </a>
                    {websiteCandidate && (
                      <span className={HINT}>
                        Site candidat : <a href={websiteCandidate.url} target="_blank" rel="noopener noreferrer" className="break-all underline" onClick={(event) => event.stopPropagation()}>{websiteCandidate.url}</a>
                      </span>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
          <label className="flex min-h-11 items-center gap-2 border-t border-[var(--bd-line)] pt-3 text-sm">
            <input
              type="radio"
              name="google-place-choice"
              value="none"
              checked={googlePlaceChoice?.status === "rejected"}
              disabled={pending || sourcePending || reading}
              onChange={() => selectPlace({ status: "rejected" }, "")}
            />
            Aucune de ces fiches ne correspond à mon entreprise
          </label>
        </fieldset>
      )}
      {!googlePlaceCandidates.length && googleStatus === "not_found" && (
        <p role="status" className={HINT}>Fiche Google non identifiée ; son absence n&apos;est pas établie.</p>
      )}
      {!googlePlaceCandidates.length && googleStatus === "unavailable" && (
        <p role="status" className={HINT}>Fiche Google non lue : recherche indisponible.</p>
      )}
      {websiteCandidates.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--bd-line)] p-4">
          <legend className="px-1 text-sm font-semibold">Autres sites repérés</legend>
          {websiteCandidates.map((candidate) => (
            <div key={`${candidate.url}:${candidate.source}`} className="flex flex-col gap-1">
              <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-semibold text-[var(--bd-brand)] underline">{candidate.url}</a>
              <p className={HINT}>
                Repéré via <a href={candidate.source} target="_blank" rel="noopener noreferrer" className="break-all underline">cette fiche Google</a>, le {new Date(candidate.readAt).toLocaleDateString("fr-FR")}.
              </p>
              <button type="button" className={SECONDARY_BUTTON} disabled={pending || sourcePending || reading} onClick={() => {
                const place = googlePlaceCandidates.find((item) => item.link === candidate.source);
                const choice = googlePlaceChoice ?? (place ? { status: "confirmed" as const, placeId: place.id } : null);
                if (choice) setGooglePlaceChoice(choice);
                setWebsite(candidate.url);
                updateSources(choice, candidate.url);
              }}>
                Utiliser cette adresse
              </button>
            </div>
          ))}
        </fieldset>
      )}
      {sourcesChanged || (reading && !analysis.sourcesReady) ? <p role="status" className={HINT}>Les réseaux seront actualisés avec vos nouvelles sources.</p> : socialCandidates.length ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--bd-line)] p-4">
          <legend className="px-1 text-sm font-semibold">Vos réseaux</legend>
          <p className={HINT}>Cochez vos profils officiels. Les autres liens seront écartés.</p>
          {socialCandidates.map((candidate, index) => {
            const choice = socialChoices.find((item) => item.candidateUrl === candidate.url);
            if (!choice) return null;
            const checkboxId = `social-confirm-${index}`;
            const urlId = `social-url-${index}`;
            return (
              <div key={candidate.url} className="flex flex-col gap-2 border-t border-[var(--bd-line)] pt-3">
                <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-semibold text-[var(--bd-brand)] underline">
                  {candidate.platform} : {candidate.url}
                </a>
                <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={choice.confirmed}
                    onChange={(event) => setSocialEdits((current) => ({ ...current, [`${analysisRunId}:${choice.candidateUrl}`]: { ...choice, confirmed: event.target.checked } }))}
                  />
                  Ce profil est officiel
                </label>
                <details className="text-sm">
                  <summary className="cursor-pointer text-[var(--bd-muted)]">Source et correction du lien</summary>
                  <p className="my-2 text-[var(--bd-muted)]">Repéré sur <a href={candidate.source} target="_blank" rel="noopener noreferrer" className="break-all underline">{candidate.source}</a>, le {new Date(candidate.readAt).toLocaleDateString("fr-FR")}.</p>
                  <label htmlFor={urlId} className={LABEL}>Adresse du profil</label>
                  <input id={urlId} type="url" className={INPUT_CLASS} value={choice.confirmedUrl} onChange={(event) => setSocialEdits((current) => ({ ...current, [`${analysisRunId}:${choice.candidateUrl}`]: { ...choice, confirmedUrl: event.target.value } }))} />
                </details>
              </div>
            );
          })}
        </fieldset>
      ) : (
        <p className={HINT}>Aucun réseau repéré dans les pages lues, sans conclusion sur votre présence en ligne.</p>
      )}
      {socialCandidates.length > 0 && <p className={HINT}>Liens publics uniquement : les publications sociales ne sont pas analysées, aucun compte n&apos;est connecté.</p>}
      <details className="rounded-lg border border-[var(--bd-line)] p-4">
        <summary className="cursor-pointer font-semibold">Ajouter un profil non trouvé</summary>
        <p className={`${HINT} my-3`}>Les liens renseignés ici seront retenus comme vos déclarations, pas comme des pages analysées.</p>
        <div className="flex flex-col gap-3">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform} className="flex flex-col gap-1.5">
              <label htmlFor={`declared-${platform}`} className={LABEL}>{platform === "facebook" ? "Facebook" : platform === "instagram" ? "Instagram" : "LinkedIn"}</label>
              <input id={`declared-${platform}`} type="url" maxLength={600} className={INPUT_CLASS} value={declaredProfiles[platform]} onChange={(event) => setDeclaredProfiles((current) => ({ ...current, [platform]: event.target.value }))} />
            </div>
          ))}
        </div>
      </details>
      <details className="border-t border-[var(--bd-line)] pt-4" open={["trade", "servingArea", "targetClients", "offers"].some((field) => errors[field]) || undefined}>
      <summary className="min-h-11 cursor-pointer text-base font-semibold">Votre activité — compléter si utile</summary>
      <p className={`${HINT} mb-4`}>Corrigez ce que vous savez. Une information inconnue peut rester vide.</p>
      <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <TradeCombobox id="trade" label="Votre activité" required={false} value={values.trade} onChange={set("trade")} invalid={Boolean(errors.trade)} describedBy={[tradeOrigin ? "trade-origin" : null, errors.trade ? "trade-error" : null].filter(Boolean).join(" ") || undefined} />
        {tradeOrigin && <p id="trade-origin" className={HINT}>{tradeOrigin}</p>}
        <FieldError id="trade-error" message={errors.trade} />
      </div>
      <TextField id="servingArea" label="Votre zone d'intervention" required={false} hint={origin("servingArea")} value={values.servingArea} onChange={set("servingArea")} errors={errors} max={LIMITS.servingArea} />
      <TextField id="targetClients" label="Vos clients" required={false} hint={origin("targetClients")} example="Qui vous achète ? Quelques mots suffisent, ou choisissez ci-dessous." value={values.targetClients} onChange={set("targetClients")} errors={errors} max={LIMITS.targetClients} />
      <Suggestions label="Exemples de clients" options={CLIENT_SUGGESTIONS} value={values.targetClients} onChange={set("targetClients")} max={LIMITS.targetClients} />
      <TextField id="offers" label="Ce que vous proposez" required={false} hint={origin("offers")} example="Vos principaux produits ou services, séparés par des virgules." value={values.offers} onChange={set("offers")} errors={errors} max={LIMITS.offers} />
      </div>
      </details>
      <FormError error={sourceAction.error} errors={sourceAction.errors} />
      {sourceAction.error && <button type="button" className={SECONDARY_OUTLINE} disabled={pending || reading} onClick={() => {
        const candidate = googlePlaceCandidates.find((item) => googlePlaceChoice?.status === "confirmed" && item.id === googlePlaceChoice.placeId);
        updateSources(googlePlaceChoice, websiteEdit ?? candidate?.website ?? websiteCandidates.find((item) => item.source === candidate?.link)?.url ?? website);
      }}>Réessayer la lecture automatique</button>}
      <FormError error={error ?? correct.error} errors={errors} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={PRIMARY_BUTTON} disabled={confirmDisabled}>
          {sourcePending || (reading && !analysis.sourcesReady)
            ? "Lecture des sources en cours…"
            : sourcesChanged
            ? "Actualiser mes sources"
            : "Oui, continuer vers mon objectif"}
        </button>
        <button type="button" className={SECONDARY_BUTTON} disabled={pending} onClick={() => correct.send({ action: "back", step: 1 })}>Changer d&apos;entreprise</button>
      </div>
    </form>
  );
}

/** Étape 3 (#282) : l'ambition dite avec vos mots, reformulée par Paul, puis confirmée telle quelle. */
export function ProfileAnalysisWatcher({ analysis, stopAtSources = false, compact = false }: { analysis: AnalysisView; stopAtSources?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(analysis);
  const [error, setError] = useState<string | null>(null);
  const sourcesRefreshed = useRef(analysis.sourcesReady);
  useEffect(() => {
    let stopped = false;
    let fetching = false;
    const timer = window.setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/bienvenue/analyse", { cache: "no-store" });
        const data = await response.json();
        if (stopped) return;
        if (!response.ok) {
          if (typeof data?.href === "string") {
            stopped = true;
            window.clearInterval(timer);
            router.push(data.href);
          } else setError("Lecture interrompue. Réessayez dans un instant.");
          return;
        }
        if (data?.analysis) {
          setCurrent(data.analysis);
          setError(null);
          if (data.analysis.finished || (stopAtSources && data.analysis.sourcesReady)) {
            stopped = true;
            window.clearInterval(timer);
            router.refresh();
          } else if (data.analysis.sourcesReady && !sourcesRefreshed.current) {
            sourcesRefreshed.current = true;
            router.refresh();
          }
        } else setError("La progression n'est pas disponible. Une nouvelle tentative aura lieu automatiquement.");
      } catch {
        if (!stopped) setError("Connexion interrompue. La lecture reprendra automatiquement.");
      } finally {
        fetching = false;
      }
    }, POLL_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [router, stopAtSources]);
  return <div className="flex flex-col gap-3">
    {compact ? <details className="mb-5 rounded-lg bg-[var(--bd-cream-deep)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold">L&apos;analyse continue en arrière-plan</summary>
      <p className="my-2">Vous pouvez continuer. Paul utilisera la lecture terminée pour préparer vos missions.</p>
      <RubricList analysis={current} />
    </details> : <RubricList analysis={current} />}
    {error && <p role="status" className={HINT}>{error}</p>}
  </div>;
}

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
export function AccountForm({ initialFirstName = "" }: { initialFirstName?: string }) {
  const router = useRouter();
  const { go } = useDraftAction();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState(initialFirstName);
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
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName, email, password, passwordConfirmation }) });
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
      <TextField id="firstName" label="Votre prénom (facultatif)" required={false} value={firstName} onChange={setFirstName} errors={{ firstName: fieldError("firstName") }} max={LIMITS.firstName} autoComplete="given-name" />
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
