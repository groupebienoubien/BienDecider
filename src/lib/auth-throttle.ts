import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ANALYSIS_PER_IP_DAILY_LIMIT } from "@/lib/onboarding/analysis-rules";
import { INTELLIGENCE_PER_IP_DAILY_LIMIT } from "@/lib/onboarding/intelligence-rules";

export type ThrottleScope = "login" | "signup" | "token" | "reset" | "draft" | "analysis" | "ambition" | "synthesis" | "intelligence";

export const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Incrément atomique des échecs de mot de passe ; un verrou expiré repart de zéro au lieu de reverrouiller au premier échec. */
export async function recordFailedAttempt(companyId: string): Promise<number> {
  const now = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
  const base = Prisma.sql`(CASE WHEN "lockedUntil" <= ${now} THEN 0 ELSE "failedLoginAttempts" END)`;
  const rows = await prisma.$queryRaw<{ failedLoginAttempts: number }[]>`
    UPDATE "Company" SET
      "failedLoginAttempts" = ${base} + 1,
      "lockedUntil" = CASE
        WHEN ${base} + 1 >= ${MAX_ATTEMPTS} THEN ${now} + (${LOCK_DURATION_MS / 1000}::int * interval '1 second')
        WHEN "lockedUntil" <= ${now} THEN NULL
        ELSE "lockedUntil" END
    WHERE "id" = ${companyId}
    RETURNING "failedLoginAttempts"`;
  return rows[0].failedLoginAttempts;
}

const POLICY: Record<ThrottleScope, { limit: number; windowSeconds: number }> = {
  login: { limit: 20, windowSeconds: 15 * 60 },
  signup: { limit: 10, windowSeconds: 60 * 60 },
  // Liens à usage unique (confirmation d'adresse, réinitialisation) : jeton de 256 bits, la limite borne le coût, pas le risque.
  token: { limit: 30, windowSeconds: 60 * 60 },
  // Demandes de lien de réinitialisation : chacune peut envoyer un e-mail à un tiers.
  reset: { limit: 5, windowSeconds: 60 * 60 },
  // Brouillons anonymes du parcours d'entrée (#279) : chacun garde des saisies 24 h ; la limite borne le stockage.
  draft: { limit: 20, windowSeconds: 24 * 60 * 60 },
  // Analyses publiques avant compte (#280, décision D2) : chacune lit un site et appelle le modèle une fois.
  analysis: { limit: ANALYSIS_PER_IP_DAILY_LIMIT, windowSeconds: 24 * 60 * 60 },
  // Interprétations de l'ambition par le modèle avant compte (#282) : au-delà, l'analyseur de secours prend le relais.
  ambition: { limit: 10, windowSeconds: 24 * 60 * 60 },
  // « Ce que nous retenons » rédigé par le modèle avant compte (#284) : au-delà, les règles prennent le relais.
  synthesis: { limit: 10, windowSeconds: 24 * 60 * 60 },
  // Recherche réelle de marché avant compte (#361, #362) : chacune fait de la recherche web, plus coûteuse qu'une analyse.
  intelligence: { limit: INTELLIGENCE_PER_IP_DAILY_LIMIT, windowSeconds: 24 * 60 * 60 },
};

/** Ligne unique du compteur global des analyses anonymes (#280), toutes IP confondues. */
export const ANALYSIS_GLOBAL_KEY = "analysis:global";
const ANALYSIS_GLOBAL_WINDOW_SECONDS = 24 * 60 * 60;
export const DEFAULT_ANONYMOUS_ANALYSIS_DAILY_LIMIT = 300;

/** Plafond global du jour, réglable par `ANONYMOUS_ANALYSIS_DAILY_LIMIT` (entier positif ; 300 sinon). */
export function anonymousAnalysisDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.ANONYMOUS_ANALYSIS_DAILY_LIMIT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_ANONYMOUS_ANALYSIS_DAILY_LIMIT;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_ANONYMOUS_ANALYSIS_DAILY_LIMIT;
}

export type ThrottleResult = { key: string; limited: false } | { key: string; limited: true; retryAfterSeconds: number } | null;

