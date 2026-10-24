import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";

/**
 * Dernière version précédente conservée d'une production (story 3.3) : son
 * numéro, son contenu, qui a écrit la suivante (agent ou dirigeant) et la
 * consigne d'une révision. null si aucune version n'a été conservée.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.agentProposal.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!proposal) return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });

  const revision = await prisma.proposalRevision.findFirst({
    where: { proposalId: proposal.id },
    orderBy: { fromVersion: "desc" },
    select: { fromVersion: true, previousContent: true, source: true, instruction: true, createdAt: true },
  });
  return NextResponse.json({ revision });
}
