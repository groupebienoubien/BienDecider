/**
 * Photos du site d'une page (story 5.5) — contrôles purs, sans base ni réseau :
 * type réel lu dans les premiers octets, limites, et nettoyage du HTML généré
 * par liste blanche des adresses des photos de l'entreprise.
 */

export const SITE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const SITE_PHOTO_MAX_COUNT = 8;
/** Plus grand côté après redimensionnement dans le navigateur. */
export const SITE_PHOTO_MAX_SIDE = 1600;
export const SITE_PHOTO_ALT_MAX = 200;

export const SITE_PHOTO_TOO_LARGE = "5 Mo au plus par photo.";
export const SITE_PHOTO_BAD_TYPE = "Formats acceptés : JPG, PNG ou WebP.";
export const SITE_PHOTO_TOO_WIDE = "1600 px au plus de côté.";
export const SITE_PHOTO_TOO_MANY = "8 photos au plus pour votre site.";
export const SITE_PHOTO_UNAVAILABLE = "L’envoi de photos n’est pas encore disponible. Nous vous préviendrons dès qu’il le sera.";

export type SitePhotoType = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

/** Type réel d'après la signature du fichier — jamais d'après l'extension ni le type annoncé. */
export function detectSitePhotoType(bytes: Uint8Array): SitePhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

/** Dimensions lues dans l'en-tête (PNG, WebP, JPEG) ; null si l'en-tête est illisible. */
export function readSitePhotoSize(bytes: Uint8Array, type: SitePhotoType): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);
  try {
    if (type.mime === "image/png") return valid(view.getUint32(16), view.getUint32(20));
    if (type.mime === "image/webp") {
      const chunk = ascii(bytes, 12, 4);
      const uint24 = (at: number) => view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
      if (chunk === "VP8X") return valid(1 + uint24(24), 1 + uint24(27));
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return valid(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff));
      }
      if (chunk === "VP8 ") return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
      return null;
    }
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
        offset += marker === 0xff ? 1 : 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      // SOF0 à SOF15, hors DHT (C4), JPG (C8) et DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return valid(view.getUint16(offset + 7), view.getUint16(offset + 5));
      }
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

export type SitePhotoCheck =
  | { ok: true; type: SitePhotoType; width: number; height: number }
  | { ok: false; status: 413 | 415; error: string };

/** Contrôle complet d'un fichier reçu : taille, type réel, en-tête lisible. */
export function checkSitePhoto(bytes: Uint8Array): SitePhotoCheck {
  if (bytes.length > SITE_PHOTO_MAX_BYTES) return { ok: false, status: 413, error: SITE_PHOTO_TOO_LARGE };
  const type = detectSitePhotoType(bytes);
  if (!type) return { ok: false, status: 415, error: SITE_PHOTO_BAD_TYPE };
  const size = readSitePhotoSize(bytes, type);
  if (!size) return { ok: false, status: 415, error: SITE_PHOTO_BAD_TYPE };
  // Le navigateur redimensionne avant l'envoi : un côté plus grand vient d'un appel direct.
  if (size.width > SITE_PHOTO_MAX_SIDE || size.height > SITE_PHOTO_MAX_SIDE) return { ok: false, status: 413, error: SITE_PHOTO_TOO_WIDE };
  return { ok: true, type, ...size };
}

/** Texte alternatif : une ligne, sans balise, longueur bornée. */
export function cleanSitePhotoAlt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const alt = value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return alt.length > SITE_PHOTO_ALT_MAX ? null : alt;
}

/** Chemin de stockage propre à l'entreprise. */
export function sitePhotoPathname(companyId: string, id: string, type: SitePhotoType): string {
  return `site-photos/${companyId}/${id}.${type.extension}`;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", lpar: "(", rpar: ")", colon: ":", sol: "/", bsol: "\\",
  tab: " ", newline: " ", period: ".", comma: ",", semi: ";", commat: "@", num: "#",
};

/** Décode les entités HTML comme le navigateur, y compris sans point-virgule final. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&([a-z]+);?/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attributs d'une balise, valeurs entre guillemets comprises : un faux « src= » dans une valeur reste dans la valeur. */
function parseAttributes(source: string): { name: string; value: string }[] {
  const attributes: { name: string; value: string }[] = [];
  const pattern = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[2] ?? "";
    const unquoted = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
    attributes.push({ name: match[1].toLowerCase(), value: decodeEntities(unquoted) });
  }
  return attributes;
}

