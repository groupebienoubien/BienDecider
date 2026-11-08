import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AgentRunQuotaError, enqueueMissionGeneration } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";
import { classifyRunError } from "@/lib/agents/agent-errors";
import { getLatestAuditFindings } from "@/lib/audit-findings";
import { prisma } from "@/lib/prisma";
import { MAX_OPEN_OWNER_MISSIONS } from "@/lib/missions/rules";
import { renderMissionMessage } from "@/lib/missions/messages";

export const maxDuration = 300;

/** Un clic, une demande : le client envoie un `requestId` neuf à chaque clic ; le même renvoie la même exécution. */
const requestSchema = z.object({ requestId: z.string().uuid() }).strict();

const NO_DIAGNOSTIC_MESSAGE = "Paul a besoin de votre diagnostic pour préparer vos missions. Lancez-le d'abord depuis la page Diagnostic.";

/**
 * « Préparer mes missions » (#284) : Paul crée au plus trois missions « À décider » issues du diagnostic courant.
 * Mêmes contrôles et codes que `plan/route.ts` (origine, session, quota 429, exécution existante 200/202, échec 409),
 * plus 409 `no_diagnostic` quand aucun constat courant n'existe.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant de demande invalide." }, { status: 400 });
  if ((await getLatestAuditFindings(company.id, { take: 1 })).length === 0) {
    return NextResponse.json({ error: NO_DIAGNOSTIC_MESSAGE, reason: "no_diagnostic", href: "/diagnostic" }, { status: 409 });
  }
  // Plafond M-75, compté comme `createMissionIn` : inutile de consommer une exécution qui ne pourrait rien créer.
  const openMissions = await prisma.mission.count({ where: { companyId: company.id, createdBy: { in: ["owner", "paul"] }, status: { not: "stopped" } } });
  if (openMissions >= MAX_OPEN_OWNER_MISSIONS) return NextResponse.json({ error: renderMissionMessage("M-75"), reason: "cap" }, { status: 409 });
  let run;
  try {
    run = await enqueueMissionGeneration(company.id, parsed.data.requestId);
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    throw error;
  }
  if (run.status === "failed") return NextResponse.json({ error: run.errorMessage ?? "Paul n'a pas pu préparer vos missions. Réessayez.", reason: run.failureReason ?? "outage", run: { id: run.id, status: run.status } }, { status: 409 });
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 202 });
}
