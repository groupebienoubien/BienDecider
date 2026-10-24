/** Shared limits; keep this module independent from runners and persistence. */
export const AGENT_RUN_MAX_DURATION_SECONDS = 300;
export const AGENT_RUN_DEADLINE_MS = 270_000;
export const AGENT_RUN_MAX_TURNS = 32;
export const AGENT_RUN_COST_RESERVATION_USD = 1;

export class AgentRunLimitError extends Error {
  constructor(readonly limit: "turns" | "cost" | "deadline" | "cancelled") {
    super("L'agent a atteint la limite de ce passage. Les productions déjà créées sont conservées et restent à relire. Vous pouvez relancer l'action.");
    this.name = "AgentRunLimitError";
  }
}
