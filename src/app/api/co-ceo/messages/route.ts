import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { resolvePaulReferences } from "@/lib/paul-references";
import { pendingActionsByMessage } from "@/lib/agents/pending-actions";
import { listConversations, resolveOwnedContext } from "@/lib/agents/chat-context";
import { CONTEXT_DISPLAYED_MESSAGES } from "@/lib/paul-contexts";

/**
 * Conversation de Paul d'un contexte (`?context=`, « strategie » par défaut) : ses derniers messages avec
 * leurs cartes, et la liste des conversations non vides pour le sélecteur du panneau (§16.1).
 */
export async function GET(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const owned = await resolveOwnedContext(company.id, request.nextUrl.searchParams.get("context") ?? undefined);
  if (!owned) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });

  const [latest, conversations] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { companyId: company.id, contextKey: owned.key },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CONTEXT_DISPLAYED_MESSAGES,
    }),
    listConversations(company.id),
  ]);
  const messages = latest.reverse();
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const [resolved, actions] = await Promise.all([
    resolvePaulReferences(company.id, assistantMessages.map((message) => message.content)),
    pendingActionsByMessage(company.id, assistantMessages.map((message) => message.id)),
  ]);
  let resolvedIndex = 0;
  return NextResponse.json({
    context: { key: owned.key, title: owned.title, template: owned.template },
    conversations,
    messages: messages.map((message) => message.role === "assistant"
      ? { ...message, ...resolved[resolvedIndex++], actions: actions.get(message.id) ?? [] }
      : { ...message, references: [], actions: [] }),
  });
}
