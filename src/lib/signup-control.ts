import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SIGNUP_CONTROL,
  signupAvailability,
  signupDayKey,
  type SignupAvailability,
  type SignupControlState,
} from "@/lib/signup-rules";

const CONTROL_ID = "global";

export async function readSignupControl(): Promise<SignupControlState & { updatedBy: string | null; updatedAt: Date | null }> {
  const saved = await prisma.signupControl.findUnique({ where: { id: CONTROL_ID } });
  if (!saved) return { ...DEFAULT_SIGNUP_CONTROL, updatedBy: null, updatedAt: null };
  return { open: saved.open, dailyCap: saved.dailyCap, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt };
}

export async function saveSignupControl(value: SignupControlState, updatedBy: string): Promise<void> {
  await prisma.signupControl.upsert({
    where: { id: CONTROL_ID },
    create: { id: CONTROL_ID, open: value.open, dailyCap: value.dailyCap, updatedBy },
    update: { open: value.open, dailyCap: value.dailyCap, updatedBy },
  });
}

export async function todaySignupCount(now = new Date()): Promise<number> {
  const row = await prisma.signupDay.findUnique({ where: { day: signupDayKey(now) } });
  return row?.count ?? 0;
}

/** État vu par un visiteur : ouvertes, fermées ou complètes aujourd'hui. */
export async function currentSignupAvailability(now = new Date()): Promise<SignupAvailability> {
  const [control, count] = await Promise.all([readSignupControl(), todaySignupCount(now)]);
  return signupAvailability(control, count);
}

/**
 * Réserve un emplacement du jour en une seule instruction : le compteur ne dépasse jamais le plafond,
 * même si deux inscriptions se présentent en même temps pour le dernier emplacement.
 * Retourne la clé du jour réservé (à rendre en cas d'échec), ou null si le plafond est atteint.
 */
export async function reserveSignupSlot(cap: number | null, now = new Date()): Promise<string | null> {
  if (cap !== null && cap <= 0) return null;
  const day = signupDayKey(now);
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "SignupDay" ("day", "count") VALUES (${day}, 1)
    ON CONFLICT ("day") DO UPDATE SET "count" = "SignupDay"."count" + 1
    WHERE ${cap}::int IS NULL OR "SignupDay"."count" < ${cap}::int
    RETURNING "count"`);
  return rows.length > 0 ? day : null;
}

/** Rend l'emplacement quand le compte n'a finalement pas été créé. */
export async function releaseSignupSlot(day: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`UPDATE "SignupDay" SET "count" = GREATEST("count" - 1, 0) WHERE "day" = ${day}`);
}
