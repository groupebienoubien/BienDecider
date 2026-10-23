import { z } from "zod";
import { clientsToMonthly, formatDecimal, formatEuros, toMonthly, type Period } from "@/lib/business-target";

/**
 * Partie pure des intentions de Paul (cartes de confirmation) : schémas,
 * conversion et lignes affichées. Sans accès base, donc utilisable par le
 * panneau de Paul et les tests sans base — cf. pending-actions.ts.
 */

export const PENDING_ACTION_TYPES = ["update_objective"] as const;
export type PendingActionType = (typeof PENDING_ACTION_TYPES)[number];
export function isPendingActionType(type: string): type is PendingActionType {
  return (PENDING_ACTION_TYPES as readonly string[]).includes(type);
}
/** superseded = remplacée par une carte plus récente du même type, sans geste du dirigeant. */
export const PENDING_ACTION_STATUSES = ["pending", "confirmed", "cancelled", "expired", "superseded"] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

/** Une carte non décidée expire 24 h après sa création. */
export const PENDING_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
export const EXPIRED_MESSAGE = "Cette proposition a expiré. Redites votre objectif à Paul.";
export const INACTIVE_MESSAGE = "Cette proposition n'est plus active.";

// Mêmes bornes que la page Entreprise (entiers 32 bits en base).
export const MAX_AMOUNT = 1_000_000_000;
const amount = z.number().finite().min(0).max(MAX_AMOUNT);
const period = z.enum(["month", "year"]);

/**
 * Ce que dit le dirigeant, tel quel : chaque montant avec la période dans
 * laquelle il l'a dit (la valeur d'un client n'en a pas). Le code convertit.
 */
export const updateObjectivePayloadSchema = z.object({
  revenueTarget: amount,
  targetPeriod: period,
  currentRevenue: amount.optional(),
  currentPeriod: period.optional(),
  averageClientValue: amount.optional(),
  newClients: amount.optional(),
  newClientsPeriod: period.optional(),
  /** Échéance « AAAA-MM », enregistrée en fin de mois comme sur la page Entreprise. */
  targetDate: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional(),
}).strict().superRefine((payload, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (payload.currentRevenue != null && !payload.currentPeriod) issue("currentPeriod", "Période du chiffre d'affaires actuel manquante");
  if (payload.newClients != null && !payload.newClientsPeriod) issue("newClientsPeriod", "Période du nombre de clients manquante");
  // Un montant qui, converti au mois, arrondit sous 1 € ne peut pas être enregistré.
  if (toMonthly(payload.revenueTarget, payload.targetPeriod) < 1) issue("revenueTarget", "Objectif inférieur à 1 € par mois");
  if (payload.currentRevenue != null && payload.currentPeriod && toMonthly(payload.currentRevenue, payload.currentPeriod) < 1) {
    issue("currentRevenue", "Chiffre d'affaires actuel inférieur à 1 € par mois");
  }
  if (payload.averageClientValue != null && Math.round(payload.averageClientValue) < 1) issue("averageClientValue", "Valeur d'un client inférieure à 1 €");
});
export type UpdateObjectivePayload = z.infer<typeof updateObjectivePayloadSchema>;

/** Valeurs mensuelles écrites dans Company à la confirmation ; un champ absent n'est pas modifié. */
export type ObjectiveUpdate = {
  revenueTarget: number;
  monthlyRevenue?: number;
  averageClientValue?: number;
  newClientsPerMonth?: number;
  targetDate?: Date;
  objective: string;
};

const PERIOD_WORD: Record<Period, string> = { month: "par mois", year: "par an" };
const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Fin du mois « AAAA-MM » (dernier jour, minuit UTC). */
export function endOfMonth(month: string): Date {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
}

export function objectiveUpdateValues(payload: UpdateObjectivePayload): ObjectiveUpdate {
  const target = formatEuros(payload.revenueTarget);
  const hasCurrent = payload.currentRevenue != null && payload.currentPeriod != null;
  let objective: string;
  if (hasCurrent && payload.currentPeriod === payload.targetPeriod) {
    objective = `Passer de ${formatEuros(payload.currentRevenue!)} à ${target} de chiffre d'affaires ${PERIOD_WORD[payload.targetPeriod]}`;
  } else if (hasCurrent) {
    objective = `Passer de ${formatEuros(payload.currentRevenue!)} ${PERIOD_WORD[payload.currentPeriod!]} à ${target} ${PERIOD_WORD[payload.targetPeriod]} de chiffre d'affaires`;
  } else {
    objective = `Atteindre ${target} de chiffre d'affaires ${PERIOD_WORD[payload.targetPeriod]}`;
  }
  if (payload.targetDate) objective += ` d'ici ${MONTH_LABEL.format(endOfMonth(payload.targetDate))}`;
  return {
    revenueTarget: toMonthly(payload.revenueTarget, payload.targetPeriod),
    ...(hasCurrent ? { monthlyRevenue: toMonthly(payload.currentRevenue!, payload.currentPeriod!) } : {}),
    // La valeur d'un client ne dépend pas d'une période : gardée telle quelle, arrondie à l'euro.
    ...(payload.averageClientValue != null ? { averageClientValue: Math.round(payload.averageClientValue) } : {}),
    ...(payload.newClients != null && payload.newClientsPeriod ? { newClientsPerMonth: clientsToMonthly(payload.newClients, payload.newClientsPeriod) } : {}),
    ...(payload.targetDate ? { targetDate: endOfMonth(payload.targetDate) } : {}),
    objective,
  };
}

export type PendingActionDescription = { title: string; lines: string[]; confirmLabel: string };

/** Lignes de la carte, construites depuis l'intention enregistrée (jamais depuis le texte de Paul). */
export function describePendingAction(action: { type: string; payload: unknown }): PendingActionDescription | null {
  if (action.type !== "update_objective") return null;
  const parsed = updateObjectivePayloadSchema.safeParse(action.payload);
  if (!parsed.success) return null;
  const values = objectiveUpdateValues(parsed.data);
  const lines = [`${formatEuros(values.revenueTarget)}/mois visés`];
  if (values.monthlyRevenue != null) lines.push(`${formatEuros(values.monthlyRevenue)}/mois actuels`);
  if (values.averageClientValue != null) lines.push(`${formatEuros(values.averageClientValue)} par client`);
  if (values.newClientsPerMonth != null) {
    lines.push(`${formatDecimal(values.newClientsPerMonth)} ${values.newClientsPerMonth >= 2 ? "clients" : "client"}/mois aujourd'hui`);
  }
  if (values.targetDate) lines.push(`Échéance : ${MONTH_LABEL.format(values.targetDate)}`);
  return { title: `Enregistrer votre objectif : ${values.objective}`, lines, confirmLabel: "Confirmer" };
}

export type PendingActionView = {
  id: string;
  type: string;
  status: PendingActionStatus;
  title: string;
  lines: string[];
  confirmLabel: string;
  expiresAt: string;
};

/** Vue affichable ; une carte encore « pending » dont l'échéance est passée est montrée expirée. */
export function toPendingActionView(
  action: { id: string; type: string; status: string; payload: unknown; expiresAt: Date },
  now: Date = new Date(),
): PendingActionView | null {
  const description = describePendingAction(action);
  if (!description) return null;
  const known = (PENDING_ACTION_STATUSES as readonly string[]).includes(action.status) ? (action.status as PendingActionStatus) : "expired";
  const status = known === "pending" && action.expiresAt.getTime() <= now.getTime() ? "expired" : known;
  return { id: action.id, type: action.type, status, ...description, expiresAt: action.expiresAt.toISOString() };
}
