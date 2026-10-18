/**
 * Glossaire des états d'une production (US #97) : un mot par état, identique sur tous les écrans.
 * L'icône double la couleur : l'état ne repose jamais sur la couleur seule (US #94, #95).
 */
export type StatusTone = "attente" | "ok" | "neutre" | "alerte";

export type ProposalStatusView = { label: string; icon: string; tone: StatusTone };

// Types que BienDecider ne publie pas lui-même : une fois approuvés, le dirigeant les publie.
const MANUAL_KINDS = ["gbp_update", "review_reply", "prospecting_email"];

export function proposalStatusView(status: string, kind: string, facebookPageName: string | null = null): ProposalStatusView {
  switch (status) {
    case "en_attente":
      return { label: "À relire", icon: "✎", tone: "attente" };
    case "validee":
    case "modifiee": {
      if (kind === "prospect" || kind === "piste_croissance") return { label: "Approuvée", icon: "✓", tone: "ok" };
      const manual = MANUAL_KINDS.includes(kind) || (kind === "social_post" && facebookPageName === null);
      return manual
        ? { label: "À publier manuellement", icon: "→", tone: "attente" }
        : { label: kind === "gmail_email" ? "Prêt à envoyer" : "Prêt à publier", icon: "✓", tone: "ok" };
    }
    case "rejetee":
      return { label: "À repenser", icon: "✕", tone: "neutre" };
    case "executee":
      return { label: kind === "gmail_email" ? "Envoyé" : "En ligne", icon: "✓", tone: "ok" };
    case "envoi_en_cours":
      return { label: "Envoi en cours", icon: "…", tone: "attente" };
    case "publication_en_cours":
      return { label: "Publication en cours", icon: "…", tone: "attente" };
    case "envoi_incertain":
      return { label: "À vérifier", icon: "!", tone: "alerte" };
    case "publication_incertaine":
      return { label: "À vérifier", icon: "!", tone: "alerte" };
    default:
      return { label: status, icon: "•", tone: "neutre" };
  }
}

/** Couleur de l'étiquette de la maquette pour chaque ton d'état. */
export const STATUS_TAG_COLORS: Record<StatusTone, "green" | "orange" | "gray"> = {
  attente: "orange",
  ok: "green",
  neutre: "gray",
  alerte: "orange",
};