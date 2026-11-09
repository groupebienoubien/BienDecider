/** Messages de refus des missions et des crédits : le texte vient de la spécification §14, jamais d'un composant. */
export const MISSION_MESSAGES = {
  "M-02": "Cette version a changé. Réexaminez le contenu avant de confirmer.",
  "M-15": "Crédits insuffisants : il en faut {n}, il vous en reste {m}.",
  "M-16": "{element} doit être compris entre {min} et {max} {unite}.",
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
  "M-33": "Vous ne pouvez pas avoir plus de rendez-vous que de demandes qualifiées. Vérifiez vos chiffres.",
  "M-34": "Seule une mission en cours peut être soldée.",
  "M-35": "Faites d'abord une première diffusion : sans retour, il n'y a rien à juger.",
  "M-36": "Renseignez d'abord le bilan de cette mission : poursuivre sans chiffres n'a pas de sens.",
  "M-37": "Faites d'abord une première diffusion de cette mission : sans envoi, il n'y a rien à mesurer.",
  "M-38": "Renseignez les demandes qualifiées et les rendez-vous (0 s'il n'y en a aucun).",
  "M-39": "Utilisez des nombres entiers positifs, sans décimale.",
  "M-40": "Cette mission est arrêtée. Proposez un nouveau test à Paul.",
  "M-41": "Choisissez d'abord au moins un contact recontactable.",
  "M-42": "Confirmez la pertinence et le droit de recontact des destinataires.",
  "M-43": "Seule une mission en cours peut être mise en pause.",
  "M-44": "La mission est arrêtée ou écartée. Son contenu reste en lecture seule.",
  "M-45": "Annulez la programmation avant de retravailler cette version.",
  "M-46": "V{n} a été diffusée : elle est en lecture seule. Créez une nouvelle version pour la modifier.",
  "M-47": "Lancez ou reprenez la mission avant de valider son contenu.",
  "M-49": "Aucun destinataire dans le périmètre de cette mission.",
  "M-51": "Confirmez la marque et les droits du visuel avant validation.",
  "M-52": "Cette version est déjà programmée.",
  "M-53": "Cette version est déjà diffusée.",
  "M-54": "Confirmez votre adresse e-mail avant toute diffusion.",
  "M-55": "Votre règle autorise uniquement la préparation. Diffusez vous-même ou modifiez les règles.",
  "M-56": "La mission doit être en cours.",
  "M-57": "Connectez le canal de destination avant de poursuivre.",
  "M-58": "Validez la version courante avant de poursuivre.",
  "M-59": "Une programmation existe déjà pour cette version.",
  "M-60": "Enregistrez vos retouches dans une nouvelle version avant cette décision.",
  "M-61": "Choisissez une date et une heure futures.",
  "M-62": "Décrivez votre idée en une phrase.",
  "M-63": "10 idées au maximum : retirez-en une avant d'en noter une autre.",
  "M-64": "Choisissez de 1 à 5 avis sans réponse.",
  "M-65": "Ajoutez un visuel : {canal} ne publie pas sans image.",
  "M-66": "Ce texte dépasse {n} caractères, la limite de {canal}. Raccourcissez-le dans une nouvelle version.",
  "M-67": "{canal} n'est pas disponible pour le moment. Choisissez un autre canal.",
  "M-68": "Choisissez le canal de la mission.",
  "M-69": "Ce canal n'est pas proposé pour ce modèle de mission.",
  "M-75": "Vous avez déjà 10 missions non arrêtées. Arrêtez-en une avant d'en créer une autre.",
  "M-76": "Ce modèle de mission n'est pas disponible pour le moment.",
  "M-77": "Cochez « J'ai relu le contenu et vérifié les informations qui engagent mon entreprise » avant de valider.",
  "M-78": "Choisissez comment retravailler : plus court, plus humain, un autre angle, ou votre consigne (5 à 300 caractères).",
  "M-79": "Paul n'a pas pu préparer ce contenu. Réessayez dans un instant.",
  "M-80": "Cette mission est menée hors canal : diffusez-la vous-même, puis déclarez-le.",
  "M-81": "Le résultat de la diffusion précédente est incertain : vérifiez sur le canal, puis dites-le.",
  "M-82": "Cochez « Je confirme cette version, cette destination et ce moment » avant de diffuser.",
  "M-83": "Indiquez où vous avez diffusé (2 à 60 caractères) et une date passée ou d'aujourd'hui.",
  "M-84": "Cochez « Je confirme avoir diffusé cette version » avant de déclarer.",
  "M-85": "Choisissez l'un des trois niveaux de délégation.",
  "M-86": "Aucun résultat incertain à vérifier pour cette version.",
  "M-87": "Aucune programmation à annuler pour cette version.",
  "M-88": "Une diffusion est programmée : annulez-la avant de modifier le périmètre.",
  "M-89": "Ce contenu a déjà été diffusé : le périmètre est figé. Créez une nouvelle version dans l'atelier pour repartir sur un autre périmètre.",
  "M-90": "Paul n'a trouvé aucune nouvelle agence avec un e-mail professionnel public dans votre zone. Réessayez plus tard.",
  "M-91": "La recherche d'agences n'est pas disponible pour le moment. Réessayez dans un instant.",
  "M-92": "Profil corrigé : relisez ce contenu et enregistrez une nouvelle version avant de le valider.",
  "M-93": "Confirmez votre marque avant de valider un visuel.",
  "M-94": "Un visuel est programmé : annulez sa diffusion avant de modifier votre marque.",
  "M-96": "Cochez « Je confirme le visuel et les droits d'utilisation » avant de valider.",
  "M-97": "Seules les publications de réseaux sociaux ont un visuel : la photo ne peut pas être ajoutée à ce contenu.",
  "M-95": "Choisissez l'une des deux compositions de visuel, ou retirez le visuel.",
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
    this.status = code === "M-02" ? 409 : code === "M-79" || code === "M-91" ? 503 : 422;
  }
}

export function renderMissionMessage(code: MissionMessageCode, params: Record<string, string | number> = {}): string {
  return MISSION_MESSAGES[code].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
