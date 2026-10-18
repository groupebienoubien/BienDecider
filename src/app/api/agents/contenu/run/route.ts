import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentRunQuotaError, enqueueDirectRun } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";

export const maxDuration = 300;

const requestSchema = z.object({ newsContext: z.string().max(4000).optional(), requestId: z.string().uuid().optional() }).strict();

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande de contenu invalide." }, { status: 400 });
  let run;
  try {
    run = await enqueueDirectRun({ companyId: company.id, agent: "contenu", requestKey: parsed.data.requestId ?? randomUUID(), newsContext: parsed.data.newsContext });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message }, { status: 429 });
    throw error;
  }
  if (run.status === "failed") return NextResponse.json({ error: run.errorMessage ?? "L'agent a échoué. Relancez la demande.", run: { id: run.id, status: run.status } }, { status: 409 });
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 202 });
}
