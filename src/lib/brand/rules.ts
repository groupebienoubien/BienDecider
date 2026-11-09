/**
 * Identité de marque (#290, FR-33 et FR-39) : règles pures, sans base ni réseau.
 * Le serveur les applique, l'interface les affiche, les tests les vérifient.
 */

export const BRAND_TONES = ["clair", "chaleureux", "expert"] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export const BRAND_TONE_LABELS: Record<BrandTone, string> = {
  clair: "Clair, concret, rassurant",
  chaleureux: "Chaleureux et accessible",
  expert: "Précis et expert",
};

/** D'où vient chaque élément : lu sur le site, proposé par BienDecider sans source, ou saisi par le dirigeant. */
export const BRAND_ORIGINS = ["site", "proposal", "declared"] as const;
export type BrandOrigin = (typeof BRAND_ORIGINS)[number];
export const BRAND_ORIGIN_LABELS: Record<BrandOrigin, string> = {
  site: "Lu sur votre site",
  proposal: "Identité proposée, non issue d'un site",
  declared: "Saisi par vous",
};

export const BRAND_ELEMENTS = ["primary", "accent", "tone"] as const;
export type BrandElement = (typeof BRAND_ELEMENTS)[number];
export const BRAND_ELEMENT_LABELS: Record<BrandElement, string> = { primary: "Couleur principale", accent: "Couleur d'accent", tone: "Ton de marque" };

export type BrandOrigins = Record<BrandElement, BrandOrigin>;

/** Le kit confirmé (ou proposé) : tout ce dont le rendu a besoin, rien d'autre. */
export type BrandKit = { primary: string; accent: string; tone: BrandTone };

export const BRAND_FONT_NOTE = "Typographie proposée : sans empattement, non modifiable pour le moment.";
export const BRAND_RULES = ["Parole simple, sans jargon.", "Seulement des faits vérifiables.", "Aucun avis, label ou gain inventé."] as const;

export const BRAND_COMPOSITIONS = ["photo_signature", "cadre_editorial"] as const;
export type BrandComposition = (typeof BRAND_COMPOSITIONS)[number];
export const BRAND_COMPOSITION_LABELS: Record<BrandComposition, string> = { photo_signature: "Photo & signature", cadre_editorial: "Cadre éditorial" };

export function isBrandComposition(value: unknown): value is BrandComposition {
  return typeof value === "string" && (BRAND_COMPOSITIONS as readonly string[]).includes(value);
}

export function isBrandTone(value: unknown): value is BrandTone {
  return typeof value === "string" && (BRAND_TONES as readonly string[]).includes(value);
}

const HEX = /^#[0-9a-f]{6}$/;

/** `#rgb` ou `#rrggbb`, majuscules admises : rendu en `#rrggbb` minuscule ; null si ce n'est pas une couleur. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return HEX.test(hex) ? hex : null;
}

function channel(hex: string, at: number): number {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** Rapport de contraste WCAG entre deux couleurs `#rrggbb`. */
export function contrastRatio(first: string, second: string): number {
  const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Texte lisible sur un fond : blanc ou presque noir, selon le meilleur contraste. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111") ? "#ffffff" : "#111111";
}

/** Contraste minimal du texte sur la couleur principale (accessibilité, 4,5 pour du texte courant). */
export const MIN_TEXT_CONTRAST = 4.5;

export type BrandErrors = Partial<Record<BrandElement | "confirmed", string>>;
export type BrandInput = { primary: string; accent: string; tone: BrandTone; origins: BrandOrigins };
export type BrandChecked = { ok: true; value: BrandInput } | { ok: false; errors: BrandErrors };

/**
 * Formulaire de marque : deux couleurs, un ton, la case de confirmation obligatoire.
 * `proposed` est le kit affiché à l'ouverture : l'origine d'un élément reste celle de la proposition tant qu'il n'a pas été changé.
 */
export function checkBrandInput(input: unknown, proposed: { kit: BrandKit; origins: BrandOrigins }): BrandChecked {
  const body = input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const errors: BrandErrors = {};
  const primary = normalizeHex(body.primary);
  const accent = normalizeHex(body.accent);
  if (!primary) errors.primary = "Indiquez une couleur au format #rrggbb.";
  if (!accent) errors.accent = "Indiquez une couleur au format #rrggbb.";
  if (!isBrandTone(body.tone)) errors.tone = "Choisissez l'un des trois tons.";
  if (body.confirmed !== true) errors.confirmed = "Cochez « Je confirme ces éléments pour les prochaines créations ».";
  if (primary && !errors.confirmed && contrastRatio(primary, readableOn(primary)) < MIN_TEXT_CONTRAST) errors.primary = "Cette couleur ne permet pas un texte lisible : choisissez-en une plus franche.";
  if (Object.keys(errors).length || !primary || !accent || !isBrandTone(body.tone)) return { ok: false, errors };
  const origins: BrandOrigins = {
    primary: primary === proposed.kit.primary ? proposed.origins.primary : "declared",
    accent: accent === proposed.kit.accent ? proposed.origins.accent : "declared",
    tone: body.tone === proposed.kit.tone ? proposed.origins.tone : "declared",
  };
  return { ok: true, value: { primary, accent, tone: body.tone, origins } };
}

const FALLBACK_PRIMARY = "#1f5f4a";
const FALLBACK_ACCENT = "#e0a030";

