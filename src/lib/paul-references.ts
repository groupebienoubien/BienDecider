export const PAUL_REFERENCE_MARKER = /\[\[bd:(proposal|finding|lead|mission):([A-Za-z0-9_-]{1,100})\]\]/g;

export type PaulReferenceType = "proposal" | "finding" | "lead" | "mission";
export type PaulReference = {
  marker: string;
  type: PaulReferenceType;
  id: string;
  label: string;
  href: string;
};
export type ResolvedPaulMessage = { content: string; references: PaulReference[] };
export type ParsedPaulReference = { marker: string; type: PaulReferenceType; id: string };

export function parsePaulReferenceMarkers(content: string): ParsedPaulReference[] {
  return [...content.matchAll(new RegExp(PAUL_REFERENCE_MARKER.source, "g"))].map((match) => ({
    marker: match[0],
    type: match[1] as PaulReferenceType,
    id: match[2],
  }));
}

function referenceHref(type: PaulReferenceType, id: string) {
  const safeId = encodeURIComponent(id);
  if (type === "proposal") return `/dashboard?proposal=${safeId}#proposal-${safeId}`;
  if (type === "finding") return `/diagnostic#finding-${safeId}`;
  // Lien d'action (FR-58) : le détail de la mission, où le dirigeant agit.
  if (type === "mission") return `/missions/${safeId}`;
  return `/prospection#lead-${safeId}`;
}

/** Resolve only real objects owned by this company; stale markers are removed. */
export async function resolvePaulReferences(companyId: string, contents: string[]): Promise<ResolvedPaulMessage[]> {
  const { prisma } = await import("@/lib/prisma");
  const parsed = contents.map(parsePaulReferenceMarkers);
  const idsByType = (type: PaulReferenceType) => [...new Set(parsed.flat().filter((ref) => ref.type === type).map((ref) => ref.id))];
  const proposalIds = idsByType("proposal");
  const findingIds = idsByType("finding");
  const leadIds = idsByType("lead");
  const missionIds = idsByType("mission");

  const [proposals, findings, leads, missions] = await Promise.all([
    proposalIds.length ? prisma.agentProposal.findMany({ where: { companyId, id: { in: proposalIds } }, select: { id: true, title: true } }) : [],
    findingIds.length ? prisma.auditFinding.findMany({ where: { companyId, id: { in: findingIds }, replacedAt: null }, select: { id: true, title: true } }) : [],
    leadIds.length ? prisma.lead.findMany({ where: { companyId, id: { in: leadIds }, stage: { notIn: ["propose", "ecarte"] } }, select: { id: true, name: true } }) : [],
    missionIds.length ? prisma.mission.findMany({ where: { companyId, id: { in: missionIds } }, select: { id: true, title: true } }) : [],
  ]);

  const valid = new Map<string, PaulReference>();
  for (const proposal of proposals) {
    valid.set(`proposal:${proposal.id}`, { marker: `[[bd:proposal:${proposal.id}]]`, type: "proposal", id: proposal.id, label: proposal.title, href: referenceHref("proposal", proposal.id) });
  }
  for (const finding of findings) {
    valid.set(`finding:${finding.id}`, { marker: `[[bd:finding:${finding.id}]]`, type: "finding", id: finding.id, label: finding.title, href: referenceHref("finding", finding.id) });
  }
  for (const lead of leads) {
    valid.set(`lead:${lead.id}`, { marker: `[[bd:lead:${lead.id}]]`, type: "lead", id: lead.id, label: lead.name, href: referenceHref("lead", lead.id) });
  }

  for (const mission of missions) {
    valid.set(`mission:${mission.id}`, { marker: `[[bd:mission:${mission.id}]]`, type: "mission", id: mission.id, label: mission.title, href: referenceHref("mission", mission.id) });
  }

  return contents.map((content, index) => {
    const references = parsed[index].flatMap((ref) => {
      const resolved = valid.get(`${ref.type}:${ref.id}`);
      return resolved ? [resolved] : [];
    });
    const validMarkers = new Set(references.map((reference) => reference.marker));
    const sanitized = content.replace(new RegExp(PAUL_REFERENCE_MARKER.source, "g"), (marker) => validMarkers.has(marker) ? marker : "");
    return { content: sanitized, references };
  });
}