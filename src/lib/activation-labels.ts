import { MISSION_TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from "@/lib/missions/templates";
import { channelLabel, isMissionChannel } from "@/lib/missions/channels";
import { STEP_LABELS, type DraftStep } from "@/lib/onboarding/draft-rules";
import { RUBRIC_NAMES, type RubricKey } from "@/lib/onboarding/analysis-rules";

/** Libellés des mesures (vue d'administration et export) : les clés stockées deviennent les mots du produit. */

export function templateLabel(key: string): string {
  return (TEMPLATE_KEYS as readonly string[]).includes(key) ? MISSION_TEMPLATES[key as TemplateKey].label : key;
}

export function channelName(key: string | null): string {
  if (key === null) return "Hors canal";
  return isMissionChannel(key) ? channelLabel(key) : key;
}

export function stepName(step: number): string {
  return `${step}. ${STEP_LABELS[step as DraftStep]?.name ?? "—"}`;
}

export function rubricName(key: RubricKey): string {
  return RUBRIC_NAMES[key];
}
