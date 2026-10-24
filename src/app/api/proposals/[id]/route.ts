import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { syncPlanItemStatus } from "@/lib/plan-item-status";
import { isPublicSource } from "@/lib/proposal-review";
import { readJsonObject } from "@/lib/request-body";
import { REVISION_IN_PROGRESS_MESSAGE, activeRevisionRun } from "@/lib/agents/revision-state";

const MAX_CONTENT_LENGTH = 100_000;

// "brouillon" enregistre une version sans décision ; "validee"/"modifiee"
// approuvent la version courante (avec ou sans nouveau contenu) ; "rejetee" refuse ;
// "a_relire" rouvre un rejet (rien n'a été exécuté, donc la décision reste réversible).
const ALLOWED_STATUSES = ["brouillon", "validee", "modifiee", "rejetee", "a_relire"] as const;
type RequestedStatus = (typeof ALLOWED_STATUSES)[number];

const VERSION_CONFLICT = "Cette production a changé depuis son ouverture. Rechargez la page pour voir la dernière version avant de décider.";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.agentProposal.findUnique({ where: { id } });
  if (!existing || existing.companyId !== company.id) {
    return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  }

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { status, content, rejectionReason, expectedVersion, leadSource } = body as {
    status: RequestedStatus; content?: unknown; rejectionReason?: unknown; expectedVersion?: unknown; leadSource?: unknown;
  };
  if (typeof content === "string" && content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `Le contenu est limité à ${MAX_CONTENT_LENGTH.toLocaleString("fr-FR")} caractères.` }, { status: 400 });
  }
  if (typeof leadSource === "string" && leadSource.length > 2000) {
    return NextResponse.json({ error: "La source est limitée à 2 000 caractères." }, { status: 400 });
  }

  if (status === undefined && leadSource !== undefined) {
    if (existing.kind !== "prospect" || typeof leadSource !== "string" || !isPublicSource(leadSource)) {
      return NextResponse.json({ error: "La source doit être une URL HTTP(S) pour un prospect en attente." }, { status: 400 });
    }
    if (existing.status !== "en_attente") {
      return NextResponse.json({ error: "La source ne peut être corrigée que tant que le prospect attend votre décision." }, { status: 409 });
    }
    const { count } = await prisma.lead.updateMany({
      where: { proposalId: id, companyId: company.id, stage: "propose" },
      data: { source: leadSource.trim() },
    });
    if (count === 0) return NextResponse.json({ error: "Prospect introuvable ou déjà décidé." }, { status: 409 });
    return NextResponse.json({ proposalId: id, leadSource: leadSource.trim() });
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status doit être l'un de : ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const changesContent = status === "brouillon" || status === "modifiee";
  if (changesContent && (typeof content !== "string" || !content.trim())) {
    return NextResponse.json({ error: "Le contenu modifié ne peut pas être vide" }, { status: 400 });
  }
  if (rejectionReason !== undefined && (status !== "rejetee" || typeof rejectionReason !== "string" || rejectionReason.length > 1000)) {
    return NextResponse.json({ error: "La raison du rejet doit être un texte de 1 000 caractères maximum, uniquement pour un rejet." }, { status: 400 });
  }
  // Écrire ou approuver exige la version vue par le dirigeant : un autre onglet
  // ne peut pas remplacer silencieusement son travail ni faire approuver une version périmée.
  if (status !== "rejetee" && !Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version attendue est obligatoire." }, { status: 400 });
  }
  if (expectedVersion !== undefined && expectedVersion !== existing.version) {
    return NextResponse.json({ error: VERSION_CONFLICT }, { status: 409 });
  }

  const wasApproved = ["validee", "modifiee"].includes(existing.status);
  if (status === "a_relire" && existing.status !== "rejetee") {
    return NextResponse.json({ error: "Seule une production rejetée peut être rouverte." }, { status: 409 });
  }
  if (status !== "a_relire" && (existing.status === "rejetee" || existing.status === "executee" || (wasApproved && status === "rejetee"))) {
    return NextResponse.json({ error: "Cette production est déjà décidée ou réalisée." }, { status: 409 });
  }
  if (wasApproved && existing.kind === "prospect") {
    return NextResponse.json({ error: "Ce prospect est déjà dans votre suivi de prospection." }, { status: 409 });
  }
  if (existing.kind === "prospect" && status !== "brouillon" && status !== "rejetee" && status !== "a_relire") {
    const lead = await prisma.lead.findUnique({ where: { proposalId: id }, select: { source: true } });
    if (!isPublicSource(lead?.source)) {
      return NextResponse.json({ error: "Ajoutez une URL publique de source valide avant d'ajouter ce prospect au suivi." }, { status: 409 });
    }
  }

  const newContent = changesContent ? (content as string).trim() : existing.content;
  const contentChanged = newContent !== existing.content;
  const version = contentChanged ? existing.version + 1 : existing.version;
  const now = new Date();

  if (status === "brouillon" && !contentChanged) {
    return NextResponse.json(existing);
  }
  // Pendant une révision (story 3.3), l'agent écrit la version suivante : on n'approuve pas celle qui va être remplacée.
  if ((status === "validee" || status === "modifiee") && await activeRevisionRun(company.id, id)) {
    return NextResponse.json({ error: REVISION_IN_PROGRESS_MESSAGE }, { status: 409 });
  }

  // Décision humaine actée ici — aucune exécution réelle déclenchée
  // automatiquement (cf. docs/architecture-technique.md § Flux de validation).
  const data =
    status === "a_relire"
      ? { status: "en_attente", rejectionReason: null, decidedAt: null }
      : status === "brouillon"
      ? // Modifier une version approuvée retire l'approbation : elle redevient à relire.
        { content: newContent, version, status: "en_attente", draftSavedAt: now }
      : status === "rejetee"
        ? { status, rejectionReason: typeof rejectionReason === "string" ? rejectionReason.trim() || null : null, decidedAt: now }
        : {
            content: newContent,
            version,
            // « modifiée » seulement si le dirigeant a écrit cette version : contenu changé par cette approbation, ou
            // brouillon qu'il a enregistré. Une version révisée par l'agent, approuvée telle quelle, est « validée ».
            status: contentChanged || existing.draftSavedAt ? "modifiee" : "validee",
            approvedVersion: version,
            approvedAt: now,
            decidedAt: now,
            rejectionReason: null,
          };

  // Mise à jour conditionnée à la version lue : deux écritures concurrentes ne peuvent pas réussir toutes les deux.
  // Un nouveau contenu conserve la version remplacée (ProposalRevision, source owner), dans la même transaction.
  const count = await prisma.$transaction(async (tx) => {
    const updated = await tx.agentProposal.updateMany({
      where: { id, companyId: company.id, version: existing.version },
      data,
    });
    if (updated.count === 1 && contentChanged) {
      await tx.proposalRevision.create({
        data: { proposalId: id, fromVersion: existing.version, previousContent: existing.content, source: "owner", instruction: null },
      });
    }
    return updated.count;
  });
  if (count === 0) {
    return NextResponse.json({ error: VERSION_CONFLICT }, { status: 409 });
  }
  const proposal = await prisma.agentProposal.findUniqueOrThrow({ where: { id } });

  // Un prospect validé entre dans le funnel de prospection (cf. src/lib/funnel.ts) ;
  // rejeté, il en sort sans être supprimé (trace pour la boucle d'apprentissage).
  // Un simple brouillon ne le fait pas avancer.
  if (existing.kind === "prospect" && status !== "brouillon") {
    await prisma.lead.updateMany({
      where: { proposalId: id, stage: { in: ["propose", "a_contacter", "ecarte"] } },
      data: { stage: status === "rejetee" ? "ecarte" : status === "a_relire" ? "propose" : "a_contacter" },
    });
  }

  // Une action n'est terminée que si tout est décidé et réalisé ; un rejet total ou une mise en ligne en attente la laisse ouverte.
  if (proposal.planItemId) await syncPlanItemStatus(proposal.planItemId);

  return NextResponse.json(proposal);
}
