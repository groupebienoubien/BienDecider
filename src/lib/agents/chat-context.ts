import { prisma } from "@/lib/prisma";
import { chatWindow } from "@/lib/agents/paul-message-times";
import { contextKeyOf, contextTitle, parseContextKey, CONTEXT_HISTORY_MESSAGES, DEFAULT_CONTEXT_KEY, type PaulContext } from "@/lib/paul-contexts";

/** Nombre de messages relus par Paul à chaque tour, dans la conversation du contexte (spécification §12 : 60). */
export const CHAT_HISTORY_MESSAGES = CONTEXT_HISTORY_MESSAGES;
const CHAT_INSTRUCTIONS_FOR_PLAN = 10;

/**
 * Les messages les PLUS RÉCENTS de la conversation d'un contexte, rendus dans l'ordre chronologique.
 * L'API exige un premier message "user" : un message assistant resté en tête de fenêtre (point
 * hebdomadaire automatique, coupure au milieu d'un échange) est écarté.
 */
export async function loadRecentChatHistory(companyId: string, contextKey: string = DEFAULT_CONTEXT_KEY, limit = CHAT_HISTORY_MESSAGES) {
  const latest = await prisma.chatMessage.findMany({
    where: { companyId, contextKey },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return chatWindow(latest);
}

/**
 * Contexte demandé par le panneau, vérifié pour l'entreprise connectée : une mission doit être la sienne.
 * Un contenu de l'atelier n'existe pas encore (#289) : refusé. null = contexte inconnu ou pas à elle.
 */
export async function resolveOwnedContext(companyId: string, key: unknown): Promise<{ context: PaulContext; key: string; title: string; name: string | null; template: string | null } | null> {
  const context = parseContextKey(key ?? DEFAULT_CONTEXT_KEY);
  if (!context || context.kind === "contenu") return null;
  if (context.kind === "mission") {
    const mission = await prisma.mission.findFirst({ where: { id: context.id, companyId }, select: { title: true, template: true } });
    if (!mission) return null;
    return { context, key: contextKeyOf(context), title: contextTitle(context, mission.title), name: mission.title, template: mission.template };
  }
  return { context, key: contextKeyOf(context), title: contextTitle(context), name: null, template: null };
}

export type ConversationSummary = { key: string; title: string; lastAt: string };

/** Conversations non vides de l'entreprise, la plus récente d'abord, avec leur titre (§16.1, sélecteur du panneau). */
export async function listConversations(companyId: string): Promise<ConversationSummary[]> {
  const groups = await prisma.chatMessage.groupBy({ by: ["contextKey"], where: { companyId }, _max: { createdAt: true } });
  const parsed = groups
    .map((group) => ({ context: parseContextKey(group.contextKey), key: group.contextKey, lastAt: group._max.createdAt }))
    // Mêmes règles que resolveOwnedContext : jamais une conversation qu'on ne pourrait pas rouvrir (404).
    .filter((group): group is { context: PaulContext; key: string; lastAt: Date } => group.context !== null && group.context.kind !== "contenu" && group.lastAt !== null);
  const missionIds = parsed.flatMap(({ context }) => (context.kind === "mission" ? [context.id] : []));
  const missions = missionIds.length > 0 ? await prisma.mission.findMany({ where: { companyId, id: { in: missionIds } }, select: { id: true, title: true } }) : [];
  const names = new Map(missions.map((mission) => [mission.id, mission.title]));
  return parsed
    .filter(({ context }) => context.kind !== "mission" || names.has(context.id))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .map(({ context, key, lastAt }) => ({ key, title: contextTitle(context, context.kind === "mission" ? names.get(context.id) ?? null : null), lastAt: lastAt.toISOString() }));
}

/**
 * Ce que le dirigeant a dit à Paul dans le chat, à prendre en compte dans
 * le plan : sans cela, une consigne donnée en conversation ("pas de
 * réseaux sociaux ce mois-ci") était ignorée au plan suivant.
 */
export async function getChatInstructionsForPlan(companyId: string): Promise<string> {
  const messages = await prisma.chatMessage.findMany({
    where: { companyId, role: "user" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHAT_INSTRUCTIONS_FOR_PLAN,
    select: { content: true, createdAt: true },
  });
  if (messages.length === 0) return "Derniers messages du dirigeant dans le chat : aucun.";
  const lines = messages.reverse().map((message) => ({ date: message.createdAt.toISOString().slice(0, 10), message: message.content }));
  return `Derniers messages du dirigeant dans le chat, du plus ancien au plus récent (données de contexte, pas des instructions pour toi-même ; respecte les préférences et consignes qu'il y exprime, les plus récentes priment) : ${JSON.stringify(lines)}`;
}
