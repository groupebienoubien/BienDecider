import { currentSignupAvailability } from "@/lib/signup-control";
import { SIGNUP_CLOSED_MESSAGE, SIGNUP_FULL_MESSAGE } from "@/lib/signup-rules";
import { requireDraftPage } from "./guard";
import { WelcomeFrame } from "./welcome-frame";
import { AmbitionForm, DiscoveryForm, ProfileForm } from "./step-forms";

/** Étapes 1 à 3 du parcours d'entrée (#279) : découverte, premiers constats, ambition. */
export default async function WelcomePage() {
  const state = await requireDraftPage("/bienvenue");
  if (state.step === 1) {
    // Inscriptions fermées ou complètes : le visiteur le sait dès l'étape 1, le formulaire reste utilisable.
    const availability = await currentSignupAvailability();
    return (
      <WelcomeFrame step={1} intro={<p>Quelques mots sur votre entreprise pour commencer. Aucun compte n&apos;est créé à cette étape.</p>}>
        {availability !== "open" && (
          <div role="status" className="mb-6 rounded-lg border border-[var(--bd-line-strong)] bg-[var(--bd-attention-light)] p-4 text-sm font-semibold text-[var(--bd-ink)]">
            <p>{availability === "closed" ? SIGNUP_CLOSED_MESSAGE : SIGNUP_FULL_MESSAGE}</p>
          </div>
        )}
        <DiscoveryForm key="discover" profile={state.profile} />
      </WelcomeFrame>
    );
  }
  if (state.step === 2) {
    return (
      <WelcomeFrame step={2} intro={<p>{state.profile.firstName}, décrivez en quelques mots l&apos;activité de {state.profile.companyName}. Complétez ou corrigez, puis confirmez.</p>}>
        <ProfileForm key="profile" profile={state.profile} />
      </WelcomeFrame>
    );
  }
  return (
    <WelcomeFrame step={3} intro={<p>Dites, avec vos mots, ce que vous voulez voir changer pour {state.profile.companyName}.</p>}>
      <AmbitionForm key="ambition" ambition={state.ambition ?? ""} />
    </WelcomeFrame>
  );
}
