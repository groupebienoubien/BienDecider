import { channelLabel, type MissionChannel } from "@/lib/missions/channels";
import type { MissionStatus } from "@/lib/missions/rules";
import type { TemplateKey } from "@/lib/missions/templates";

/**
 * Étape d'une mission, suivi en six temps et prochain pas (spécification §3), en fonctions pures.
 * Le contenu principal est fourni par l'atelier (#289) ; tant qu'il n'existe pas, une mission en cours est « en préparation ».
 */
export type MissionStage =
  | "dismissed" | "closed" | "launch" | "preparing" | "scheduled" | "report" | "decide" | "next-round"
  | "self-publish" | "publish" | "connect" | "approve";

/** État du contenu principal : version courante, validation, diffusions et ce qui a été jugé dessus. */
export type ContentState = {
  number: number;
  validated: boolean;
  currentDiffused: boolean;
  scheduled: boolean;
  diffusions: number;
  reportAt: number | null;
  decisionAt: number | null;
  channelConnected: boolean;
};

export type StageMission = {
  id: string;
  title: string;
  outcome: string;
  status: MissionStatus;
  template: TemplateKey;
  channel: MissionChannel | null;
  position: number;
  content: ContentState | null;
};

export type Delegation = "prepare" | "review" | "bounded";

export function missionStage(mission: StageMission, delegation: Delegation = "review"): MissionStage {
  if (mission.status === "dismissed") return "dismissed";
  if (mission.status === "stopped") return "closed";
  if (mission.status !== "active") return "launch";
  const content = mission.content;
  if (!content) return "preparing";
  if (content.scheduled) return "scheduled";
  if (content.currentDiffused) {
    if (content.reportAt !== content.diffusions) return "report";
    if (content.decisionAt !== content.diffusions) return "decide";
    return "next-round";
  }
  if (content.validated) {
    if (delegation === "prepare" || mission.channel === null) return "self-publish";
    return content.channelConnected ? "publish" : "connect";
  }
  return "approve";
}

export const STAGE_LABELS: Record<MissionStage, string> = {
  launch: "à lancer",
  preparing: "contenu en préparation",
  approve: "contenu à valider",
  connect: "canal à connecter",
  publish: "diffusion à confirmer",
  "self-publish": "à diffuser vous-même",
  scheduled: "diffusion programmée",
  report: "bilan à renseigner",
  decide: "décision de fin de test",
  "next-round": "série suivante à préparer",
  closed: "mission close",
  dismissed: "mission écartée du plan",
};

export const TRACKER_STEPS = ["Cadrer", "Préparer", "Valider", "Diffuser", "Faire le bilan", "Décider"] as const;
export type TrackerStep = { label: (typeof TRACKER_STEPS)[number]; state: "done" | "current" | "todo" };

const CURRENT_STEP: Record<MissionStage, number> = {
  launch: 0, preparing: 1, approve: 2, connect: 3, publish: 3, "self-publish": 3, scheduled: 3, report: 4, decide: 5, "next-round": 6, closed: 6, dismissed: -1,
};

/** Suivi en six temps : les temps précédents sont faits, le temps courant est marqué ; null pour une mission écartée. */
export function missionTracker(stage: MissionStage): TrackerStep[] | null {
  const current = CURRENT_STEP[stage];
  if (current < 0) return null;
  return TRACKER_STEPS.map((label, index) => ({ label, state: index < current ? "done" : index === current ? "current" : "todo" }));
}

/** Priorité : la première mission ni écartée ni close dans l'ordre du plan (la priorité choisie avec Paul arrive avec #288). */
export function priorityMissionId(missions: StageMission[]): string | null {
  return [...missions].sort((a, b) => a.position - b.position).find((mission) => mission.status !== "dismissed" && mission.status !== "stopped")?.id ?? null;
}

/** Ordre des missions : la priorité, puis les autres dans l'ordre du plan. */
export function orderMissions<T extends StageMission>(missions: T[]): T[] {
  const priority = priorityMissionId(missions);
  return [...missions].sort((a, b) => (a.id === priority ? -1 : b.id === priority ? 1 : a.position - b.position));
}

export type NextStepTarget = { kind: "link"; href: string; label: string } | { kind: "paul"; label: string };
export type NextStep = { stage: MissionStage | "none"; missionId: string | null; title: string; detail: string; target: NextStepTarget };

