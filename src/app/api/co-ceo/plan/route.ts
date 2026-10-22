import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AGENT_RUN_VIEW_SELECT, publicRun } from "@/lib/agent-run-types";
import { AgentRunQuotaError, enqueuePlanGeneration } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";
import { classifyRunError } from "@/lib/agents/agent-errors";

export const maxDuration = 300;

const requestSchema = z.object({ requestId: z.string().uuid().optional() }).strict();

export async function GET() {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const items = await prisma.actionPlanItem.findMany({
    where: { companyId: company.id },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: {
      proposals: { orderBy: { createdAt: "desc" } },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 1, select: AGENT_RUN_VIEW_SELECT },
    },
  });
  return NextResponse.json(items.map((item) => ({ ...item, agentRuns: item.agentRuns.map(publicRun) })));
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant de demande invalide." }, { status: 400 });
  let run;
  try {
    run = await enqueuePlanGeneration(company.id, parsed.data.requestId ?? randomUUID());
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    throw error;
  }
  if (run.status === "failed") return NextResponse.json({ error: run.errorMessage ?? "Paul n'a pas pu préparer le plan. Réessayez.", reason: run.failureReason ?? "outage", run: { id: run.id, status: run.status } }, { status: 409 });
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 202 });
}
