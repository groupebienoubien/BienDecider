/** Parties du Studio partagées entre le serveur et le navigateur (US #258) : aucun accès base ici. */

export type StudioVersionSource = "initial" | "agent" | "owner" | "restore";

/** Une version d'une production, avec la demande qui l'a produite. */
export type StudioVersion = {
  version: number;
  content: string;
  /** Qui a écrit cette version : l'agent à la création (initial) ou sur consigne, le dirigeant, ou un retour à une version précédente. */
  source: StudioVersionSource;
  /** Demande du dirigeant à l'origine de cette version ; null pour la version initiale et les modifications manuelles. */
  instruction: string | null;
  /** Ce que l'agent dit avoir changé ; null si l'agent n'en a pas laissé. */
  note: string | null;
  createdAt: string;
};

export type StudioProposal = {
  id: string;
  kind: string;
  title: string;
  agent: string;
  status: string;
  version: number;
  approvedVersion: number | null;
};

export type StudioState = {
  proposal: StudioProposal;
  /** Versions disponibles, de la plus ancienne à la plus récente (la dernière est la version courante). */
  versions: StudioVersion[];
  /** Pourquoi le Studio ne peut pas demander de modification ; null si la production peut être révisée. */
  locked: StudioLock | null;
  activeRunId: string | null;
  /** Pourquoi l'agent a proposé cette production (plan d'action) ; null pour une demande ponctuelle. */
  rationale: string | null;
};

export type StudioLock = "validated" | "rejected" | "decided" | "prospect" | "agent" | "too_long";

export const STUDIO_LOCK_MESSAGES: Record<StudioLock, string> = {
  validated: "Cette version est validée. Elle ne change plus ici : publiez-la depuis vos décisions, ou rouvrez-la en la modifiant.",
  rejected: "Cette production est rejetée. Rouvrez-la depuis vos décisions pour la retravailler.",
  decided: "Cette production est déjà décidée ou réalisée : elle ne peut plus être modifiée dans le Studio.",
  prospect: "Un prospect se corrige dans sa fiche, dans Prospection.",
  agent: "Cette production ne peut pas être retravaillée par son auteur.",
  too_long: "Cette production est trop longue pour être réécrite d’un coup. Modifiez-la vous-même depuis vos décisions.",
};

/** Demandes fréquentes : chacune envoie la consigne correspondante à l'agent, comme si le dirigeant l'avait écrite. */
export const STUDIO_QUICK_ACTIONS = [
  { label: "Plus court", instruction: "Fais plus court : garde l’essentiel et le même ton." },
  { label: "Plus humain", instruction: "Rends le texte plus humain et plus chaleureux, sans changer les faits." },
  { label: "Moins commercial", instruction: "Rends le texte moins commercial : plus de conseil et d’utilité, moins de promotion." },
  { label: "Autre proposition", instruction: "Propose une autre approche du même sujet (autre angle, autre accroche), sans inventer de fait." },
] as const;

export const STUDIO_AUTHOR_LABELS: Record<StudioVersionSource, string> = {
  initial: "Version proposée",
  agent: "Révisée par l’agent",
  owner: "Modifiée par vous",
  restore: "Retour à une version précédente",
};
