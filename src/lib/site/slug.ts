/** Adresse lisible : sans accents, en minuscules, mots séparés par des tirets. */
export function slugify(name: string, fallback = "site"): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || fallback;
}