/**
 * CSS sans aucune ressource : commentaires, barres obliques inverses et entités retirés d'abord
 * (contournements « u\rl( », « url/ ** /( », « url&#40; »), puis toute fonction url(), image-set()…
 * et tout @import. Les photos ne passent que par <img>.
 */
export function stripCssResources(css: string): string {
  return decodeEntities(css)
    .replace(/</g, "")
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, "")
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/\\/g, "")
    .replace(/</g, "")
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/(?:-webkit-)?(?:url|image-set|image|cross-fade|element|src)\s*\([^)]*\)?/gi, "none");
}

const REMOVED_ELEMENTS = /<\/?(?:picture|source|link|object|embed|video|audio|track|image|feimage|use|input|iframe|frame|frameset|base|meta|form|script|noscript|svg:image)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const TAG = /<([a-z][a-z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const REMOTE_URL = /(?:https?:|\/\/)/i;

/**
 * Seules les photos de l'entreprise restent dans la page. Chaque <img> gardé est reconstruit à partir de rien
 * (adresse autorisée, texte alternatif de la photo en base, loading="lazy") ; il est supprimé si son adresse
 * n'est pas une photo de l'entreprise ou si la balise contient une autre adresse distante. Les éléments qui
 * chargent une ressource sont retirés ; sur les autres balises, srcset/src/background/poster et tout href hors
 * <a> sont retirés, et les styles sont vidés de leurs ressources.
 */
export function keepOnlyCompanyPhotos(html: string, photos: readonly { url: string; alt: string }[]): string {
  const byUrl = new Map(photos.map((photo) => [photo.url, photo]));
  return html
    .replace(REMOVED_ELEMENTS, "")
    .replace(/(<style\b(?:"[^"]*"|'[^']*'|[^'">])*>)([\s\S]*?)(<\/style\s*>|$)/gi, (_, open: string, css: string, close: string) => `${open}${stripCssResources(css)}${close}`)
    .replace(TAG, (tag, rawName: string, rawAttributes: string) => {
      const name = rawName.toLowerCase();
      const attributes = parseAttributes(rawAttributes);
      if (name === "img") {
        const src = attributes.find((attribute) => attribute.name === "src")?.value.trim();
        const photo = src ? byUrl.get(src) : undefined;
        if (!photo) return "";
        let rest = decodeEntities(tag);
        for (const known of byUrl.values()) rest = rest.split(known.url).join("").split(known.alt).join("");
        if (REMOTE_URL.test(rest)) return "";
        return `<img src="${escapeAttribute(photo.url)}" alt="${escapeAttribute(photo.alt)}" loading="lazy">`;
      }
      const kept = attributes.filter((attribute) => {
        if (/^on/.test(attribute.name)) return false;
        if (["src", "srcset", "background", "poster", "lowsrc", "dynsrc", "data", "action", "formaction", "xlink:href", "ping"].includes(attribute.name)) return false;
        if (attribute.name.endsWith(":href") || (attribute.name === "href" && name !== "a")) return false;
        if (attribute.name === "href" && /^(javascript|data|vbscript):/i.test(attribute.value.replace(/[\s\p{Cc}]/gu, ""))) return false;
        return true;
      });
      const rebuilt = kept.map((attribute) => {
        const value = attribute.name === "style" ? stripCssResources(attribute.value) : attribute.value;
        return `${attribute.name}="${escapeAttribute(value)}"`;
      });
      return `<${rawName}${rebuilt.length ? " " + rebuilt.join(" ") : ""}>`;
    });
}

/** Lignes des photos transmises au modèle : adresse et texte alternatif, rien d'autre. */
export function sitePhotoPromptLines(photos: readonly { url: string; alt: string; width: number; height: number }[]): string {
  if (photos.length === 0) return "Photos fournies par le dirigeant : aucune. N'utilise aucune balise <img>.";
  return [
    "Photos fournies par le dirigeant (à afficher toutes, avec exactement ces adresses et ces textes alternatifs) :",
    ...photos.map((photo, index) => `${index + 1}. src="${photo.url}" alt="${photo.alt.replace(/"/g, "'")}" (${photo.width}×${photo.height})`),
  ].join("\n");
}
