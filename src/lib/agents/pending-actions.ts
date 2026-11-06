import { withAgentRunWrite } from "@/lib/agent-run-execution";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/serialization-conflict";
import { MissionError } from "@/lib/missions/messages";
import { MissionNotFoundError, applyMissionTransitionIn, createMissionIn } from "@/lib/missions/service";
import type { MissionAction } from "@/lib/missions/rules";
import { DEFAULT_CONTEXT_KEY } from "@/lib/paul-contexts";
import { IdeaNotFoundError, ideaFrameHref, noteIdeaIn } from "@/lib/ideas";
import { profileChanges } from "@/lib/company-profile";
import { markProfileChanged } from "@/lib/contents/service";
import {
  KEEP_COURSE_REPLY,
  ideaNotePayloadSchema,
  PAYLOAD_SCHEMAS,
  PENDING_ACTION_TTL_MS,
  isPendingActionType,
  launchFrameHref,
  mergeProfilePayloads,
  missionCreatePayloadSchema,
  missionRefPayloadSchema,
  missionScopePayloadSchema,
  pendingActionMissionId,
  profileUpdateValues,
  toPendingActionView,
  updateProfilePayloadSchema,
  type PayloadFor,
  type PendingActionType,
  type PendingActionView,
} from "@/lib/agents/pending-action-view";

export { describePendingAction, toPendingActionView, type PendingActionView } from "@/lib/agents/pending-action-view";

/**
 * Propositions de Paul (cartes « Paul · proposition à confirmer », spécification §16.3) : ses outils ne font
 * que créer ces enregistrements. Rien ne change avant « Accepter », qui passe par decidePendingAction :
 * l'exécuteur appelle le service des missions dans la transaction de la confirmation, avec les mêmes
 * contrôles qu'à la main.
 */

/** Effet d'une acceptation : rien de plus, ou une adresse où mener le dirigeant (lancement). Faux : intention devenue illisible. */
type Executed = { redirect?: string } | false;
type Executor = (tx: Prisma.TransactionClient, companyId: string, payload: unknown) => Promise<Executed>;

/** Transition de mission proposée par Paul, appliquée à la version courante : un refus du service (M-xx) annule tout. */
function transition(build: (payload: unknown) => { missionId: string; request: MissionAction } | null): Executor {
  return async (tx, companyId, payload) => {
    const target = build(payload);
    if (!target) return false;
    try {
      await applyMissionTransitionIn(tx, companyId, target.missionId, target.request, null);
    } catch (error) {
      if (error instanceof MissionNotFoundError) return false;
      throw error;
    }
    return {};
  };
}

/** Statuts où le dialogue « Confirmer le cadre de la mission » peut s'ouvrir. */
const LAUNCHABLE: readonly string[] = ["proposed", "paused"];

const ref = (action: "set_priority" | "pause" | "dismiss" | "restore") => transition((payload) => {
  const parsed = missionRefPayloadSchema.safeParse(payload);
  return parsed.success ? { missionId: parsed.data.missionId, request: { action } } : null;
});

/** Un exécuteur par type de proposition (exhaustif) : écrit ce que l'écran manuel équivalent écrirait. */
const EXECUTORS: { [K in PendingActionType]: Executor } = {
  // Mêmes limites et même nettoyage que la page Entreprise (src/lib/company-profile.ts).
  update_profile: async (tx, companyId, payload) => {
    const parsed = updateProfilePayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    const values = profileUpdateValues(parsed.data);
    const before = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    await tx.company.update({ where: { id: companyId }, data: values });
    // Même effet qu'une correction depuis Entreprise (J-02, §4.5), dans la transaction de l'acceptation.
    if (before.name && profileChanges(before, values)) await markProfileChanged(tx, companyId);
    return {};
  },
  mission_priority: ref("set_priority"),
  mission_scope: transition((payload) => {
    const parsed = missionScopePayloadSchema.safeParse(payload);
    return parsed.success ? { missionId: parsed.data.missionId, request: { action: "set_scope", scope: parsed.data.scope } } : null;
  }),
  mission_pause: ref("pause"),
  mission_dismiss: ref("dismiss"),
  mission_restore: ref("restore"),
  mission_create: async (tx, companyId, payload) => {
    const parsed = missionCreatePayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    const { ideaId, findingId, deduction, ...body } = parsed.data;
    try {
      // Le constat est vérifié de nouveau par le service : devenu étranger ou ancien, la mission est créée sans lien (#168).
      await createMissionIn(tx, companyId, body, "paul", ideaId, { sourceFindingId: findingId, deduction });
    } catch (error) {
      // Idée déjà cadrée, retirée ou absente : aucune mission n'est créée (vérifié avant toute écriture).
      if (error instanceof IdeaNotFoundError) return false;
      throw error;
    }
    return {};
  },
  // « Lancer » n'exécute rien : il mène au dialogue « Confirmer le cadre de la mission » (§13.7), rien n'est débité ici.
  mission_launch: async (tx, companyId, payload) => {
    const parsed = missionRefPayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    const mission = await tx.mission.findFirst({ where: { id: parsed.data.missionId, companyId }, select: { id: true, status: true } });
    if (!mission) return false;
    if (mission.status === "stopped") throw new MissionError("M-40");
    if (mission.status === "dismissed") throw new MissionError("M-21");
    // Déjà en cours : rien à lancer (idempotent, §2.2) et pas de cadre à ouvrir.
    return LAUNCHABLE.includes(mission.status) ? { redirect: launchFrameHref(mission.id) } : {};
  },
  // « Noter l'idée » (US #312) : M-62 et M-63 refaits à l'acceptation, J-16, puis « Cadrons votre nouvelle mission » prérempli.
  idea_note: async (tx, companyId, payload) => {
    const parsed = ideaNotePayloadSchema.safeParse(payload);
    if (!parsed.success) return false;
    const idea = await noteIdeaIn(tx, companyId, parsed.data.text);
    return { redirect: ideaFrameHref(idea.id) };
  },
};

