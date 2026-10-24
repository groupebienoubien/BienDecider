import { parseFindingActionItems } from "@/lib/finding-shared";

type PlanFinding = { title: string; toImprove: string | null; content: string; actionItems: unknown };

const FIELD_MAX = 400;
const MAX_FINDINGS = 8;
const MAX_RECOMMENDATIONS = 3;

function clip(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > FIELD_MAX ? `${flat.slice(0, FIELD_MAX - 1)}…` : flat;
}

/**
 * Story 5.2 : le dernier audit tel que Paul le lit pour préparer le plan —
 * pour chaque constat, son titre, ce qu'il faut améliorer et les
 * recommandations de Martine, et plus seulement les titres.
 */
export function latestAuditLines(findings: PlanFinding[]) {
  if (!findings.length) return "Dernier audit : aucun constat.";
  const lines = findings.slice(0, MAX_FINDINGS).map((finding, index) => {
    const toImprove = clip(finding.toImprove ?? finding.content);
    const recommendations = parseFindingActionItems(finding.actionItems)
      .slice(0, MAX_RECOMMENDATIONS)
      .map((item) => `${item.agent}: ${clip(item.title)} (${clip(item.rationale)})`)
      .join(" ; ");
    return `${index + 1}. ${clip(finding.title)} — À améliorer : ${toImprove || "non précisé"} — Recommandations : ${recommendations || "aucune"}`;
  });
  return `Dernier audit (base ton plan sur ces constats et leurs recommandations ; l'audit est fait, ne propose pas de le refaire) :\n${lines.join("\n")}`;
}
