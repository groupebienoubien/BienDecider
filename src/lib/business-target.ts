/**
 * Calcul déterministe (aucun appel modèle) de l'écart entre la situation
 * déclarée et l'objectif chiffré — cf. docs/backlog.md "partenaire de
 * croissance". Tout est déclaratif : Pepito n'estime jamais un CA lui-même.
 */

type BusinessFields = {
  monthlyRevenue: number | null;
  revenueTarget: number | null;
  targetDate: Date | null;
  averageClientValue: number | null;
  newClientsPerMonth: number | null;
};

export type BusinessTarget = {
  current: number;
  target: number;
  gap: number;
  growthPct: number;
  monthsRemaining: number | null;
  /** Nouveaux clients par mois nécessaires en plus du rythme actuel, à une décimale — null sans valeur client. */
  extraClientsPerMonth: number | null;
  /** Même écart compté sur un an, à une décimale — null sans valeur client. */
  extraClientsPerYear: number | null;
  /** Valeur d'un client déclarée, gardée pour choisir l'affichage sur la valeur non arrondie. */
  averageClientValue: number | null;
};

export type Period = "month" | "year";

/** Arrondi au dixième le plus proche (et non plus au client entier supérieur). */
export function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Montant dit par mois ou par an, ramené au mois et arrondi à l'euro (les champs de Company sont mensuels). */
export function toMonthly(amount: number, period: Period): number {
  return Math.round(period === "year" ? amount / 12 : amount);
}

/** Nombre de clients dit par mois ou par an, ramené au mois à une décimale (6 par an = 0,5 par mois). */
export function clientsToMonthly(count: number, period: Period): number {
  return roundOneDecimal(period === "year" ? count / 12 : count);
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

/**
 * Écart en clients tel qu'affiché : par an quand il est inférieur à 1 client
 * par mois (« environ 3,3 clients de plus par an »), par mois sinon.
 */
export function clientGapLabel(
  target: Pick<BusinessTarget, "gap" | "averageClientValue" | "extraClientsPerMonth" | "extraClientsPerYear">,
): { count: number; period: Period; text: string } | null {
  if (target.extraClientsPerMonth == null || target.extraClientsPerYear == null || !target.averageClientValue) return null;
  // Le choix mois/an se fait sur la valeur exacte : 0,96 client par mois s'affiche par an, pas « 1 par mois ».
  const period: Period = target.gap / target.averageClientValue < 1 ? "year" : "month";
  const count = period === "year" ? target.extraClientsPerYear : target.extraClientsPerMonth;
  if (count === 0) return { count, period, text: "moins de 0,1 client de plus par an" };
  // En français, le pluriel commence à 2 : « 1,5 client », « 3,3 clients ».
  const noun = count >= 2 ? "clients" : "client";
  return { count, period, text: `environ ${formatDecimal(count)} ${noun} de plus par ${period === "year" ? "an" : "mois"}` };
}

export function computeBusinessTarget(company: BusinessFields): BusinessTarget | null {
  if (company.monthlyRevenue == null || company.revenueTarget == null) return null;
  const current = company.monthlyRevenue;
  const target = company.revenueTarget;
  const gap = target - current;
  const growthPct = current > 0 ? Math.round((gap / current) * 100) : 0;

  let monthsRemaining: number | null = null;
  if (company.targetDate) {
    const ms = company.targetDate.getTime() - Date.now();
    monthsRemaining = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)));
  }

  const hasClientValue = company.averageClientValue != null && company.averageClientValue > 0 && gap > 0;
  const extraClientsPerMonth = hasClientValue ? roundOneDecimal(gap / company.averageClientValue!) : null;
  const extraClientsPerYear = hasClientValue ? roundOneDecimal((gap * 12) / company.averageClientValue!) : null;

  return {
    current, target, gap, growthPct, monthsRemaining, extraClientsPerMonth, extraClientsPerYear,
    averageClientValue: company.averageClientValue,
  };
}

export function formatEuros(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(value)} €`;
}

/** Résumé chiffré pour les prompts agents — vide si l'objectif chiffré n'est pas renseigné. */
export function businessTargetLines(company: BusinessFields): string {
  const t = computeBusinessTarget(company);
  if (!t) return "";
  const lines = [
    `Situation déclarée : ${formatEuros(t.current)}/mois de CA. Objectif : ${formatEuros(t.target)}/mois${
      t.monthsRemaining != null ? ` d'ici ${t.monthsRemaining} mois` : ""
    }, soit ${t.gap >= 0 ? "+" : ""}${formatEuros(t.gap)}/mois (${t.growthPct >= 0 ? "+" : ""}${t.growthPct} %).`,
  ];
  if (company.averageClientValue) {
    lines.push(`Valeur moyenne d'un client : ${formatEuros(company.averageClientValue)}.`);
  }
  if (t.extraClientsPerMonth != null && t.extraClientsPerYear != null) {
    lines.push(
      `Il faut donc ${t.extraClientsPerYear === 0 ? "moins de 0,1 nouveau client supplémentaire par an" : `environ ${formatDecimal(t.extraClientsPerYear)} nouveaux clients supplémentaires par an, soit ${formatDecimal(t.extraClientsPerMonth)} par mois`}${
        company.newClientsPerMonth != null ? ` (rythme actuel déclaré : ${formatDecimal(company.newClientsPerMonth)}/mois)` : ""
      }. Ces chiffres sont calculés : cite-les tels quels, ne les recalcule pas. Chaque action doit être justifiée par sa contribution à cet écart, pas par un effet de visibilité vague.`,
    );
  }
  return lines.join("\n");
}
