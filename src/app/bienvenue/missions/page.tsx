import { requireDraftPage } from "../guard";
import { WelcomeFrame } from "../welcome-frame";
import { InterestButton, MarketCompetitors } from "../step-forms";
import { MissionsIntelligenceWatcher } from "./missions-waiting";
import { FIRST_BADGE, matchingIntelligence, starterFacts, starterPlan } from "@/lib/onboarding/draft-rules";
import { intelligenceRunning, intelligenceView } from "@/lib/onboarding/intelligence-rules";
import { safeSourceUrl } from "@/lib/findings/certainty";
import { RESPONSIBLE_LABELS } from "@/lib/missions/rules";
import { MISSION_TEMPLATES } from "@/lib/missions/templates";
import { MissionEvidenceList } from "@/components/mission-evidence";

/**
 * Étape 4 (#284, FR-8, #361-#364, #371) : le rappel de l'entreprise et du cap, « Ce que nous retenons », puis jusqu'à trois missions
 * fondées sur le profil confirmé, l'analyse, l'ambition et, quand elle a abouti, une recherche réelle de marché lancée
 * à la confirmation de l'ambition (étape 3). Aucun appel de modèle ici au chargement : la recherche tourne en tâche de
 * fond, cette page affiche l'attente puis se rafraîchit. Rien n'est créé ni lancé avant le compte.
 */
export default async function WelcomeMissionsPage() {
  const state = await requireDraftPage("/bienvenue/missions");
  if (intelligenceRunning(state.intelligence)) {
    return (
      <WelcomeFrame step={4} intro={<p>Nous terminons la recherche et la préparation des missions pour {state.profile.companyName} avant de vous présenter les pistes.</p>}>
        <MissionsIntelligenceWatcher initial={intelligenceView(state.intelligence)} />
      </WelcomeFrame>
    );
  }
  const { recap, retained, missions } = starterPlan(state);
  const intelligence = matchingIntelligence(state);
  const competitors = starterFacts(intelligence).competitors.filter((competitor) => safeSourceUrl(competitor.source));
  return (
    <WelcomeFrame step={4} intro={<p>{missions.length > 0 ? `${missions.length} ${missions.length === 1 ? "mission proposée" : "missions proposées"} pour ${recap.companyName}. Vous choisirez laquelle lancer.` : `Pas encore de mission étayée pour ${recap.companyName}. Précisez votre priorité avec Paul.`}</p>}>
      <div className="flex flex-col gap-6">
        <MissionsIntelligenceWatcher initial={intelligenceView(intelligence)} />
        {!intelligence?.planning && state.ambition?.planningVersion !== 1 && (
          <p role="status" className="rounded-md border border-[var(--bd-line)] p-3 text-sm text-[var(--bd-ink)]">
            Ces pistes proviennent de l&apos;ancienne préparation. Revenez à l&apos;étape Ambition et confirmez votre objectif pour obtenir les missions issues de la nouvelle analyse.
          </p>
        )}
        <section aria-labelledby="recap-title" className="border-b border-[var(--bd-line)] pb-4">
          <h2 id="recap-title" className="text-sm font-semibold text-[var(--bd-ink)]">Votre cap</h2>
          <p className="mt-1 break-words border-l-4 border-[var(--bd-accent)] pl-3 text-base text-[var(--bd-ink)]">{recap.cap}</p>
          {recap.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--bd-ink)]">
              {recap.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
        </section>

        {missions.length > 0 && <ol className="flex flex-col gap-3" aria-label="Missions proposées">
          {missions.map((mission) => (
            <li key={mission.template} className="min-w-0 rounded-lg border border-[var(--bd-line)] bg-white p-4">
              {mission.first && (
                <p className="mb-2 inline-block rounded-full border-l-4 border-[var(--bd-accent)] bg-[var(--bd-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--bd-accent-ink)]">{FIRST_BADGE}</p>
              )}
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--bd-ink)]">{mission.title}</h3>
              <dl className="mt-2 grid gap-1 text-sm text-[var(--bd-ink)] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                <dt className="font-semibold">Résultat recherché</dt><dd className="break-words">{mission.outcome}</dd>
                <dt className="font-semibold">Indicateur</dt><dd className="break-words">{mission.decisionPlan.indicator}</dd>
                <dt className="font-semibold">Votre action</dt><dd className="break-words">{mission.decisionPlan.ownerAction}</dd>
              </dl>
              <details className="mt-2 text-sm text-[var(--bd-ink)]">
                <summary className="cursor-pointer font-semibold">Pourquoi et comment</summary>
                <p className="mt-2 break-words">{mission.finding} <span className="text-[var(--bd-muted)]">· {mission.origin}</span></p>
                <p className="mt-1 break-words"><span className="font-semibold">Pourquoi cette priorité :</span> {mission.decisionPlan.selectionReason}</p>
                <p className="mt-1 break-words">{mission.deduction}</p>
                <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                  <dt className="font-semibold">Périmètre</dt><dd className="break-words">{mission.scopeLabel}</dd>
                  <dt className="font-semibold">Saisie du résultat</dt><dd className="break-words">{mission.decisionPlan.collectionMethod}</dd>
                  <dt className="font-semibold">Effort et prérequis</dt><dd className="break-words">{mission.decisionPlan.effort} {mission.decisionPlan.prerequisites}</dd>
                  <dt className="font-semibold">Horizon et arrêt</dt><dd className="break-words">Bilan à {mission.stopRuleDays ?? MISSION_TEMPLATES[mission.template].stopRuleDays} jours, selon la règle du modèle.</dd>
                </dl>
                {mission.decisionPlan.evidence && <MissionEvidenceList evidence={mission.decisionPlan.evidence} />}
                <p className="mt-1 break-words"><span className="font-semibold">Préparée par :</span> {RESPONSIBLE_LABELS[mission.responsibleAgent]}</p>
                <p className="mt-1 break-words"><span className="font-semibold">Risque ou limite :</span> {mission.risk}</p>
              </details>
            </li>
          ))}
        </ol>}
        <InterestButton />
        <details className="border-t border-[var(--bd-line)] pt-4 text-sm text-[var(--bd-ink)]">
          <summary className="cursor-pointer font-semibold">Synthèse de l&apos;analyse{competitors.length > 0 ? " et comparables" : ""}</summary>
          <div className="mt-3 flex flex-col gap-3">
            {retained.map((sentence, index) => <p key={index} className="break-words">{sentence}</p>)}
            {competitors.length > 0 && <MarketCompetitors competitors={competitors} decisions={state.competitorDecisions} />}
          </div>
        </details>
      </div>
    </WelcomeFrame>
  );
}
