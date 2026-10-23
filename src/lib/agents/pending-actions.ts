import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSerializationConflict } from "@/lib/agent-runs";
import {
  PENDING_ACTION_TTL_MS,
  isPendingActionType,
  mergeProfilePayloads,
  objectiveUpdateValues,
  profileUpdateValues,
  toPendingActionView,
  updateObjectivePayloadSchema,
  updateProfilePayloadSchema,
  type PendingActionType,
  type PendingActionView,
  type UpdateObjectivePayload,
  type UpdateProfilePayload,
} from "@/lib/agents/pending-action-view";

export { describePendingAction, toPendingActionView, type PendingActionView } from "@/lib/agents/pending-action-view";

/**
 * Intentions proposées par Paul (cartes de confirmation) : ses outils ne font
 * que créer ces enregistrements. Rien n'est écrit dans Company avant le clic
 * du dirigeant, qui passe par decidePendingAction.
 */

type PayloadFor = { update_objective: UpdateObjectivePayload; update_profile: UpdateProfilePayload };
/** Renvoie false, sans rien écrire, quand l'intention enregistrée n'est plus valide. */
type Executor = (tx: Prisma.TransactionClient, companyId: string, payload: unknown) => Promise<boolean>;

/** Un exécuteur par type d'intention (exhaustif) : écrit ce que l'écran manuel équivalent écrirait. */
const EXECUTORS: { [K in PendingActionType]: Executor } = {
  // Mêmes champs que la page Entreprise, en valeurs mensuelles.
  update_objective: async (tx, companyId, payload) => {
    const parsed = updateObjectivePayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    await tx.company.update({ where: { id: companyId }, data: objectiveUpdateValues(parsed.data) });
    return true;
  },
  // Mêmes limites et même nettoyage que la page Entreprise (src/lib/company-profile.ts).
  update_profile: async (tx, companyId, payload) => {
    const parsed = updateProfilePayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    await tx.company.update({ where: { id: companyId }, data: profileUpdateValues(parsed.data) });
    return true;
  },
};

/**
 * Fusion avec la carte en attente remplacée, par type : une carte de profil
 * reprend les champs de la précédente (les nouvelles valeurs l'emportent),
 * pour qu'un second champ dit plus tard n'efface pas le premier.
 */
const MERGERS: { [K in PendingActionType]?: (previous: unknown, next: PayloadFor[K]) => PayloadFor[K] } = {
  update_profile: (previous, next) => {
    const parsed = updateProfilePayloadSchema.safeParse(previous);
    return parsed.success ? updateProfilePayloadSchema.parse(mergeProfilePayloads(parsed.data, next)) : next;
  },
};

const PAYLOAD_SCHEMAS: { [K in PendingActionType]: { parse: (value: unknown) => PayloadFor[K] } } = {
  update_objective: updateObjectivePayloadSchema,
  update_profile: updateProfilePayloadSchema,
};

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Crée une intention en attente. La précédente du même type est remplacée
 * (superseded) si elle était encore valable, marquée expirée sinon. Le tout
 * en transaction sérialisable : deux créations simultanées ne laissent
 * qu'une carte en attente.
 */
export async function createPendingAction<T extends PendingActionType>(companyId: string, type: T, payload: PayloadFor[T]) {
  const valid = PAYLOAD_SCHEMAS[type].parse(payload);
  for (let attempt = 1; ; attempt++) {
    const now = new Date();
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.paulPendingAction.updateMany({
          where: { companyId, type, status: "pending", expiresAt: { lte: now } },
          data: { status: "expired", decidedAt: now },
        });
        const merge = MERGERS[type];
        const previous = merge ? await tx.paulPendingAction.findFirst({ where: { companyId, type, status: "pending" }, orderBy: { createdAt: "desc" } }) : null;
        const finalPayload = merge && previous ? merge(previous.payload, valid) : valid;
        await tx.paulPendingAction.updateMany({
          where: { companyId, type, status: "pending" },
          data: { status: "superseded", decidedAt: now },
        });
        return tx.paulPendingAction.create({
          data: { companyId, type, payload: finalPayload as Prisma.InputJsonValue, expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS) },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= MAX_CREATE_ATTEMPTS) throw error;
    }
  }
}

export type PendingDecision = "confirm" | "cancel";
export type DecisionResult =
  | { ok: true; action: PendingActionView }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "expired"; action: PendingActionView }
  | { ok: false; error: "inactive"; action: PendingActionView | null };

const OUTCOME: Record<PendingDecision, "confirmed" | "cancelled"> = { confirm: "confirmed", cancel: "cancelled" };

