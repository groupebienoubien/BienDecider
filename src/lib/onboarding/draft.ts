import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readDraftState, type DraftState } from "@/lib/onboarding/draft-rules";
import { analysisRunning, readAnalysis, type DraftAnalysis } from "@/lib/onboarding/analysis-rules";

/**
 * Brouillon anonyme du parcours d'entrée (#279, addendum §6) : lié au cookie `pepito_draft`, valable 24 h.
 * Seule l'empreinte SHA-256 du jeton est en base ; un brouillon expiré est ignoré (le parcours repart à l'étape 1).
 */
export const DRAFT_COOKIE = "pepito_draft";
export const DRAFT_TTL_SECONDS = 24 * 60 * 60;

export type LoadedDraft = { id: string; state: DraftState; expiresAt: Date };

export function hashDraftToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function draftCookieOptions(expiresAt: Date, nodeEnv: string | undefined = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: nodeEnv === "production",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

function toJson(state: DraftState): { step: number; profile: Prisma.InputJsonObject; ambition: Prisma.InputJsonObject | undefined; profileConfirmed: boolean; diagnosticReady: boolean } {
  return {
    step: state.step,
    profile: { ...state.profile },
    ambition: state.ambition === null ? undefined : {
      text: state.ambition.text,
      terms: { ...state.ambition.terms },
      // « Ce que nous retenons » et son coût (#284) ; absents, ils disparaissent de la colonne (retour avant l'étape 4).
      ...(state.ambition.retained ? { retained: [...state.ambition.retained] } : {}),
      ...(state.ambition.retainedCost ? { retainedCost: { ...state.ambition.retainedCost } } : {}),
    },
    profileConfirmed: state.profileConfirmed,
    diagnosticReady: state.diagnosticReady,
  };
}

async function draftToken(): Promise<string | null> {
  const value = (await cookies()).get(DRAFT_COOKIE)?.value;
  return value && value.length <= 128 ? value : null;
}

/** Brouillon du cookie, s'il existe et n'a pas expiré ; sinon null. */
export async function loadDraft(now = new Date()): Promise<LoadedDraft | null> {
  const token = await draftToken();
  if (!token) return null;
  const row = await prisma.onboardingDraft.findUnique({ where: { tokenHash: hashDraftToken(token) } });
  if (!row || row.expiresAt <= now) return null;
  return { id: row.id, state: readDraftState(row), expiresAt: row.expiresAt };
}

/** Crée le brouillon et pose son cookie (route handler seulement). Les brouillons expirés sont effacés au passage. */
export async function createDraft(state: DraftState, now = new Date()): Promise<LoadedDraft> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_SECONDS * 1000);
  const row = await prisma.onboardingDraft.create({ data: { tokenHash: hashDraftToken(token), expiresAt, ...toJson(state) } });
  (await cookies()).set(DRAFT_COOKIE, token, draftCookieOptions(expiresAt));
  if (Math.random() < 0.05) void prisma.onboardingDraft.deleteMany({ where: { expiresAt: { lte: now } } }).catch(() => undefined);
  return { id: row.id, state, expiresAt };
}

/** Faux si le brouillon a disparu entre-temps (compte créé dans un autre onglet) ou a expiré. */
export async function saveDraft(id: string, state: DraftState, now = new Date()): Promise<boolean> {
  // L'ambition ne redevient jamais vide : absente, elle reste telle qu'en base.
  const saved = await prisma.onboardingDraft.updateMany({ where: { id, expiresAt: { gt: now } }, data: toJson(state) });
  return saved.count > 0;
}

/**
 * Pose une nouvelle analyse « en cours » (#280), sauf si une autre l'est déjà : la ligne est verrouillée le temps
 * du contrôle, deux lancements simultanés ne passent jamais tous les deux. La colonne `analysis` est la seule écrite.
 */
export async function startAnalysis(id: string, analysis: DraftAnalysis, now = new Date()): Promise<"started" | "busy" | "missing"> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ analysis: unknown; expiresAt: Date }[]>`SELECT "analysis", "expiresAt" FROM "OnboardingDraft" WHERE "id" = ${id} FOR UPDATE`;
    const row = rows[0];
    if (!row || row.expiresAt <= now) return "missing";
    if (analysisRunning(readAnalysis(row.analysis), now)) return "busy";
    await tx.onboardingDraft.update({ where: { id }, data: { analysis: analysis as unknown as Prisma.InputJsonObject } });
    return "started";
  });
}

/** Écrit l'état de l'analyse `runId` (en arrière-plan) ; faux si le brouillon a disparu, expiré ou relancé une autre analyse. */
export async function saveAnalysis(id: string, analysis: DraftAnalysis, now = new Date()): Promise<boolean> {
  const saved = await prisma.onboardingDraft.updateMany({
    where: { id, expiresAt: { gt: now }, analysis: { path: ["runId"], equals: analysis.runId } },
    data: { analysis: analysis as unknown as Prisma.InputJsonObject },
  });
  return saved.count > 0;
}

/** Efface le cookie du brouillon (route handler seulement). */
export async function clearDraftCookie(): Promise<void> {
  (await cookies()).delete(DRAFT_COOKIE);
}
