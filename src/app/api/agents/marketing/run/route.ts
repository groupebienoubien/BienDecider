import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentRunQuotaError, enqueueDirectRun } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";
import { classifyRunError } from "@/lib/agents/agent-errors";

export const maxDuration = 300;

const requestSchema = z.object({ requestId: z.string().uuid().optional() }).strict();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant de demande invalide." }, { status: 400 });
  let run;
  try {
    run = await enqueueDirectRun({ companyId: company.id, agent: "marketing", requestKey: parsed.data.requestId ?? randomUUID() });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    throw error;
  }
  if (run.status === "failed") return NextResponse.json({ error: run.errorMessage ?? "L'agent a échoué. Relancez la demande.", reason: run.failureReason ?? "outage", run: { id: run.id, status: run.status } }, { status: 409 });
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 202 });
}