/**
 * Décision du dirigeant, filtrée sur son entreprise. La transition
 * pending → confirmed est un UPDATE conditionnel fait avant l'exécuteur, dans
 * la même transaction : deux clics simultanés n'écrivent qu'une fois, le
 * second reçoit l'état confirmé sans réécrire. Une carte qui n'est plus en
 * attente (remplacée, annulée…) est refusée.
 */
export async function decidePendingAction(companyId: string, id: string, decision: PendingDecision, now: Date = new Date()): Promise<DecisionResult> {
  const outcome = OUTCOME[decision];
  const result = await prisma.$transaction(async (tx): Promise<"not_found" | "unsupported" | "invalid" | "expired" | "transitioned" | "unchanged"> => {
    const action = await tx.paulPendingAction.findFirst({ where: { id, companyId } });
    if (!action) return "not_found";
    if (!isPendingActionType(action.type)) return "unsupported";
    if (action.status === "pending" && action.expiresAt.getTime() <= now.getTime()) {
      await tx.paulPendingAction.updateMany({ where: { id, companyId, status: "pending" }, data: { status: "expired", decidedAt: now } });
      return "expired";
    }
    const transition = await tx.paulPendingAction.updateMany({
      where: { id, companyId, status: "pending", expiresAt: { gt: now } },
      data: { status: outcome, decidedAt: now },
    });
    if (transition.count === 0) return "unchanged";
    if (decision === "confirm" && !(await EXECUTORS[action.type](tx, companyId, action.payload))) {
      // Intention devenue illisible : rien n'est écrit, la carte est retirée.
      await tx.paulPendingAction.updateMany({ where: { id, companyId }, data: { status: "cancelled" } });
      return "invalid";
    }
    return "transitioned";
  });
  if (result === "not_found") return { ok: false, error: "not_found" };
  const current = await prisma.paulPendingAction.findFirst({ where: { id, companyId } });
  const view = current ? toPendingActionView(current, now) : null;
  if (!current) return { ok: false, error: "not_found" };
  if (result === "unsupported" || result === "invalid" || !view) return { ok: false, error: "inactive", action: view };
  if (result === "transitioned" || view.status === outcome) return { ok: true, action: view };
  if (view.status === "expired") return { ok: false, error: "expired", action: view };
  return { ok: false, error: "inactive", action: view };
}

/** Annule les cartes créées pendant un tour de Paul qui a échoué : aucune carte ne reste sans message. */
export async function cancelOrphanPendingActions(companyId: string, ids: string[]) {
  if (ids.length === 0) return;
  await prisma.paulPendingAction.updateMany({
    where: { companyId, id: { in: ids }, status: "pending", chatMessageId: null },
    data: { status: "cancelled", decidedAt: new Date() },
  });
}

/** Rattache les intentions créées pendant un tour au message de Paul enregistré à la fin. */
export async function attachPendingActions(companyId: string, ids: string[], chatMessageId: string): Promise<PendingActionView[]> {
  if (ids.length === 0) return [];
  await prisma.paulPendingAction.updateMany({ where: { companyId, id: { in: ids } }, data: { chatMessageId } });
  const actions = await prisma.paulPendingAction.findMany({ where: { companyId, id: { in: ids } }, orderBy: { createdAt: "asc" } });
  return actions.map((action) => toPendingActionView(action)).filter((view): view is PendingActionView => view !== null);
}

/** Cartes de chaque message de Paul, pour l'historique du panneau. */
export async function pendingActionsByMessage(companyId: string, chatMessageIds: string[]): Promise<Map<string, PendingActionView[]>> {
  const byMessage = new Map<string, PendingActionView[]>();
  if (chatMessageIds.length === 0) return byMessage;
  const actions = await prisma.paulPendingAction.findMany({
    where: { companyId, chatMessageId: { in: chatMessageIds } },
    orderBy: { createdAt: "asc" },
  });
  const now = new Date();
  for (const action of actions) {
    const view = toPendingActionView(action, now);
    if (!view || !action.chatMessageId) continue;
    byMessage.set(action.chatMessageId, [...(byMessage.get(action.chatMessageId) ?? []), view]);
  }
  return byMessage;
}

/** Ce que Paul sait de ses dernières cartes (get_current_status) : type, statut et date de décision. */
export async function recentPendingActions(companyId: string, take = 5) {
  const actions = await prisma.paulPendingAction.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: { type: true, status: true, decidedAt: true, expiresAt: true },
  });
  const now = Date.now();
  return actions.map((action) => ({
    type: action.type,
    status: action.status === "pending" && action.expiresAt.getTime() <= now ? "expired" : action.status,
    decidedAt: action.decidedAt?.toISOString() ?? null,
  }));
}
