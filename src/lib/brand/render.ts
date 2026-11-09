import { BRAND_COMPOSITIONS, readableOn, type BrandComposition, type BrandTone, normalizeHex, isBrandTone } from "./rules.ts";

/**
 * Rendu déterministe d'un visuel simple (#290, FR-39) : mêmes entrées, même sortie, octet pour octet.
 * Aucune couleur ni taille n'est demandée au dirigeant : tout vient du kit de marque. L'accroche s'ajuste au cadre :
 * la taille diminue, puis le texte est coupé par « … », jamais de débordement. Le SVG se met à l'échelle de son conteneur (320 à 1440 px).
 */
export const VISUAL_SIZE = 1080;
export const HEADLINE_MAX_LINES = 5;
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Largeur moyenne d'un caractère, en part du corps : borne haute prudente pour une police sans empattement. */
const CHAR_WIDTH = 0.56;
const MAX_FONT = 88;
const MIN_FONT = 44;

export type VisualInput = {
  composition: BrandComposition;
  primary: string;
  accent: string;
  tone: BrandTone;
  /** Accroche : le titre de la version. */
  headline: string;
  /** Signature : le nom de l'entreprise. */
  signature: string;
  /** Adresse d'une photo de l'entreprise ; absente, le visuel s'en passe. */
  photoUrl?: string | null;
};

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Coupe en lignes sans dépasser `maxChars` ; un mot plus long que la ligne est coupé. */
export function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > maxChars) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Plus grande taille qui tient dans `width` × `height`, avec ses lignes ; au minimum, le texte est coupé par « … ». */
export function fitHeadline(text: string, width: number, height: number): { size: number; lines: string[]; truncated: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  for (let size = MAX_FONT; size >= MIN_FONT; size -= 4) {
    const lines = wrapWords(clean, Math.max(4, Math.floor(width / (size * CHAR_WIDTH))));
    if (lines.length <= HEADLINE_MAX_LINES && lines.length * size * 1.18 <= height) return { size, lines, truncated: false };
  }
  const size = MIN_FONT;
  const perLine = Math.max(4, Math.floor(width / (size * CHAR_WIDTH)));
  const capacity = Math.min(HEADLINE_MAX_LINES, Math.max(1, Math.floor(height / (size * 1.18))));
  const lines = wrapWords(clean, perLine).slice(0, capacity);
  const last = lines[lines.length - 1] ?? "";
  lines[lines.length - 1] = `${last.slice(0, Math.max(1, perLine - 1)).trimEnd()}…`;
  return { size, lines, truncated: true };
}

function textBlock(lines: string[], x: number, y: number, size: number, fill: string, weight: number): string {
  const spans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(size * 1.18)}">${escapeXml(line)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" font-family="${FONT_STACK}" font-size="${size}" font-weight="${weight}" fill="${fill}">${spans}</text>`;
}

function photo(url: string, x: number, y: number, width: number, height: number, clip: string): string {
  return `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath><image href="${escapeXml(url)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`;
}

/** Le SVG complet. Une couleur ou une composition invalide est refusée plutôt que corrigée en silence. */
export function renderVisual(input: VisualInput): string {
  const primary = normalizeHex(input.primary);
  const accent = normalizeHex(input.accent);
  if (!primary || !accent || !isBrandTone(input.tone) || !BRAND_COMPOSITIONS.includes(input.composition)) throw new Error("Kit de marque invalide");
  const ink = readableOn(primary);
  const size = VISUAL_SIZE;
  const signature = escapeXml(input.signature.replace(/\s+/g, " ").trim().slice(0, 60));
  const url = input.photoUrl && /^https:\/\//.test(input.photoUrl) ? input.photoUrl : null;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" role="img" aria-label="${escapeXml(input.headline.slice(0, 100))}" preserveAspectRatio="xMidYMid meet">`;
  const signatureLine = (x: number, y: number, fill: string) => `<text x="${x}" y="${y}" font-family="${FONT_STACK}" font-size="40" font-weight="600" fill="${fill}">${signature}</text>`;

  if (input.composition === "photo_signature") {
    // Photo en fond (ou aplat de la couleur principale), bandeau de la couleur principale en bas : accroche puis signature.
    const band = 480;
    const fit = fitHeadline(input.headline, size - 160, band - 200);
    return [
      open,
      `<rect width="${size}" height="${size}" fill="${primary}"/>`,
      url ? photo(url, 0, 0, size, size - band, "p") : `<rect width="${size}" height="${size - band}" fill="${accent}" opacity="0.35"/>`,
      `<rect y="${size - band}" width="${size}" height="${band}" fill="${primary}"/>`,
      `<rect x="80" y="${size - band + 40}" width="120" height="10" fill="${accent}"/>`,
      textBlock(fit.lines, 80, size - band + 40 + 20 + fit.size, fit.size, ink, 700),
      signatureLine(80, size - 56, ink),
      "</svg>",
    ].join("");
  }

  // Cadre éditorial : fond clair, cadre de la couleur principale, accroche centrée sur la page, filet d'accent, signature.
  const region = url ? { y: 380, height: 480 } : { y: 200, height: 640 };
  const fit = fitHeadline(input.headline, size - 280, region.height);
  const textHeight = fit.lines.length * Math.round(fit.size * 1.18);
  const top = region.y + Math.round((region.height - textHeight) / 2) + fit.size - 20;
  return [
    open,
    `<rect width="${size}" height="${size}" fill="#faf8f3"/>`,
    `<rect x="40" y="40" width="${size - 80}" height="${size - 80}" fill="none" stroke="${primary}" stroke-width="16"/>`,
    url ? photo(url, 140, 100, size - 280, 190, "p") : "",
    `<rect x="140" y="${top - fit.size - 20}" width="120" height="10" fill="${accent}"/>`,
    textBlock(fit.lines, 140, top, fit.size, "#1a1a1a", 700),
    `<rect x="140" y="${size - 190}" width="${size - 280}" height="4" fill="${accent}"/>`,
    signatureLine(140, size - 120, primary),
    "</svg>",
  ].join("");
}
