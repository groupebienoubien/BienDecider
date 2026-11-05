import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Jetons à usage unique envoyés par e-mail (stories 6.4 et 6.5). Seule l'empreinte SHA-256 est stockée.
export const EMAIL_TOKEN_KINDS = ["verify_email", "reset_password"] as const;
export type EmailTokenKind = (typeof EMAIL_TOKEN_KINDS)[number];

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenKind, number> = {
  verify_email: 24 * 3_600_000, // [ASSUMPTION] le cahier des charges ne fixe pas la durée de la confirmation
  reset_password: 3_600_000, // FR-10 : valable une heure
};

/** Délai minimal entre deux e-mails du même type pour un compte. */
export const EMAIL_RESEND_INTERVAL_MS = 60_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashEmailToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forme attendue d'un jeton (32 octets en base64url) : évite toute requête pour une valeur manifestement fausse. */
export function isWellFormedEmailToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Secondes restantes avant de pouvoir recréer un jeton de ce type pour ce compte, 0 si c'est possible. */
export async function secondsUntilNextEmail(companyId: string, kind: EmailTokenKind, now = new Date()): Promise<number> {
  const last = await prisma.emailToken.findFirst({ where: { companyId, kind }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!last) return 0;
  return Math.max(0, Math.ceil((last.createdAt.getTime() + EMAIL_RESEND_INTERVAL_MS - now.getTime()) / 1000));
}

/** Crée un jeton et annule les précédents non utilisés du même type. Retourne le jeton en clair, à n'envoyer que par e-mail. */
export async function createEmailToken(companyId: string, kind: EmailTokenKind, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { companyId, kind, OR: [{ usedAt: null }, { expiresAt: { lt: now } }] } }),
    prisma.emailToken.create({ data: { companyId, kind, tokenHash: hashEmailToken(token), expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[kind]) } }),
  ]);
  return token;
}

/**
 * Consomme un jeton valide, de façon atomique : un jeton ne sert qu'une fois, même si deux requêtes
 * arrivent en même temps. Retourne l'entreprise concernée, ou null (inconnu, expiré, déjà utilisé).
 */
export async function consumeEmailToken(token: unknown, kind: EmailTokenKind, now = new Date()): Promise<{ companyId: string } | null> {
  if (!isWellFormedEmailToken(token)) return null;
  const tokenHash = hashEmailToken(token);
  const claimed = await prisma.emailToken.updateMany({ where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claimed.count !== 1) return null;
  const row = await prisma.emailToken.findUnique({ where: { tokenHash }, select: { companyId: true } });
  return row ?? null;
}
