import { appBaseUrl } from "@/lib/service-mail";

// Messages du service : vouvoiement, texte simple, un seul lien (docs/charte.md). Fonctions pures.

export const VERIFY_EMAIL_PATH = "/verifier-email";
export const RESET_PASSWORD_PATH = "/reinitialiser";

export function verificationLink(token: string): string {
  return `${appBaseUrl()}${VERIFY_EMAIL_PATH}?token=${encodeURIComponent(token)}`;
}

export function passwordResetLink(token: string): string {
  return `${appBaseUrl()}${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}`;
}

export function verificationEmail(link: string): { subject: string; text: string } {
  return {
    subject: "Confirmez votre adresse e-mail BienDecider",
    text: [
      "Bonjour,",
      "",
      "Pour confirmer votre adresse e-mail et pouvoir diffuser depuis BienDecider, ouvrez ce lien :",
      link,
      "",
      "Ce lien est valable 24 heures et ne sert qu'une fois.",
      "Si vous n'avez pas créé de compte BienDecider, ignorez ce message : rien ne sera activé.",
      "",
      "BienDecider",
    ].join("\n"),
  };
}

export function passwordResetEmail(link: string): { subject: string; text: string } {
  return {
    subject: "Réinitialisez votre mot de passe BienDecider",
    text: [
      "Bonjour,",
      "",
      "Vous avez demandé à réinitialiser votre mot de passe. Pour en choisir un nouveau, ouvrez ce lien :",
      link,
      "",
      "Ce lien est valable une heure et ne sert qu'une fois. Une fois le mot de passe changé, vos sessions ouvertes sont fermées.",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
      "",
      "BienDecider",
    ].join("\n"),
  };
}
