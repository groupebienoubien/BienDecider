/**
 * Accès administrateur : seules les adresses listées dans ADMIN_EMAILS (séparées
 * par des virgules, sans tenir compte de la casse ni des espaces) sont
 * administrateurs. Sans liste, personne ne l'est : l'ouverture historique du
 * pilote (tout utilisateur connecté) est supprimée avant l'ouverture à des
 * entrepreneurs externes (story 6.2, #63).
 */
function adminList(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return adminList().includes(email.toLowerCase());
}

/** Réglages globaux (risques, inscriptions, plafonds) : même règle que l'administration, nom conservé pour distinguer les usages. */
export function isExplicitAdminEmail(email: string | null): boolean {
  return isAdminEmail(email);
}
