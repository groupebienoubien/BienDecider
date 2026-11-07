import { createHmac, timingSafeEqual } from "node:crypto";
import type { AmbitionTerms } from "@/lib/ambition-rules";

/**
 * Jeton de l'interprétation de l'ambition (#282) : l'interprétation n'est jamais enregistrée seule, elle revient au
 * client avec un HMAC (SESSION_SECRET) sur le texte exact et les éléments retenus ; « C'est bien ça » l'exige.
 * Module serveur, séparé des règles pures (`ambition-rules.ts`) que les composants client importent.
 */

function canonical(text: string, terms: AmbitionTerms): string {
  return JSON.stringify(["ambition-v1", text, terms.gainPercent, terms.horizonMonths, terms.mediaBudgetPerMonth, terms.recruitment]);
}

function mac(text: string, terms: AmbitionTerms, secret: string): string {
  return createHmac("sha256", secret).update(canonical(text, terms)).digest("base64url");
}

export function signInterpretation(text: string, terms: AmbitionTerms, secret: string | undefined = process.env.SESSION_SECRET): string {
  if (!secret) throw new Error("SESSION_SECRET manquant dans l'environnement.");
  return mac(text, terms, secret);
}

/** Vrai si le jeton a été émis pour ce texte exact et ces éléments. */
export function verifyInterpretation(text: string, terms: AmbitionTerms, token: unknown, secret: string | undefined = process.env.SESSION_SECRET): boolean {
  if (!secret || typeof token !== "string" || token.length > 128) return false;
  const expected = Buffer.from(mac(text, terms, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