/** Teinte, saturation et luminosité d'une couleur `#rrggbb`, pour choisir parmi les couleurs lues sur le site. */
function saturation(hex: string): number {
  const values = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Proposition de départ : la palette lue sur le site (la première couleur assez foncée pour porter du texte blanc ou noir,
 * puis la plus saturée des autres), sinon une identité proposée, marquée « non issue d'un site ». Le ton vient de l'analyse
 * s'il est déclaré, sinon « clair ».
 */
export function proposeBrand(proposal: { palette: string[] } | null): { kit: BrandKit; origins: BrandOrigins; fromSite: boolean } {
  const palette = (proposal?.palette ?? []).map(normalizeHex).filter((color): color is string => color !== null);
  if (!palette.length) {
    return { kit: { primary: FALLBACK_PRIMARY, accent: FALLBACK_ACCENT, tone: "clair" }, origins: { primary: "proposal", accent: "proposal", tone: "proposal" }, fromSite: false };
  }
  const primary = palette.find((color) => contrastRatio(color, readableOn(color)) >= MIN_TEXT_CONTRAST && saturation(color) > 0.15) ?? palette[0];
  const others = palette.filter((color) => color !== primary).sort((a, b) => saturation(b) - saturation(a));
  const accent = others[0] ?? FALLBACK_ACCENT;
  return {
    kit: { primary, accent, tone: "clair" },
    origins: { primary: "site", accent: others[0] ? "site" : "proposal", tone: "proposal" },
    fromSite: true,
  };
}

/** Lit la proposition enregistrée à l'inscription ; toute valeur illisible est ignorée. */
export function readBrandProposal(value: unknown): { palette: string[]; source: string | null } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const palette = Array.isArray(record.palette) ? record.palette.map(normalizeHex).filter((color): color is string => color !== null).slice(0, 10) : [];
  if (!palette.length) return null;
  return { palette, source: typeof record.source === "string" ? record.source.slice(0, 120) : null };
}

/** Lit les origines enregistrées ; une origine inconnue devient « proposée ». */
export function readBrandOrigins(value: unknown): BrandOrigins {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const origin = (key: BrandElement): BrandOrigin => (BRAND_ORIGINS as readonly string[]).includes(record[key] as string) ? (record[key] as BrandOrigin) : "proposal";
  return { primary: origin("primary"), accent: origin("accent"), tone: origin("tone") };
}

export type BrandStatus = "to_confirm" | "confirmed";
export const BRAND_STATUS_LABELS: Record<BrandStatus, string> = { to_confirm: "À confirmer", confirmed: "Confirmé par vous" };

/** Instantané conservé avec chaque version : ce que le visuel de cette version a vraiment utilisé. */
export type BrandSnapshot = { name: string; primary: string; accent: string; tone: BrandTone; composition: BrandComposition; logoUrl?: string | null };

export function readBrandSnapshot(value: unknown): BrandSnapshot | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const primary = normalizeHex(record.primary);
  const accent = normalizeHex(record.accent);
  if (typeof record.name !== "string" || !primary || !accent || !isBrandTone(record.tone) || !isBrandComposition(record.composition)) return null;
  const logoUrl = typeof record.logoUrl === "string" && /^https:\/\//.test(record.logoUrl) ? record.logoUrl : null;
  return { name: record.name, primary, accent, tone: record.tone, composition: record.composition, ...(logoUrl ? { logoUrl } : {}) };
}

/** Logo de la marque (#290) : PNG, JPEG ou WebP, 500 Ko au plus. */
export const BRAND_LOGO_MAX_BYTES = 500 * 1024;
export const BRAND_LOGO_TOO_LARGE = "500 Ko au plus pour le logo.";
export const BRAND_LOGO_ORIGIN = "Importé par vous";
export type BrandLogo = { url: string; pathname: string; width: number; height: number };

/** Lit le logo enregistré ; une valeur illisible, ou hors du dossier de l'entreprise, est ignorée. */
export function readBrandLogo(value: unknown, companyId: string): BrandLogo | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { url, pathname, width, height } = value as Record<string, unknown>;
  if (typeof url !== "string" || !/^https:\/\//.test(url) || typeof pathname !== "string" || !pathname.startsWith(`brand-logos/${companyId}/`)) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  return { url, pathname, width: width as number, height: height as number };
}

export function brandLogoPathname(companyId: string, id: string, extension: string): string {
  return `brand-logos/${companyId}/${id}.${extension}`;
}

/** Note de la version système écrite quand la marque change (le visuel doit être validé à nouveau). */
export const BRAND_REVIEW_NOTE = "Marque modifiée : visuel à valider à nouveau";

/**
 * Proposition enregistrée à l'inscription (#290) : la palette lue sur le site pendant l'analyse anonyme, avec sa source.
 * Sans palette observée, rien n'est enregistré : l'identité sera proposée « non issue d'un site ».
 */
export function brandProposalFromAnalysis(analysis: { findings?: { palette?: { value: string[]; provenance: { kind: string; source?: string } } | null } } | null | undefined): { palette: string[]; source: string | null } | null {
  const palette = analysis?.findings?.palette;
  if (!palette || palette.provenance.kind !== "observed") return null;
  return readBrandProposal({ palette: palette.value, source: palette.provenance.source ?? null });
}
