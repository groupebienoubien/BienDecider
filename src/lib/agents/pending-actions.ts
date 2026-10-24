import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/serialization-conflict";
import { failureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";
import {
  PENDING_ACTION_TTL_MS,
  isPendingActionType,
  launchPlanItemPayloadSchema,
  mergeProfilePayloads,
  objectiveUpdateValues,
  profileUpdateValues,
  reviseProposalPayloadSchema,
  toPendingActionView,
  updateObjectivePayloadSchema,
  updateProfilePayloadSchema,
  type PendingActionType,
  type LaunchPlanItemPayload,
  type LaunchResult,
  type PendingActionView,
  type ReviseProposalPayload,
  type UpdateObjectivePayload,
  type UpdateProfilePayload,
} from "@/lib/agents/pending-action-view";

export { describePendingAction, toPendingActionView, type PendingActionView } from "@/lib/agents/pending-action-view";

/**
 * Intentions proposées par Paul (cartes de confirmation) : ses outils ne font
 * que créer ces enregistrements. Rien n'est écrit dans Company avant le clic
 * du dirigeant, qui passe par decidePendingAction.
 */

type PayloadFor = {
  update_objective: UpdateObjectivePayload;
  update_profile: UpdateProfilePayload;
  launch_plan_item: LaunchPlanItemPayload;
  revise_proposal: ReviseProposalPayload;
};
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
  // Le lancement lui-même se fait après la transaction (launchConfirmedPlanItem) : il a ses propres
  // transactions et programme l'exécution avec after(). Ici, on vérifie seulement que la carte est lisible.
  launch_plan_item: async (_tx, _companyId, payload) => launchPlanItemPayloadSchema.safeParse(payload).success,
  // Comme un lancement : l'exécution de révision est créée après la transaction (reviseConfirmedProposal).
  revise_proposal: async (_tx, _companyId, payload) => reviseProposalPayloadSchema.safeParse(payload).success,
};

/**
 * Lancement confirmé d'une carte : même chemin que le bouton « Lancer » du
 * plan (launchPlanItemFromCard : relance d'un échec, motifs typés). Le résultat
 * est enregistré sur la carte pour le panneau et pour Paul au tour suivant.
 */
async function launchConfirmedPlanItem(companyId: string, id: string, payload: unknown): Promise<LaunchResult | null> {
  const parsed = launchPlanItemPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { planItemId, agent, title, extras } = parsed.data;
  const agentName = PERSONAS[agent].name;
  let result: LaunchResult;
  try {
    // Import différé : co-ceo.ts importe ce module (outils de Paul), pas de dépendance circulaire au chargement.
    const { launchPlanItemFromCard } = await import("@/lib/agents/co-ceo");
    const delegation = await launchPlanItemFromCard(companyId, agent, planItemId, extras ?? {});
    result = {
      ok: delegation.ok,
      ...(delegation.reason ? { reason: delegation.reason } : {}),
      // Sans motif, l'action n'était plus lançable (écartée, terminée) : le message destiné à Paul n'est pas montré.
      message: delegation.ok || delegation.reason ? delegation.message : `L'action « ${title} » n'est plus à lancer dans votre plan : rien n'a été lancé.`,
      ...(delegation.runId ? { runId: delegation.runId } : {}),
    };
  } catch (error) {
    console.error(`Lancement confirmé ${agent} impossible :`, error);
    result = { ok: false, reason: "outage", message: failureMessage("outage", agentName) };
  }
  // L'exécution est peut-être déjà en file : un échec d'écriture du résultat ne fait pas échouer la décision.
  try {
    await prisma.paulPendingAction.updateMany({
      where: { id, companyId },
      data: { payload: { ...parsed.data, result } as Prisma.InputJsonValue },
    });
  } catch (error) {
    console.error("Résultat du lancement non enregistré sur la carte :", error);
  }
  return result;
}