/** Adresse IP posée par la plateforme (Vercel écrase x-real-ip) ; null si absente, la limite par IP est alors ignorée. */
function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded || null;
}

function throttleKey(scope: ThrottleScope, ip: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant dans l'environnement.");
  return `${scope}:${createHmac("sha256", secret).update(ip).digest("hex")}`;
}

/**
 * Consomme une tentative pour l'IP de la requête, de façon atomique (un seul UPSERT).
 * Retourne null quand aucune IP n'est disponible.
 */
export async function consumeIpAttempt(request: Request, scope: ThrottleScope): Promise<ThrottleResult> {
  const ip = clientIp(request);
  if (!ip) return null;
  const { limit, windowSeconds } = POLICY[scope];
  return consumeKey(throttleKey(scope, ip), limit, windowSeconds);
}

/** Consomme une analyse sur le compteur global du jour (#280) : au-delà du plafond, tout le monde est refusé. */
export async function consumeGlobalAnalysis(limit = anonymousAnalysisDailyLimit()): Promise<ThrottleResult> {
  return consumeKey(ANALYSIS_GLOBAL_KEY, limit, ANALYSIS_GLOBAL_WINDOW_SECONDS);
}

/** Ligne unique du compteur global des recherches de marché anonymes (#361), toutes IP confondues. */
export const INTELLIGENCE_GLOBAL_KEY = "intelligence:global";
const INTELLIGENCE_GLOBAL_WINDOW_SECONDS = 24 * 60 * 60;
export const DEFAULT_ANONYMOUS_INTELLIGENCE_DAILY_LIMIT = 300;

/** Plafond global du jour, réglable par `ANONYMOUS_INTELLIGENCE_DAILY_LIMIT` (entier positif ; 300 sinon), même ordre que l'analyse. */
export function anonymousIntelligenceDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.ANONYMOUS_INTELLIGENCE_DAILY_LIMIT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_ANONYMOUS_INTELLIGENCE_DAILY_LIMIT;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_ANONYMOUS_INTELLIGENCE_DAILY_LIMIT;
}

/** Consomme une recherche sur le compteur global du jour (#361) : au-delà du plafond, tout le monde est refusé. */
export async function consumeGlobalIntelligence(limit = anonymousIntelligenceDailyLimit()): Promise<ThrottleResult> {
  return consumeKey(INTELLIGENCE_GLOBAL_KEY, limit, INTELLIGENCE_GLOBAL_WINDOW_SECONDS);
}

/** Incrément atomique d'un compteur à fenêtre fixe (un seul UPSERT). */
async function consumeKey(key: string, limit: number, windowSeconds: number): Promise<Exclude<ThrottleResult, null>> {
  const utcNow = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
  const expired = Prisma.sql`"AuthThrottle"."windowStart" <= ${utcNow} - (${windowSeconds}::int * interval '1 second')`;
  const rows = await prisma.$queryRaw<{ count: number; elapsed: number }[]>`
    INSERT INTO "AuthThrottle" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${utcNow})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN ${expired} THEN 1 ELSE "AuthThrottle"."count" + 1 END,
      "windowStart" = CASE WHEN ${expired} THEN ${utcNow} ELSE "AuthThrottle"."windowStart" END
    RETURNING "count", EXTRACT(EPOCH FROM (${utcNow} - "AuthThrottle"."windowStart"))::int AS "elapsed"`;
  const row = rows[0];
  if (Math.random() < 0.02) {
    void prisma.$executeRaw`DELETE FROM "AuthThrottle" WHERE "windowStart" < ${utcNow} - interval '1 day'`.catch(() => undefined);
  }
  if (row.count <= limit) return { key, limited: false };
  return { key, limited: true, retryAfterSeconds: Math.max(1, windowSeconds - row.elapsed) };
}

/** Rend une tentative réussie : seuls les échecs doivent compter contre l'IP. */
export async function refundIpAttempt(result: ThrottleResult): Promise<void> {
  if (!result) return;
  await prisma.$executeRaw`UPDATE "AuthThrottle" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${result.key}`;
}
