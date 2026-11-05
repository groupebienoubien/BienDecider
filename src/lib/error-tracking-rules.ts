import { createHash } from "node:crypto";
import { redactSecrets } from "@/lib/redact-secrets";
import { safeAlertLabel } from "@/lib/usage-alert-rules";

/** Règles pures du suivi des erreurs serveur (story 8.1) : rien n'est stocké ni envoyé sans être nettoyé. */
export const ERROR_ALERT_WINDOW_MS = 60 * 60 * 1000;
export const ERROR_RETENTION_DAYS = 30;
export const ERROR_PATH_MAX_LENGTH = 200;

/** Chemin seul : ni paramètres ni fragment, qui peuvent porter un jeton. */
export function cleanErrorPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "/";
  try {
    return new URL(value.trim(), "http://page.invalid").pathname.slice(0, ERROR_PATH_MAX_LENGTH) || "/";
  } catch {
    return "/";
  }
}

export function cleanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "Erreur inconnue";
  return redactSecrets(raw) || "Erreur inconnue";
}

/** Même erreur sur la même route = même empreinte, quels que soient les nombres et identifiants du message. */
export function errorFingerprint(message: string, route: string, method: string): string {
  const stable = message.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|\d+/gi, "#");
  return createHash("sha256").update(`${method.toUpperCase()} ${route} ${stable}`).digest("hex").slice(0, 16);
}

export function errorAlertEmail(event: { message: string; path: string; method: string }, adminUrl: string): { subject: string; text: string } {
  const where = `${safeAlertLabel(event.method)} ${safeAlertLabel(event.path)}`;
  return {
    subject: `Erreur en production : ${where}`,
    text: [
      "Bonjour,",
      "",
      `Une erreur serveur s'est produite sur ${where}.`,
      "",
      event.message,
      "",
      `Voir les erreurs récentes : ${adminUrl}`,
      "",
      "Une seule alerte est envoyée par erreur et par heure. Aucun secret n'est conservé dans ce message.",
      "",
      "BienDecider",
    ].join("\n"),
  };
}
