import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** Profil complet d'un brouillon de test (#279). */
export const DRAFT_PROFILE = {
  firstName: "Claire",
  companyName: "Atelier Lumen",
  location: "Lyon",
  website: "",
  trade: "Électricien",
  servingArea: "Lyon et alentours",
  targetClients: "Particuliers propriétaires",
  offers: "Rénovation électrique",
};
export const DRAFT_AMBITION = "+20 % de chiffre d'affaires en 12 mois, sans embaucher";

export type TestDraft = { id: string; token: string; cookie: string };

/**
 * Brouillon anonyme écrit directement en base, à l'étape demandée (5 par défaut : prêt pour la création du compte).
 * Seule l'empreinte du jeton est stockée, comme en production ; `cookie` s'envoie tel quel dans l'en-tête Cookie.
 */
export async function createTestDraft(prisma: PrismaClient, options: { step?: number; expiresAt?: Date; profile?: Partial<typeof DRAFT_PROFILE> } = {}): Promise<TestDraft> {
  const step = options.step ?? 5;
  const token = randomBytes(32).toString("base64url");
  const draft = await prisma.onboardingDraft.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      step,
      profile: { ...DRAFT_PROFILE, ...options.profile },
      ambition: step >= 4 ? { text: DRAFT_AMBITION } : undefined,
      profileConfirmed: step >= 3,
      diagnosticReady: step >= 4,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 24 * 3_600_000),
    },
  });
  return { id: draft.id, token, cookie: `pepito_draft=${token}` };
}
