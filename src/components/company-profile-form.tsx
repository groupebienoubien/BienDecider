"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TradeCombobox } from "@/components/trade-combobox";
import { PageHeading } from "@/components/mockup-ui";

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
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [averageClientValue, setAverageClientValue] = useState("");
  const [newClientsPerMonth, setNewClientsPerMonth] = useState("");
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
        setMonthlyRevenue(c.monthlyRevenue?.toString() ?? "");
        setRevenueTarget(c.revenueTarget?.toString() ?? "");
        setTargetDate(c.targetDate ? String(c.targetDate).slice(0, 7) : "");
        setAverageClientValue(c.averageClientValue?.toString() ?? "");
        setNewClientsPerMonth(c.newClientsPerMonth?.toString() ?? "");
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  }, []);

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
          objective: objective.trim(),
          description: description.trim(),
          phone: phone.trim(),
          certifications: certifications.trim(),
          openingHours: openingHours.trim(),
          monthlyRevenue: monthlyRevenue || null,
          revenueTarget: revenueTarget || null,
          // <input type="month"> renvoie "AAAA-MM" : on vise la fin du mois choisi.
          targetDate: targetDate ? new Date(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)), 0).toISOString() : null,
          averageClientValue: averageClientValue || null,
          newClientsPerMonth: newClientsPerMonth || null,
        }),
      });
      if (!res.ok) throw new Error();

      // Le premier audit de Martine est créé au plan et lancé par le serveur à la première création du profil.
      router.push("/dashboard");
    } catch {
      setError("Impossible d'enregistrer ces informations, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const content = (
      <div id="modifier">
        {guided ? (
          <PageHeading kicker="BIENVENUE" title="Parlez-nous de votre activité" description="Moins de 5 minutes. Vous pourrez tout modifier plus tard." />
        ) : (
          <>
            <h2>Modifier les informations</h2>
            <p className="legend">Modifiez ces informations à tout moment — elles orientent directement vos agents.</p>
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
          <div data-profile-section="objectifs" hidden={!guided && profileTab !== "objectifs"}>
          <div className="flex flex-col gap-3">
          {(!guided || profileInterpreted) && <>
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
              <legend className="px-1 text-sm font-medium">Votre objectif en chiffres</legend>
              <p className="mb-3 text-xs text-slate-500">
                Déclaratif et approximatif, ça suffit. BienDecider calcule l&apos;écart et le nombre de clients à aller chercher,
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
                <label htmlFor="profile-new-clients" className="field" style={{ gridColumn: "1 / -1" }}>
                  Nouveaux clients par mois aujourd&apos;hui (nombre par mois)
                  <input
                    id="profile-new-clients"
                    type="number"
                    min={0}
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
            </fieldset>
          </>}

          </div>
          </div>
          <div data-profile-section="informations" hidden={!guided && profileTab !== "informations"}>
          <div className="flex flex-col gap-3">
          <label htmlFor="profile-name" className="field">Nom commercial</label>
          <input
            id="profile-name"
            required
            placeholder="Nom commercial"
            value={name}
            onChange={(e) => setName(e.target.value)}
           
          />

          <TradeCombobox value={trade} onChange={setTrade} />

          <label htmlFor="profile-area" className="field">Zone de chalandise (là où vous trouvez vos clients)</label>
          <input
            id="profile-area"
            required
            placeholder="Zone de chalandise (ex: Lyon et alentours)"
            value={servingArea}
            onChange={(e) => setServingArea(e.target.value)}
           
          />

          {!guided && <>
            <label htmlFor="profile-description" className="field">
              Décrivez votre entreprise, votre savoir-faire et ce qui vous différencie
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
                Téléphone affiché aux clients (facultatif)
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
            <label htmlFor="profile-hours" className="field">Horaires d&apos;ouverture (facultatif)</label>
            <input
              id="profile-hours"
              placeholder="Horaires d'ouverture (optionnel)"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
             
            />
            <label htmlFor="profile-website" className="field">Site web (facultatif)</label>
            <input
              id="profile-website"
              placeholder="Site web (optionnel — beaucoup de TPE n'en ont pas)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
             
            />
            <label htmlFor="profile-social" className="field">Compte Instagram ou Facebook (facultatif)</label>
            <input
              id="profile-social"
              placeholder="Compte Instagram/Facebook (optionnel, ex: @cabinet_demo)"
              value={socialHandles}
              onChange={(e) => setSocialHandles(e.target.value)}
             
            />

          </>}
          </div>
          </div>
          <button
            type="submit"
            disabled={loading || !profileLoaded}
            className="primary"
          >
            {loading ? "Enregistrement…" : isNew ? "Valider et lancer mon audit" : "Enregistrer"}
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </fieldset>
        </form>
      </div>
  );

  if (embedded) return content;
  return <AppShell paul={!guided} companyName={guided ? undefined : name}>{content}</AppShell>;
}