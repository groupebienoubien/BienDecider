import Link from "next/link";
import { currentSignupAvailability } from "@/lib/signup-control";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE } from "@/lib/signup-rules";
import { analysisMatchesProfile, prefillFromPaul, prefillProfile, prefillWebsite } from "@/lib/onboarding/draft-rules";
import { analysisView, limitedStepNotice, type DraftAnalysis, type Finding, type FirstFinding } from "@/lib/onboarding/analysis-rules";
import { CERTAINTY_LABELS } from "@/lib/findings/certainty";
import { VISIT_TRACE_NOTICE } from "@/lib/onboarding/visit-trace-rules";
import { requireDraftPage } from "./guard";
import { WelcomeFrame } from "./welcome-frame";
import { AmbitionForm, DiscoveryStep, ProfileForm } from "./step-forms";

const readDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso));

function sourceName(source: string): string {
  try {
    const url = new URL(source);
    return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) ? "votre fiche Google" : url.hostname.replace(/^www\./, "");
  } catch {
    return "une page publique";
  }
}

function observedLine(finding: Finding<unknown>): string {
  return finding.provenance.kind === "observed" ? `Observé sur ${sourceName(finding.provenance.source)} le ${readDate(finding.provenance.readAt)}` : "Hypothèse de Paul";
}

