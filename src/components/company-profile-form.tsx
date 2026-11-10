"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TradeCombobox } from "@/components/trade-combobox";
import { PageHeading } from "@/components/mockup-ui";
import { CORRECTION_FIELDS, PROFILE_FIELD_LABELS, PROFILE_TEXT_LIMITS, companyOriginLabel, readProfileOrigins, type CorrectionField, type ProfileOrigins } from "@/lib/company-profile";
import { LIMITS } from "@/lib/onboarding/draft-rules";
import { clientGapLabel, computeBusinessTarget, formatDecimal, formatEuros } from "@/lib/business-target";

/** Limite de chaque champ de « Corriger mon profil », la même qu'aux étapes 1 et 2 du parcours d'entrée. */
const CORRECTION_LIMITS: Record<CorrectionField, number> = {
  firstName: LIMITS.firstName,
  name: LIMITS.companyName,
  location: LIMITS.location,
  trade: LIMITS.trade,
  servingArea: LIMITS.servingArea,
  targetClients: LIMITS.targetClients,
  offers: LIMITS.offers,
};

/** Champ du formulaire de chaque information, pour le marquer et le focaliser quand le serveur le refuse. */
const FIELD_INPUT_IDS: Record<CorrectionField, string> = {
  firstName: "profile-first-name",
  name: "profile-name",
  location: "profile-location",
  trade: "profile-trade",
  servingArea: "profile-area",
  targetClients: "profile-target-clients",
  offers: "profile-offers",
};

