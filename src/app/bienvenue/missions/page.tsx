import { requireDraftPage } from "../guard";
import { WelcomeFrame } from "../welcome-frame";
import { InterestButton, MarketCompetitors, ProfileAnalysisWatcher } from "../step-forms";
import { MissionsIntelligenceWatcher, PrepareMissions } from "./missions-waiting";
import { FIRST_BADGE, matchingIntelligence, starterFacts, starterPlan } from "@/lib/onboarding/draft-rules";
import { intelligenceRunning, intelligenceView } from "@/lib/onboarding/intelligence-rules";
import { safeSourceUrl } from "@/lib/findings/certainty";
import { RESPONSIBLE_LABELS } from "@/lib/missions/rules";
import { MISSION_TEMPLATES } from "@/lib/missions/templates";
import { MissionEvidenceList } from "@/components/mission-evidence";
import { analysisView } from "@/lib/onboarding/analysis-rules";

/**
 * Étape 4 (#284, FR-8, #361-#364, #371) : le rappel de l'entreprise et du cap, « Ce que nous retenons », puis jusqu'à trois missions
 * fondées sur le profil confirmé, l'analyse, l'ambition et, quand elle a abouti, une recherche réelle de marché lancée
 * à la confirmation de l'ambition (étape 3). Aucun appel de modèle ici au chargement : la recherche tourne en tâche de
 * fond, cette page affiche l'attente puis se rafraîchit. Rien n'est créé ni lancé avant le compte.
 */
