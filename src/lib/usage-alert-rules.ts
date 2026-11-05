// Règles pures des alertes de consommation (story 7.3) : sans base de données, testables sans réseau.
export type UsageAlertThresholds = { companyDailyUsd: number; totalDailyUsd: number };
export type CrossedAlert = { scope: string; label: string; thresholdUsd: number; costUsd: number };

export const DEFAULT_USAGE_ALERT_THRESHOLDS: UsageAlertThresholds = { companyDailyUsd: 3, totalDailyUsd: 10 };
export const MIN_USAGE_ALERT_USD = 0.01;
export const MAX_USAGE_ALERT_USD = 100_000;
export const TOTAL_ALERT_SCOPE = "total";

export const companyAlertScope = (companyId: string) => `company:${companyId}`;

/** Portées dont le coût du jour atteint le seuil (égalité comprise). */
export function crossedAlerts(input: { companyId: string; companyLabel: string; companyDayCostUsd: number; totalDayCostUsd: number; thresholds: UsageAlertThresholds }): CrossedAlert[] {
  const crossed: CrossedAlert[] = [];
  if (input.companyDayCostUsd >= input.thresholds.companyDailyUsd) {
    crossed.push({ scope: companyAlertScope(input.companyId), label: input.companyLabel, thresholdUsd: input.thresholds.companyDailyUsd, costUsd: input.companyDayCostUsd });
  }
  if (input.totalDayCostUsd >= input.thresholds.totalDailyUsd) {
    crossed.push({ scope: TOTAL_ALERT_SCOPE, label: "Total", thresholdUsd: input.thresholds.totalDailyUsd, costUsd: input.totalDayCostUsd });
  }
  return crossed;
}

export function parseUsageAlertInput(body: unknown): { ok: true; value: UsageAlertThresholds } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const { companyDailyUsd, totalDailyUsd } = body as Record<string, unknown>;
  for (const value of [companyDailyUsd, totalDailyUsd]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_USAGE_ALERT_USD || value > MAX_USAGE_ALERT_USD) {
      return { ok: false, error: `Chaque seuil doit être un nombre de ${MIN_USAGE_ALERT_USD} à ${MAX_USAGE_ALERT_USD} dollars.` };
    }
  }
  return { ok: true, value: { companyDailyUsd: companyDailyUsd as number, totalDailyUsd: totalDailyUsd as number } };
}

/** Libellé sûr pour un objet d'e-mail : une seule ligne, 80 caractères au plus. */
export function safeAlertLabel(label: string): string {
  const flat = label.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
  return flat || "Entreprise sans nom";
}

export function alertEmail(alert: CrossedAlert, adminUrl: string): { subject: string; text: string } {
  const label = safeAlertLabel(alert.label);
  const scope = alert.scope === TOTAL_ALERT_SCOPE ? "La consommation totale du jour" : `La consommation du jour de « ${label} »`;
  return {
    subject: `Consommation anormale : ${label}`,
    text: [
      "Bonjour,",
      "",
      `${scope} atteint ${alert.costUsd.toFixed(2)} $, pour un seuil de ${alert.thresholdUsd.toFixed(2)} $.`,
      "",
      `Voir l'administration : ${adminUrl}`,
      "",
      "Une seule alerte est envoyée par portée et par jour. Les seuils se règlent dans l'administration.",
      "",
      "BienDecider",
    ].join("\n"),
  };
}