const WAITING_OWNER: MissionStage[] = ["approve", "connect", "publish", "self-publish", "report", "decide"];

function stepFor(mission: StageMission, stage: MissionStage): NextStep {
  const version = mission.content ? `V${mission.content.number}` : "";
  const canal = mission.channel ? channelLabel(mission.channel) : "";
  const atelier = `/atelier?mission=${mission.id}`;
  const base = { stage, missionId: mission.id };
  switch (stage) {
    case "launch":
      return { ...base, title: `Examiner « ${mission.title} »`, detail: `${mission.outcome}.`, target: { kind: "link", href: `/missions/${mission.id}`, label: "Examiner cette mission" } };
    case "preparing":
      return { ...base, title: "Préparer le premier contenu", detail: `« ${mission.title} » est lancée : son premier contenu se prépare dans l'atelier. Rien ne sera diffusé sans votre accord.`, target: { kind: "link", href: `/missions/${mission.id}`, label: "Voir la mission" } };
    case "approve":
      return { ...base, title: "Relire et valider le contenu", detail: `${mission.title} · ${version} attend votre accord. Valider n'envoie rien.`, target: { kind: "link", href: atelier, label: "Ouvrir l'atelier" } };
    case "connect":
      return { ...base, title: `Connecter ${canal}`, detail: "Le contenu est validé. Il manque seulement le canal de diffusion (aucun envoi à cette étape).", target: { kind: "link", href: "/connexions", label: `Connecter ${canal}` } };
    case "publish":
      return { ...base, title: mission.channel === "gmail" ? "Confirmer l'envoi" : "Confirmer la publication", detail: `${mission.title} · ${version} est validée et ${canal} est connecté. Rien ne part sans votre confirmation.`, target: { kind: "link", href: atelier, label: "Ouvrir l'atelier" } };
    case "self-publish":
      return { ...base, title: "Diffuser vous-même", detail: `${mission.title} · ${version} est validée. Récupérez le texte, diffusez-le, puis déclarez-le.`, target: { kind: "link", href: atelier, label: "Ouvrir l'atelier" } };
    case "scheduled":
      return { ...base, title: "Diffusion programmée", detail: "Rien à faire pour l'instant. Vous pouvez encore l'annuler dans l'atelier.", target: { kind: "link", href: atelier, label: "Voir la programmation" } };
    case "report":
      return { ...base, title: "Renseigner le bilan", detail: `${mission.title} : notez les réponses reçues. Sans bilan, impossible de décider de la suite.`, target: { kind: "link", href: `/resultats?mission=${mission.id}`, label: "Renseigner mon bilan" } };
    case "decide":
      return { ...base, title: "Décider de la suite", detail: `${mission.title} : poursuivre, adapter avec Paul ou arrêter, au regard de votre bilan.`, target: { kind: "link", href: `/resultats?mission=${mission.id}`, label: "Décider la suite" } };
    case "next-round":
      return { ...base, title: "Préparer la série suivante", detail: "Vous avez décidé de poursuivre : une nouvelle version du contenu démarre un nouveau cycle.", target: { kind: "link", href: atelier, label: "Ouvrir l'atelier" } };
    default:
      return noneStep();
  }
}

function noneStep(): NextStep {
  return { stage: "none", missionId: null, title: "Aucune mission en cours", detail: "Toutes vos missions sont closes ou écartées. Explorez une nouvelle idée avec Paul pour lancer un prochain test.", target: { kind: "paul", label: "Explorer une idée" } };
}

/** Prochain pas (§3.3) : ce qui attend le dirigeant, puis un lancement, puis toute mission vivante, sinon aucune mission. */
export function nextStep(missions: StageMission[], delegation: Delegation = "review"): NextStep {
  const ordered = orderMissions(missions).map((mission) => ({ mission, stage: missionStage(mission, delegation) }));
  const pick = ordered.find(({ stage }) => WAITING_OWNER.includes(stage))
    ?? ordered.find(({ stage }) => stage === "launch")
    ?? ordered.find(({ stage }) => stage !== "closed" && stage !== "dismissed");
  return pick ? stepFor(pick.mission, pick.stage) : noneStep();
}
