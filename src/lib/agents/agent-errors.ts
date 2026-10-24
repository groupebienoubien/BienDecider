/**
 * Motif typé d'un lancement non fait ou d'une exécution échouée. Il est
 * enregistré sur l'exécution (AgentRun.failureReason), renvoyé à Paul et
 * aux routes, et toujours dit en clair au dirigeant via failureMessage.
 */
export const RUN_FAILURE_REASONS = ["already_running", "quota_runs", "quota_budget", "no_result", "outage"] as const;
export type RunFailureReason = (typeof RUN_FAILURE_REASONS)[number];

export function isRunFailureReason(value: unknown): value is RunFailureReason {
  return typeof value === "string" && (RUN_FAILURE_REASONS as readonly string[]).includes(value);
}

/**
 * Un agent a tourné sans rien produire d'exploitable. Échec silencieux réel
 * observé en prod (2026-10-05, "La Tonnelle") : 32k tokens consommés, aucune
 * proposition, et l'action passait pour réussie. Tous les agents lèvent
 * cette erreur plutôt que de renvoyer un résultat vide ou un faux constat.
 */
export class AgentNoResultError extends Error {
  constructor(agentName: string, message?: string) {
    super(message ?? failureMessage("no_result", agentName));
    this.name = "AgentNoResultError";
  }
}

/** Pourquoi une révision n'a rien écrit : production modifiée, décidée ou disparue entre-temps. */
export type RevisionConflictKind = "modified" | "decided" | "missing";

const REVISION_CONFLICT_MESSAGES: Record<RevisionConflictKind, (title: string) => string> = {
  modified: (title) => `« ${title} » a été modifiée pendant la révision : votre version est conservée.`,
  decided: (title) => `« ${title} » a été validée ou rejetée entre-temps : rien n'a été changé.`,
  missing: () => "Cette production n'existe plus : rien n'a été changé.",
};

/**
 * Révision dont l'écriture est refusée parce que la production a changé
 * entre-temps : rien n'est écrit, l'exécution échoue en no_result avec un
 * message en clair selon ce qui s'est passé (story 3.3).
 */
export class RevisionConflictError extends AgentNoResultError {
  readonly kind: RevisionConflictKind;
  constructor(agentName: string, kind: RevisionConflictKind, title = "") {
    super(agentName, REVISION_CONFLICT_MESSAGES[kind](title));
    this.name = "RevisionConflictError";
    this.kind = kind;
  }
}

/**
 * Lancement refusé parce que l'action ou l'exécution n'est plus disponible.
 * Le motif est fixé à chaque `throw` : `already_running` quand l'agent y
 * travaille déjà, `outage` pour une demande interne invalide, et null pour
 * une action non lançable (écartée, terminée ou inconnue), qui est une
 * erreur de l'appelant et pas un motif d'échec.
 */
export class AgentRunConflictError extends Error {
  readonly reason: RunFailureReason | null;
  constructor(message: string, reason: RunFailureReason | null) {
    super(message);
    this.name = "AgentRunConflictError";
    this.reason = reason;
  }
}

/** Quota de lancements ou budget atteint : le motif est fixé à chaque `throw`. */
export class AgentRunQuotaError extends Error {
  readonly reason: "quota_runs" | "quota_budget";
  constructor(message: string, reason: "quota_runs" | "quota_budget") {
    super(message);
    this.name = "AgentRunQuotaError";
    this.reason = reason;
  }
}

/**
 * Point unique de conversion d'une erreur en motif. Seul le type de
 * l'erreur compte, jamais son texte : toute erreur inattendue (réseau,
 * fournisseur du modèle, base) est une panne. null uniquement pour un
 * conflit sur une action non lançable.
 */
export function classifyRunError(error: unknown): RunFailureReason | null {
  if (error instanceof AgentRunQuotaError || error instanceof AgentRunConflictError) return error.reason;
  if (error instanceof AgentNoResultError) return "no_result";
  return "outage";
}

/** Message affichable au dirigeant pour un motif, au vouvoiement, sans détail technique. */
export function failureMessage(reason: RunFailureReason, agentName: string): string {
  switch (reason) {
    case "already_running":
      return `${agentName} y travaille déjà. Vous pouvez suivre l'exécution en cours.`;
    case "quota_runs":
      return "Les agents ont atteint leur limite de lancements. Réessayez plus tard.";
    case "quota_budget":
      return "Le budget du jour est atteint. Réessayez demain.";
    case "no_result":
      return `${agentName} n'a pas pu produire de résultat exploitable cette fois-ci. Réessayez.`;
    case "outage":
      return `${agentName} est indisponible pour le moment. Réessayez dans quelques minutes.`;
  }
}

export function ensureAgentProduced(
  agentName: string,
  producedCount: number,
  diagnostics: { stopReason: unknown; usage: unknown },
) {
  if (producedCount > 0) return;
  console.warn(`${agentName} n'a rien produit — stop_reason: ${String(diagnostics.stopReason)}, usage total:`, diagnostics.usage);
  throw new AgentNoResultError(agentName);
}
