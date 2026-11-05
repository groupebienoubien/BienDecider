/** Messages de refus des missions et des crédits : le texte vient de la spécification §14, jamais d'un composant. */
export const MISSION_MESSAGES = {
  "M-02": "Cette version a changé. Réexaminez le contenu avant de confirmer.",
  "M-15": "Crédits insuffisants : il en faut {n}, il vous en reste {m}.",
  "M-17": "Précisez le sujet de la publication (5 à 120 caractères).",
  "M-18": "Décrivez le périmètre (10 à 300 caractères) et fixez une règle d'arrêt entre 7 et 90 jours.",
  "M-19": "Le canal est figé dès qu'une version est validée. Créez une nouvelle mission pour un autre canal.",
  "M-20": "Précisez le titre (5 à 80 caractères), le résultat (5 à 120) et le constat (10 à 300), sans balise HTML.",
  "M-21": "Cette mission est écartée : remettez-la d'abord au plan.",
  "M-22": "Cette mission est en cours : mettez-la en pause avant de l'écarter.",
  "M-23": "Cette mission est arrêtée : elle reste dans l'historique.",
  "M-24": "Cette mission n'est pas écartée.",
  "M-25": "Décrivez le résultat recherché en 5 à 120 caractères.",
  "M-26": "Cette mission est arrêtée : son objectif est figé.",
  "M-30": "Choisissez 1 ou 2 agences.",
  "M-31": "Choisissez de 1 à 8 contacts recontactables.",
  "M-32": "Réalisation inconnue.",
  "M-40": "Cette mission est arrêtée. Proposez un nouveau test à Paul.",
  "M-41": "Choisissez d'abord au moins un contact recontactable.",
  "M-42": "Confirmez la pertinence et le droit de recontact des destinataires.",
  "M-43": "Seule une mission en cours peut être mise en pause.",
  "M-64": "Choisissez de 1 à 5 avis sans réponse.",
  "M-67": "{canal} n'est pas disponible pour le moment. Choisissez un autre canal.",
  "M-68": "Choisissez le canal de la mission.",
  "M-69": "Ce canal n'est pas proposé pour ce modèle de mission.",
  "M-75": "Vous avez déjà 10 missions non arrêtées. Arrêtez-en une avant d'en créer une autre.",
  "M-76": "Ce modèle de mission n'est pas disponible pour le moment.",
} as const;

export type MissionMessageCode = keyof typeof MISSION_MESSAGES;

/** Refus métier : code de la spécification, texte rendu, et statut HTTP (409 pour M-02, 422 sinon). */
export class MissionError extends Error {
  readonly code: MissionMessageCode;
  readonly status: number;

  constructor(code: MissionMessageCode, params: Record<string, string | number> = {}) {
    super(renderMissionMessage(code, params));
    this.name = "MissionError";
    this.code = code;
    this.status = code === "M-02" ? 409 : 422;
  }
}

export function renderMissionMessage(code: MissionMessageCode, params: Record<string, string | number> = {}): string {
  return MISSION_MESSAGES[code].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
