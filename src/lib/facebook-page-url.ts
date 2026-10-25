/**
 * Lien d'une Page Facebook : validation stricte et forme canonique. Module pur.
 * Un lien n'est accepté que s'il désigne une Page (https, facebook.com, un seul
 * segment de chemin, sans paramètre ni fragment) et jamais un profil, un
 * groupe, un partage ou une page utilitaire de Facebook.
 */

const HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com"]);
const SLUG = /^[A-Za-z0-9.-]{5,50}$/;
const RESERVED = new Set([
  "profile.php", "groups", "group", "people", "sharer", "sharer.php", "share", "share.php", "login", "login.php", "events", "event",
  "watch", "marketplace", "gaming", "stories", "story.php", "reel", "reels", "photo", "photo.php", "photos", "permalink.php", "hashtag",
  "pages", "plugins", "dialog", "l.php", "help", "policies", "business", "ads", "privacy", "terms", "about", "notes", "public",
  "search", "places", "friends", "messages", "bookmarks", "settings", "recover", "checkpoint", "video", "videos", "posts", "legal",
  "support", "developers", "home.php", "directory", "careers", "ajax", "tr", "r.php", "reg", "fundraisers", "donate", "offers",
]);
const MAX_INPUT = 300;
const LINK_IN_TEXT = /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\s,;)"'<>]+/gi;

/** Forme canonique `https://www.facebook.com/<nom>` d'un lien de Page, ou null si ce n'en est pas un. */
export function canonicalFacebookPageUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > MAX_INPUT) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  const slug = segments[0];
  if (!SLUG.test(slug) || slug.startsWith(".") || slug.endsWith(".") || slug.includes("..")) return null;
  if (RESERVED.has(slug.toLowerCase()) || slug.toLowerCase().endsWith(".php")) return null;
  return `https://www.facebook.com/${slug}`;
}

/** Premier lien de Page Facebook valide déclaré dans un texte libre (champ « Compte Instagram ou Facebook »). */
export function declaredFacebookPageUrl(text: string | null | undefined): string | null {
  for (const match of (text ?? "").match(LINK_IN_TEXT) ?? []) {
    // Dans un texte libre, un paramètre de suivi ou une barre finale ne rend pas le lien invalide.
    const canonical = canonicalFacebookPageUrl(match.replace(/[?#].*$/, "").replace(/^http:/i, "https:"));
    if (canonical) return canonical;
  }
  return null;
}