/** Premiers constats (FR-6) : certitude, fait, conséquence possible, source et date ; une piste n'a jamais de source. */
function FirstFindings({ constats }: { constats: FirstFinding[] }) {
  if (!constats.length) return null;
  return (
    <section aria-labelledby="constats-title" className="mb-6 flex flex-col gap-3">
      <h2 id="constats-title" className="text-base font-semibold text-[var(--bd-ink)]">Vos premiers constats</h2>
      <ul className="flex flex-col gap-3">
        {constats.map((constat) => (
          <li key={constat.fact} className="flex flex-col gap-1 rounded-lg border border-[var(--bd-line-strong)] bg-white p-4 text-sm text-[var(--bd-ink)]">
            <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${constat.certainty === "observe" ? "bg-[var(--bd-brand-light)] text-[var(--bd-brand)]" : "bg-[var(--bd-attention-light)] text-[var(--bd-ink)]"}`}>
              {CERTAINTY_LABELS[constat.certainty]}
            </span>
            <p className="font-semibold">{constat.fact}</p>
            <p>Conséquence possible : {constat.consequence}</p>
            <p className="text-[var(--bd-muted)]">
              {constat.source && constat.readAt
                ? <>Lu sur <a href={constat.source} target="_blank" rel="noopener noreferrer" className="underline">{sourceName(constat.source)}</a> le {readDate(constat.readAt)}</>
                : "Déduction de Paul, sans source directe : à confirmer avec vous."}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ce que l'analyse a observé (source et date de lecture) ; rien n'est présenté comme observé sans avoir été lu. */
function ObservedFindings({ analysis, guessed }: { analysis: DraftAnalysis; guessed: boolean }) {
  const { contacts, palette, google, pages, publicSources = [], readLimitations = [] } = analysis.findings;
  if (!contacts.length && !palette && !google && !pages.length && !publicSources.length && !readLimitations.length) return null;
  return (
    <section aria-labelledby="observed-title" className="mb-6 flex flex-col gap-3 rounded-lg bg-[var(--bd-cream)] p-4">
      <h2 id="observed-title" className="text-base font-semibold text-[var(--bd-ink)]">Ce que Paul a observé</h2>
      <ul className="flex flex-col gap-2 text-sm text-[var(--bd-ink)]">
        {pages.map((page, index) => (
          <li key={page.url}>
            <a href={page.url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-[var(--bd-brand)] underline">
              {index === 0 ? "Site lu" : "Page consultée"} : {sourceName(page.url)}
            </a>
            <span className="block text-[var(--bd-muted)]">
              Consulté le {readDate(page.readAt)}{index === 0 ? ". Vérifiez ci-dessous qu'il s'agit bien du vôtre." : "."}
            </span>
          </li>
        ))}
        {readLimitations.map((limitation) => (
          <li key={`${limitation.url}:${limitation.reason}`} className="break-all">
            <a href={limitation.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--bd-brand)] underline">
              Page non lue : {sourceName(limitation.url)}
            </a>
            <span className="block text-[var(--bd-muted)]">
              {limitation.reason === "pdf" && "Document PDF non lu."}
              {limitation.reason === "other_host" && "Page sur un autre hôte, non lue."}
              {limitation.reason === "not_selected" && "Page pertinente hors de la sélection bornée."}
              {limitation.reason === "unreadable" && "Page illisible ou inaccessible."}
              {limitation.reason === "dynamic" && "Contenu probablement dynamique, lecture partielle."}
            </span>
          </li>
        ))}
        {google && (
          <li>
            <a href={google.value} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--bd-brand)] underline">Fiche Google repérée, à vérifier</a>
            <span className="block text-[var(--bd-muted)]">{observedLine(google)}</span>
          </li>
        )}
        {publicSources.map((candidate) => (
          <li key={`${candidate.platform}:${candidate.url}`} className="break-all">
            <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--bd-brand)] underline">
              {candidate.platform === "website" ? "Site candidat" : `Profil ${candidate.platform} candidat`} : {candidate.url}
            </a>
            <span className="block text-[var(--bd-muted)]">
              Repéré sur {sourceName(candidate.source)}, le {readDate(candidate.readAt)}. À confirmer ou écarter.
            </span>
          </li>
        ))}
        {contacts.map((contact) => (
          <li key={contact.value} className="break-words">
            <span className="font-semibold">Contact public : {contact.value}</span>
            <span className="block text-[var(--bd-muted)]">{observedLine(contact)}</span>
          </li>
        ))}
        {palette && (
          <li>
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              Couleurs de votre site
              {palette.value.map((color) => <span key={color} aria-hidden="true" className="inline-block h-5 w-5 rounded-full border border-[var(--bd-line-strong)]" style={{ backgroundColor: color }} />)}
              <span className="sr-only">{palette.value.join(", ")}</span>
            </span>
            <span className="block text-[var(--bd-muted)]">{observedLine(palette)}</span>
          </li>
        )}
      </ul>
      {guessed && <p className="text-sm text-[var(--bd-muted)]">Chaque champ ci-dessous indique d&apos;où vient sa valeur : rien n&apos;est retenu avant votre confirmation.</p>}
    </section>
  );
}

/** Étapes 1 à 3 du parcours d'entrée (#279) : découverte (et son analyse publique, #280), premiers constats, ambition. */
export default async function WelcomePage() {
  const state = await requireDraftPage("/bienvenue");
  if (state.step === 1) {
    // Inscriptions fermées ou complètes : le visiteur le sait dès l'étape 1, le formulaire reste utilisable.
    const availability = await currentSignupAvailability();
    return (
      <WelcomeFrame step={1} intro={<p>Quelques mots sur votre entreprise pour commencer. Paul lit ce qui est public, puis vous montre ce qu&apos;il a compris. Aucun compte n&apos;est créé à cette étape.</p>}>
        {availability !== "open" && (
          <div role="status" className="mb-6 rounded-lg border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-4 text-sm font-semibold text-[var(--bd-ink)]">
            <p>{availability === "closed" ? SIGNUP_CLOSED_MESSAGE : SIGNUP_FULL_MESSAGE}</p>
          </div>
        )}
        <DiscoveryStep key="discover" profile={state.profile} analysis={analysisView(state.analysis)} />
        {/* FR-60 (#311) : la trace anonyme est annoncée dès l'étape 1. */}
        <p className="mt-6 text-sm text-[var(--bd-muted)]">
          {VISIT_TRACE_NOTICE} <Link href="/confidentialite#trace-visites" className="underline">Ce que nous gardons, et combien de temps</Link>
        </p>
      </WelcomeFrame>
    );
  }
  if (state.step === 2) {
    const prefill = prefillProfile(state);
    const guessed = prefillFromPaul(prefill);
    const analysis = analysisMatchesProfile(state) ? state.analysis : null;
    return (
      <WelcomeFrame step={2} intro={<p>{state.profile.firstName}, {guessed ? `voici ce que Paul a compris de ${state.profile.companyName}. Vérifiez, corrigez ou complétez, puis confirmez.` : `décrivez en quelques mots l'activité de ${state.profile.companyName}. Complétez ou corrigez, puis confirmez.`}</p>}>
        {analysis?.status === "limited" && (
          <p role="status" className="mb-6 rounded-lg border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-4 text-sm font-semibold text-[var(--bd-ink)]">
            {limitedStepNotice(analysis.limit)}
          </p>
        )}
        {analysis?.constats && <FirstFindings constats={analysis.constats} />}
        {analysis && <ObservedFindings analysis={analysis} guessed={guessed} />}
        <p className="mb-4 text-sm text-[var(--bd-muted)]">Cette première lecture couvre le site et les informations Google accessibles. Les publications Facebook, Instagram et LinkedIn ne sont pas analysées à cette étape.</p>
        <ProfileForm
          key="profile"
          prefill={prefill}
          website={prefillWebsite(state)}
          publicSources={analysis?.findings.publicSources ?? []}
          socialSourceDecisions={state.socialSourceDecisions}
        />
      </WelcomeFrame>
    );
  }
  return (
    <WelcomeFrame step={3} intro={<p>Dites, avec vos mots, ce que vous voulez voir changer pour {state.profile.companyName}.</p>}>
      <AmbitionForm key="ambition" ambition={state.ambition?.text ?? ""} />
    </WelcomeFrame>
  );
}
