import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueuePlanRun } from "@/lib/agent-runs";
import { withSerializableRetry } from "@/lib/serialization-conflict";

export const ONBOARDING_AUDIT_TITLE = "Audit de présence en ligne et fiche Google";
export const ONBOARDING_AUDIT_TIMING = "Dès l'inscription";
export const ONBOARDING_GROWTH_TITLE = "Pistes de croissance réelles pour votre activité";
export const ONBOARDING_GROWTH_TIMING = "Dès l'inscription";
const MAX_SERIALIZATION_ATTEMPTS = 3;

/** Crée l'action du plan d'un agent « dès l'inscription » si elle n'existe pas déjà, puis la lance. */
async function startOnboardingPlanItem(companyId: string, data: { agent: "marketing" | "demarchage"; title: string; rationale: string; outcome: string; timing: string; theme: "Visibilité" | "Prospection"; priority: number }) {
  // Sérialisable : deux envois simultanés lisent tous deux « pas d'action » ; l'un échoue (conflit de sérialisation), relit et la trouve.
  const item = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.actionPlanItem.findFirst({
      where: { companyId, agent: data.agent, timing: data.timing },
      select: { id: true },
    });
    if (existing) return null;
    return tx.actionPlanItem.create({ data: { companyId, ...data } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), MAX_SERIALIZATION_ATTEMPTS);
  if (!item) return null;
  const run = await enqueuePlanRun({ companyId, item });
  return { item, run };
}

/**
 * Premier audit de Martine, créé au plan à la première création du profil
 * (AD-11) : avant, le navigateur le lançait hors du plan, l'accueil ne le
 * voyait pas et Paul en relançait un. Aucun second audit d'inscription s'il
 * existe déjà (double envoi du formulaire). Les refus de
 * lancement (quota, budget, conflit) remontent à l'appelant ; l'action reste
 * alors « à lancer ».
 */
export async function startOnboardingAudit(companyId: string) {
  return startOnboardingPlanItem(companyId, {
    agent: "marketing",
    title: ONBOARDING_AUDIT_TITLE,
    rationale: "Premier passage de Martine dès l'inscription, pour connaître le point de départ de votre visibilité en ligne.",
    outcome: "Un état des lieux de votre présence en ligne et de votre fiche Google, avec les premières corrections à faire.",
    timing: ONBOARDING_AUDIT_TIMING,
    theme: "Visibilité",
    priority: 1,
  });
}

/**
 * Première recherche de Jean-Claude, lancée dès l'inscription comme l'audit de Martine ci-dessus : une vraie
 * recherche web d'actualités locales, d'événements à venir et d'opportunités professionnelles pour cette activité
 * et cette zone — jamais un texte générique. Même garde-fou qu'au-dessus : aucune seconde recherche d'inscription
 * si elle existe déjà, et un refus de lancement (quota, budget, conflit) remonte à l'appelant sans bloquer l'inscription.
 */
export async function startOnboardingGrowthSearch(companyId: string) {
  return startOnboardingPlanItem(companyId, {
    agent: "demarchage",
    title: ONBOARDING_GROWTH_TITLE,
    rationale: "Première recherche de Jean-Claude dès l'inscription, pour repérer sans attendre une actualité, un événement ou une opportunité réelle près de chez vous.",
    outcome: "Des pistes de croissance réelles, sourcées, à décider de garder ou d'écarter.",
    timing: ONBOARDING_GROWTH_TIMING,
    theme: "Prospection",
    priority: 2,
  });
}
