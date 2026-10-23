import { Prisma } from "@prisma/client";

/**
 * Conflit d'une transaction sérialisable, à réessayer. Avec l'adaptateur pg,
 * il arrive aussi brut, en DriverAdapterError de cause TransactionWriteConflict
 * (code Postgres 40001), sans être converti en P2034.
 * Module à part pour ne pas dépendre d'agent-runs (plan-items l'utilise, et agent-runs importe plan-items).
 */
export function isSerializationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2034";
  return error instanceof Error && error.name === "DriverAdapterError" &&
    (error.cause as { kind?: string } | undefined)?.kind === "TransactionWriteConflict";
}

/**
 * Exécute fn (une transaction sérialisable) et la rejoue sur conflit de
 * sérialisation, au plus `attempts` fois en tout, avec un court délai
 * aléatoire entre deux essais pour que les transactions concurrentes ne se
 * rejouent pas en même temps. Toute autre erreur remonte telle quelle.
 */
export async function withSerializableRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * attempt));
    }
  }
}
