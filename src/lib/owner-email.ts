import { prisma } from "@/lib/prisma";

/** Adresse de connexion telle qu'enregistrée : sans espaces autour, en minuscules. */
export function normalizeOwnerEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Compte d'une adresse, sans tenir compte de la casse. L'adresse exacte passe d'abord : un compte créé avant
 * la mise en minuscules garde sa casse d'origine en base.
 */
export async function findCompanyByOwnerEmail(email: string) {
  return (await prisma.company.findUnique({ where: { ownerEmail: email } }))
    ?? prisma.company.findFirst({ where: { ownerEmail: { equals: email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } });
}
