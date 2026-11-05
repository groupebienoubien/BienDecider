import { safeAlertLabel } from "@/lib/usage-alert-rules";

/** Signalements des dirigeants (story 7.4) : règles pures partagées par la route, la fenêtre et l'administration. */
export const FEEDBACK_KINDS = ["problem", "confusion", "idea"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  problem: "Un problème",
  confusion: "Une confusion",
  idea: "Une idée",
};

export const FEEDBACK_TEXT_MAX = 1000;
export const FEEDBACK_PAGE_MAX = 200;
export const FEEDBACK_HOURLY_LIMIT = 10;

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value);
}

/** Chemin de la page seulement : sans domaine, paramètres ni fragment ; « / » si la valeur est inutilisable. */
export function cleanFeedbackPage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "/";
  try {
    const path = new URL(value.trim(), "http://page.invalid").pathname;
    return path.slice(0, FEEDBACK_PAGE_MAX) || "/";
  } catch {
    return "/";
  }
}

export function parseFeedbackInput(body: unknown): { ok: true; value: { kind: FeedbackKind; text: string; page: string } } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Demande invalide." };
  const input = body as Record<string, unknown>;
  if (!isFeedbackKind(input.kind)) return { ok: false, error: "Choisissez le type de signalement." };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < 1) return { ok: false, error: "Décrivez ce qui ne va pas." };
  if (text.length > FEEDBACK_TEXT_MAX) return { ok: false, error: `Votre message dépasse ${FEEDBACK_TEXT_MAX} caractères.` };
  return { ok: true, value: { kind: input.kind, text, page: cleanFeedbackPage(input.page) } };
}

export function feedbackEmail(feedback: { kind: FeedbackKind; page: string; text: string; companyLabel: string }, adminUrl: string): { subject: string; text: string } {
  const company = safeAlertLabel(feedback.companyLabel);
  return {
    subject: `Signalement (${FEEDBACK_KIND_LABELS[feedback.kind].toLowerCase()}) : ${company}`,
    text: [
      `${company} a laissé un signalement.`,
      `Type : ${FEEDBACK_KIND_LABELS[feedback.kind]}`,
      `Page : ${feedback.page}`,
      "",
      feedback.text,
      "",
      `Le traiter : ${adminUrl}`,
    ].join("\n"),
  };
}
