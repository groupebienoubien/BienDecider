import { prisma } from "@/lib/prisma";
import { revisionRefusal } from "@/lib/agents/revision";
import { activeRevisionRun } from "@/lib/agents/revision-state";
import type { StudioLock, StudioState, StudioVersion, StudioVersionSource } from "@/lib/proposal-studio-shared";

const APPROVED = ["validee", "modifiee"];

/** Pourquoi une production ne peut pas être retravaillée dans le Studio ; null si elle le peut. */
export function studioLock(proposal: { kind: string; status: string; agent: string; content: string }): StudioLock | null {
  if (APPROVED.includes(proposal.status)) return "validated";
  if (proposal.status === "rejetee") return "rejected";
  return revisionRefusal(proposal);
}

function readSource(value: string): Exclude<StudioVersionSource, "initial"> {
  return value === "owner" || value === "restore" ? value : "agent";
}

/**
 * État du Studio d'une production : toutes les versions encore lisibles (la
 * version v est conservée dans la révision fromVersion = v ; la dernière est
 * la production elle-même), avec la demande, l'auteur et la note de chacune.
 * null si la production n'existe pas ou n'appartient pas à l'entreprise.
 */
export async function loadStudioState(companyId: string, proposalId: string): Promise<StudioState | null> {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, companyId },
    include: { revisions: { orderBy: { fromVersion: "asc" } } },
  });
  if (!proposal) return null;

  const byFromVersion = new Map(proposal.revisions.map((revision) => [revision.fromVersion, revision]));
  const versions: StudioVersion[] = [];
  for (let version = 1; version <= proposal.version; version++) {
    const content = version === proposal.version ? proposal.content : byFromVersion.get(version)?.previousContent;
    // Une version antérieure à l'historique n'a pas été conservée : elle n'est pas proposée.
    if (content === undefined) continue;
    const cause = version === 1 ? null : byFromVersion.get(version - 1);
    versions.push({
      version,
      content,
      source: cause ? readSource(cause.source) : "initial",
      instruction: cause?.instruction ?? null,
      note: cause?.note ?? null,
      createdAt: (cause?.createdAt ?? proposal.createdAt).toISOString(),
    });
  }

  const [active, plan] = await Promise.all([
    activeRevisionRun(companyId, proposal.id),
    proposal.planItemId ? prisma.actionPlanItem.findFirst({ where: { id: proposal.planItemId, companyId }, select: { rationale: true } }) : null,
  ]);

  return {
    proposal: {
      id: proposal.id,
      kind: proposal.kind,
      title: proposal.title,
      agent: proposal.agent,
      status: proposal.status,
      version: proposal.version,
      approvedVersion: proposal.approvedVersion,
    },
    versions,
    locked: studioLock(proposal),
    activeRunId: active?.id ?? null,
    rationale: plan?.rationale ?? null,
  };
}

export type RestoreResult = { ok: true; version: number } | { ok: false; status: 404 | 409; error: string };

/**
 * Retour à une version précédente : son contenu devient une nouvelle version
 * (V4 reprend V2). Rien n'est supprimé ni écrasé ; la version remplacée est
 * conservée comme pour toute modification. Refusé si la production a changé
 * depuis l'ouverture du Studio ou si elle n'est plus à relire.
 */
export async function restoreProposalVersion(companyId: string, proposalId: string, targetVersion: number, expectedVersion: number): Promise<RestoreResult> {
  const existing = await prisma.agentProposal.findFirst({ where: { id: proposalId, companyId } });
  if (!existing) return { ok: false, status: 404, error: "Production introuvable" };
  if (existing.version !== expectedVersion) return { ok: false, status: 409, error: "Cette production a changé depuis son ouverture. Rechargez le Studio pour voir la dernière version." };
  const lock = studioLock(existing);
  if (lock && lock !== "too_long") return { ok: false, status: 409, error: "Cette production n’est plus à relire : le retour à une version précédente est impossible." };
  if (await activeRevisionRun(companyId, proposalId)) return { ok: false, status: 409, error: "Une révision est en cours : attendez la nouvelle version." };
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion >= existing.version) return { ok: false, status: 409, error: "Cette version n’existe pas ou est déjà la version actuelle." };
  const target = await prisma.proposalRevision.findUnique({ where: { proposalId_fromVersion: { proposalId, fromVersion: targetVersion } }, select: { previousContent: true } });
  if (!target) return { ok: false, status: 409, error: "Cette version n’a pas été conservée." };
  if (target.previousContent === existing.content) return { ok: false, status: 409, error: "Cette version est identique à la version actuelle." };

  const nextVersion = existing.version + 1;
  const restored = await prisma.$transaction(async (tx) => {
    // Écriture conditionnée à la version et au statut lus : une décision ou une révision concurrente l'emporte.
    const updated = await tx.agentProposal.updateMany({
      where: { id: proposalId, companyId, version: existing.version, status: "en_attente" },
      data: { content: target.previousContent, version: nextVersion, draftSavedAt: null },
    });
    if (updated.count !== 1) return false;
    await tx.proposalRevision.create({
      data: { proposalId, fromVersion: existing.version, previousContent: existing.content, source: "restore", instruction: `Retour à la version ${targetVersion}` },
    });
    return true;
  });
  if (!restored) return { ok: false, status: 409, error: "Cette production a changé depuis son ouverture. Rechargez le Studio pour voir la dernière version." };
  return { ok: true, version: nextVersion };
}
