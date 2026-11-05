"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { MissionTags, MissionTracker } from "@/components/mission-ui";
import { PaulButton } from "@/components/mission-actions";
import type { MissionStatus } from "@/lib/missions/rules";
import type { MissionStage } from "@/lib/missions/stage";

export type MissionCardData = { id: string; title: string; outcome: string; status: MissionStatus; stage: MissionStage; stageLabel: string; priority: boolean };

const FILTERS: { key: string; label: string; status: MissionStatus | null }[] = [
  { key: "toutes", label: "Toutes", status: null },
  { key: "en-cours", label: "En cours", status: "active" },
  { key: "a-decider", label: "À décider", status: "proposed" },
  { key: "en-pause", label: "En pause", status: "paused" },
  { key: "arretees", label: "Arrêtées", status: "stopped" },
  { key: "ecartees", label: "Écartées", status: "dismissed" },
];

/** Liste filtrée par statut, sans rechargement ; le filtre est gardé dans l'adresse pour être partagé. */
export function MissionList({ missions }: { missions: MissionCardData[] }) {
  const requested = useSearchParams().get("statut");
  const filter = FILTERS.find((candidate) => candidate.key === requested) ?? FILTERS[0];
  const shown = filter.status ? missions.filter((mission) => mission.status === filter.status) : missions;

  function choose(key: string) {
    const url = new URL(window.location.href);
    if (key === "toutes") url.searchParams.delete("statut");
    else url.searchParams.set("statut", key);
    window.history.replaceState(null, "", url);
  }

  if (missions.length === 0) {
    return (
      <div className="empty">
        <Icon name="flag" />
        <h3>Aucune mission pour le moment</h3>
        <p>Une mission part d&apos;un constat et le teste dans un cadre limité. Créez la première, ou explorez une idée avec Paul.</p>
        <div className="heading-actions">
          <Link className="btn" href="/missions/nouvelle"><Icon name="plus" />Créer une mission</Link>
          <PaulButton label="Explorer une idée" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tabs" role="group" aria-label="Filtrer par statut">
        {FILTERS.map((candidate) => {
          const count = candidate.status ? missions.filter((mission) => mission.status === candidate.status).length : missions.length;
          return (
            <button key={candidate.key} type="button" className={candidate.key === filter.key ? "selected" : undefined} aria-pressed={candidate.key === filter.key} onClick={() => choose(candidate.key)}>
              {candidate.label} ({count})
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <Icon name="flag" />
          <h3>Aucune mission dans cette vue</h3>
          <button type="button" onClick={() => choose("a-decider")}>Voir les propositions</button>
        </div>
      ) : (
        <div className="mission-grid">
          {shown.map((mission) => (
            <article key={mission.id} className="mission-card" aria-labelledby={`mission-${mission.id}`}>
              <MissionTags status={mission.status} priority={mission.priority} />
              <h2 id={`mission-${mission.id}`}>{mission.title}</h2>
              <p className="target"><Icon name="target" />{mission.outcome}</p>
              <p className="small muted">Étape : {mission.stageLabel}</p>
              <MissionTracker stage={mission.stage} />
              <div className="mission-card-foot">
                <small>Votre copilote : Paul</small>
                <Link className="btn" href={`/missions/${mission.id}`}>Voir la mission<Icon name="arrow-right" /></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
