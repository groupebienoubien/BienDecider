/**
 * Mesures d'activation du PoC (#296, cahier des charges §7) : règles pures, sans base ni réseau.
 * Le serveur rassemble les faits (src/lib/activation.ts), ces règles en tirent les étapes, les délais et les parts ;
 * l'administration les affiche, les tests node les vérifient sur des entreprises fictives.
 * Imports relatifs en `.ts` seulement : `node --experimental-strip-types --test` charge ce fichier tel quel.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Les huit étapes de l'entonnoir, dans l'ordre, avec la question de #100 qu'elles recoupent
 * (activation, validation, réalisation) pour rapprocher les séances observées des chiffres.
 */
export const ACTIVATION_STEPS = [
  { key: "signup", label: "Inscription", theme: "Activation" },
  { key: "emailVerified", label: "E-mail confirmé", theme: "Activation" },
  { key: "workspace", label: "Espace créé", theme: "Activation" },
  { key: "firstLaunch", label: "Première mission lancée", theme: "Activation" },
  { key: "firstValidation", label: "Premier contenu validé", theme: "Validation" },
  { key: "firstDiffusion", label: "Première diffusion", theme: "Réalisation" },
  { key: "firstReport", label: "Premier bilan", theme: "Réalisation" },
  { key: "returnDay7", label: "Retour à J+7", theme: "Activation" },
] as const;
export type ActivationStepKey = (typeof ACTIVATION_STEPS)[number]["key"];

/** Faits d'une entreprise lus en base : la première date de chaque étape, ou null si elle n'est pas atteinte. */
export type CompanyFacts = {
  id: string;
  name: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  workspaceAt: Date | null;
  firstLaunchAt: Date | null;
  firstValidationAt: Date | null;
  firstDiffusionAt: Date | null;
  firstReportAt: Date | null;
  /** Dates d'activité du dirigeant (journal, messages à Paul, signalements, dernière connexion) : la première à J+7 ou après compte. */
  ownerActivity: readonly (Date | null)[];
};

export type CompanyJourney = {
  id: string;
  name: string;
  createdAt: Date;
  dates: Record<ActivationStepKey, Date | null>;
  /** Étape la plus avancée de l'entonnoir dont la date est connue (l'inscription au moins). */
  lastStep: ActivationStepKey;
};

/** Première date de la liste, ou null. */
export function earliest(dates: readonly (Date | null | undefined)[]): Date | null {
  let first: Date | null = null;
  for (const date of dates) if (date && !Number.isNaN(date.getTime()) && (!first || date < first)) first = date;
  return first;
}

/** Médiane d'une liste de nombres, ou null si elle est vide. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Retour à J+7 : la première activité du dirigeant 7 jours ou plus après l'inscription. */
export function returnDay7(createdAt: Date, activity: readonly (Date | null)[]): Date | null {
  const threshold = createdAt.getTime() + 7 * DAY_MS;
  return earliest(activity.filter((date): date is Date => date !== null && date.getTime() >= threshold));
}

export function companyJourney(facts: CompanyFacts): CompanyJourney {
  const dates: Record<ActivationStepKey, Date | null> = {
    signup: facts.createdAt,
    emailVerified: facts.emailVerifiedAt,
    workspace: facts.workspaceAt,
    firstLaunch: facts.firstLaunchAt,
    firstValidation: facts.firstValidationAt,
    firstDiffusion: facts.firstDiffusionAt,
    firstReport: facts.firstReportAt,
    returnDay7: returnDay7(facts.createdAt, facts.ownerActivity),
  };
  let lastStep: ActivationStepKey = "signup";
  for (const step of ACTIVATION_STEPS) if (dates[step.key]) lastStep = step.key;
  return { id: facts.id, name: facts.name, createdAt: facts.createdAt, dates, lastStep };
}

export type FunnelStep = {
  key: ActivationStepKey;
  label: string;
  theme: string;
  reached: number;
  /** Part des entreprises de la cohorte, de 0 à 1 ; null sans entreprise. */
  share: number | null;
  /** Temps médian depuis l'étape précédente, en jours (une décimale), parmi les entreprises qui ont atteint les deux ; null sinon. */
  medianDaysFromPrevious: number | null;
};

/**
 * Entonnoir d'une cohorte : nombre et part d'entreprises par étape, temps médian depuis l'étape précédente.
 * Une étape atteinte avant la précédente (e-mail confirmé après le lancement, par exemple) compte pour un délai nul.
 */
