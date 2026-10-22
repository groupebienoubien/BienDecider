import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueuePlanRun } from "@/lib/agent-runs";

export const ONBOARDING_AUDIT_TITLE = "Audit de présence en ligne et fiche Google";
export const ONBOARDING_AUDIT_TIMING = "Dès l'inscription";
const MAX_SERIALIZATION_ATTEMPTS = 3;

/**
 * Premier audit de Martine, créé au plan à la première création du profil
 * (AD-11) : avant, le navigateur le lançait hors du plan, l'accueil ne le
 * voyait pas et Paul en relançait un. Aucun second audit d'inscription s'il
 * existe déjà (double envoi du formulaire). Les refus de
 * lancement (quota, budget, conflit) remontent à l'appelant ; l'action reste
 * alors « à lancer ».
 */
export async function startOnboardingAudit(companyId: string) {
  let item = null;
  for (let attempt = 1; ; attempt++) {
    try {
      // Sérialisable : deux envois simultanés lisent tous deux « pas d'audit » ; l'un échoue (P2034), relit et trouve l'audit.
      item = await prisma.$transaction(async (tx) => {
        const existing = await tx.actionPlanItem.findFirst({
          where: { companyId, agent: "marketing", timing: ONBOARDING_AUDIT_TIMING },
          select: { id: true },
        });
        if (existing) return null;
        return tx.actionPlanItem.create({
          data: {
            companyId,
            agent: "marketing",
            title: ONBOARDING_AUDIT_TITLE,
            rationale: "Premier passage de Martine dès l'inscription, pour connaître le point de départ de votre visibilité en ligne.",
            outcome: "Un état des lieux de votre présence en ligne et de votre fiche Google, avec les premières corrections à faire.",
            timing: ONBOARDING_AUDIT_TIMING,
            theme: "Visibilité",
            priority: 1,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt >= MAX_SERIALIZATION_ATTEMPTS) throw error;
    }
  }
  if (!item) return null;
  const run = await enqueuePlanRun({ companyId, item });
  return { item, run };
}
