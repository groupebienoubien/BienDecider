import type { PaulReference } from "@/lib/paul-references";

// Import de type seulement : ce module reste exécutable par les tests Node sans l'alias "@/".
const REFERENCE_MARKER = /\[\[bd:(?:proposal|finding|lead):[A-Za-z0-9_-]{1,100}\]\]/g;

/** Texte lu à voix haute : les marqueurs de lien deviennent le nom de l'objet cité, ou disparaissent s'ils sont inconnus. */
export function spokenText(content: string, references: PaulReference[] = []): string {
  const labels = new Map(references.map((reference) => [reference.marker, reference.label]));
  return content
    .replace(REFERENCE_MARKER, (marker) => labels.get(marker) ?? "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ajoute le texte dicté à la saisie existante, sans dépasser la limite du champ. */
export function appendDictation(existing: string, transcript: string, maxLength: number): string {
  const spoken = transcript.trim();
  if (!spoken) return existing;
  const joined = existing.trim() ? `${existing.replace(/\s+$/, "")} ${spoken}` : spoken;
  return joined.slice(0, maxLength);
}

const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed": "Le micro est refusé par le navigateur. Autorisez-le dans les réglages du site, ou écrivez votre message.",
  "service-not-allowed": "La dictée n'est pas autorisée sur ce navigateur. Écrivez votre message.",
  "audio-capture": "Aucun micro détecté. Écrivez votre message.",
  "no-speech": "Aucune voix détectée. Réessayez ou écrivez votre message.",
  network: "La dictée a besoin d'une connexion internet. Réessayez ou écrivez votre message.",
};

export function dictationErrorMessage(code: string): string | null {
  if (code === "aborted") return null;
  return DICTATION_ERRORS[code] ?? "La dictée a échoué. Réessayez ou écrivez votre message.";
}
