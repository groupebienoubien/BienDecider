import { prisma } from "@/lib/prisma";
import { CHAT_USAGE_PURPOSES, parisQuotaWindows } from "@/lib/quota-windows";
import {
  cohortMeasures, companyJourney, earliest, funnelSummary, inPeriod, monthOf, parisDay, reachedCaps,
  type CohortMeasures, type CompanyJourney, type FunnelStep, type MissionFacts, type Period,
} from "@/lib/activation-rules";
import { aggregateVisits, type TraceRow, type VisitAggregate } from "@/lib/onboarding/visit-trace-rules";

/**
 * Mesures d'activation (#296) et traces des visites (#311) pour l'administration : agrégation déterministe en base,
 * sans appel de modèle. Ne lit aucun contenu (versions, constats, messages, bilans) ni aucune donnée de tiers
 * (destinataires, prospects) : seulement des dates, des compteurs et des coûts.
 */

export type CompanyActivation = CompanyJourney & { costUsd: number; caps: string[] };

export type ActivationReport = {
  period: Period;
  companies: CompanyActivation[];
  funnel: FunnelStep[];
  measures: CohortMeasures;
  cohorts: { month: string; measures: CohortMeasures }[];
  visits: VisitAggregate;
};

type FirstAt = { companyId: string; at: Date };

const minBy = <T>(rows: readonly T[], key: (row: T) => string, date: (row: T) => Date | null) => {
  const firsts = new Map<string, Date>();
  for (const row of rows) {
    const at = date(row);
    if (!at) continue;
    const current = firsts.get(key(row));
    if (!current || at < current) firsts.set(key(row), at);
  }
  return firsts;
};

/** Première activité du dirigeant à J+7 ou après, par source : la comparaison à la date d'inscription se fait en base. */
async function activityAfterDay7(): Promise<Map<string, Date[]>> {
  const [journal, chat, feedback] = await Promise.all([
    prisma.$queryRaw<FirstAt[]>`SELECT j."companyId" AS "companyId", MIN(j."createdAt") AS "at" FROM "JournalEntry" j JOIN "Company" c ON c."id" = j."companyId" WHERE j."actor" = 'owner' AND j."createdAt" >= c."createdAt" + INTERVAL '7 days' GROUP BY j."companyId"`,
    prisma.$queryRaw<FirstAt[]>`SELECT m."companyId" AS "companyId", MIN(m."createdAt") AS "at" FROM "ChatMessage" m JOIN "Company" c ON c."id" = m."companyId" WHERE m."role" = 'user' AND m."createdAt" >= c."createdAt" + INTERVAL '7 days' GROUP BY m."companyId"`,
    prisma.$queryRaw<FirstAt[]>`SELECT f."companyId" AS "companyId", MIN(f."createdAt") AS "at" FROM "Feedback" f JOIN "Company" c ON c."id" = f."companyId" WHERE f."createdAt" >= c."createdAt" + INTERVAL '7 days' GROUP BY f."companyId"`,
  ]);
  const activity = new Map<string, Date[]>();
  for (const row of [...journal, ...chat, ...feedback]) activity.set(row.companyId, [...(activity.get(row.companyId) ?? []), new Date(row.at)]);
  return activity;
}

/** Traces des visites commencées pendant la période (jours de Paris, bornes incluses), agrégées avec le seuil d'affichage. */
export async function readVisits(period: Period): Promise<VisitAggregate> {
  const traces = await prisma.visitTrace.findMany({
    where: { startedOn: { ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}), ...(period.to ? { lte: new Date(`${period.to}T00:00:00.000Z`) } : {}) } },
    select: { startedOn: true, lastStep: true, abandonedStep: true, trade: true, department: true, hasWebsite: true, sourcesRead: true, proposedTemplates: true, accountCreated: true, analysisCostUsd: true },
  });
  return aggregateVisits(traces.map((trace) => ({ ...trace, sourcesRead: (trace.sourcesRead ?? {}) as unknown as TraceRow["sourcesRead"] })));
}

