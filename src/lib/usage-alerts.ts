import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listAdminEmails } from "@/lib/admin";
import { parisDateKey } from "@/lib/agents/personas";
import { parisQuotaWindows } from "@/lib/quota-windows";
import { appBaseUrl, sendServiceEmail } from "@/lib/service-mail";
import { alertEmail, crossedAlerts, DEFAULT_USAGE_ALERT_THRESHOLDS, safeAlertLabel, type CrossedAlert, type UsageAlertThresholds } from "@/lib/usage-alert-rules";

const SETTING_ID = "global";

export async function readUsageAlertThresholds(): Promise<UsageAlertThresholds> {
  const saved = await prisma.usageAlertSetting.findUnique({ where: { id: SETTING_ID } });
  return saved ? { companyDailyUsd: saved.companyDailyUsd, totalDailyUsd: saved.totalDailyUsd } : DEFAULT_USAGE_ALERT_THRESHOLDS;
}

export async function saveUsageAlertThresholds(value: UsageAlertThresholds, updatedBy: string): Promise<void> {
  await prisma.usageAlertSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...value, updatedBy },
    update: { ...value, updatedBy },
  });
}

async function notifyAdmins(alert: CrossedAlert): Promise<void> {
  const content = alertEmail(alert, `${appBaseUrl()}/admin`);
  for (const to of listAdminEmails()) await sendServiceEmail({ to, ...content });
}

/**
 * Évalue les seuils du jour après un enregistrement de coût (story 7.3). Une alerte par jour et par portée :
 * l'enregistrement est unique en base, et seule la requête qui le crée envoie l'e-mail aux administrateurs.
 * Un envoi impossible laisse l'alerte enregistrée et visible dans l'administration.
 */
export async function evaluateUsageAlerts(companyId: string, now = new Date()): Promise<CrossedAlert[]> {
  const { dayStart } = parisQuotaWindows(now);
  const [thresholds, company, companyDay, totalDay] = await Promise.all([
    readUsageAlertThresholds(),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, ownerEmail: true } }),
    prisma.usageEvent.aggregate({ where: { companyId, createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
    prisma.usageEvent.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
  ]);
  const crossed = crossedAlerts({
    companyId,
    companyLabel: safeAlertLabel(company?.name || company?.ownerEmail || ""),
    companyDayCostUsd: companyDay._sum.costUsd ?? 0,
    totalDayCostUsd: totalDay._sum.costUsd ?? 0,
    thresholds,
  });
  const day = parisDateKey(now);
  const created: CrossedAlert[] = [];
  for (const alert of crossed) {
    try {
      await prisma.usageAlert.create({ data: { day, scope: alert.scope, label: alert.label, thresholdUsd: alert.thresholdUsd, costUsd: alert.costUsd } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue; // déjà alerté aujourd'hui
      throw error;
    }
    created.push(alert);
    await notifyAdmins(alert);
  }
  return created;
}
