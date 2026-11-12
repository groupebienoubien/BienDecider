import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

// cf. docs/archives/architecture-technique.md : choix du modèle non verrouillé.
// Sonnet 5.5 par défaut pour maîtriser le coût d'inférence à 15€/mois ;
// à réévaluer vers Opus 5.5 sur les cas sensibles après test qualité.
export const AGENT_MODEL = "claude-sonnet-5-5";
export const MISSION_PLANNING_MODEL = "claude-opus-5-5";
