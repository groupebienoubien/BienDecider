"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { clientGapLabel, formatEuros, type BusinessTarget } from "@/lib/business-target";
import type { WeeklyDelta } from "@/lib/funnel";
import { openPaul } from "@/lib/paul-context";
import { Icon } from "@/components/icon";

export type ObjectiveProgress = { target: BusinessTarget | null; week: WeeklyDelta; weekStart: string };

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * En-tête de l'accueil (charte, section 2) : l'objectif en grand et une progression
 * strictement déclarative — chiffre d'affaires saisi par le dirigeant et échanges
 * enregistrés cette semaine. Aucune estimation ni conclusion n'est calculée ici.
 */
export function ObjectiveHero({ objective, progress, dateLabel, actions }: { objective: string | null; progress: ObjectiveProgress; dateLabel: string; actions?: ReactNode }) {
  const { target, week } = progress;
  const exchanges = [
    week.contactes > 0 && plural(week.contactes, "prospect contacté", "prospects contactés"),
    week.reponses > 0 && plural(week.reponses, "réponse"),
    week.rdv > 0 && plural(week.rdv, "rendez-vous", "rendez-vous"),
    week.clients > 0 && plural(week.clients, "client gagné", "clients gagnés"),
  ].filter(Boolean) as string[];

  if (!objective?.trim()) {
    return (
      <section className="objective-hero" aria-label="Mon objectif">
        <div className="objective-top"><div className="eyebrow">{dateLabel}</div>{actions}</div>
        <p className="objective-label">Votre objectif</p>
        <h1>Quel résultat voulez-vous atteindre ?</h1>
        <p className="objective-lead">Dites-le à Paul en une phrase, par exemple « 10 demandes de devis par mois ». Il prépare ensuite le plan avec l’équipe.</p>
        <div className="objective-actions">
          <button type="button" className="primary" onClick={() => openPaul()}><Icon name="message-circle" /> En parler avec Paul</button>
          <Link href="/entreprise?tab=objectifs#modifier">Le saisir moi-même</Link>
        </div>
      </section>
    );
  }

  const clientGap = target ? clientGapLabel(target) : null;
  const ratio = target && target.target > 0 ? Math.min(1, Math.max(0, target.current / target.target)) : null;
  return (
    <section className="objective-hero" aria-label="Mon objectif">
      <div className="objective-top"><div className="eyebrow">{dateLabel}</div>{actions}</div>
      <p className="objective-label">Votre objectif</p>
      <h1>{objective}</h1>
      {target && ratio !== null && (
        <div className="objective-progress">
          <div className="objective-progress-text">
            <span>Chiffre d’affaires mensuel déclaré : <strong>{formatEuros(target.current)}</strong> sur <strong>{formatEuros(target.target)}</strong> visés</span>
            {clientGap && <small>Écart : {clientGap.text}</small>}
          </div>
          <progress value={Math.round(ratio * 100)} max={100} aria-label={`Chiffre d’affaires déclaré : ${Math.round(ratio * 100)} % de l’objectif`} />
        </div>
      )}
      <p className="objective-week">
        <strong>Cette semaine :</strong> {exchanges.length > 0 ? exchanges.join(" · ") : "aucun échange commercial déclaré pour l’instant."}
      </p>
      <Link className="objective-adjust" href="/entreprise?tab=objectifs">Ajuster l’objectif ou mes chiffres →</Link>
    </section>
  );
}
