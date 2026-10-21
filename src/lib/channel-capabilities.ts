/**
 * Source unique de ce que BienDecider fait réellement sur chaque canal : la page publique
 * « Ce que fait chaque canal » (/canaux), l'accueil et la fiche de production en dérivent.
 * `publishedBy` dit qui diffuse : BienDecider (toujours après votre confirmation) ou vous.
 * À mettre à jour à chaque connecteur livré, jamais avant.
 */
export const CHANNEL_CAPABILITIES = {
  site: {
    label: "Site vitrine",
    publishedBy: "biendecider",
    availability: "Publication disponible après approbation et confirmation.",
    nextStep: "Vous relisez le brief puis confirmez la mise en ligne. BienDecider génère la page à partir du brief approuvé.",
  },
  facebook: {
    label: "Page Facebook",
    publishedBy: "biendecider",
    availability: "Publication disponible sur une Page reliée et vérifiée.",
    nextStep: "Après votre approbation et une confirmation séparée, BienDecider publie sur la Page choisie.",
  },
  googleBusiness: {
    label: "Fiche établissement Google",
    publishedBy: "vous",
    availability: "La publication des changements n'est pas disponible.",
    nextStep: "Les propositions restent à copier et à appliquer vous-même dans Google.",
  },
  gmail: {
    label: "Email avec Gmail",
    publishedBy: "biendecider",
    availability: "Envoi manuel disponible après autorisation du compte.",
    nextStep: "Vous choisissez le destinataire et confirmez chaque envoi depuis votre compte Gmail.",
  },
  linkedin: {
    label: "Profil LinkedIn",
    publishedBy: "vous",
    availability: "La connexion concerne votre profil personnel ; la publication n'est pas disponible.",
    nextStep: "Vous pouvez copier un contenu préparé et le publier vous-même.",
  },
  instagram: {
    label: "Instagram",
    publishedBy: "vous",
    availability: "La connexion et la publication ne sont pas disponibles.",
    nextStep: "Vous pouvez copier un contenu préparé et le publier vous-même.",
  },
  prospecting: {
    label: "Prospection",
    publishedBy: "vous",
    availability: "Les pistes et les modèles de message sont préparés, aucun message n'est envoyé automatiquement.",
    nextStep: "Vous vérifiez la source, choisissez qui contacter et envoyez vous-même le message.",
  },
} as const;

export type ProposalGuidance = {
  destination: string;
  nextStep: string;
  canCopy: boolean;
};

/** Ce que « Valider » déclenche réellement, pour le dire avant le clic. */
export function getApprovalConsequence(kind: string, facebookPageName: string | null) {
  switch (kind) {
    case "prospect":
      return "Valider ajoute ce prospect à votre suivi de prospection. Aucun message n'est envoyé.";
    case "piste_croissance":
      return "Valider retient cette piste. Aucune action externe n'est lancée.";
    case "site_web_content":
      return "Valider approuve ce brief. Le site n'est pas mis en ligne : vous confirmerez la publication séparément.";
    case "social_post":
      return facebookPageName
        ? "Valider approuve ce contenu. Il n'est pas encore publié : vous confirmerez la publication sur Facebook séparément."
        : "Valider approuve ce contenu. Il n'est pas publié : copiez-le et publiez-le vous-même.";
    default:
      return "Valider approuve ce contenu. Il n'est ni publié ni envoyé : vous l'utilisez vous-même.";
  }
}

export function getProposalGuidance(kind: string, facebookPageName: string | null): ProposalGuidance {
  switch (kind) {
    case "site_web_content":
      return {
        destination: "Page publique de votre entreprise sur BienDecider",
        nextStep: CHANNEL_CAPABILITIES.site.nextStep,
        canCopy: false,
      };
    case "social_post":
      return facebookPageName
        ? {
            destination: `${CHANNEL_CAPABILITIES.facebook.label} « ${facebookPageName} »`,
            nextStep: CHANNEL_CAPABILITIES.facebook.nextStep,
            canCopy: true,
          }
        : {
            destination: "Aucune destination de publication reliée",
            nextStep: CHANNEL_CAPABILITIES.instagram.nextStep,
            canCopy: true,
          };
    case "gbp_update":
    case "review_reply":
      return {
        destination: CHANNEL_CAPABILITIES.googleBusiness.label,
        nextStep: CHANNEL_CAPABILITIES.googleBusiness.nextStep,
        canCopy: true,
      };
    case "prospecting_email":
      return {
        destination: "Votre outil de messagerie",
        nextStep: CHANNEL_CAPABILITIES.prospecting.nextStep,
        canCopy: true,
      };
    case "prospect":
    case "piste_croissance":
      return {
        destination: "Votre suivi de prospection",
        nextStep: "Vérifiez la source et décidez vous-même de la prochaine action.",
        canCopy: false,
      };
    default:
      return {
        destination: "Destination à confirmer",
        nextStep: "Vérifiez le canal avant d'utiliser ce contenu.",
        canCopy: true,
      };
  }
}