export default async function WelcomeMissionsPage() {
  const state = await requireDraftPage("/bienvenue/missions");
  const progress = analysisView(state.analysis);
  if (progress && !progress.finished) {
    return <WelcomeFrame step={4} intro={<p>Votre objectif est enregistré. Paul termine la lecture de vos sources avant de préparer vos missions.</p>}>
      <ProfileAnalysisWatcher analysis={progress} />
    </WelcomeFrame>;
  }
  if (intelligenceRunning(state.intelligence)) {
    return (
      <WelcomeFrame step={4} intro={<p>Nous terminons la recherche et la préparation des missions pour {state.profile.companyName} avant de vous présenter les pistes.</p>}>
        <MissionsIntelligenceWatcher initial={intelligenceView(state.intelligence)} />
      </WelcomeFrame>
    );
  }
  const { recap, retained, missions } = starterPlan(state);
  const intelligence = matchingIntelligence(state);
  if (!intelligence && state.ambition?.planningVersion) {
    return <WelcomeFrame step={4}><PrepareMissions /></WelcomeFrame>;
  }
  const competitors = starterFacts(intelligence).competitors.filter((competitor) => safeSourceUrl(competitor.source));
  return (
    <WelcomeFrame step={4} intro={<p>{missions.length > 0 ? `${missions.length} ${missions.length === 1 ? "mission proposée" : "missions proposées"} pour ${recap.companyName}. Vous choisirez laquelle lancer.` : `Pas encore de mission étayée pour ${recap.companyName}. Précisez votre priorité avec Paul.`}</p>}>
      <div className="flex flex-col gap-6">
        {intelligence?.status !== "done" && <MissionsIntelligenceWatcher initial={intelligenceView(intelligence)} />}
        {(!intelligence?.planning && !state.ambition?.planningVersion || state.ambition?.planningVersion === 1) && (
          <p role="status" className="rounded-md border border-[var(--bd-line)] p-3 text-sm text-[var(--bd-ink)]">
            Ces pistes proviennent de l&apos;ancienne préparation. Revenez à votre objectif et confirmez-le pour obtenir les missions issues de la nouvelle analyse.
          </p>
        )}
        <section aria-labelledby="recap-title" className="border-b border-[var(--bd-line)] pb-4">
          <h2 id="recap-title" className="text-sm font-semibold text-[var(--bd-ink)]">Votre cap</h2>
          <p className="mt-1 break-words border-l-4 border-[var(--bd-accent)] pl-3 text-base text-[var(--bd-ink)]">{recap.cap}</p>
          {recap.notes.length > 0 && (
            <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Points à garder en tête</summary>
            <ul className="mt-3 flex flex-col gap-2 leading-relaxed text-[var(--bd-muted)]">
              {recap.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
            </details>
          )}
        </section>

        {missions.length > 0 && <ol className="flex list-none flex-col gap-6" aria-label="Missions proposées">
          {missions.map((mission, index) => (
            <li key={mission.template} className={`min-w-0 rounded-xl border bg-white p-5 sm:p-6 ${mission.first ? "border-[var(--bd-brand)]" : "border-[var(--bd-line)]"}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-[var(--bd-brand)]">{mission.first ? FIRST_BADGE : `Piste ${index + 1}`}</span>
                <span className="rounded-full bg-[var(--bd-cream)] px-3 py-1">Bilan à {mission.stopRuleDays ?? MISSION_TEMPLATES[mission.template].stopRuleDays} jours</span>
              </div>
              <h3 className="break-words font-[family-name:var(--font-sora)] text-xl font-semibold leading-snug text-[var(--bd-ink)]">{mission.title}</h3>
              <p className="mt-3 break-words text-base leading-relaxed text-[var(--bd-muted)]">{mission.outcome}</p>
              <div className="mt-5 rounded-lg bg-[var(--bd-cream)] p-4">
                <p className="text-sm font-semibold">{mission.template === "custom" ? "Le test sur le terrain" : "Ce que Paul prépare"}</p>
                <p className="mt-2 break-words text-base leading-relaxed">{mission.template !== "custom" && <span className="font-medium">{MISSION_TEMPLATES[mission.template].label} : </span>}{mission.scopeLabel}</p>
                {mission.template === "custom" && <p className="mt-2 text-sm text-[var(--bd-muted)]">Vous menez le test. Paul vous aide à le cadrer et à faire le bilan.</p>}
              </div>
              <dl className="mt-5 grid gap-5 text-base leading-relaxed sm:grid-cols-2">
                <div className="min-w-0"><dt className="text-sm font-semibold">De votre côté</dt><dd className="mt-2 break-words">{mission.decisionPlan.ownerAction}</dd></div>
                <div className="min-w-0"><dt className="text-sm font-semibold">Le signal à observer</dt><dd className="mt-2 break-words">{mission.decisionPlan.indicator}</dd></div>
              </dl>
              <details className="mt-5 border-t border-[var(--bd-line)] pt-4 text-sm leading-relaxed text-[var(--bd-ink)]">
                <summary className="min-h-11 cursor-pointer font-semibold">Pourquoi ce test et comment le mener</summary>
                <p className="mt-2 break-words">{mission.decisionPlan.selectionReason}</p>
                <dl className="mt-4 flex flex-col gap-4">
                  <div><dt className="font-semibold">Mesurer simplement</dt><dd className="mt-1 break-words">{mission.decisionPlan.collectionMethod}</dd></div>
                  <div><dt className="font-semibold">Effort à prévoir</dt><dd className="mt-1 break-words">{mission.decisionPlan.effort}</dd></div>
                  <div><dt className="font-semibold">Avant de commencer</dt><dd className="mt-1 break-words">{mission.decisionPlan.prerequisites}</dd></div>
                  <div><dt className="font-semibold">Limite du test</dt><dd className="mt-1 break-words">{mission.risk}</dd></div>
                </dl>
                {mission.decisionPlan.evidence && <MissionEvidenceList evidence={mission.decisionPlan.evidence} />}
                <p className="mt-4 break-words text-[var(--bd-muted)]">{RESPONSIBLE_LABELS[mission.responsibleAgent]}</p>
              </details>
            </li>
          ))}
        </ol>}
        <p className="text-sm text-[var(--bd-muted)]">Ce sont des tests, pas des résultats garantis. Rien n&apos;est publié ni lancé sans votre validation.</p>
        <InterestButton />
        <details className="border-t border-[var(--bd-line)] pt-4 text-sm text-[var(--bd-ink)]">
          <summary className="cursor-pointer font-semibold">Synthèse de l&apos;analyse{competitors.length > 0 ? " et comparables" : ""}</summary>
          <div className="mt-3 flex flex-col gap-3">
            {intelligence?.status === "done" && <MissionsIntelligenceWatcher initial={intelligenceView(intelligence)} />}
            {retained.map((sentence, index) => <p key={index} className="break-words">{sentence}</p>)}
            {competitors.length > 0 && <MarketCompetitors competitors={competitors} decisions={state.competitorDecisions} />}
          </div>
        </details>
      </div>
    </WelcomeFrame>
  );
}
