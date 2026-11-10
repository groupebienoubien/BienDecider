import { CERTAINTY_LABELS, CERTAINTY_TONES, normalizeCertainty, type MissionProvenance } from "./certainty.ts";

/**
 * « Concurrence locale » d'Entreprise (#292, FR-51) : règles pures. Un constat de catégorie `concurrence` devient une ligne
 * acteur / angle / ce qu'il montre / ce qu'il ne montre pas / fiabilité, avec son statut (à confirmer, confirmé, écarté).
 * Un concurrent écarté n'est jamais reproposé par un audit suivant (`dismissedCompetitorNames`, lu par l'agent marketing).
 */

export const COMPETITOR_CATEGORY = "concurrence";

type CompetitorFindingLike = {
  id: string;
  category: string;
  title: string;
  content: string;
  whatWorks: string | null;
  toImprove: string | null;
  sourceUrl: string | null;
  sourceStatus: string | null;
  certainty: string;
  competitorConfirmedAt?: Date | string | null;
  competitorDismissedAt?: Date | string | null;
};

export type CompetitorStatus = "pending" | "confirmed" | "dismissed";

export type CompetitorRow = {
  id: string;
  /** Acteur : le nom du concurrent identifié. */
  actor: string;
  /** Angle : ce qui le distingue, tel que relevé par Paul. */
  angle: string;
  /** Ce qu'il montre. */
  shows: string;
  /** Ce qu'il ne montre pas. */
  hides: string;
  /** Fiabilité du constat : réutilise les libellés de certitude (Observé = avis réellement lus). */
  reliability: string;
  tone: MissionProvenance["tone"];
  status: CompetitorStatus;
};

const FALLBACK = "—";

/** Lignes « Concurrence locale », dans l'ordre du diagnostic ; les autres catégories de constat sont ignorées. */
export function competitorRows(findings: readonly CompetitorFindingLike[]): CompetitorRow[] {
  return findings
    .filter((finding) => finding.category === COMPETITOR_CATEGORY)
    .map((finding) => {
      const certainty = normalizeCertainty(finding.certainty, finding.sourceStatus, finding.sourceUrl);
      const status: CompetitorStatus = finding.competitorDismissedAt ? "dismissed" : finding.competitorConfirmedAt ? "confirmed" : "pending";
      return {
        id: finding.id,
        actor: finding.title,
        angle: finding.content,
        shows: finding.whatWorks?.trim() || FALLBACK,
        hides: finding.toImprove?.trim() || FALLBACK,
        reliability: CERTAINTY_LABELS[certainty],
        tone: CERTAINTY_TONES[certainty],
        status,
      };
    });
}

/** Noms des concurrents déjà écartés par le dirigeant, toutes périodes confondues : à ne jamais reproposer (prompt de l'agent). */
export function dismissedCompetitorNames(findings: readonly { category: string; title: string; competitorDismissedAt?: Date | string | null }[]): string[] {
  const names = findings.filter((finding) => finding.category === COMPETITOR_CATEGORY && finding.competitorDismissedAt).map((finding) => finding.title.trim());
  return [...new Set(names)];
}
