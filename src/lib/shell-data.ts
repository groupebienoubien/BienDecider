// Données du menu latéral communes à toutes les pages connectées (cf. docs/maquette : décisions en attente et budget IA du mois).
import { prisma } from "@/lib/prisma";
import { getTeamState } from "@/lib/team-state";

type ShellCompany = {
  id: string;
  name: string;
  trade: string | null;
  servingArea: string | null;
  objective: string | null;
  ownerEmail: string;
  monthlySpendLimitUsd: number;
};

export async function getShellProps(company: ShellCompany) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [teamState, monthUsage] = await Promise.all([
    getTeamState(company.id, now),
    prisma.usageEvent.aggregate({ where: { companyId: company.id, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
  ]);
  return {
    companyName: company.name,
    companyTrade: company.trade,
    companyArea: company.servingArea,
    objective: company.objective,
    ownerEmail: company.ownerEmail,
    // Décision du dirigeant (2026-10-22) : seules les productions qui l'attendent comptent, comme sur la page Décisions.
    decisionCount: teamState.pendingDecisions,
    budget: { spentUsd: monthUsage._sum.costUsd ?? 0, limitUsd: company.monthlySpendLimitUsd },
  };
}

/** Pages sans entreprise garantie (administration) : coque complète si le compte en a une, sinon coque minimale. */
export async function getShellPropsForEmail(ownerEmail: string) {
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  return company?.name ? getShellProps(company) : { ownerEmail };
}