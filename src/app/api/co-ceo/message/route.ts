import { AgentRunLimitError } from "@/lib/agent-run-limits";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCoCeoTurn } from "@/lib/agents/co-ceo";
import { buildPageContext, pageContextSchema } from "@/lib/agents/page-context";
import { AgentRunQuotaError, reserveUsageBudget } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";
import { encodeStreamEvent, NDJSON_CONTENT_TYPE, type PaulStreamEvent } from "@/lib/chat-stream";
import { classifyRunError, failureMessage } from "@/lib/agents/agent-errors";

export const maxDuration = 300;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  context: pageContextSchema.optional(),
});

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Message requis (4 000 caractères au plus)." }, { status: 400 });
  }

  try {
    const pageContext = parsed.data.context ? await buildPageContext(company.id, parsed.data.context) : undefined;
    const reservation = await reserveUsageBudget(company.id, "co_ceo_chat");
    if (!request.headers.get("accept")?.includes(NDJSON_CONTENT_TYPE)) {
      const reply = await runCoCeoTurn(company.id, parsed.data.message, reservation.id, pageContext);
      return NextResponse.json({ reply: reply.content, references: reply.references, actions: reply.actions });
    }

    // Réponse en flux : si le client se déconnecte, le tour continue et la réponse est quand même enregistrée.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: PaulStreamEvent) => {
          try { controller.enqueue(encoder.encode(encodeStreamEvent(event))); } catch { /* client parti */ }
        };
        try {
          const reply = await runCoCeoTurn(company.id, parsed.data.message, reservation.id, pageContext, {
            onTurnStart: () => send({ type: "reset" }),
            onText: (text) => send({ type: "delta", text }),
          });
          send({ type: "done", reply: reply.content, references: reply.references, actions: reply.actions });
        } catch (error) {
          console.error("Erreur Co-CEO:", error);
          const reason = classifyRunError(error) ?? "outage";
          send({ type: "error", error: error instanceof AgentRunQuotaError || error instanceof AgentRunLimitError ? error.message : failureMessage(reason, "Paul"), reason });
        }
        try { controller.close(); } catch { /* client parti */ }
      },
    });
    return new Response(body, {
      headers: { "Content-Type": `${NDJSON_CONTENT_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform" },
    });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    console.error("Erreur Co-CEO:", error);
    return NextResponse.json({ error: error instanceof AgentRunLimitError ? error.message : "Échec de la réponse", reason: classifyRunError(error) ?? "outage" }, { status: 500 });
  }
}
