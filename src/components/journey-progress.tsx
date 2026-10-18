"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  objectiveComplete: boolean;
  diagnosticComplete: boolean;
  planComplete: boolean;
  workStarted: boolean;
  needsValidation: boolean;
  resultsAvailable: boolean;
  planLoading: boolean;
  onPreparePlan: () => void;
};

export function JourneyProgress({
  objectiveComplete,
  diagnosticComplete,
  planComplete,
  workStarted,
  needsValidation,
  resultsAvailable,
  planLoading,
  onPreparePlan,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [showCompletedDetails, setShowCompletedDetails] = useState(false);
  const steps = [
    { label: "Objectif", complete: objectiveComplete },
    { label: "Diagnostic", complete: diagnosticComplete },
    { label: "Plan", complete: planComplete },
    { label: "Validation", complete: workStarted && !needsValidation },
    { label: "Résultats", complete: resultsAvailable },
  ];
  const completedCount = steps.filter((step) => step.complete).length;
  const complete = completedCount === steps.length;
  const currentIndex = steps.findIndex((step) => !step.complete);

  if (!visible) {
    return (
      <section aria-label="Votre parcours" className="sync-line">
        <span>Parcours {complete ? "terminé" : `${completedCount}/5 étapes terminées`}</span>
        <button type="button" className="text-link" onClick={() => setVisible(true)}>Afficher le parcours</button>
      </section>
    );
  }

  if (complete && !showCompletedDetails) {
    return (
      <section aria-label="Votre parcours" className="sync-line">
        <span>Premier cycle terminé · 5/5 étapes</span>
        <span className="heading-actions">
          <Link className="text-link" href="/rapport">Voir les résultats</Link>
          <button type="button" className="text-link" onClick={() => setShowCompletedDetails(true)}>Détails</button>
          <button type="button" className="text-link" onClick={() => setVisible(false)}>Masquer</button>
        </span>
      </section>
    );
  }

  const currentStep = steps[currentIndex];
  return (
    <section aria-label="Votre parcours">
      <div className="cycle" role="progressbar" aria-label="Avancement du parcours" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completedCount}>
        {steps.map((step, index) => {
          const current = !complete && index === currentIndex;
          return (
            <span key={step.label} aria-current={current ? "step" : undefined} className={current ? "current" : undefined}>
              <b>{step.complete ? "✓" : index + 1}</b>{step.label}
            </span>
          );
        })}
      </div>
      <div className="sync-line">
        <span>{complete ? "Votre premier cycle est terminé." : <>Étape {currentIndex + 1} sur {steps.length} · Prochaine étape : <strong>{currentStep.label}</strong></>}</span>
        <span className="heading-actions">
          {!complete && currentStep && (currentIndex === 0 ? (
            <Link className="text-link" href="/entreprise?tab=objectifs#modifier">Compléter mon objectif</Link>
          ) : currentIndex === 1 ? (
            <Link className="text-link" href="/diagnostic">Lancer le diagnostic</Link>
          ) : currentIndex === 2 && !planComplete ? (
            <button type="button" className="text-link" onClick={onPreparePlan} disabled={planLoading}>{planLoading ? "Préparation…" : "Préparer le plan"}</button>
          ) : currentIndex === 3 && needsValidation ? (
            <Link className="text-link" href="/dashboard?view=validation">Examiner les productions</Link>
          ) : currentIndex === 3 ? (
            <Link className="text-link" href="/dashboard?view=plan">Lancer une action du plan</Link>
          ) : (
            <Link className="text-link" href="/rapport">Consulter les résultats</Link>
          ))}
          {complete && <Link className="text-link" href="/rapport">Voir les résultats</Link>}
          <button type="button" className="text-link" onClick={() => setVisible(false)}>Masquer le parcours</button>
        </span>
      </div>
    </section>
  );
}