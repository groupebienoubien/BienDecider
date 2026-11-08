import { requireDraftPage } from "../guard";
import { WelcomeFrame } from "../welcome-frame";
import { InterestButton } from "../step-forms";
import { FIRST_BADGE, starterPlan } from "@/lib/onboarding/draft-rules";
import { RESPONSIBLE_LABELS } from "@/lib/missions/rules";

/**
 * Étape 4 (#284, FR-8) : le rappel de l'entreprise et du cap, « Ce que nous retenons », puis trois missions fondées sur le
 * profil confirmé, l'analyse et l'ambition. Aucun appel de modèle ici : « Ce que nous retenons » a été écrit au clic
 * « C'est bien ça » (ou vient des règles). Rien n'est créé ni lancé avant le compte.
 */
export default async function WelcomeMissionsPage() {
  const state = await requireDraftPage("/bienvenue/missions");
  const { recap, retained, missions } = starterPlan(state);
  return (
    <WelcomeFrame step={4} intro={<p>Voici trois premières pistes pour {recap.companyName}. Elles arriveront « À décider » dans votre stratégie : aucune n&apos;est lancée sans vous.</p>}>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="recap-title" className="rounded-lg bg-[var(--bd-cream)] p-4">
          <h2 id="recap-title" className="text-sm font-semibold text-[var(--bd-ink)]">Votre entreprise</h2>
          <p className="mt-1 break-words text-base text-[var(--bd-ink)]">
            <strong>{recap.companyName}</strong>{recap.details.length > 0 && <>, {recap.details.join(" · ")}</>}
          </p>
          <h2 className="mt-3 text-sm font-semibold text-[var(--bd-ink)]">Votre cap</h2>
          <p className="mt-1 break-words border-l-4 border-[var(--bd-accent)] pl-3 text-base text-[var(--bd-ink)]">{recap.cap}</p>
          {recap.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--bd-ink)]">
              {recap.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
        </section>

        <section aria-labelledby="retained-title">
          <h2 id="retained-title" className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--bd-ink)]">Ce que nous retenons</h2>
          <div className="mt-2 flex flex-col gap-2 text-base text-[var(--bd-ink)]">
            {retained.map((sentence, index) => <p key={index} className="break-words">{sentence}</p>)}
          </div>
        </section>

        <ol className="flex flex-col gap-3" aria-label="Trois premières pistes">
          {missions.map((mission) => (
            <li key={mission.template} className="min-w-0 rounded-lg border border-[var(--bd-line)] bg-white p-4">
              {mission.first && (
                <p className="mb-2 inline-block rounded-full border-l-4 border-[var(--bd-accent)] bg-[var(--bd-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--bd-accent-ink)]">{FIRST_BADGE}</p>
              )}
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--bd-ink)]">{mission.title}</h3>
              <p className="mt-1 break-words text-sm text-[var(--bd-ink)]">
                {mission.finding} <span className="text-[var(--bd-muted)]">· {mission.origin}</span>
              </p>
              <dl className="mt-2 grid gap-1 text-sm text-[var(--bd-ink)] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                <dt className="font-semibold">Résultat recherché</dt><dd className="break-words">{mission.outcome}</dd>
                <dt className="font-semibold">Périmètre proposé</dt><dd className="break-words">{mission.scopeLabel}</dd>
              </dl>
              <details className="mt-2 text-sm text-[var(--bd-ink)]">
                <summary className="cursor-pointer font-semibold">Pourquoi cette piste</summary>
                <p className="mt-1 break-words">{mission.deduction}</p>
                <p className="mt-1 break-words"><span className="font-semibold">Préparée par :</span> {RESPONSIBLE_LABELS[mission.responsibleAgent]}</p>
                <p className="mt-1 break-words"><span className="font-semibold">Risque ou limite :</span> {mission.risk}</p>
              </details>
            </li>
          ))}
        </ol>
        <InterestButton />
      </div>
    </WelcomeFrame>
  );
}
