import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PublishRefusedError } from "@/lib/execution-error";
import { publishSiteFromProposal } from "@/lib/site/publish";
import { getSessionCompany } from "@/lib/session";
import { publishProposalToFacebook } from "@/lib/social/facebook-publish";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { AgentRunQuotaError } from "@/lib/agent-runs";
import { syncPlanItemStatus } from "@/lib/plan-item-status";
import { decideProposalReview, reviewProposal } from "@/lib/proposal-review";
import { classifyRunError } from "@/lib/agents/agent-errors";

export const maxDuration = 60;

/**
 * Exécution réelle d'une proposition VALIDÉE : publier le site d'une page,
 * ou une publication sur la Page Facebook connectée. Les autres types
 * (fiche Google, Instagram, LinkedIn) attendent leurs connecteurs — cf. docs/backlog.md.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (_request.headers.get("origin") !== _request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const proposal = await prisma.agentProposal.findUnique({ where: { id } });
  if (!proposal || proposal.companyId !== company.id) {
    return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  }

  // Confirmer l'exécution d'une version précise : une ancienne page ouverte ne peut pas publier une version remplacée.
  const body = await _request.json().catch(() => null);
  const expectedVersion = body && typeof body === "object" ? (body as { expectedVersion?: unknown }).expectedVersion : undefined;
  const confirmed = body && typeof body === "object" ? (body as { confirmed?: unknown }).confirmed : undefined;
  const acknowledgedReviewIds = body && typeof body === "object" ? (body as { acknowledgedReviewIds?: unknown }).acknowledgedReviewIds : undefined;
  const acknowledgementIds = Array.isArray(acknowledgedReviewIds) && acknowledgedReviewIds.every((value) => typeof value === "string")
    ? acknowledgedReviewIds as string[]
    : [];
  if (confirmed !== true) {
    return NextResponse.json({ error: "Confirmez explicitement la destination et la mise en ligne." }, { status: 400 });
  }
  if (!Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version à publier est obligatoire." }, { status: 400 });
  }

  if (proposal.kind === "social_post" || proposal.kind === "site_web_content") {
    const profile = await prisma.company.findUnique({ where: { id: company.id }, select: { phone: true, certifications: true } });
    const reviewPoints = reviewProposal({
      kind: proposal.kind,
      content: proposal.content,
      companyPhone: profile?.phone,
      companyCertifications: profile?.certifications,
    });
    const review = decideProposalReview(reviewPoints, acknowledgementIds);
    if (review.blockers.length > 0) {
      return NextResponse.json({ error: `Publication bloquée : ${review.blockers.map((point) => point.title).join(" ; ")}.` }, { status: 409 });
    }
    if (review.missingAcknowledgements.length > 0) {
      return NextResponse.json({ error: `Confirmez les vérifications humaines de cette version : ${review.missingAcknowledgements.map((point) => point.title).join(" ; ")}.` }, { status: 409 });
    }
  }

  try {
    if (proposal.kind === "social_post") {
      const riskSettings = await getConfiguredRiskLevels();
      const { message } = await publishProposalToFacebook(id, company.id, expectedVersion as number, { configuredRiskLevel: riskSettings[proposal.kind] });
      if (proposal.planItemId) await syncPlanItemStatus(proposal.planItemId);
      return NextResponse.json({ message });
    }
    const { slug } = await publishSiteFromProposal(id, expectedVersion as number, acknowledgementIds);
    if (proposal.planItemId) await syncPlanItemStatus(proposal.planItemId);
    return NextResponse.json({ url: `/site/${slug}`, message: "Site publié. La publication figure dans les résultats." });
  } catch (error) {
    console.error("Erreur exécution proposition:", error);
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message, reason: classifyRunError(error) }, { status: 429 });
    if (error instanceof PublishRefusedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Échec de l'exécution";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