export function funnelSummary(journeys: readonly CompanyJourney[]): FunnelStep[] {
  return ACTIVATION_STEPS.map((step, index) => {
    const reached = journeys.filter((journey) => journey.dates[step.key]).length;
    const previous = index > 0 ? ACTIVATION_STEPS[index - 1].key : null;
    const delays = previous
      ? journeys.flatMap((journey) => {
          const from = journey.dates[previous];
          const to = journey.dates[step.key];
          return from && to ? [Math.max(0, to.getTime() - from.getTime()) / DAY_MS] : [];
        })
      : [];
    const days = median(delays);
    return {
      key: step.key,
      label: step.label,
      theme: step.theme,
      reached,
      share: journeys.length ? reached / journeys.length : null,
      medianDaysFromPrevious: days === null ? null : Math.round(days * 10) / 10,
    };
  });
}

// ——— Cohortes d'inscription (cible V5.2, §7) ———

/** Faits d'une mission lancée ou non, pour les parts de la cohorte. */
export type MissionFacts = {
  companyId: string;
  template: string;
  channel: string | null;
  firstLaunchedAt: Date | null;
  stopRuleDays: number | null;
  firstDiffusionAt: Date | null;
  confirmedDiffusions: number;
  declaredDiffusions: number;
  firstReportAt: Date | null;
  firstDecisionAt: Date | null;
  /** Première fois que la mission a été écartée (J-09), ou null. */
  dismissedAt: Date | null;
};

export type CohortMeasures = {
  accounts: number;
  launchedWithin7Days: number;
  launched: number;
  withDiffusion: number;
  withReport: number;
  withDecision: number;
  byTemplate: { key: string; count: number }[];
  byChannel: { key: string | null; count: number }[];
  confirmedDiffusions: number;
  declaredDiffusions: number;
  /** Contre-mesures. */
  diffusedWithoutReportAfterStopRule: number;
  dismissedWithinHour: number;
};

function countBy<T extends string | null>(values: readonly T[]): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key ?? "").localeCompare(String(b.key ?? "")));
}

/**
 * Mesures d'une cohorte d'entreprises : lancement dans les 7 jours, missions lancées puis diffusées, puis avec un bilan,
 * puis avec une décision de suite ; répartition par modèle et par canal ; diffusions déclarées ; contre-mesures.
 * Seules comptent les missions des entreprises de la cohorte.
 */
export function cohortMeasures(journeys: readonly CompanyJourney[], missions: readonly MissionFacts[], now: Date): CohortMeasures {
  const ids = new Set(journeys.map((journey) => journey.id));
  const launched = missions.filter((mission) => ids.has(mission.companyId) && mission.firstLaunchedAt);
  const diffused = launched.filter((mission) => mission.firstDiffusionAt);
  const reported = diffused.filter((mission) => mission.firstReportAt);
  const decided = reported.filter((mission) => mission.firstDecisionAt);
  const overdue = diffused.filter((mission) => {
    if (mission.firstReportAt || mission.stopRuleDays === null) return false;
    return mission.firstLaunchedAt!.getTime() + mission.stopRuleDays * DAY_MS < now.getTime();
  });
  const dismissedFast = launched.filter((mission) => {
    if (!mission.dismissedAt) return false;
    const delay = mission.dismissedAt.getTime() - mission.firstLaunchedAt!.getTime();
    return delay >= 0 && delay <= HOUR_MS;
  });
  return {
    accounts: journeys.length,
    launchedWithin7Days: journeys.filter((journey) => {
      const launch = journey.dates.firstLaunch;
      return launch !== null && launch.getTime() - journey.createdAt.getTime() <= 7 * DAY_MS;
    }).length,
    launched: launched.length,
    withDiffusion: diffused.length,
    withReport: reported.length,
    withDecision: decided.length,
    byTemplate: countBy(launched.map((mission) => mission.template)),
    byChannel: countBy(launched.map((mission) => mission.channel)),
    confirmedDiffusions: launched.reduce((sum, mission) => sum + mission.confirmedDiffusions, 0),
    declaredDiffusions: launched.reduce((sum, mission) => sum + mission.declaredDiffusions, 0),
    diffusedWithoutReportAfterStopRule: overdue.length,
    dismissedWithinHour: dismissedFast.length,
  };
}

// ——— Plafonds (#50, story 3.2, story 4.1) ———

export type CapLimits = {
  dailyAgentRunLimit: number;
  monthlyAgentRunLimit: number;
  dailyChatMessageLimit: number;
  monthlyChatMessageLimit: number;
  dailySpendLimitUsd: number;
  monthlySpendLimitUsd: number;
};
export type CapUsage = { dailyRuns: number; monthlyRuns: number; dailyMessages: number; monthlyMessages: number; dailyCostUsd: number; monthlyCostUsd: number };