/**
 * Révision confirmée d'une carte (story 3.3) : crée l'exécution de révision
 * de l'agent auteur, après la transition atomique de la carte. Le résultat
 * est enregistré sur la carte, comme pour un lancement.
 */
async function reviseConfirmedProposal(companyId: string, id: string, payload: unknown): Promise<LaunchResult | null> {
  const parsed = reviseProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { proposalId, agent, title, fromVersion, instruction } = parsed.data;
  const card = { proposalId, agent, title, fromVersion, instruction };
  let result: LaunchResult;
  try {
    // Import différé : revision.ts dépend d'agent-runs, chargé seulement au clic.
    const { startRevisionFromCard } = await import("@/lib/agents/revision");
    result = await startRevisionFromCard(companyId, card);
  } catch (error) {
    console.error(`Révision confirmée ${card.agent} impossible :`, error);
    result = { ok: false, reason: "outage", message: failureMessage("outage", PERSONAS[card.agent].name) };
  }
  try {
    await prisma.paulPendingAction.updateMany({
      where: { id, companyId },
      data: { payload: { ...card, result } as Prisma.InputJsonValue },
    });
  } catch (error) {
    console.error("Résultat de la révision non enregistré sur la carte :", error);
  }
  return result;
}

/** Effets exécutés après la transition pending → confirmed, hors transaction. */
const AFTER_CONFIRM: { [K in PendingActionType]?: (companyId: string, id: string, payload: unknown) => Promise<LaunchResult | null> } = {
  launch_plan_item: launchConfirmedPlanItem,
  revise_proposal: reviseConfirmedProposal,
};

/**
 * Cible d'une intention : une nouvelle carte ne remplace que la carte en
 * attente de même type et de même cible. Objectif et profil n'ont qu'une
 * cible (l'entreprise) ; un lancement vise une action du plan, une révision une production.
 */
function sameTarget(type: PendingActionType, payload: unknown): Prisma.PaulPendingActionWhereInput {
  if (type === "launch_plan_item") {
    const parsed = launchPlanItemPayloadSchema.safeParse(payload);
    return parsed.success ? { payload: { path: ["planItemId"], equals: parsed.data.planItemId } } : {};
  }
  if (type === "revise_proposal") {
    const parsed = reviseProposalPayloadSchema.safeParse(payload);
    return parsed.success ? { payload: { path: ["proposalId"], equals: parsed.data.proposalId } } : {};
  }
  return {};
}

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
  launch_plan_item: launchPlanItemPayloadSchema,
  revise_proposal: reviseProposalPayloadSchema,
};

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Crée une intention en attente. La précédente du même type et de même cible est remplacée
 * (superseded) si elle était encore valable, marquée expirée sinon. Le tout
 * en transaction sérialisable : deux créations simultanées ne laissent
 * qu'une carte en attente.
 */
