/**
 * Partie pure du funnel (types, constantes, texte pour les prompts) — sans
 * import Prisma, pour être importable côté client. L'agrégation en base est
 * dans src/lib/funnel.ts (serveur uniquement).
 */

export const LEAD_STAGES = ["propose", "a_contacter", "contacte", "repondu", "rdv", "gagne", "perdu", "ecarte"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export type FunnelCounts = {
  identifies: number;
  aContacter: number;
  contactes: number;
  reponses: number;
  rdv: number;
  clients: number;
  perdus: number;
};

export type FunnelStats = {
  total: FunnelCounts;
  thisMonth: FunnelCounts;
  bySegment: { segment: string; counts: FunnelCounts }[];
};

/** Rang dans le funnel : un lead "rdv" a forcément été contacté et a répondu. */
const RANK: Record<LeadStage, number> = {
  propose: 0,
  ecarte: 0,
  a_contacter: 1,
  contacte: 2,
  repondu: 3,
  rdv: 4,
  gagne: 5,
  perdu: 2, // perdu après contact : compte comme contacté, pas comme réponse
};

/**
 * Compte un ensemble de leads par étape atteinte — pure, sans Prisma, pour
 * pouvoir recalculer les compteurs côté client juste après une déclaration
 * (sans attendre un rechargement de page pour refléter l'action).
 */
export function countLeads(leads: { stage: string }[]): FunnelCounts {
  const reached = (min: number) => leads.filter((l) => RANK[l.stage as LeadStage] >= min).length;
  return {
    identifies: leads.filter((l) => l.stage !== "ecarte").length,
    aContacter: leads.filter((l) => l.stage === "a_contacter").length,
    contactes: reached(2),
    reponses: reached(3),
    rdv: reached(4),
    clients: leads.filter((l) => l.stage === "gagne").length,
    perdus: leads.filter((l) => l.stage === "perdu").length,
  };
}

/**
 * En dessous de ce nombre de contacts par segment, Paul doit dire "trop tôt
 * pour conclure" — jamais "A fonctionne 5x mieux que B" sur 5 réponses
 * (cf. docs/archives/backlog.md, boucle d'apprentissage).
 */
export const MIN_CONTACTS_TO_CONCLUDE = 20;

/** Résumé du funnel pour le prompt de plan de Paul — vide si aucun lead. */
export function funnelLines(stats: FunnelStats): string {
  if (stats.total.identifies === 0) return "";
  const t = stats.total;
  const lines = [
    `Funnel de prospection réel (déclaré par le dirigeant) : ${t.identifies} prospects identifiés, ${t.contactes} contactés, ${t.reponses} réponses, ${t.rdv} rendez-vous, ${t.clients} clients gagnés, ${t.perdus} perdus.`,
  ];
  const segs = stats.bySegment.filter((s) => s.counts.contactes > 0);
  if (segs.length) {
    lines.push(
      "Par type de cible : " +
        segs
          .map(
            (s) =>
              `${s.segment} — ${s.counts.contactes} contactés, ${s.counts.reponses} réponses, ${s.counts.rdv} RDV, ${s.counts.clients} clients${
                s.counts.contactes < MIN_CONTACTS_TO_CONCLUDE ? " (échantillon trop petit pour conclure)" : ""
              }`,
          )
          .join(" ; ") +
        ".",
    );
  }
  lines.push(
    `Règle d'honnêteté : en dessous de ${MIN_CONTACTS_TO_CONCLUDE} contacts sur un type de cible, tu dis "trop tôt pour conclure, je continue à tester" — tu ne déclares jamais qu'une cible "fonctionne mieux" sur quelques réponses. Au-dessus, tu peux recommander de concentrer les efforts sur la cible qui convertit le mieux.`,
  );
  return lines.join("\n");
}
