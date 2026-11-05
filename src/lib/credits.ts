import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MissionError } from "@/lib/missions/messages";

/** Crédits (spécification §8, D1) : 20 offerts, 3 par premier lancement, 1 par version préparée avec Paul. Le registre est en ajout seul. */
export const WELCOME_CREDITS = 20;
export const PAUL_VERSION_CREDITS = 1;
export const CREDIT_HISTORY_SIZE = 8;

export type CreditKind = "grant" | "mission_launch" | "paul_version";

type Client = Prisma.TransactionClient;

/** Écrit les 20 crédits offerts au registre, une seule fois par entreprise (la colonne de garde est posée de façon atomique). */
export async function ensureCreditGrant(tx: Client, companyId: string): Promise<void> {
  const claimed = await tx.company.updateMany({ where: { id: companyId, creditGrantedAt: null }, data: { creditGrantedAt: new Date() } });
  if (claimed.count === 0) return;
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { creditBalance: true } });
  await tx.creditLedger.create({ data: { companyId, delta: company.creditBalance, kind: "grant", label: "Crédits offerts à l'inscription", balanceAfter: company.creditBalance } });
}

/** Débit atomique : refusé (M-15) si le solde ne suffit pas, écrit avec son mouvement de registre dans la transaction de l'appelant. */
export async function debitCredits(tx: Client, input: { companyId: string; amount: number; kind: Exclude<CreditKind, "grant">; label: string; missionId?: string }): Promise<number> {
  await ensureCreditGrant(tx, input.companyId);
  const debited = await tx.company.updateMany({ where: { id: input.companyId, creditBalance: { gte: input.amount } }, data: { creditBalance: { decrement: input.amount } } });
  const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { creditBalance: true } });
  if (debited.count === 0) throw new MissionError("M-15", { n: input.amount, m: company.creditBalance });
  await tx.creditLedger.create({ data: { companyId: input.companyId, delta: -input.amount, kind: input.kind, label: input.label, missionId: input.missionId, balanceAfter: company.creditBalance } });
  return company.creditBalance;
}

export type CreditSummary = { balance: number; history: { id: string; delta: number; label: string; balanceAfter: number; createdAt: Date }[] };

export async function readCredits(companyId: string): Promise<CreditSummary> {
  await prisma.$transaction((tx) => ensureCreditGrant(tx, companyId));
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { creditBalance: true } });
  const history = await prisma.creditLedger.findMany({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CREDIT_HISTORY_SIZE, select: { id: true, delta: true, label: true, balanceAfter: true, createdAt: true } });
  return { balance: company.creditBalance, history };
}
