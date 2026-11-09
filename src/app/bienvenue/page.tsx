import { currentSignupAvailability } from "@/lib/signup-control";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE } from "@/lib/signup-rules";
import { prefillFromPaul, prefillProfile } from "@/lib/onboarding/draft-rules";
import { analysisView, limitedStepNotice, type DraftAnalysis, type Finding } from "@/lib/onboarding/analysis-rules";
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

/** Ce que l'analyse a observé (source et date de lecture) ; rien n'est présenté comme observé sans avoir été lu. */
function ObservedFindings({ analysis, guessed }: { analysis: DraftAnalysis; guessed: boolean }) {
  const { contacts, palette, google } = analysis.findings;
  if (!contacts.length && !palette && !google) return null;
  return (
    <section aria-labelledby="observed-title" className="mb-6 flex flex-col gap-3 rounded-lg bg-[var(--bd-cream)] p-4">
      <h2 id="observed-title" className="text-base font-semibold text-[var(--bd-ink)]">Ce que Paul a observé</h2>
      <ul className="flex flex-col gap-2 text-sm text-[var(--bd-ink)]">
        {google && (
          <li>
            <a href={google.value} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--bd-brand)] underline">Votre fiche Google</a>
            <span className="block text-[var(--bd-muted)]">{observedLine(google)}</span>
          </li>
        )}
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
      </WelcomeFrame>
    );
  }
  if (state.step === 2) {
    const prefill = prefillProfile(state);
    const guessed = prefillFromPaul(prefill);
    return (
      <WelcomeFrame step={2} intro={<p>{state.profile.firstName}, {guessed ? `voici ce que Paul a compris de ${state.profile.companyName}. Vérifiez, corrigez ou complétez, puis confirmez.` : `décrivez en quelques mots l'activité de ${state.profile.companyName}. Complétez ou corrigez, puis confirmez.`}</p>}>
        {state.analysis?.status === "limited" && (
          <p role="status" className="mb-6 rounded-lg border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-4 text-sm font-semibold text-[var(--bd-ink)]">
            {limitedStepNotice(state.analysis.limit)}
          </p>
        )}
        {state.analysis && <ObservedFindings analysis={state.analysis} guessed={guessed} />}
        <ProfileForm key="profile" prefill={prefill} />
      </WelcomeFrame>
    );
  }
  return (
    <WelcomeFrame step={3} intro={<p>Dites, avec vos mots, ce que vous voulez voir changer pour {state.profile.companyName}.</p>}>
      <AmbitionForm key="ambition" ambition={state.ambition?.text ?? ""} />
    </WelcomeFrame>
  );
}