export function CompanyProfileForm({ guided = false, embedded = false, initialTab = "informations" }: { guided?: boolean; embedded?: boolean; initialTab?: "informations" | "objectifs" }) {
  const router = useRouter();
  const [profileTab, setProfileTab] = useState(initialTab);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [servingArea, setServingArea] = useState("");
  const [website, setWebsite] = useState("");
  const [socialHandles, setSocialHandles] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [certifications, setCertifications] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [ownerName, setOwnerName] = useState("");
  // « Corriger mon profil » (#169) : prénom, localisation, clients et offres, et l'origine de chaque information telle qu'enregistrée.
  const [firstName, setFirstName] = useState("");
  const [location, setLocation] = useState("");
  const [targetClients, setTargetClients] = useState("");
  const [offers, setOffers] = useState("");
  const [saved, setSaved] = useState<Partial<Record<CorrectionField, string>>>({});
  const [origins, setOrigins] = useState<ProfileOrigins | null>(null);
  const [invalidField, setInvalidField] = useState<CorrectionField | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [averageClientValue, setAverageClientValue] = useState("");
  const [newClientsPerMonth, setNewClientsPerMonth] = useState("");
  // Ambition retenue (#282) : sans CA visé, l'écart du chiffrage facultatif en part (D8).
  const [ambition, setAmbition] = useState<{ terms: unknown; confirmedAt: Date | null }>({ terms: null, confirmedAt: null });
  const [profileSentence, setProfileSentence] = useState("");
  const [profileInterpreted, setProfileInterpreted] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretationError, setInterpretationError] = useState<string | null>(null);
  const [missingAnswer, setMissingAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(true);

  // Pré-remplit le formulaire si l'entreprise existe déjà (page "Mon entreprise").
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        setIsNew(!c.name);
        setName(c.name ?? "");
        setTrade(c.trade ?? "");
        setServingArea(c.servingArea ?? "");
        setWebsite(c.website ?? "");
        setSocialHandles(c.socialHandles ?? "");
        setObjective(c.objective ?? "");
        setDescription(c.description ?? "");
        setPhone(c.phone ?? "");
        setCertifications(c.certifications ?? "");
        setOpeningHours(c.openingHours ?? "");
        setOwnerName(c.ownerName ?? "");
        setFirstName(c.firstName ?? "");
        setLocation(c.location ?? "");
        setTargetClients(c.targetClients ?? "");
        setOffers(c.offers ?? "");
        setSaved(Object.fromEntries(CORRECTION_FIELDS.map((field) => [field, typeof c[field] === "string" ? c[field] : ""])));
        setOrigins(readProfileOrigins(c.profileOrigins));
        setMonthlyRevenue(c.monthlyRevenue?.toString() ?? "");
        setRevenueTarget(c.revenueTarget?.toString() ?? "");
        setTargetDate(c.targetDate ? String(c.targetDate).slice(0, 7) : "");
        setAverageClientValue(c.averageClientValue?.toString() ?? "");
        setNewClientsPerMonth(c.newClientsPerMonth?.toString() ?? "");
        setAmbition({ terms: c.ambitionTerms ?? null, confirmedAt: c.ambitionConfirmedAt ? new Date(c.ambitionConfirmedAt) : null });
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  }, []);

  /** Origine d'un champ (#169), tant qu'il garde sa valeur enregistrée : un champ modifié sera « déclaré par vous ». */
  function originOf(field: CorrectionField, value: string): string | null {
    if (guided || !origins || value !== (saved[field] ?? "")) return null;
    return companyOriginLabel(origins[field]);
  }
  /** Description d'un champ : son origine, et le message du serveur s'il l'a refusé. */
  const originId = (field: CorrectionField, value: string) =>
    [originOf(field, value) ? `profile-origin-${field}` : null, invalidField === field ? "profile-error" : null].filter(Boolean).join(" ") || undefined;
  const invalid = (field: CorrectionField) => (invalidField === field ? true : undefined);
  const originNote = (field: CorrectionField, value: string) => {
    const label = originOf(field, value);
    return label ? <p id={`profile-origin-${field}`} className="-mt-2 text-xs text-[var(--bd-muted)]" data-origin={field}>Origine : {label}</p> : null;
  };

  const missingProfileFields = [
    { key: "name", label: "nom commercial", value: name },
    { key: "trade", label: "métier", value: trade },
    { key: "servingArea", label: "zone de chalandise", value: servingArea },
    { key: "objective", label: "objectif", value: objective },
  ];
  const nextMissingField = profileInterpreted
    ? missingProfileFields.find((field) => !field.value.trim())
    : undefined;

  async function interpretProfileSentence() {
    setInterpreting(true);
    setInterpretationError(null);
    try {
      const response = await fetch("/api/onboarding/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: profileSentence }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.profile) {
        throw new Error(data?.error ?? "Impossible d'interpréter cette phrase.");
      }
      setName(data.profile.name ?? "");
      setTrade(data.profile.trade ?? "");
      setServingArea(data.profile.servingArea ?? "");
      setObjective(data.profile.objective ?? "");
      setProfileInterpreted(true);
      setMissingAnswer("");
    } catch (error) {
      setInterpretationError(error instanceof Error ? error.message : "Interprétation indisponible.");
    } finally {
      setInterpreting(false);
    }
  }

  function addMissingProfileField() {
    if (!nextMissingField || !missingAnswer.trim()) return;
    const value = missingAnswer.trim();
    if (nextMissingField.key === "name") setName(value);
    if (nextMissingField.key === "trade") setTrade(value);
    if (nextMissingField.key === "servingArea") setServingArea(value);
    if (nextMissingField.key === "objective") setObjective(value);
    setMissingAnswer("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInvalidField(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trade,
          servingArea,
          website: website.trim(),
          socialHandles: socialHandles.trim(),
          // Absent, l'objectif reste tel qu'en base : seul l'ancien formulaire guidé le saisit encore.
          ...(guided ? { objective: objective.trim() } : {}),
          description: description.trim(),
          phone: phone.trim(),
          certifications: certifications.trim(),
          openingHours: openingHours.trim(),
          ownerName: ownerName.trim(),
          // Absents du formulaire guidé : ils restent tels qu'en base.
          ...(guided ? {} : { firstName: firstName.trim(), location: location.trim(), targetClients: targetClients.trim(), offers: offers.trim() }),
          monthlyRevenue: monthlyRevenue || null,
          revenueTarget: revenueTarget || null,
          // <input type="month"> renvoie "AAAA-MM" : on vise la fin du mois choisi.
          targetDate: targetDate ? new Date(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)), 0).toISOString() : null,
          averageClientValue: averageClientValue || null,
          newClientsPerMonth: newClientsPerMonth || null,
        }),
      });
      if (!res.ok) {
        // Champ refusé (#169) : le message du champ, le champ marqué et focalisé dans l'onglet « Informations ».
        const data = await res.json().catch(() => null);
        const field = typeof data?.field === "string" && (CORRECTION_FIELDS as readonly string[]).includes(data.field) ? (data.field as CorrectionField) : null;
        if (res.status === 400 && field && typeof data?.error === "string") {
          setInvalidField(field);
          if (!guided) setProfileTab("informations");
          requestAnimationFrame(() => document.getElementById(FIELD_INPUT_IDS[field])?.focus());
          throw new Error(data.error);
        }
        throw new Error("");
      }

      // Le premier audit de Martine est créé au plan et lancé par le serveur à la première création du profil.
      router.push("/dashboard");
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Impossible d'enregistrer ces informations, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  // Écart calculé avec les chiffres saisis (D8) : celui que Paul citera, jamais une estimation de sa part.
  const number = (value: string) => (value.trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value));
  const preview = computeBusinessTarget({
    monthlyRevenue: number(monthlyRevenue), revenueTarget: number(revenueTarget), averageClientValue: number(averageClientValue), newClientsPerMonth: number(newClientsPerMonth),
    targetDate: targetDate ? new Date(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)), 0) : null,
    ambitionTerms: ambition.terms, ambitionConfirmedAt: ambition.confirmedAt,
  });
  const previewGap = preview ? clientGapLabel(preview) : null;
  const gapPreview = preview
    ? `Écart calculé${preview.basis === "ambition" ? ` avec votre ambition (+${formatDecimal(preview.gainPercent ?? 0)} %)` : ""} : ${preview.gap >= 0 ? "+" : ""}${formatEuros(preview.gap)} par mois${previewGap ? `, ${previewGap.text}` : ""}.`
    : "Indiquez au moins votre chiffre d'affaires actuel pour calculer l'écart.";

  const content = (
      <div>
        {guided ? (
          <PageHeading kicker="BIENVENUE" title="Parlez-nous de votre activité" description="Moins de 5 minutes. Vous pourrez tout modifier plus tard." />
        ) : (
          <>
            <h2 id="corriger-mon-profil">Corriger mon profil</h2>
            <p className="legend">Paul prépare vos contenus à partir de ces informations.</p>
            <div className="tabs" role="group" aria-label="Rubriques de mon entreprise">
              {([["informations", "Informations"], ["objectifs", "Objectifs"]] as const).map(([tab, label]) => (
                <button key={tab} type="button" className={profileTab === tab ? "selected" : undefined} aria-current={profileTab === tab ? "page" : undefined} onClick={() => setProfileTab(tab)}>{label}</button>
              ))}
            </div>
          </>
        )}

        {guided && isNew && profileLoaded && (
          <section aria-label="Démarrer en une phrase" className="mt-5 border-y border-slate-200 py-4">
            <label htmlFor="profile-sentence" className="field">Décrivez votre activité et votre objectif en une phrase</label>
            <textarea
              id="profile-sentence"
              value={profileSentence}
              onChange={(event) => setProfileSentence(event.target.value)}
              maxLength={1200}
              rows={3}
              placeholder="Ex. Je suis plombière à Lille et je veux trouver 5 nouveaux clients par mois."
              
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Paul propose un profil à vérifier ; rien n&apos;est enregistré avant votre confirmation.</p>
              <button type="button" onClick={() => void interpretProfileSentence()} disabled={interpreting || profileSentence.trim().length < 8} className="primary">
                {interpreting ? "Lecture de votre phrase…" : "Préremplir mon profil"}
              </button>
            </div>
            {interpretationError && <p role="alert" className="mt-2 text-sm text-red-700">{interpretationError}</p>}
            {profileInterpreted && (
              <div aria-live="polite" className="mt-3 border-l-2 border-emerald-500 pl-3 text-sm text-slate-700">
                <p className="font-medium">Voici ce que j&apos;ai compris. Vérifiez et corrigez les champs avant d&apos;enregistrer.</p>
                {nextMissingField && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-48 flex-1 text-xs text-slate-600">
                      Information manquante : {nextMissingField.label}
                      <input value={missingAnswer} onChange={(event) => setMissingAnswer(event.target.value)}  />
                    </label>
                    <button type="button" onClick={addMissingProfileField} disabled={!missingAnswer.trim()} className="primary">Continuer</button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <form onSubmit={handleSubmit} onInvalidCapture={(event) => {
          if (guided) return;
          event.preventDefault();
          const field = event.target as HTMLInputElement;
          setProfileTab(field.closest("[data-profile-section]")?.getAttribute("data-profile-section") === "objectifs" ? "objectifs" : "informations");
          setError("Vérifiez le champ indiqué avant d’enregistrer.");
          requestAnimationFrame(() => field.focus());
        }} className="mt-6 flex flex-col gap-3">
          <fieldset disabled={!profileLoaded || loading} className="flex min-w-0 flex-col gap-3">
          <div id="chiffres" data-profile-section="objectifs" hidden={!guided && profileTab !== "objectifs"}>
          <div className="flex flex-col gap-3">
          {/* Dans Entreprise, l'ambition se modifie avec Paul (bloc « Votre ambition », #282) : plus de champ objectif ici. */}
          {guided && profileInterpreted && <>
            <label htmlFor="profile-objective" className="field">Quel est votre objectif principal ?</label>
            <input
              id="profile-objective"
              placeholder="ex: 10 nouveaux clients par mois"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
             
            />

          </>}
          {!guided && <>
            <fieldset className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <legend className="px-1 text-sm font-medium">Chiffrage facultatif</legend>
              <p className="mb-3 text-xs text-slate-500">
                Votre chiffre d&apos;affaires actuel et la valeur moyenne d&apos;un client suffisent : sans chiffre d&apos;affaires visé,
                l&apos;écart part de votre ambition. Déclaratif et approximatif, ça suffit. BienDecider calcule l&apos;écart et le nombre de clients à aller chercher,
                puis mesure si ses actions vous en rapprochent. Ces chiffres servent à préparer votre travail avec nos prestataires
                d&apos;IA ; ils ne sont pas publiés. Les informations de présentation de votre entreprise peuvent figurer
                dans un contenu que vous approuvez avant publication.{" "}
                <a href="/confidentialite#traitement" className="underline">Voir la politique de confidentialité</a>.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label htmlFor="profile-revenue" className="field">
                  Chiffre d&apos;affaires mensuel actuel (€ par mois)
                  <input
                    id="profile-revenue"
                    type="number"
                    min={0}
                    placeholder="CA mensuel actuel (€)"
                    value={monthlyRevenue}
                    onChange={(e) => setMonthlyRevenue(e.target.value)}
                   
                  />
                </label>
                <label htmlFor="profile-client-value" className="field">
                  Valeur moyenne d&apos;un client (€ au total)
                  <input
                    id="profile-client-value"
                    type="number"
                    min={0}
                    placeholder="Valeur moyenne d'un client (€)"
                    value={averageClientValue}
                    onChange={(e) => setAverageClientValue(e.target.value)}
                   
                  />
                </label>
                <label htmlFor="profile-revenue-target" className="field">
                  Chiffre d&apos;affaires mensuel visé (€ par mois)
                  <input
                    id="profile-revenue-target"
                    type="number"
                    min={0}
                    placeholder="CA mensuel visé (€)"
                    value={revenueTarget}
                    onChange={(e) => setRevenueTarget(e.target.value)}
                   
                  />
                </label>
                <label className="field">
                  Échéance (mois visé)
                  <input
                    type="month"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                   
                  />
                </label>
                <label htmlFor="profile-new-clients" className="field" style={{ gridColumn: "1 / -1" }}>
                  Nouveaux clients par mois aujourd&apos;hui (nombre par mois)
                  <input
                    id="profile-new-clients"
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    placeholder="Nouveaux clients par mois aujourd'hui"
                    value={newClientsPerMonth}
                    onChange={(e) => setNewClientsPerMonth(e.target.value)}
                   
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Valeur d&apos;un client = ce qu&apos;il vous rapporte en tout (pas un seul achat) — pour une activité
                récurrente, comptez la durée de la relation.
              </p>
              <p className="mt-2 text-sm" data-testid="gap-preview">{gapPreview}</p>
            </fieldset>
          </>}

          </div>
          </div>
          <div data-profile-section="informations" hidden={!guided && profileTab !== "informations"}>
          <div className="flex flex-col gap-3">
          {!guided && <>
            <label htmlFor="profile-first-name" className="field">Prénom (facultatif)</label>
            <input id="profile-first-name" autoComplete="given-name" maxLength={CORRECTION_LIMITS.firstName} aria-invalid={invalid("firstName")} aria-describedby={originId("firstName", firstName)} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            {originNote("firstName", firstName)}
          </>}

          <label htmlFor="profile-name" className="field">{guided ? "Nom commercial" : "Entreprise"}</label>
          <input
            id="profile-name"
            required
            placeholder="Nom commercial"
            maxLength={guided ? undefined : CORRECTION_LIMITS.name}
            aria-invalid={invalid("name")} aria-describedby={originId("name", name)}
            value={name}
            onChange={(e) => setName(e.target.value)}

          />
          {originNote("name", name)}

          {!guided && <>
            <label htmlFor="profile-location" className="field">Localisation (facultatif)</label>
            <input id="profile-location" placeholder="ex: Lyon 7e" maxLength={CORRECTION_LIMITS.location} aria-invalid={invalid("location")} aria-describedby={originId("location", location)} value={location} onChange={(e) => setLocation(e.target.value)} />
            {originNote("location", location)}
          </>}

          <TradeCombobox value={trade} onChange={setTrade} label={guided ? undefined : "Activité"} invalid={invalid("trade")} describedBy={originId("trade", trade)} />
          {originNote("trade", trade)}

          <label htmlFor="profile-area" className="field">{guided ? "Zone de chalandise (là où vous trouvez vos clients)" : "Zone (là où vous trouvez vos clients)"}</label>
          <input
            id="profile-area"
            required
            placeholder="Zone de chalandise (ex: Lyon et alentours)"
            maxLength={guided ? undefined : CORRECTION_LIMITS.servingArea}
            aria-invalid={invalid("servingArea")} aria-describedby={originId("servingArea", servingArea)}
            value={servingArea}
            onChange={(e) => setServingArea(e.target.value)}

          />
          {originNote("servingArea", servingArea)}

          {!guided && <>
            <label htmlFor="profile-target-clients" className="field">Vos clients (facultatif)</label>
            <input id="profile-target-clients" placeholder="ex: Particuliers, familles, entreprises" maxLength={CORRECTION_LIMITS.targetClients} aria-invalid={invalid("targetClients")} aria-describedby={originId("targetClients", targetClients)} value={targetClients} onChange={(e) => setTargetClients(e.target.value)} />
            {originNote("targetClients", targetClients)}
            <label htmlFor="profile-offers" className="field">Ce que vous proposez (facultatif)</label>
            <input id="profile-offers" placeholder="Vos principaux produits ou services" maxLength={CORRECTION_LIMITS.offers} aria-invalid={invalid("offers")} aria-describedby={originId("offers", offers)} value={offers} onChange={(e) => setOffers(e.target.value)} />
            {originNote("offers", offers)}
          </>}

          {/* L'onboarding guidé garde ses trois champs (refonte UX) : le nom se saisit dans Entreprise ou via Paul, qui le demande dès qu'un email est en jeu. */}
          {!guided && <>
            <label htmlFor="profile-owner-name" className="field">
              {PROFILE_FIELD_LABELS.ownerName} (facultatif)
              <input
                id="profile-owner-name"
                autoComplete="name"
                aria-describedby="profile-owner-name-help"
                maxLength={PROFILE_TEXT_LIMITS.ownerName}
                placeholder="ex: Samuel Morel"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </label>
            <p id="profile-owner-name-help" className="-mt-1 text-xs text-slate-600">
              Vos agents signent de ce nom les emails qu&apos;ils préparent pour vous.
            </p>
          </>}

          {!guided && <>
            <label htmlFor="profile-description" className="field">
              {PROFILE_FIELD_LABELS.description}
            </label>
            <textarea
              id="profile-description"
              placeholder="ex: Cabinet familial depuis 15 ans, spécialisé en rééducation sportive, accueil chaleureux et sans attente..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
             
            />
            <p className="-mt-1 text-xs text-slate-600">
              Utilisé par tous les agents pour écrire dans votre ton — inutile de choisir un style dans une liste.
            </p>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label htmlFor="profile-phone" className="field">
                {PROFILE_FIELD_LABELS.phone} (facultatif)
                <input
                  id="profile-phone"
                  placeholder="Téléphone affiché aux clients (optionnel)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                 
                />
              </label>
              <label htmlFor="profile-certifications" className="field">
                Certifications et labels (facultatif)
                <input
                  id="profile-certifications"
                  placeholder="Certifications / labels (ex: RGE, optionnel)"
                  value={certifications}
                  onChange={(e) => setCertifications(e.target.value)}
                 
                />
              </label>
            </div>
            <label htmlFor="profile-hours" className="field">{PROFILE_FIELD_LABELS.openingHours} (facultatif)</label>
            <input
              id="profile-hours"
              placeholder="Horaires d'ouverture (optionnel)"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
             
            />
            <label htmlFor="profile-website" className="field">{PROFILE_FIELD_LABELS.website} (facultatif)</label>
            <input
              id="profile-website"
              placeholder="Site web (optionnel — beaucoup de TPE n'en ont pas)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
             
            />
            <label htmlFor="profile-social" className="field">{PROFILE_FIELD_LABELS.socialHandles} (facultatif)</label>
            <input
              id="profile-social"
              placeholder="Compte Instagram/Facebook (optionnel, ex: @cabinet_demo)"
              value={socialHandles}
              onChange={(e) => setSocialHandles(e.target.value)}
             
            />

          </>}
          </div>
          </div>
          {!guided && !isNew && <p id="profile-correction-effects" className="text-sm text-[var(--bd-muted)]">Vos contenus en cours seront à relire et leurs programmations annulées.</p>}
          <button
            type="submit"
            aria-describedby={!guided && !isNew ? "profile-correction-effects" : undefined}
            disabled={loading || !profileLoaded}
            className="primary"
          >
            {loading ? "Enregistrement…" : isNew ? "Valider et lancer mon audit" : "Enregistrer"}
          </button>
          {error && <p id="profile-error" role="alert" className="text-sm text-red-600">{error}</p>}
          </fieldset>
        </form>
      </div>
  );

  if (embedded) return content;
  return <AppShell paul={!guided} companyName={guided ? undefined : name}>{content}</AppShell>;
}