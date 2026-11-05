// Nettoyage des messages d'erreur avant affichage dans l'administration (story 7.2) : jamais de jeton, de mot de passe
// ni de secret de connexion à l'écran, même si une erreur de fournisseur ou de base en contenait un. Fonction pure.
const MASK = "[masqué]";

const RULES: [RegExp, string | ((...groups: string[]) => string)][] = [
  // URL avec identifiants : schéma://utilisateur:motdepasse@hôte
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${MASK}@`],
  // En-têtes et jetons porteurs
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${MASK}`],
  // Clés et jetons de fournisseurs (sk-…, ghp_…, xoxb-…)
  [/\b(?:sk|pk|rk|ghp|gho|ghs|xox[abprs])[-_][A-Za-z0-9_-]{10,}/g, MASK],
  // Paramètres nommés : token=…, password: …, api_key=…
  [/\b(access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|client[_-]?secret|password|passwd|mot de passe|api[_-]?key|authorization|cookie)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, (_all, name, separator) => `${name}${separator}${MASK}`],
  // Longues suites hexadécimales ou base64 contenant au moins un chiffre (clés, empreintes, jetons)
  [/\b(?=[A-Za-z0-9+/_-]{32,})(?=[^\s]*\d)[A-Za-z0-9+/_-]{32,}={0,2}/g, MASK],
];

export const ERROR_MESSAGE_MAX_LENGTH = 300;

/** Masque les secrets, puis tronque : le nettoyage se fait sur le message entier avant de couper. */
export function redactSecrets(value: string | null | undefined, maxLength = ERROR_MESSAGE_MAX_LENGTH): string {
  if (!value) return "";
  let text = value.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement as string);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
