import { requireDraftPage } from "../guard";
import { WelcomeFrame } from "../welcome-frame";
import { InterestButton } from "../step-forms";
import { starterMissions } from "@/lib/onboarding/draft-rules";

/** Étape 4 (#279) : le cap et trois missions tirées du catalogue ; rien n'est lancé. */
export default async function WelcomeMissionsPage() {
  const state = await requireDraftPage("/bienvenue/missions");
  const missions = starterMissions(state.profile, state.ambition?.text ?? "");
  return (
    <WelcomeFrame step={4} intro={<p>Voici trois premières missions pour {state.profile.companyName}. Elles arriveront « À décider » dans votre stratégie : aucune n&apos;est lancée sans vous.</p>}>
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border-l-4 border-[var(--bd-accent)] bg-[var(--bd-cream)] p-4">
          <h2 className="text-sm font-semibold text-[var(--bd-ink)]">Votre cap</h2>
          <p className="mt-1 break-words text-base text-[var(--bd-ink)]">{state.ambition?.text}</p>
        </div>
        <ol className="flex flex-col gap-3" aria-label="Trois premières pistes">
          {missions.map((mission) => (
            <li key={mission.template} className="rounded-lg border border-[var(--bd-line)] bg-white p-4">
              <h2 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--bd-ink)]">{mission.title}</h2>
              <p className="mt-1 break-words text-sm text-[var(--bd-ink)]">{mission.finding}</p>
              <p className="mt-2 text-sm text-[var(--bd-ink)]"><span className="font-semibold">Résultat recherché :</span> {mission.outcome}</p>
            </li>
          ))}
        </ol>
        <InterestButton />
      </div>
    </WelcomeFrame>
  );
}