/**
 * Cible d'une intention : une nouvelle carte ne remplace que la carte en attente de même type et de même
 * cible. Le profil n'a qu'une cible (l'entreprise) ; une proposition sur une mission vise cette mission,
 * une création vise son titre.
 */
function sameTarget(type: PendingActionType, payload: unknown): Prisma.PaulPendingActionWhereInput {
  // Une seule priorité possible : une nouvelle carte de priorité remplace toute carte de priorité en attente.
  if (type === "mission_priority") return {};
  const missionId = pendingActionMissionId({ type, payload });
  if (missionId) return { payload: { path: ["missionId"], equals: missionId } };
  if (type === "mission_create") {
    const parsed = missionCreatePayloadSchema.safeParse(payload);
    return parsed.success ? { payload: { path: ["title"], equals: parsed.data.title } } : {};
  }
  // Une idée vise son texte : la même idée redite remplace la carte en attente, une autre idée s'ajoute.
  if (type === "idea_note") {
    const parsed = ideaNotePayloadSchema.safeParse(payload);
    return parsed.success ? { payload: { path: ["text"], equals: parsed.data.text } } : {};
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

const MAX_CREATE_ATTEMPTS = 3;

/**
 * Crée une intention en attente. La précédente du même type et de même cible est remplacée
 * (superseded) si elle était encore valable, marquée expirée sinon. Le tout
 * en transaction sérialisable : deux créations simultanées ne laissent
 * qu'une carte en attente.
 */
export async function createPendingAction<T extends PendingActionType>(companyId: string, type: T, payload: PayloadFor[T]) {
  const valid = PAYLOAD_SCHEMAS[type].parse(payload) as PayloadFor[T];
  const target = sameTarget(type, valid);
  return withSerializableRetry(() => {
    const now = new Date();
    return withAgentRunWrite(companyId, undefined, async (tx) => {
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
    });
  }, MAX_CREATE_ATTEMPTS);
}

export type PendingDecision = "confirm" | "cancel";
export type PaulReplyMessage = { id: string; role: "assistant"; content: string; createdAt: string; contextKey: string };
export type DecisionResult =
  | { ok: true; action: PendingActionView; redirect?: string; reply?: PaulReplyMessage }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "expired"; action: PendingActionView }
  | { ok: false; error: "refused"; message: string; code: string; status: number; action: PendingActionView | null }
  | { ok: false; error: "inactive"; action: PendingActionView | null };

const OUTCOME: Record<PendingDecision, "confirmed" | "cancelled"> = { confirm: "confirmed", cancel: "cancelled" };

type Transitioned = { kind: "transitioned"; redirect?: string; reply?: PaulReplyMessage };
type TxOutcome = { kind: "not_found" | "unsupported" | "invalid" | "expired" | "unchanged" } | Transitioned;

/**
 * Décision du dirigeant, filtrée sur son entreprise. La transition pending → confirmed est un UPDATE
 * conditionnel fait avant l'exécuteur, dans la même transaction : deux clics simultanés n'écrivent qu'une
 * fois. Un refus du service des missions (M-xx) annule toute la transaction : la carte reste en attente
 * et rien n'est écrit. « Garder le cap actuel » annule la carte et enregistre la réponse fixe de Paul
 * dans le fil de la carte.
 */
export async function decidePendingAction(companyId: string, id: string, decision: PendingDecision, now: Date = new Date()): Promise<DecisionResult> {
  const outcome = OUTCOME[decision];
  let result: TxOutcome;
  try {
    result = await prisma.$transaction(async (tx): Promise<TxOutcome> => {
      const action = await tx.paulPendingAction.findFirst({ where: { id, companyId }, include: { chatMessage: { select: { contextKey: true } } } });
      if (!action) return { kind: "not_found" };
      if (!isPendingActionType(action.type)) return { kind: "unsupported" };
      if (action.status === "pending" && action.expiresAt.getTime() <= now.getTime()) {
        await tx.paulPendingAction.updateMany({ where: { id, companyId, status: "pending" }, data: { status: "expired", decidedAt: now } });
        return { kind: "expired" };
      }
      const moved = await tx.paulPendingAction.updateMany({
        where: { id, companyId, status: "pending", expiresAt: { gt: now } },
        data: { status: outcome, decidedAt: now },
      });
      if (moved.count === 0) return { kind: "unchanged" };
      if (decision === "cancel") {
        const contextKey = action.chatMessage?.contextKey ?? DEFAULT_CONTEXT_KEY;
        const message = await tx.chatMessage.create({ data: { companyId, role: "assistant", content: KEEP_COURSE_REPLY, contextKey } });
        return { kind: "transitioned", reply: { id: message.id, role: "assistant", content: message.content, createdAt: message.createdAt.toISOString(), contextKey } };
      }
      const executed = await EXECUTORS[action.type](tx, companyId, action.payload);
      if (executed === false) {
        // Intention devenue illisible ou mission disparue : rien n'est écrit, la carte est retirée.
        await tx.paulPendingAction.updateMany({ where: { id, companyId }, data: { status: "cancelled" } });
        return { kind: "invalid" };
      }
      return { kind: "transitioned", ...(executed.redirect ? { redirect: executed.redirect } : {}) };
    }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    if (!(error instanceof MissionError)) throw error;
    // Refus des règles : la transaction est annulée, la carte reste en attente, le message M-xx s'affiche sur elle.
    const current = await prisma.paulPendingAction.findFirst({ where: { id, companyId } });
    return { ok: false, error: "refused", message: error.message, code: error.code, status: error.status, action: current ? toPendingActionView(current, now) : null };
  }
  if (result.kind === "not_found") return { ok: false, error: "not_found" };
  const current = await prisma.paulPendingAction.findFirst({ where: { id, companyId } });
  if (!current) return { ok: false, error: "not_found" };
  const view = toPendingActionView(current, now);
  if (result.kind === "unsupported" || result.kind === "invalid" || !view) return { ok: false, error: "inactive", action: view };
  if (result.kind === "transitioned") return { ok: true, action: view, ...(result.redirect ? { redirect: result.redirect } : {}), ...(result.reply ? { reply: result.reply } : {}) };
  // Second clic sur une carte déjà décidée de la même façon : même réponse, sans réécrire.
  if (view.status === outcome) {
    const missionId = pendingActionMissionId(current);
    const launchable = decision === "confirm" && current.type === "mission_launch" && missionId
      ? await prisma.mission.findFirst({ where: { id: missionId, companyId, status: { in: [...LAUNCHABLE] } }, select: { id: true } })
      : null;
    const redirect = launchable ? launchFrameHref(launchable.id) : undefined;
    return { ok: true, action: view, ...(redirect ? { redirect } : {}) };
  }
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
  return withAgentRunWrite(companyId, undefined, async (tx) => {
    await tx.paulPendingAction.updateMany({ where: { companyId, id: { in: ids } }, data: { chatMessageId } });
    const actions = await tx.paulPendingAction.findMany({ where: { companyId, id: { in: ids } }, orderBy: { createdAt: "asc" } });
    return actions.map((action) => toPendingActionView(action)).filter((view): view is PendingActionView => view !== null);
  });
}

/** Cartes de chaque message de Paul, pour l'historique du panneau ; les anciennes cartes ne s'affichent plus. */
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
 * Ce que Paul sait de ses dernières propositions (get_current_status) : type, statut, date de décision
 * et mission visée. pending = à confirmer, confirmed = acceptée, cancelled = « Garder le cap actuel »,
 * superseded = remplacée par une plus récente, expired = non décidée sous 24 h.
 */
export async function recentPendingActions(companyId: string, take = 10) {
  const actions = await prisma.paulPendingAction.findMany({
    where: { companyId, type: { in: Object.keys(PAYLOAD_SCHEMAS) } },
    orderBy: { createdAt: "desc" },
    take,
    select: { type: true, status: true, decidedAt: true, expiresAt: true, payload: true },
  });
  const now = Date.now();
  return actions.map((action) => {
    const title = action.payload !== null && typeof action.payload === "object" && !Array.isArray(action.payload) ? (action.payload as Record<string, unknown>).title : undefined;
    const missionId = pendingActionMissionId(action);
    return {
      type: action.type,
      status: action.status === "pending" && action.expiresAt.getTime() <= now ? "expired" : action.status,
      decidedAt: action.decidedAt?.toISOString() ?? null,
      ...(missionId ? { missionId } : {}),
      ...(typeof title === "string" ? { mission: title } : {}),
    };
  });
}
