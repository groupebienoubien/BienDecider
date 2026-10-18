// Données du menu latéral communes à toutes les pages connectées (cf. docs/maquette : décisions en attente et budget IA du mois).
import { prisma } from "@/lib/prisma";
import { getPendingDecisionCount } from "@/lib/pending-decisions-server";

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
  const [pendingProductions, proposedActions, monthUsage] = await Promise.all([
    getPendingDecisionCount(company.id),
    prisma.actionPlanItem.count({ where: { companyId: company.id, status: "propose" } }),
    prisma.usageEvent.aggregate({ where: { companyId: company.id, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
  ]);
  return {
    companyName: company.name,
    companyTrade: company.trade,
    companyArea: company.servingArea,
    objective: company.objective,
    ownerEmail: company.ownerEmail,
    decisionCount: pendingProductions + proposedActions,
    budget: { spentUsd: monthUsage._sum.costUsd ?? 0, limitUsd: company.monthlySpendLimitUsd },
  };
}

/** Pages sans entreprise garantie (administration) : coque complète si le compte en a une, sinon coque minimale. */
export async function getShellPropsForEmail(ownerEmail: string) {
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  return company?.name ? getShellProps(company) : { ownerEmail };
}