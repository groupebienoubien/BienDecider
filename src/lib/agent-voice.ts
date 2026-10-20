import { PERSONAS, type AgentKey } from "@/lib/agents/personas";

/** Ce que l'agent a préparé, dit comme une personne le dirait (charte, section 3). */
const PRODUCTION_NOUNS: Record<string, string> = {
  social_post: "un post Facebook",
  site_web_content: "une page de site",
  gmail_email: "un email",
  prospecting_email: "un email de prospection",
  gbp_update: "une mise à jour de votre fiche Google",
  review_reply: "une réponse à un avis",
  prospect: "un prospect à contacter",
  piste_croissance: "une piste de croissance",
};

export function agentName(agent: string): string {
  return agent in PERSONAS ? PERSONAS[agent as AgentKey].name : agent;
}

export function productionNoun(kind: string): string {
  return PRODUCTION_NOUNS[kind] ?? "une production";
}

/** « Camille vous propose un post Facebook » plutôt que « Facebook · Camille · v1 ». */
export function proposalByline(agent: string, kind: string): string {
  return `${agentName(agent)} vous propose ${productionNoun(kind)}`;
}
