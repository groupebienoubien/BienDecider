import type { MissionMessageCode } from "@/lib/missions/messages";
import type { MissionStatus } from "@/lib/missions/rules";

/** Bilan, décision de suite et lecture du bilan (spécification §7), en fonctions pures. */
export const REPORT_MAX = 100_000_000;
export const REPORT_NOTE_MAX = 600;

export type ReportInput = { qualifiedLeads: number; meetings: number; signedRevenue: number | null; note: string | null };
type Failure = { ok: false; code: MissionMessageCode };

const blank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

function wholeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 && number <= REPORT_MAX ? number : null;
}

/** Saisie du bilan (§7.1) : demandes et rendez-vous obligatoires (M-38), entiers de 0 à 100 000 000 (M-39), rendez-vous ≤ demandes (M-33). */
export function validateReport(body: unknown): { ok: true; value: ReportInput } | Failure {
  const input = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (blank(input.qualifiedLeads) || blank(input.meetings)) return { ok: false, code: "M-38" };
  const qualifiedLeads = wholeNumber(input.qualifiedLeads);
  const meetings = wholeNumber(input.meetings);
  const signedRevenue = blank(input.signedRevenue) ? null : wholeNumber(input.signedRevenue);
  if (qualifiedLeads === null || meetings === null || (!blank(input.signedRevenue) && signedRevenue === null)) return { ok: false, code: "M-39" };
  if (meetings > qualifiedLeads) return { ok: false, code: "M-33" };
  const note = typeof input.note === "string" ? input.note.replace(/[\p{Cc}]/gu, (char) => (char === "\n" ? "\n" : " ")).trim().slice(0, REPORT_NOTE_MAX) : "";
  return { ok: true, value: { qualifiedLeads, meetings, signedRevenue, note: note || null } };
}

/** Un bilan ou une décision est « à jour » tant que le nombre de diffusions de la mission n'a pas changé. */
export const isUpToDate = (recordedAt: number | null | undefined, diffusions: number) => recordedAt !== null && recordedAt !== undefined && recordedAt === diffusions;

export type DecisionChoice = "continue" | "stop";

/** Décision de suite (§2.2, §7.2) : mission En cours (M-34), au moins une diffusion (M-35) ; poursuivre exige un bilan à jour (M-36). */
export function checkDecision(state: { status: MissionStatus; diffusions: number; reportAt: number | null }, choice: DecisionChoice): MissionMessageCode | null {
  if (state.status !== "active") return "M-34";
  if (state.diffusions === 0) return "M-35";
  if (choice === "continue" && !isUpToDate(state.reportAt, state.diffusions)) return "M-36";
  return null;
}

/** Échéance de la règle d'arrêt : depuis la première diffusion, ou depuis la dernière décision de poursuivre. */
export function stopRuleDue(start: Date | null, days: number | null): Date | null {
  if (!start || !days) return null;
  return new Date(start.getTime() + days * 86_400_000);
}

const NUMBER_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

export type OutcomeTarget = { kind: "meetings" | "leads"; target: number };

/** Ce que le résultat recherché chiffre : « Un rendez-vous qualifié », « Deux demandes de devis »… ; null s'il n'est pas mesurable avec le bilan. */
export function readOutcomeTarget(outcome: string): OutcomeTarget | null {
  const text = outcome.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const match = /(?:^|[^\w-])(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:[a-z]+\s+){0,2}?(rendez-vous|rdv|demandes?|devis|contacts?|reponses?|appels?)\b/.exec(text);
  if (!match) return null;
  const target = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1]];
  if (!target) return null;
  return { kind: match[2] === "rendez-vous" || match[2] === "rdv" ? "meetings" : "leads", target };
}

export type ReportReading = {
  verdict: "reached" | "partial" | "missed" | "unknown";
  observed: string;
  suggests: string;
  notProven: string;
  impact: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * « Ce que Paul apprend » (§7.3) : les chiffres déclarés comparés au résultat recherché. Paul ne conclut pas avant
 * l'échéance de la règle d'arrêt (#52) ; sa proposition n'est jamais appliquée sans confirmation, jamais un élargissement.
 */
export function readReport(outcome: string, report: { qualifiedLeads: number; meetings: number; signedRevenue: number | null }, stop: { due: Date | null; now: Date }): ReportReading {
  const observed = `${plural(report.qualifiedLeads, "demande qualifiée", "demandes qualifiées")}, ${report.meetings} rendez-vous${report.signedRevenue === null ? ", chiffre d'affaires non déclaré" : `, ${report.signedRevenue.toLocaleString("fr-FR")} € signés`}.`;
  const target = readOutcomeTarget(outcome);
  const value = target ? (target.kind === "meetings" ? report.meetings : report.qualifiedLeads) : 0;
  const verdict: ReportReading["verdict"] = !target ? "unknown" : value >= target.target ? "reached" : value > 0 ? "partial" : "missed";
  const unit = target?.kind === "meetings" ? "rendez-vous" : "demande(s)";
  const suggests = verdict === "unknown"
    ? `Le résultat recherché « ${outcome} » n'est pas chiffré : impossible de juger. Précisez-le, par exemple « 2 demandes qualifiées ».`
    : verdict === "reached" ? `Résultat recherché atteint : ${value} ${unit} pour ${target?.target} visé${(target?.target ?? 0) > 1 ? "s" : ""}.`
    : verdict === "partial" ? `Résultat recherché partiellement atteint : ${value} ${unit} sur ${target?.target}.`
    : `Résultat recherché non atteint : aucun ${target?.kind === "meetings" ? "rendez-vous" : "demande"} sur ${target?.target} visé${(target?.target ?? 0) > 1 ? "s" : ""}.`;
  const early = stop.due !== null && stop.now < stop.due;
  const impact = early
    ? `Attendre la fin du test, le ${DAY.format(stop.due as Date)}, avant de conclure ; d'ici là, mêmes limites.`
    : verdict === "reached" ? "Proposition à confirmer : poursuivre dans les mêmes limites."
    : verdict === "partial" ? "Proposition à confirmer : poursuivre dans les mêmes limites, ou réduire pour isoler ce qui a marché."
    : verdict === "missed" ? "Proposition à confirmer : arrêter cette mission, ou tester une autre piste."
    : "Proposition à confirmer : préciser le résultat recherché, puis décider de la suite.";
  return { verdict, observed, suggests, notProven: "L'attribution est déclarative, non vérifiée, et un résultat isolé ne prouve pas qu'il se répétera.", impact };
}