export async function readActivation(period: Period, now = new Date()): Promise<ActivationReport> {
  const all = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    // Ni e-mail, ni profil, ni contenu : le nom de l'entreprise seulement, pour la vue par entreprise.
    select: {
      id: true, name: true, createdAt: true, emailVerifiedAt: true, profileConfirmedAt: true, lastLoginAt: true, creditBalance: true,
      dailyAgentRunLimit: true, monthlyAgentRunLimit: true, dailyChatMessageLimit: true, monthlyChatMessageLimit: true, dailySpendLimitUsd: true, monthlySpendLimitUsd: true,
    },
  });
  const cohort = all.filter((company) => inPeriod(parisDay(company.createdAt), period));
  const ids = cohort.map((company) => company.id);
  const inCohort = { companyId: { in: ids } };
  const { dayStart, monthStart } = parisQuotaWindows(now);
  const chatPurposes = [...CHAT_USAGE_PURPOSES];

  const [journalFirsts, missions, validated, publications, reports, decisions, dismissals, activity, costs, dayCost, monthCost, dayAttempts, monthAttempts, dayInline, monthInline, dayChat, monthChat, alerts, traces] = await Promise.all([
    prisma.journalEntry.groupBy({ by: ["companyId", "code"], where: { ...inCohort, code: { in: ["J-04", "J-20"] } }, _min: { createdAt: true } }),
    prisma.mission.findMany({ where: inCohort, select: { id: true, companyId: true, template: true, channel: true, firstLaunchedAt: true, stopRuleDays: true } }),
    prisma.missionContent.groupBy({ by: ["companyId"], where: { ...inCohort, validatedAt: { not: null } }, _min: { validatedAt: true } }),
    prisma.publication.findMany({ where: { ...inCohort, status: "sent" }, select: { companyId: true, missionId: true, mode: true, sentAt: true, createdAt: true } }),
    prisma.missionReport.findMany({ where: { mission: inCohort }, select: { missionId: true, createdAt: true, mission: { select: { companyId: true } } } }),
    prisma.missionDecision.findMany({ where: { mission: inCohort }, select: { missionId: true, createdAt: true } }),
    prisma.journalEntry.findMany({ where: { ...inCohort, code: "J-09", missionId: { not: null } }, select: { missionId: true, createdAt: true } }),
    activityAfterDay7(),
    prisma.usageEvent.groupBy({ by: ["companyId"], where: inCohort, _sum: { costUsd: true } }),
    prisma.usageEvent.groupBy({ by: ["companyId"], where: { ...inCohort, createdAt: { gte: dayStart } }, _sum: { costUsd: true } }),
    prisma.usageEvent.groupBy({ by: ["companyId"], where: { ...inCohort, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
    prisma.agentRunAttempt.groupBy({ by: ["companyId"], where: { ...inCohort, queuedAt: { gte: dayStart } }, _count: { _all: true } }),
    prisma.agentRunAttempt.groupBy({ by: ["companyId"], where: { ...inCohort, queuedAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.usageReservation.groupBy({ by: ["companyId"], where: { ...inCohort, purpose: { notIn: chatPurposes }, createdAt: { gte: dayStart } }, _count: { _all: true } }),
    prisma.usageReservation.groupBy({ by: ["companyId"], where: { ...inCohort, purpose: { notIn: chatPurposes }, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.usageReservation.groupBy({ by: ["companyId"], where: { ...inCohort, purpose: { in: chatPurposes }, createdAt: { gte: dayStart } }, _count: { _all: true } }),
    prisma.usageReservation.groupBy({ by: ["companyId"], where: { ...inCohort, purpose: { in: chatPurposes }, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.usageAlert.groupBy({ by: ["scope"], where: { scope: { in: ids.map((id) => `company:${id}`) } }, _count: { _all: true } }),
    readVisits(period),
  ]);

  const journalAt = (code: string) => new Map(journalFirsts.filter((row) => row.code === code && row._min.createdAt).map((row) => [row.companyId, row._min.createdAt as Date]));
  const workspaceAt = journalAt("J-04");
  const validationJournalAt = journalAt("J-20");
  const validatedAt = new Map(validated.map((row) => [row.companyId, row._min.validatedAt]));
  const diffusionAt = (row: { sentAt: Date | null; createdAt: Date }) => row.sentAt ?? row.createdAt;
  const companyDiffusion = minBy(publications, (row) => row.companyId, diffusionAt);
  const missionDiffusion = minBy(publications, (row) => row.missionId, diffusionAt);
  const companyReport = minBy(reports, (row) => row.mission.companyId, (row) => row.createdAt);
  const missionReport = minBy(reports, (row) => row.missionId, (row) => row.createdAt);
  const missionDecision = minBy(decisions, (row) => row.missionId, (row) => row.createdAt);
  const missionDismissal = minBy(dismissals, (row) => row.missionId ?? "", (row) => row.createdAt);
  const companyLaunch = minBy(missions, (row) => row.companyId, (row) => row.firstLaunchedAt);
  const sum = <T extends { companyId: string }>(rows: readonly T[], value: (row: T) => number) => new Map(rows.map((row) => [row.companyId, value(row)]));
  const costMap = sum(costs, (row) => row._sum.costUsd ?? 0);
  const dayCostMap = sum(dayCost, (row) => row._sum.costUsd ?? 0);
  const monthCostMap = sum(monthCost, (row) => row._sum.costUsd ?? 0);
  const counts = (rows: readonly { companyId: string; _count: { _all: number } }[]) => sum(rows, (row) => row._count._all);
  const [dayAttemptMap, monthAttemptMap, dayInlineMap, monthInlineMap, dayChatMap, monthChatMap] = [dayAttempts, monthAttempts, dayInline, monthInline, dayChat, monthChat].map(counts);
  const alertMap = new Map(alerts.map((row) => [row.scope, row._count._all]));

  const companies: CompanyActivation[] = cohort.map((company) => {
    const journey = companyJourney({
      id: company.id,
      name: company.name,
      createdAt: company.createdAt,
      emailVerifiedAt: company.emailVerifiedAt,
      workspaceAt: workspaceAt.get(company.id) ?? company.profileConfirmedAt,
      firstLaunchAt: companyLaunch.get(company.id) ?? null,
      firstValidationAt: earliest([validationJournalAt.get(company.id), validatedAt.get(company.id)]),
      firstDiffusionAt: companyDiffusion.get(company.id) ?? null,
      firstReportAt: companyReport.get(company.id) ?? null,
      ownerActivity: [...(activity.get(company.id) ?? []), company.lastLoginAt],
    });
    const caps = reachedCaps(company, {
      dailyRuns: (dayAttemptMap.get(company.id) ?? 0) + (dayInlineMap.get(company.id) ?? 0),
      monthlyRuns: (monthAttemptMap.get(company.id) ?? 0) + (monthInlineMap.get(company.id) ?? 0),
      dailyMessages: dayChatMap.get(company.id) ?? 0,
      monthlyMessages: monthChatMap.get(company.id) ?? 0,
      dailyCostUsd: dayCostMap.get(company.id) ?? 0,
      monthlyCostUsd: monthCostMap.get(company.id) ?? 0,
    }, company.creditBalance, alertMap.get(`company:${company.id}`) ?? 0);
    return { ...journey, costUsd: costMap.get(company.id) ?? 0, caps };
  });

  const missionFacts: MissionFacts[] = missions.map((mission) => {
    const sent = publications.filter((row) => row.missionId === mission.id);
    return {
      companyId: mission.companyId,
      template: mission.template,
      channel: mission.channel,
      firstLaunchedAt: mission.firstLaunchedAt,
      stopRuleDays: mission.stopRuleDays,
      firstDiffusionAt: missionDiffusion.get(mission.id) ?? null,
      confirmedDiffusions: sent.filter((row) => row.mode === "confirmed").length,
      declaredDiffusions: sent.filter((row) => row.mode === "declared").length,
      firstReportAt: missionReport.get(mission.id) ?? null,
      firstDecisionAt: missionDecision.get(mission.id) ?? null,
      dismissedAt: missionDismissal.get(mission.id) ?? null,
    };
  });

  const byMonth = new Map<string, CompanyActivation[]>();
  for (const company of companies) {
    const month = monthOf(parisDay(company.createdAt));
    byMonth.set(month, [...(byMonth.get(month) ?? []), company]);
  }

  return {
    period,
    companies,
    funnel: funnelSummary(companies),
    measures: cohortMeasures(companies, missionFacts, now),
    cohorts: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, list]) => ({ month, measures: cohortMeasures(list, missionFacts, now) })),
    visits: traces,
  };
}
