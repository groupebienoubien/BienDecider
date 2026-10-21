/**
 * Regroupement du diagnostic par sujet (charte, section 6 : « regrouper avant de lister »).
 * La synthèse de chaque sujet est calculée, jamais rédigée par un modèle : nombre de points
 * à renforcer et de points positifs, et le constat le plus récent.
 */
export const DIAGNOSTIC_TOPICS = [
  { category: "site_web", label: "Site web" },
  { category: "reseaux_sociaux", label: "Réseaux sociaux" },
  { category: "concurrence", label: "Concurrence" },
] as const;

type GroupableFinding = { id: string; category: string; title: string; whatWorks: string | null; toImprove: string | null; createdAt: Date | string };

export type DiagnosticGroup<F extends GroupableFinding> = { category: string; label: string; findings: F[]; summary: string };

export function isPositiveFinding(finding: Pick<GroupableFinding, "whatWorks" | "toImprove">) {
  return Boolean(finding.whatWorks) && !finding.toImprove;
}

function count(value: number, singular: string, plural: string) {
  return `${value} ${value > 1 ? plural : singular}`;
}

/** Sujets connus dans l'ordre de la charte, puis les autres ; constats du plus récent au plus ancien. */
export function groupFindings<F extends GroupableFinding>(findings: F[]): DiagnosticGroup<F>[] {
  const categories = [...DIAGNOSTIC_TOPICS.map((topic) => topic.category as string), ...new Set(findings.map((finding) => finding.category))];
  return [...new Set(categories)].flatMap((category) => {
    const inGroup = findings
      .filter((finding) => finding.category === category)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (inGroup.length === 0) return [];
    const positives = inGroup.filter(isPositiveFinding).length;
    const toStrengthen = inGroup.length - positives;
    const counts = [toStrengthen > 0 && count(toStrengthen, "point à renforcer", "points à renforcer"), positives > 0 && count(positives, "point positif", "points positifs")].filter(Boolean).join(" · ");
    return [{
      category,
      label: DIAGNOSTIC_TOPICS.find((topic) => topic.category === category)?.label ?? category,
      findings: inGroup,
      summary: `${counts} — dernier constat : ${inGroup[0].title}`,
    }];
  });
}
