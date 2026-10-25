import { prisma } from "@/lib/prisma";
import { currentAgentExecution, withAgentRunWrite } from "@/lib/agent-run-execution";

/**
 * Enregistrement des lectures de sources faites par le code (pas déclarées par
 * le modèle) : ce que l'analyse a réellement pu lire, jamais de contenu tiers.
 */

export type SourceName = "google_reviews" | "facebook_page";
export type SourceReadReason = "not_configured" | "to_confirm" | "not_found" | "unavailable" | "not_connected" | "permission" | "reauthorization";
export type SourceReadInput = { target: "own" | "competitor"; subject?: string; status: "lue" | "non_lue"; reason?: SourceReadReason; itemCount?: number };

const SUBJECT_MAX = 120;

/** Enregistre une lecture, dans le même contrôle de tentative que les autres écritures d'un agent. */
export async function recordSourceRead(companyId: string, agentRunId: string | undefined, source: SourceName, read: SourceReadInput) {
  const data = {
    companyId,
    agentRunId,
    source,
    target: read.target,
    subject: read.subject?.slice(0, SUBJECT_MAX) ?? null,
    status: read.status,
    reason: read.reason ?? null,
    itemCount: read.itemCount ?? null,
  };
  // Dans un passage d'agent, la garde de tentative s'applique ; hors de tout passage (appel direct), il n'y a aucune tentative à protéger.
  if (currentAgentExecution()) await withAgentRunWrite(companyId, agentRunId, (tx) => tx.sourceRead.create({ data }));
  else await prisma.sourceRead.create({ data });
}

const GOOGLE_LABELS: Record<SourceReadReason, string> = {
  not_configured: "la lecture des avis Google n'est pas activée",
  to_confirm: "la fiche Google n'est pas encore confirmée par le dirigeant",
  not_found: "aucune fiche Google n'a été trouvée",
  unavailable: "Google n'a pas répondu",
  not_connected: "la fiche Google n'est pas connectée",
  permission: "la permission de lecture n'est pas accordée",
  reauthorization: "la connexion est à refaire",
};

const FACEBOOK_LABELS: Record<SourceReadReason, string> = {
  not_configured: "la connexion Facebook n'est pas activée",
  to_confirm: "la Page Facebook n'est pas encore confirmée par le dirigeant",
  not_found: "aucune Page Facebook n'a été trouvée",
  unavailable: "Facebook n'a pas répondu",
  not_connected: "la Page Facebook n'est pas connectée à BienDecider",
  permission: "la permission de lire les publications n'est pas accordée",
  reauthorization: "la connexion Facebook est à refaire",
};

export function sourceReasonLabel(reason: string | null, source: string = "google_reviews"): string {
  const labels = source === "facebook_page" ? FACEBOOK_LABELS : GOOGLE_LABELS;
  return reason && reason in labels ? labels[reason as SourceReadReason] : "raison inconnue";
}