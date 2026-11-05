import { safeAlertLabel } from "@/lib/usage-alert-rules";

/** Règles pures du crédit du fournisseur du modèle (story 8.2). Le fournisseur n'expose pas de solde : on part du solde saisi. */
export const CREDIT_ALERT_SCOPE = "credit-llm";
export const CREDIT_ALERT_LABEL = "Crédit du modèle";
export const MAX_CREDIT_USD = 1_000_000;
export const DEFAULT_CREDIT_ALERT_BELOW_USD = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_DAYS = 7;

export type CreditInput = { balanceUsd: number; alertBelowUsd: number };

export function parseCreditInput(body: unknown): { ok: true; value: CreditInput } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Demande invalide." };
  const { balanceUsd, alertBelowUsd } = body as Record<string, unknown>;
  const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_CREDIT_USD;
  if (!valid(balanceUsd)) return { ok: false, error: `Le solde doit être un montant de 0 à ${MAX_CREDIT_USD} $.` };
  if (!valid(alertBelowUsd)) return { ok: false, error: `Le seuil d'alerte doit être un montant de 0 à ${MAX_CREDIT_USD} $.` };
  return { ok: true, value: { balanceUsd, alertBelowUsd } };
}

export type CreditStatus = {
  balanceUsd: number;
  balanceAt: Date;
  alertBelowUsd: number;
  spentSinceBalanceUsd: number;
  recentSpentUsd: number;
  remainingUsd: number;
  daysLeft: number | null;
  belowThreshold: boolean;
};

/** Début de la fenêtre de rythme : 7 jours, mais jamais avant le solde saisi (rien n'est connu avant). */
export function creditRateWindowStart(balanceAt: Date, now: Date): Date {
  return new Date(Math.max(balanceAt.getTime(), now.getTime() - RATE_WINDOW_DAYS * DAY_MS));
}

/** Restant = solde saisi moins la consommation mesurée depuis ; jours restants au rythme de la fenêtre, null sans consommation. */
export function computeCredit(input: { balanceUsd: number; balanceAt: Date; alertBelowUsd: number; spentSinceBalanceUsd: number; recentSpentUsd: number; now: Date }): CreditStatus {
  const remainingUsd = Math.max(0, input.balanceUsd - input.spentSinceBalanceUsd);
  const windowDays = Math.max(1, (input.now.getTime() - creditRateWindowStart(input.balanceAt, input.now).getTime()) / DAY_MS);
  const dailyRate = input.recentSpentUsd / windowDays;
  return {
    balanceUsd: input.balanceUsd,
    balanceAt: input.balanceAt,
    alertBelowUsd: input.alertBelowUsd,
    spentSinceBalanceUsd: input.spentSinceBalanceUsd,
    recentSpentUsd: input.recentSpentUsd,
    remainingUsd,
    daysLeft: dailyRate > 0 ? remainingUsd / dailyRate : null,
    belowThreshold: remainingUsd <= input.alertBelowUsd,
  };
}

export function creditAlertEmail(alert: { remainingUsd: number; alertBelowUsd: number }, adminUrl: string): { subject: string; text: string } {
  return {
    subject: `Crédit du modèle bas : ${alert.remainingUsd.toFixed(2)} $`,
    text: [
      "Bonjour,",
      "",
      `Le crédit restant chez le fournisseur du modèle est estimé à ${alert.remainingUsd.toFixed(2)} $, sous le seuil de ${alert.alertBelowUsd.toFixed(2)} $.`,
      "Rechargez-le avant la panne, puis saisissez le nouveau solde dans l'administration.",
      "",
      `Voir l'administration : ${adminUrl}`,
      "",
      "Une seule alerte est envoyée par jour. Le seuil se règle dans l'administration.",
      "",
      "BienDecider",
    ].join("\n"),
  };
}

export const creditAlertLabel = () => safeAlertLabel(CREDIT_ALERT_LABEL);