/** Plafonds atteints aujourd'hui ou ce mois-ci (heure de Paris), crédits épuisés et alertes de consommation reçues. */
export function reachedCaps(limits: CapLimits, usage: CapUsage, creditBalance: number, alerts: number): string[] {
  const reached: string[] = [];
  if (usage.dailyRuns >= limits.dailyAgentRunLimit) reached.push("Lancements du jour");
  if (usage.monthlyRuns >= limits.monthlyAgentRunLimit) reached.push("Lancements du mois");
  if (usage.dailyMessages >= limits.dailyChatMessageLimit) reached.push("Messages du jour");
  if (usage.monthlyMessages >= limits.monthlyChatMessageLimit) reached.push("Messages du mois");
  if (usage.dailyCostUsd >= limits.dailySpendLimitUsd) reached.push("Dépense du jour");
  if (usage.monthlyCostUsd >= limits.monthlySpendLimitUsd) reached.push("Dépense du mois");
  if (creditBalance <= 0) reached.push("Crédits épuisés");
  if (alerts > 0) reached.push(`${alerts} alerte${alerts > 1 ? "s" : ""} de consommation`);
  return reached;
}

// ——— Période, jours de Paris, export ———

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" });

/** Jour de Paris d'une date, au format AAAA-MM-JJ. */
export function parisDay(date: Date): string {
  return PARIS_DAY.format(date);
}

/** Jour AAAA-MM-JJ valide (le calendrier fait foi : pas de 31 février). */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Période de la vue, bornes incluses, en jours de Paris ; une borne absente ou illisible est ignorée. */
export type Period = { from: string | null; to: string | null };

export function readPeriod(params: { du?: unknown; au?: unknown }): Period {
  const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value);
  const from = isDayKey(pick(params.du)) ? (pick(params.du) as string) : null;
  const to = isDayKey(pick(params.au)) ? (pick(params.au) as string) : null;
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

export function inPeriod(day: string, period: Period): boolean {
  return (!period.from || day >= period.from) && (!period.to || day <= period.to);
}

/** Mois AAAA-MM d'un jour AAAA-MM-JJ. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Cellule CSV : une formule possible (= + - @ en tête, tabulation ou retour chariot) est neutralisée par une apostrophe, puis le champ est entouré de guillemets. */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[\t\r]|^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Fichier CSV lisible par un tableur français : UTF-8 avec BOM, séparateur « ; », fins de ligne CRLF. */
export function toCsv(lines: readonly (readonly (string | number)[])[]): string {
  return `﻿${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** Part en pourcentage entier (« 42 % »), ou « — » sans dénominateur. */
export function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : "—";
}

/** Durée en jours, une décimale, virgule française ; « — » si non mesurée. */
export function daysLabel(days: number | null): string {
  if (days === null) return "—";
  return `${days.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;
}

/** Lignes de l'export agrégé de l'activation : aucune ligne par entreprise. */
export function activationCsv(period: Period, funnel: readonly FunnelStep[], measures: CohortMeasures, labels: { template: (key: string) => string; channel: (key: string | null) => string }): string {
  const lines: (string | number)[][] = [["Section", "Mesure", "Valeur", "Part", "Temps médian depuis l'étape précédente (jours)"]];
  lines.push(["Période", "Inscriptions du", period.from ?? "—", "", ""], ["Période", "au", period.to ?? "—", "", ""]);
  for (const step of funnel) {
    lines.push(["Entonnoir", step.label, step.reached, step.share === null ? "—" : percent(step.reached, measures.accounts), step.medianDaysFromPrevious === null ? "—" : step.medianDaysFromPrevious]);
  }
  lines.push(
    ["Cohorte", "Comptes ayant lancé une mission dans les 7 jours", measures.launchedWithin7Days, percent(measures.launchedWithin7Days, measures.accounts), ""],
    ["Cohorte", "Missions lancées", measures.launched, "", ""],
    ["Cohorte", "… avec une diffusion", measures.withDiffusion, percent(measures.withDiffusion, measures.launched), ""],
    ["Cohorte", "… puis un bilan", measures.withReport, percent(measures.withReport, measures.launched), ""],
    ["Cohorte", "… puis une décision de suite", measures.withDecision, percent(measures.withDecision, measures.launched), ""],
    ["Cohorte", "Diffusions déclarées", measures.declaredDiffusions, percent(measures.declaredDiffusions, measures.declaredDiffusions + measures.confirmedDiffusions), ""],
  );
  for (const row of measures.byTemplate) lines.push(["Missions lancées par modèle", labels.template(row.key), row.count, percent(row.count, measures.launched), ""]);
  for (const row of measures.byChannel) lines.push(["Missions lancées par canal", labels.channel(row.key), row.count, percent(row.count, measures.launched), ""]);
  lines.push(
    ["Contre-mesure", "Diffusions sans bilan après la règle d'arrêt", measures.diffusedWithoutReportAfterStopRule, "", ""],
    ["Contre-mesure", "Missions écartées dans l'heure qui suit leur lancement", measures.dismissedWithinHour, "", ""],
  );
  return toCsv(lines);
}
