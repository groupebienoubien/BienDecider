import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MissionError } from "@/lib/missions/messages";
import { AgentRunQuotaError } from "@/lib/agents/agent-errors";
import { AGENCY_SEGMENT, newAgencies, readFoundAgency, type FoundAgency } from "@/lib/agencies/rules";
import { anthropicAgencyFinder, type AgencyFinder } from "@/lib/agencies/finder";

type Client = Prisma.TransactionClient | typeof prisma;

export type AgencyView = { id: string; name: string; sector: string; email: string; source: string | null; reason: string };

const AGENCY_WHERE = (companyId: string) => ({ companyId, segment: AGENCY_SEGMENT, email: { not: null } });

/** Liste d'agences de l'entreprise, dans l'ordre où elles ont été trouvées. */
export async function listAgencies(companyId: string, client: Client = prisma): Promise<AgencyView[]> {
  const leads = await client.lead.findMany({ where: AGENCY_WHERE(companyId), orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return leads.map((lead) => ({ id: lead.id, name: lead.name, sector: lead.sector ?? "Agence", email: lead.email as string, source: lead.source, reason: lead.reason }));
}

function idsOf(scope: unknown): string[] {
  const value = scope !== null && typeof scope === "object" && !Array.isArray(scope) ? (scope as Record<string, unknown>).agencyIds : null;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** Agences du périmètre, dans l'ordre choisi ; une agence qui n'est plus dans la liste n'y figure pas. */
export async function scopeAgencies(companyId: string, scope: unknown, client: Client = prisma): Promise<AgencyView[]> {
  const ids = idsOf(scope);
  if (ids.length === 0) return [];
  const found = new Map((await listAgencies(companyId, client)).map((agency) => [agency.id, agency]));
  return ids.map((id) => found.get(id)).filter((agency): agency is AgencyView => agency !== undefined);
}

/** Noms des agences du périmètre, pour le résumé « {agence 1} et {agence 2} » (§6.3). */
export async function agencyNames(companyId: string, scope: unknown, client: Client = prisma): Promise<Record<string, string>> {
  return Object.fromEntries((await scopeAgencies(companyId, scope, client)).map((agency) => [agency.id, agency.name]));
}

/** Le périmètre ne cite que des agences de la liste de l'entreprise, avec leur e-mail (M-30 sinon). */
export async function checkAgencyScope(companyId: string, scope: unknown, client: Client): Promise<void> {
  const ids = idsOf(scope);
  if ((await scopeAgencies(companyId, scope, client)).length !== ids.length) throw new MissionError("M-30");
}

/**
 * Recherche de prescripteurs (FR-45) : Paul cherche des agences de la zone avec leur e-mail professionnel et leur source ;
 * seules les nouvelles sont ajoutées à la liste. Aucun envoi, aucune relance : la liste sert au choix du périmètre.
 */
export async function searchAgencies(companyId: string, finder: AgencyFinder = anthropicAgencyFinder): Promise<{ added: number; total: number }> {
  if (finder === anthropicAgencyFinder && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new MissionError("M-91");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, trade: true, servingArea: true, description: true, targetClients: true, offers: true } });
  const known = await prisma.lead.findMany({ where: { companyId, segment: AGENCY_SEGMENT }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true, email: true } });
  let found: FoundAgency[];
  try {
    found = (await finder({ companyId, company, known: known.map((agency) => agency.name) })).map(readFoundAgency).filter((agency): agency is FoundAgency => agency !== null);
  } catch (error) {
    // Quota, budget, adresse non confirmée : le motif est dit tel quel ; toute autre erreur est une panne.
    if (error instanceof MissionError || error instanceof AgentRunQuotaError) throw error;
    console.error("[agencies] recherche impossible", error instanceof Error ? error.message : error);
    throw new MissionError("M-91");
  }
  const kept = newAgencies(found, known);
  if (kept.length === 0) throw new MissionError("M-90");
  const { count } = await prisma.lead.createMany({
    data: kept.map((agency) => ({ companyId, segment: AGENCY_SEGMENT, name: agency.name, sector: agency.sector, email: agency.email, publicContact: agency.email, source: agency.source, reason: agency.reason })),
    skipDuplicates: true,
  });
  if (count === 0) throw new MissionError("M-90");
  return { added: count, total: await prisma.lead.count({ where: AGENCY_WHERE(companyId) }) };
}
