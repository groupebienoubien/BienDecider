import type { TemplateKey } from "@/lib/missions/templates";

const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Résumé du périmètre en une ligne (spécification §6.3) ; « À préciser » tant qu'il n'est pas renseigné.
 * `names` : noms des agences lus en base, pour « {agence 1} et {agence 2} » ; sans eux, le nombre d'agences.
 */
export function scopeSummary(template: TemplateKey, scope: unknown, names: Record<string, string> = {}): string {
  const value = asObject(scope);
  switch (template) {
    case "agencies": {
      if (!count(value.agencyIds)) return "À préciser";
      const named = (value.agencyIds as unknown[]).map((id) => (typeof id === "string" ? names[id] : undefined));
      return named.every(Boolean) ? named.join(" et ") : plural(count(value.agencyIds), "agence", "agences");
    }
    case "leads":
      return count(value.contactIds) ? plural(count(value.contactIds), "contact", "contacts") : "À préciser";
    case "proof":
      return typeof value.proofId === "string" ? "1 réalisation" : "À préciser";
    case "social_post":
      return typeof value.topic === "string" ? `Sujet : ${value.topic}` : "À préciser";
    case "google_profile":
      return "Votre établissement";
    case "review_reply":
      return count(value.reviewIds) ? plural(count(value.reviewIds), "avis", "avis") : "À préciser";
    case "site_page":
      return typeof value.page === "string" ? `Page : ${value.page}` : "Une page du site";
    case "custom":
      return typeof value.description === "string" ? value.description : "À préciser";
  }
}