export async function createPendingAction<T extends PendingActionType>(companyId: string, type: T, payload: PayloadFor[T]) {
  const valid = PAYLOAD_SCHEMAS[type].parse(payload);
  const target = sameTarget(type, valid);
  return withSerializableRetry(() => {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      await tx.paulPendingAction.updateMany({
        where: { companyId, type, status: "pending", expiresAt: { lte: now }, ...target },
        data: { status: "expired", decidedAt: now },
      });
      const merge = MERGERS[type];
      const previous = merge ? await tx.paulPendingAction.findFirst({ where: { companyId, type, status: "pending", ...target }, orderBy: { createdAt: "desc" } }) : null;
      const finalPayload = merge && previous ? merge(previous.payload, valid) : valid;
      await tx.paulPendingAction.updateMany({
        where: { companyId, type, status: "pending", ...target },
        data: { status: "superseded", decidedAt: now },
      });
      return tx.paulPendingAction.create({
        data: { companyId, type, payload: finalPayload as Prisma.InputJsonValue, expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }, MAX_CREATE_ATTEMPTS);
}

export type PendingDecision = "confirm" | "cancel";
export type DecisionResult =
  | { ok: true; action: PendingActionView; launch?: LaunchResult }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "expired"; action: PendingActionView }
  | { ok: false; error: "inactive"; action: PendingActionView | null };

const OUTCOME: Record<PendingDecision, "confirmed" | "cancelled"> = { confirm: "confirmed", cancel: "cancelled" };

/**
 * Décision du dirigeant, filtrée sur son entreprise. La transition
 * pending → confirmed est un UPDATE conditionnel fait avant l'exécuteur, dans
 * la même transaction : deux clics simultanés n'écrivent qu'une fois, le
 * second reçoit l'état confirmé sans réécrire. Une carte qui n'est plus en
 * attente (remplacée, annulée…) est refusée. Un lancement confirmé part
 * après la transaction : rien n'est lancé sans la transition, et un second
 * clic ne lance pas une seconde fois.
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
  let launch: LaunchResult | null = null;
  if (result === "transitioned" && decision === "confirm") {
    const record = await prisma.paulPendingAction.findFirst({ where: { id, companyId } });
    const afterConfirm = record && isPendingActionType(record.type) ? AFTER_CONFIRM[record.type] : undefined;
    if (record && afterConfirm) launch = await afterConfirm(companyId, id, record.payload);
  }
  const current = await prisma.paulPendingAction.findFirst({ where: { id, companyId } });
  const stored = current ? toPendingActionView(current, now) : null;
  // Résultat du lancement non relu (écriture échouée) : la vue le reprend quand même.
  const view = stored && launch && !stored.result ? { ...stored, result: launch } : stored;
  if (!current) return { ok: false, error: "not_found" };
  if (result === "unsupported" || result === "invalid" || !view) return { ok: false, error: "inactive", action: view };
  if (result === "transitioned" || view.status === outcome) return { ok: true, action: view, ...(launch ? { launch } : {}) };
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

/**
 * Ce que Paul sait de ses dernières cartes (get_current_status) : type, statut
 * et date de décision ; pour un lancement, l'action visée et ce que le clic a donné ;
 * pour une révision, la production visée, sa version et ce que le clic a donné.
 */
export async function recentPendingActions(companyId: string, take = 10) {
  const actions = await prisma.paulPendingAction.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: { type: true, status: true, decidedAt: true, expiresAt: true, payload: true },
  });
  const now = Date.now();
  return actions.map((action) => {
    const launch = action.type === "launch_plan_item" ? launchPlanItemPayloadSchema.safeParse(action.payload) : null;
    const revision = action.type === "revise_proposal" ? reviseProposalPayloadSchema.safeParse(action.payload) : null;
    return {
      type: action.type,
      status: action.status === "pending" && action.expiresAt.getTime() <= now ? "expired" : action.status,
      decidedAt: action.decidedAt?.toISOString() ?? null,
      ...(launch?.success ? {
        planItemId: launch.data.planItemId,
        agent: launch.data.agent,
        action: launch.data.title,
        ...(launch.data.result
          ? { lancement: { ok: launch.data.result.ok, reason: launch.data.result.reason ?? null, message: launch.data.result.message } }
          // Confirmée sans résultat enregistré : issue inconnue pour l'instant (voir executionsRecentes).
          : action.status === "confirmed" ? { lancement: { ok: null } } : {}),
      } : {}),
      ...(revision?.success ? {
        proposalId: revision.data.proposalId,
        agent: revision.data.agent,
        production: revision.data.title,
        versionRevisee: revision.data.fromVersion,
        consigne: revision.data.instruction,
        ...(revision.data.result
          ? { lancement: { ok: revision.data.result.ok, reason: revision.data.result.reason ?? null, message: revision.data.result.message } }
          : action.status === "confirmed" ? { lancement: { ok: null } } : {}),
      } : {}),
    };
  });
}
