// Règle de mot de passe commune à l'inscription, au changement et à la réinitialisation (story 6.5, FR-10, M-12).
// La connexion ne l'applique pas : un mot de passe créé avant cette règle (6 ou 7 caractères) reste valable.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_TOO_SHORT_MESSAGE = `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
export const PASSWORD_TOO_LONG_MESSAGE = `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;

/** Message à afficher si le mot de passe est refusé, null s'il est accepté. */
export function passwordPolicyError(value: unknown): string | null {
  if (typeof value !== "string" || value.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (value.length > PASSWORD_MAX_LENGTH) return PASSWORD_TOO_LONG_MESSAGE;
  return null;
}
