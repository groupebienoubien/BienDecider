import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

/** Adresse IP propre à un test : chaque test a ses 3 analyses du jour (#280). */
export function testIpHeader(): Record<string, string> {
  return { "x-real-ip": `test-${randomUUID()}` };
}

/** Attend la fin de l'analyse publique du brouillon de `request` (#280), et renvoie sa vue. */
export async function waitForAnalysis(request: APIRequestContext, baseURL: string, headers: Record<string, string> = {}) {
  const last: { view: { finished: boolean; status: string; notice: string | null; rubrics: { key: string; name: string; label: string }[] } | null } = { view: null };
  await expect.poll(async () => {
    const response = await request.get(`${baseURL}/api/bienvenue/analyse`, { headers });
    last.view = response.ok() ? (await response.json()).analysis : null;
    return last.view?.finished ?? false;
  }, { timeout: 30_000, intervals: [300, 600, 1200] }).toBe(true);
  return last.view!;
}

export async function waitForIntelligence(request: APIRequestContext, baseURL: string) {
  await expect.poll(async () => {
    const response = await request.get(`${baseURL}/api/bienvenue/intelligence`);
    if (!response.ok()) return false;
    const { intelligence } = await response.json();
    return intelligence === null || intelligence?.finished === true;
  }, { timeout: 185_000, intervals: [300, 600, 1200] }).toBe(true);
}

/** Étape 1 par l'API du parcours : « Découvrir », fin de l'analyse, puis « Voir les constats » (étape 2). */
export async function discoverThenSeeFindings(request: APIRequestContext, baseURL: string, data: Record<string, string>, headers: Record<string, string> = testIpHeader()) {
  const post = (body: Record<string, unknown>) => request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL, ...headers }, data: body });
  expect([200, 429], "discover").toContain((await post({ action: "discover", ...data })).status());
  await waitForAnalysis(request, baseURL, headers);
  expect((await post({ action: "see_findings" })).status(), "see_findings").toBe(200);
}

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
/** Éléments retenus de `DRAFT_AMBITION` (#282). */
export const DRAFT_AMBITION_TERMS = { gainPercent: 20, horizonMonths: 12, mediaBudgetPerMonth: null, recruitment: "no" };

/**
 * Étape 3 par l'API du parcours (#282) : « Interpréter », puis « C'est bien ça » avec le jeton reçu.
 * Renvoie la réponse de la confirmation et l'interprétation.
 */
export async function interpretThenConfirmAmbition(request: APIRequestContext, baseURL: string, ambition: string, headers: Record<string, string> = {}) {
  const post = (body: Record<string, unknown>) => request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL, ...headers }, data: body });
  const interpreted = await post({ action: "interpret_ambition", ambition });
  expect(interpreted.status(), "interpret_ambition").toBe(200);
  const { interpretation, token } = await interpreted.json();
  const confirmed = await post({ action: "confirm_ambition", ambition, terms: interpretation.terms, token });
  return { confirmed, interpretation, token };
}

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
      ambition: step >= 4 ? { text: DRAFT_AMBITION, terms: DRAFT_AMBITION_TERMS } : undefined,
      profileConfirmed: step >= 3,
      diagnosticReady: step >= 4,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 24 * 3_600_000),
    },
  });
  return { id: draft.id, token, cookie: `pepito_draft=${token}` };
}
