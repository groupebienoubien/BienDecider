import type { Lead } from "@prisma/client";
import { cleanOwnerName } from "@/lib/company-profile";
import { OWNER_NAME_PLACEHOLDER } from "@/lib/agents/personas";

type LeadView = Pick<Lead, "name" | "reason" | "publicContact" | "source" | "stage" | "createdAt" | "deferredUntil">;

/** Ce que BienDecider sait vraiment du prospect : le reste est à confirmer par le dirigeant sur la source. */
export function leadReadiness(lead: Pick<Lead, "publicContact" | "source">) {
  const toConfirm: string[] = [];
  if (!lead.publicContact?.trim()) toConfirm.push("Aucun contact professionnel public indiqué : recherchez-le vous-même (site, téléphone) avant d'écrire.");
  if (!lead.source?.trim()) toConfirm.push("Aucune source indiquée : vérifiez que cette organisation existe et correspond à votre cible.");
  return { usable: toConfirm.length === 0, toConfirm };
}

export function isDeferred(lead: Pick<Lead, "deferredUntil">, now: number): boolean {
  return lead.deferredUntil !== null && new Date(lead.deferredUntil).getTime() > now;
}

/** Prochain prospect à traiter : à contacter, non différé, avec contact et source d'abord, puis le plus ancien. */
export function pickNextLead<T extends LeadView>(leads: T[], now: number): T | null {
  const candidates = leads.filter((lead) => lead.stage === "a_contacter" && !isDeferred(lead, now));
  const ranked = [...candidates].sort((a, b) =>
    Number(leadReadiness(b).usable) - Number(leadReadiness(a).usable)
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return ranked[0] ?? null;
}

/** Brouillon repris du prospect, sans adresse inventée : le dirigeant complète les passages entre crochets. */
export function buildOutreachDraft(params: {
  lead: Pick<Lead, "name" | "reason">;
  companyName: string;
  trade: string | null;
  phone: string | null;
  /** Prénom et nom du dirigeant : signature du brouillon, sinon « [Votre prénom et nom] ». */
  ownerName?: string | null;
}): string {
  const { lead, companyName, trade, phone } = params;
  const signature = (params.ownerName && cleanOwnerName(params.ownerName)) || OWNER_NAME_PLACEHOLDER;
  const who = trade ? `${companyName} (${trade})` : companyName;
  return [
    `Objet : ${companyName} — une idée pour ${lead.name}`,
    "",
    "Bonjour [Prénom],",
    "",
    `Je représente ${who}. Je vous écris car ${lead.name} m'a semblé correspondre à ce que nous faisons : ${lead.reason.trim()}`,
    "",
    `[Précisez en une phrase ce que vous proposez et ce que cela apporterait à ${lead.name}.]`,
    "",
    "Seriez-vous disponible pour un court échange cette semaine ?",
    "",
    "Cordialement,",
    signature,
    companyName,
    ...(phone ? [phone] : []),
  ].join("\n");
}

export function hasPlaceholders(draft: string): boolean {
  return /\[[^\]]+\]/.test(draft);
}

/** « 2026-10-12 » → date locale lisible, sans décalage de fuseau. */
export function formatDay(value: Date | string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

/** Jour calendaire stocké à midi UTC pour rester le même jour quel que soit le fuseau d'affichage. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}
