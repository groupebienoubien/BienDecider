import { Icon } from "@/components/icon";
import { Tag, type TagColor } from "@/components/mockup-ui";
import { STAGE_LABELS, missionTracker, type MissionStage } from "@/lib/missions/stage";
import type { MissionStatus } from "@/lib/missions/rules";

export const STATUS_LABELS: Record<MissionStatus, string> = {
  proposed: "À décider",
  active: "En cours",
  paused: "En pause",
  stopped: "Arrêtée",
  dismissed: "Écartée",
};

const STATUS_COLORS: Record<MissionStatus, TagColor> = { proposed: "orange", active: "green", paused: "orange", stopped: "gray", dismissed: "gray" };

export function MissionTags({ status, priority }: { status: MissionStatus; priority: boolean }) {
  return (
    <div className="tags">
      <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
      {priority && <Tag color="blue">Priorité de Paul</Tag>}
    </div>
  );
}

/** Suivi en six temps (§3.2) : liste ordonnée, le temps courant annoncé aux lecteurs d'écran. */
export function MissionTracker({ stage }: { stage: MissionStage }) {
  const steps = missionTracker(stage);
  if (!steps) return null;
  return (
    <ol className="mission-tracker" aria-label={`Suivi de la mission : ${STAGE_LABELS[stage]}`}>
      {steps.map((step) => (
        <li key={step.label} className={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          {step.state === "done" && <Icon name="check" />}
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
