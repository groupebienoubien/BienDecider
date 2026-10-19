export type ProposalChannel = "Site" | "Facebook" | "Gmail" | "Google" | "Prospection";

/** Canal de diffusion d'une production, tel que présenté dans la maquette (Facebook, Gmail, Site…). */
export function proposalChannel(kind: string): ProposalChannel {
  if (kind === "site_web_content") return "Site";
  if (kind === "social_post") return "Facebook";
  if (kind === "gmail_email" || kind === "prospecting_email") return "Gmail";
  if (kind === "gbp_update" || kind === "review_reply") return "Google";
  return "Prospection";
}
