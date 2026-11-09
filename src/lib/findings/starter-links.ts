/**
 * Missions de départ reliées aux premiers constats (#292, report) : règle pure, sans dépendance serveur.
 * À l'inscription, chaque mission de l'étape 4 cite le constat repris dont le sujet correspond à son modèle ;
 * la ligne d'Entreprise montre alors sa déduction, et corriger ce constat met la mission à réexaminer (#169).
 */

/** Sujet de constat de chaque modèle de mission de départ ; « Sur mesure » n'en a pas. */
export const STARTER_FINDING_TOPICS: Readonly<Record<string, string>> = {
  site_page: "site_web",
  google_profile: "fiche_google",
  review_reply: "fiche_google",
  social_post: "reseaux_sociaux",
};

/**
 * Pour chaque modèle, l'indice du constat relié : le premier constat du même sujet pas encore relié,
 * sinon le premier du même sujet (un constat peut fonder deux missions), sinon null.
 */
export function starterFindingLinks(templates: readonly string[], topics: readonly string[]): (number | null)[] {
  const used = new Set<number>();
  return templates.map((template) => {
    const topic = Object.prototype.hasOwnProperty.call(STARTER_FINDING_TOPICS, template) ? STARTER_FINDING_TOPICS[template] : null;
    if (!topic) return null;
    const matching = topics.flatMap((candidate, index) => (candidate === topic ? [index] : []));
    const index = matching.find((candidate) => !used.has(candidate)) ?? matching[0];
    if (index === undefined) return null;
    used.add(index);
    return index;
  });
}
