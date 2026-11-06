import { z } from "zod";

/** Liste d'agences des Partenariats (D6) : des organisations, jamais des particuliers, chacune avec sa source citée. */
export const AGENCY_SEGMENT = "agence";
/** Agences retenues au plus par recherche. */
export const AGENCY_SEARCH_MAX = 6;

export type FoundAgency = { name: string; sector: string; email: string; source: string; reason: string };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\p{Cc}<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

const emailSchema = z.email().max(254);

function readSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Une agence trouvée n'est retenue qu'avec un nom, un secteur, un e-mail professionnel valide et une source web. */
export function readFoundAgency(input: unknown): FoundAgency | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const name = clean(value.name, 80);
  const sector = clean(value.sector, 60);
  const reason = clean(value.reason, 300);
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const source = readSource(value.source);
  if (name.length < 2 || sector.length < 2 || !source || !emailSchema.safeParse(email).success) return null;
  return { name, sector, email, source, reason };
}

const nameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Retire les agences déjà connues (même e-mail ou même nom) et les doublons de la recherche, dans la limite d'une recherche. */
export function newAgencies(found: FoundAgency[], known: { name: string; email: string | null }[]): FoundAgency[] {
  const emails = new Set(known.map((agency) => agency.email?.toLowerCase()).filter(Boolean));
  const names = new Set(known.map((agency) => nameKey(agency.name)));
  const kept: FoundAgency[] = [];
  for (const agency of found) {
    if (kept.length >= AGENCY_SEARCH_MAX) break;
    if (emails.has(agency.email) || names.has(nameKey(agency.name))) continue;
    emails.add(agency.email);
    names.add(nameKey(agency.name));
    kept.push(agency);
  }
  return kept;
}
