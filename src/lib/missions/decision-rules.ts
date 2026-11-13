import { capacityState } from "@/lib/capacity";
import type { TemplateKey } from "@/lib/missions/templates";

const ACQUISITION_TEMPLATES = new Set<TemplateKey>([
  "agencies",
  "leads",
  "proof",
  "social_post",
  "google_profile",
  "site_page",
  "custom",
]);

export function ambitionTargetsRequests(text: string): boolean {
  return /\b(demandes?|devis|appels?|contacts?|rendez-vous|réservations?|prospects?|nouveaux clients|nouvelles clientes?|plus de clients|davantage de clients|développer la clientèle)\b/i.test(text);
}

export function needsWeekdayClarification(text: string): boolean {
  const weekdayGoal = /\b(?:en semaine|pendant la semaine|durant la semaine|jours de semaine)\b/i.test(text) && ambitionTargetsRequests(text);
  const namedDay = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(text);
  return weekdayGoal && !namedDay;
}

export function hasNoAdditionalTime(text: string): boolean {
  return /\b(?:sans|pas de|aucun)\s+(?:temps|travail|charge)\s+(?:supplémentaire|en plus|additionnel(?:le)?)\b/i.test(text);
}

export function hasNoAvailableCapacity(text: string): boolean {
  return /\b(?:capacité (?:est )?(?:pleine|complète|saturée)|(?:je suis|nous sommes|on est|je serai|nous serons)\s+(?:déjà\s+)?(?:complet(?:s)?|complèt(?:e|es))|(?:planning|agenda|carnet de commandes)\s+(?:est\s+)?(?:déjà\s+)?complet|pas de place|aucun nouveau client|ne peux pas accueillir)\b/i.test(text);
}

export function hasSatisfactoryBookingPage(text: string): boolean {
  const mentionsPage = /\b(?:page|site|réservation|réservations|formulaire)\b.{0,50}\b(?:déjà )?(?:satisfaisant(?:e|es|s)?|fonctionne bien|suffisant(?:e|s)?)\b/i.test(text)
    || /\b(?:déjà )?(?:satisfaisant(?:e|es|s)?|fonctionne bien|suffisant(?:e|s)?)\b.{0,50}\b(?:page|site|réservation|réservations|formulaire)\b/i.test(text);
  const explicitlyUnsatisfactory = /\b(?:n['’](?:est|sont|semble|semblent)\s+(?:pas|plus|jamais)(?:\s+encore)?|pas(?: encore| du tout)?)\s+(?:déjà\s+)?(?:satisfaisant(?:e|es|s)?|suffisant(?:e|s)?)\b/i.test(text);
  return mentionsPage && !explicitlyUnsatisfactory;
}

export type MissionObjectiveDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateMissionObjective(input: {
  template: TemplateKey;
  objective: string;
  availableCapacity?: number | null;
  capacityConfirmedAt?: Date | string | null;
  now?: Date;
}): MissionObjectiveDecision {
  const { template, objective } = input;
  if (!ACQUISITION_TEMPLATES.has(template)) return { allowed: true };
  if (hasNoAdditionalTime(objective)) {
    return { allowed: false, reason: "Le dirigeant indique ne pas avoir de temps supplémentaire pour réaliser ce test." };
  }
  if (hasNoAvailableCapacity(objective)) {
    return { allowed: false, reason: "Le dirigeant indique que sa capacité est pleine ; ne pas proposer d'acquisition supplémentaire." };
  }
  if (input.availableCapacity === 0 && capacityState(input.availableCapacity, input.capacityConfirmedAt, input.now).status === "confirmed") {
    return { allowed: false, reason: "La capacité confirmée est de zéro nouveau projet client ; ne pas proposer d'acquisition supplémentaire." };
  }
  if (template === "site_page" && hasSatisfactoryBookingPage(objective)) {
    return { allowed: false, reason: "Le dirigeant indique que sa page ou réservation est déjà satisfaisante ; ne pas proposer de la refaire." };
  }
  return { allowed: true };
}
