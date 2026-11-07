/**
 * Seule règle de la vérification de l'adresse (décision du 2026-11-07, #279) : pendant le POC, une adresse
 * non confirmée peut tout utiliser, diffusion comprise. Le blocage (M-54, 403) revient dès que
 * `REQUIRE_EMAIL_VERIFICATION=true` est posée, sans changement de code. L'e-mail de vérification part
 * toujours et le bandeau reste affiché.
 */
export function emailVerificationRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.REQUIRE_EMAIL_VERIFICATION === "true";
}

/** Vrai si l'adresse n'a pas à être confirmée, ou si elle l'est. */
export function emailVerificationGateOpen(verifiedAt: Date | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return !emailVerificationRequired(env) || (verifiedAt !== null && verifiedAt !== undefined);
}
