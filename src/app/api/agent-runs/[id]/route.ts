import { NextRequest, NextResponse } from "next/server";
import { getAgentRun } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";

export const maxDuration = 300;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  const run = await getAgentRun(company.id, id);
  if (!run) return NextResponse.json({ error: "Exécution introuvable" }, { status: 404 });
  return NextResponse.json({ run });
}
