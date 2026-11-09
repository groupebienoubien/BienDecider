import { CERTAINTY_LABELS, findingOrigin, normalizeCertainty, safeSourceUrl, type Certainty, type MissionSourceFinding } from "@/lib/findings/certainty";

/**
 * « Diagnostic & positionnement » d'Entreprise (#292, FR-51, spécification §13.5) : règles pures. Chaque constat du diagnostic
 * courant devient une ligne « Constat · Certitude · Ce que Paul en déduit · Suite proposée » ; rien n'est déduit sans mission reliée.
 */

type FindingLike = { id: string; title: string; category: string; content: string; sourceUrl: string | null; sourceStatus: string | null; certainty: string; createdAt: Date | string };
type MissionLike = { id: string; title: string; status: string; sourceFindingId: string | null; deduction: string | null };

export type DecisionRow = {
  finding: MissionSourceFinding;
  origin: string;
  certainty: string;
  tone: "green" | "blue" | "orange";
  /** Déduction de Paul, seulement quand une mission en découle. */
  deduction: string | null;
  missions: { id: string; title: string }[];
};

const TONES: Record<Certainty, DecisionRow["tone"]> = { observe: "green", piste: "blue", a_verifier: "orange" };

/** Lignes du tableau, dans l'ordre du diagnostic ; une mission écartée ou arrêtée n'est pas une suite proposée. */
export function decisionRows(findings: FindingLike[], missions: MissionLike[]): DecisionRow[] {
  return findings.map((finding) => {
    const certainty = normalizeCertainty(finding.certainty, finding.sourceStatus, finding.sourceUrl);
    const linked = missions.filter((mission) => mission.sourceFindingId === finding.id && mission.status !== "dismissed" && mission.status !== "stopped");
    return {
      finding: { id: finding.id, title: finding.title, category: finding.category, content: finding.content, sourceUrl: finding.sourceUrl, sourceStatus: finding.sourceStatus, certainty, createdAt: new Date(finding.createdAt).toISOString() },
      origin: findingOrigin(finding.category, finding.sourceUrl),
      certainty: CERTAINTY_LABELS[certainty],
      tone: TONES[certainty],
      deduction: linked.find((mission) => mission.deduction?.trim())?.deduction?.trim() ?? null,
      missions: linked.map((mission) => ({ id: mission.id, title: mission.title })),
    };
  });
}

/** Résumé chiffré : constats, sources réellement lues (adresses distinctes des constats observés) et missions qui en découlent. */
export function diagnosticSummary(rows: DecisionRow[]): { findings: number; sources: number; missions: number } {
  const sources = new Set(rows.filter((row) => row.finding.certainty === "observe").map((row) => safeSourceUrl(row.finding.sourceUrl)).filter(Boolean));
  return { findings: rows.length, sources: sources.size, missions: new Set(rows.flatMap((row) => row.missions.map((mission) => mission.id))).size };
}

type CompanyGaps = { website: string | null; googlePlaceId: string | null; targetClients: string | null; offers: string | null; monthlyRevenue: number | null; averageClientValue: number | null };

/** « Ce qu'il nous manque » : ce que Paul ne sait pas, tiré du profil, jamais supposé. */
export function missingInputs(company: CompanyGaps): string[] {
  const missing: string[] = [];
  if (!company.website?.trim()) missing.push("Votre site internet, s'il existe");
  if (!company.googlePlaceId) missing.push("Votre fiche Google, à confirmer dans le diagnostic");
  if (!company.targetClients?.trim()) missing.push("Vos clients");
  if (!company.offers?.trim()) missing.push("Ce que vous proposez");
  if (company.monthlyRevenue == null) missing.push("Votre chiffre d'affaires actuel (facultatif)");
  if (company.averageClientValue == null) missing.push("La valeur moyenne d'un client (facultatif)");
  missing.push("La performance réelle de vos concurrents : non accessible");
  return missing;
}
