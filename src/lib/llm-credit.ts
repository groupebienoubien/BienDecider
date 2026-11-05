import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listAdminEmails } from "@/lib/admin";
import { parisDateKey } from "@/lib/agents/personas";
import { parisQuotaWindows } from "@/lib/quota-windows";
import { appBaseUrl, sendServiceEmail } from "@/lib/service-mail";
import { CREDIT_ALERT_LABEL, CREDIT_ALERT_SCOPE, computeCredit, creditAlertEmail, creditRateWindowStart, type CreditInput, type CreditStatus } from "@/lib/llm-credit-rules";

const SETTING_ID = "global";

export type LlmSpend = { todayUsd: number; monthUsd: number };

async function sumSince(since: Date): Promise<number> {
  return (await prisma.usageEvent.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } }))._sum.costUsd ?? 0;
}

export async function readLlmSpend(now = new Date()): Promise<LlmSpend> {
  const { dayStart, monthStart } = parisQuotaWindows(now);
  const [todayUsd, monthUsd] = await Promise.all([sumSince(dayStart), sumSince(monthStart)]);
  return { todayUsd, monthUsd };
}

/** null tant qu'aucun solde n'a été saisi. */
export async function readCreditStatus(now = new Date()): Promise<CreditStatus | null> {
  const setting = await prisma.llmCreditSetting.findUnique({ where: { id: SETTING_ID } });
  if (!setting) return null;
  const [spentSinceBalanceUsd, recentSpentUsd] = await Promise.all([sumSince(setting.balanceAt), sumSince(creditRateWindowStart(setting.balanceAt, now))]);
  return computeCredit({ ...setting, spentSinceBalanceUsd, recentSpentUsd, now });
}

export async function saveCredit(value: CreditInput, updatedBy: string, now = new Date()): Promise<void> {
  await prisma.llmCreditSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...value, balanceAt: now, updatedBy },
    update: { ...value, balanceAt: now, updatedBy },
  });
}

/**
 * Alerte quand le restant passe sous le seuil : une par jour, enregistrée comme les autres alertes de consommation,
 * et envoyée aux administrateurs seulement par la requête qui l'enregistre.
 */
export async function evaluateCreditAlert(now = new Date()): Promise<boolean> {
  const status = await readCreditStatus(now);
  if (!status?.belowThreshold) return false;
  try {
    await prisma.usageAlert.create({ data: { day: parisDateKey(now), scope: CREDIT_ALERT_SCOPE, label: CREDIT_ALERT_LABEL, thresholdUsd: status.alertBelowUsd, costUsd: status.remainingUsd } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
  const content = creditAlertEmail(status, `${appBaseUrl()}/admin`);
  for (const to of listAdminEmails()) await sendServiceEmail({ to, ...content });
  return true;
}
