import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { socialCandidatesFromLinks, type PublicSourceCandidate } from "./public-sources.ts";

/**
 * Lecteur du site public d'une entreprise, avant tout compte (#280, spécification §1.3).
 * Protégé contre le SSRF : http(s) seulement, ports 80 et 443, chaque adresse résolue doit être publique
 * (IPv4 et IPv6), la connexion se fait à l'adresse vérifiée, chaque redirection (3 au plus) est revérifiée.
 * Chaque page : 8 secondes et 1 Mo au plus, `text/html` seulement. Accueil, plus quatre pages internes au plus.
 */

export const SITE_READ_LIMITS = { timeoutMs: 8_000, maxBytes: 1_000_000, maxRedirects: 3, internalPages: 4, textPerPage: 6_000 } as const;

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type SiteResolver = (hostname: string) => Promise<ResolvedAddress[]>;
/** Une requête GET vers `url`, connectée à `address` (déjà vérifiée) ; renvoie la réponse sans suivre les redirections. */
export type SiteTransport = (url: URL, init: { address: ResolvedAddress; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
export type SiteReaderDeps = { resolve?: SiteResolver; fetchImpl?: SiteTransport; now?: () => Date };

export type SiteFailure = "refused" | "unreadable";
export type SitePage = { url: string; title: string; text: string };
export type SiteReadLimitation = {
  url: string;
  reason: "pdf" | "other_host" | "not_selected" | "unreadable" | "dynamic";
};
export type SiteReadResult =
  | {
      ok: true;
      url: string;
      readAt: string;
      pages: SitePage[];
      socialSources?: PublicSourceCandidate[];
      readLimitations?: SiteReadLimitation[];
      palette: string[];
      logo: string | null
    }
  | { ok: false; reason: SiteFailure };

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; BienDecider/1.0; lecture publique)",
  Accept: "text/html",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

// ---------------------------------------------------------------------------
// Adresses publiques
// ---------------------------------------------------------------------------

function ipv4Bytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

function ipv6Words(ip: string): number[] | null {
  let value = ip.toLowerCase();
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  if (tail.includes(".")) {
    const bytes = ipv4Bytes(tail);
    if (!bytes) return null;
    value = `${value.slice(0, lastColon + 1)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const words = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...rest];
  if (words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return words.map((word) => parseInt(word, 16));
}

const IPV4_BLOCKED: [number[], number][] = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
];

function inV4Range(bytes: number[], base: number[], prefix: number): boolean {
  const toInt = (value: number[]) => ((value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (toInt(bytes) & mask) === (toInt(base) & mask);
}

/**
 * Vrai si l'adresse est publique. IPv4 : privées, bouclage, link-local, partagées, documentation, multicast et
 * réservées refusées. IPv6 : seul l'unicast global (2000::/3) est accepté, hors documentation, Teredo, ORCHID et 6to4 ;
 * `::1`, `::`, `fc00::/7`, `fe80::/10`, `ff00::/8`, les adresses IPv4 mappées et NAT64 sont donc refusées.
 */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip.split("%")[0]);
  if (version === 4) {
    const bytes = ipv4Bytes(ip);
    return bytes !== null && !IPV4_BLOCKED.some(([base, prefix]) => inV4Range(bytes, base, prefix));
  }
  if (version !== 6) return false;
  const words = ipv6Words(ip);
  if (!words) return false;
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2001 && words[1] === 0x0000) return false; // Teredo
  if (words[0] === 0x2001 && (words[1] & 0xfff0) === 0x0010) return false; // ORCHID
  if (words[0] === 0x2001 && (words[1] & 0xfe00) === 0x0000) return false; // assignations IETF 2001::/23
  if (words[0] === 0x2002) return false; // 6to4
  if (words[0] === 0x3fff && (words[1] & 0xf000) === 0x0000) return false; // documentation 3fff::/20
  return true;
}

const defaultResolve: SiteResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
};

type Checked = { ok: true; address: ResolvedAddress } | { ok: false; reason: SiteFailure };

/** Adresse http(s) sur le port 80 ou 443, sans identifiants, dont toutes les adresses résolues sont publiques. */
export async function checkSiteUrl(url: URL, resolve: SiteResolver = defaultResolve, signal?: AbortSignal): Promise<Checked> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "refused" };
  if (url.username || url.password) return { ok: false, reason: "refused" };
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return { ok: false, reason: "refused" };
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return { ok: false, reason: "refused" };
  const literal = isIP(hostname);
  if (literal) return isPublicAddress(hostname) ? { ok: true, address: { address: hostname, family: literal === 6 ? 6 : 4 } } : { ok: false, reason: "refused" };
  if (/(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i.test(hostname)) return { ok: false, reason: "refused" };
  let addresses: ResolvedAddress[];
  try {
    // La résolution compte dans le délai de la page : au-delà, la page est illisible.
    const timedOut = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(new Error("timeout"));
      signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    });
    timedOut.catch(() => undefined);
    addresses = await Promise.race([resolve(hostname), timedOut]);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (addresses.length === 0) return { ok: false, reason: "unreadable" };
  if (addresses.some((entry) => !isPublicAddress(entry.address))) return { ok: false, reason: "refused" };
  return { ok: true, address: addresses[0] };
}

// ---------------------------------------------------------------------------
// Requête protégée
// ---------------------------------------------------------------------------

/** Transport par défaut : node:http(s), connecté à l'adresse vérifiée (pas de seconde résolution DNS). */
export const pinnedTransport: SiteTransport = (url, { address, signal, headers }) => new Promise((resolve, reject) => {
  const client = url.protocol === "https:" ? https : http;
  const request = client.request(url, {
    method: "GET",
    headers,
    signal,
    lookup: (_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
      if (options?.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    },
  } as http.RequestOptions, (response) => {
    const status = response.statusCode ?? 0;
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
    if (status < 200 || status > 599) {
      response.destroy();
      reject(new Error("status"));
      return;
    }
    if ((status >= 300 && status < 400) || [204, 205].includes(status)) {
      response.resume();
      resolve(new Response(null, { status, headers: responseHeaders }));
      return;
    }
    const encoding = (response.headers["content-encoding"] ?? "").toLowerCase().trim();
    let stream: Readable = response;
    const decoder = encoding === "gzip" || encoding === "x-gzip" ? zlib.createGunzip() : encoding === "deflate" ? zlib.createInflate() : encoding === "br" ? zlib.createBrotliDecompress() : null;
    // Codage inconnu ou en liste : jamais d'octets compressés lus comme du texte.
    if (!decoder && encoding !== "" && encoding !== "identity") {
      response.destroy();
      reject(new Error("encoding"));
      return;
    }
    if (decoder) {
      response.on("error", (error) => decoder.destroy(error));
      stream = response.pipe(decoder);
    }
    resolve(new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers: responseHeaders }));
  });
  request.on("error", reject);
  request.end();
});

/** Hôte identique, au préfixe « www. » près. */
function sameSite(a: string, b: string): boolean {
  const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
  return bare(a) === bare(b);
}

async function readBody(response: Response, signal: AbortSignal): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new Error("timeout"));
    signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  });
  aborted.catch(() => undefined);
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > SITE_READ_LIMITS.maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Jeu de caractères : celui de l'en-tête, sinon `<meta charset>` ou `http-equiv` des 2 premiers Ko, sinon UTF-8. */
export function decode(body: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(body.subarray(0, 2048));
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta\b[^<>]*charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

type PageResult = { ok: true; url: URL; html: string } | { ok: false; reason: SiteFailure };

/** Lit une page HTML : chaque saut (redirection comprise) revérifié, 8 s et 1 Mo au plus, `text/html` seulement. */
export async function readPage(start: URL, deps: SiteReaderDeps = {}, siteHost = start.hostname): Promise<PageResult> {
  const signal = AbortSignal.timeout(SITE_READ_LIMITS.timeoutMs);
  const transport = deps.fetchImpl ?? pinnedTransport;
  let url = start;
  try {
    for (let redirects = 0; ; redirects++) {
      // Quitter le site n'est pas un blocage de sécurité : la page est seulement illisible.
      if (!sameSite(url.hostname, siteHost)) return { ok: false, reason: "unreadable" };
      const checked = await checkSiteUrl(url, deps.resolve, signal);
      if (!checked.ok) return checked;
      if (signal.aborted) return { ok: false, reason: "unreadable" };
      const response = await transport(url, { address: checked.address, signal, headers: { ...HEADERS } });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location || redirects >= SITE_READ_LIMITS.maxRedirects) return { ok: false, reason: "unreadable" };
        url = new URL(location, url);
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const length = Number(response.headers.get("content-length") ?? "0");
      if (!response.ok || !/^\s*text\/html\b/i.test(contentType) || length > SITE_READ_LIMITS.maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, reason: "unreadable" };
      }
      const body = await readBody(response, signal);
      if (!body) return { ok: false, reason: "unreadable" };
      return { ok: true, url, html: decode(body, contentType) };
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

// ---------------------------------------------------------------------------
// Lecture du HTML
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û", ugrave: "ù", icirc: "î", iuml: "ï", euml: "ë", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", euro: "€" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const clean = (value: string) => decodeEntities(value).replace(/[\p{Cc}<>]+/gu, " ").replace(/\s+/g, " ").trim();

/** Minuscules ASCII seulement : la longueur ne change pas, les positions restent valables. */
const asciiLower = (value: string) => value.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

export type HtmlElement = { start: number; end: number; attrs: string; inner: string };

/**
 * Éléments `<tag …>…</tag>` trouvés par balayage linéaire (indexOf de l'ouverture, puis de la fermeture à partir de là) :
 * jamais d'expression rationnelle paresseuse sur la page. Un élément sans fermeture emporte le reste de la page.
 */
export function scanElements(html: string, tag: string, limit = Number.POSITIVE_INFINITY, lower = asciiLower(html)): HtmlElement[] {
  const found: HtmlElement[] = [];
  const opening = `<${tag}`;
  let from = 0;
  while (found.length < limit) {
    const open = lower.indexOf(opening, from);
    if (open < 0) break;
    const next = lower.charAt(open + opening.length);
    if (next !== "" && !/[\s>/]/.test(next)) {
      from = open + opening.length;
      continue;
    }
    const gt = lower.indexOf(">", open);
    const close = gt < 0 ? -1 : lower.indexOf(`</${tag}`, gt + 1);
    if (close < 0) {
      found.push({ start: open, end: html.length, attrs: html.slice(open + opening.length, gt < 0 ? html.length : gt), inner: gt < 0 ? "" : html.slice(gt + 1) });
      break;
    }
    const closeEnd = lower.indexOf(">", close);
    const end = closeEnd < 0 ? html.length : closeEnd + 1;
    found.push({ start: open, end, attrs: html.slice(open + opening.length, gt), inner: html.slice(gt + 1, close) });
    from = end;
  }
  return found;
}

/** Retire les blocs `open…close` (balayage linéaire ; sans fermeture, le reste est retiré). */
function removeBetween(html: string, open: string, close: string, lower = asciiLower(html)): string {
  let out = "";
  let from = 0;
  for (;;) {
    const start = lower.indexOf(open, from);
    if (start < 0) return out + html.slice(from);
    out += `${html.slice(from, start)} `;
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) return out;
    from = end + close.length;
  }
}

function removeElements(html: string, tag: string): string {
  let out = "";
  let from = 0;
  for (const element of scanElements(html, tag)) {
    out += `${html.slice(from, element.start)} `;
    from = element.end;
  }
  return out + html.slice(from);
}

/** Titre de la page (`<title>`), nettoyé. */
export function extractTitle(html: string): string {
  return clean(scanElements(html, "title", 1)[0]?.inner ?? "").slice(0, 200);
}

/** Texte lisible : sans scripts, styles, commentaires ni balises ; la description de la page en tête. */
export function htmlToText(html: string): string {
  const description = metaContent(html, "description");
  let stripped = removeBetween(html, "<!--", "-->");
  for (const tag of ["script", "style", "noscript", "svg", "template", "iframe", "head"]) stripped = removeElements(stripped, tag);
  // `[^<>]*` : chaque essai s'arrête au prochain chevron, le coût reste linéaire.
  const body = stripped
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|footer|header)>/gi, "\n")
    .replace(/<[^<>]*>/g, " ");
  const text = decodeEntities(body).replace(/[\p{Cc}<>]+/gu, (match) => (match.includes("\n") ? "\n" : " ")).replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return description ? `${clean(description)}\n${text}` : text;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^<>]*>/gi) ?? []) {
    const name = (attribute(tag, "name") ?? attribute(tag, "property") ?? "").toLowerCase();
    if (name === key) return attribute(tag, "content");
  }
  return null;
}

function absolute(href: string, base: URL): URL | null {
  try {
    const url = new URL(decodeEntities(href.trim()), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export type PageLink = { url: URL; text: string };

/** Liens examinés au plus sur une page. */
export const MAX_LINKS = 300;

export function extractLinks(html: string, base: URL): PageLink[] {
  const links: PageLink[] = [];
  for (const element of scanElements(html, "a", MAX_LINKS)) {
    const href = attribute(element.attrs.slice(0, 2000), "href");
    if (!href || /^(mailto|tel|javascript):/i.test(href.trim())) continue;
    const url = absolute(href, base);
    if (url) links.push({ url, text: clean(element.inner.slice(0, 2000).replace(/<[^<>]*>/g, " ")).slice(0, 120) });
  }
  return links;
}

const PAGE_KEYWORD_GROUPS = [
  ["contact", "coordonnees", "coordonnées", "about", "a-propos", "qui-sommes-nous"],
  ["offres", "offre", "services", "service", "prestations", "prestation", "menu", "catalogue"],
  ["tarifs", "tarif", "prix"],
  ["reservation", "réservation", "booking", "devis", "rendez-vous"],
  ["horaires", "heures", "realisations", "réalisations", "projets", "portfolio"]
];

/** Pages utiles au parcours d'achat, bornées et limitées au même hôte. */
export function pickInternalPages(links: PageLink[], home: URL, max: number = SITE_READ_LIMITS.internalPages): URL[] {
  const homeKey = `${home.origin}${home.pathname.replace(/\/+$/, "")}`;
  const ranked: { url: URL; rank: number }[] = [];
  const seen = new Set<string>([homeKey]);
  for (const link of links) {
    if (link.url.hostname.toLowerCase() !== home.hostname.toLowerCase()) continue;
    let path = link.url.pathname.toLowerCase();
    try {
      path = decodeURIComponent(path);
    } catch {
      // Chemin mal encodé : lu tel quel.
    }
    const haystack = `${path} ${link.text.toLowerCase()}`;
    const rank = PAGE_KEYWORD_GROUPS.findIndex((words) =>
      words.some((word) => haystack.includes(word))
    );
    if (rank < 0) continue;
    const url = new URL(link.url);
    url.hash = "";
    const key = `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({ url, rank });
  }
  const groupOf = (rank: number) => rank;
  const picked: URL[] = [];
  const groups = new Set<number>();
  for (const candidate of [...ranked].sort((a, b) => a.rank - b.rank)) {
    if (picked.length >= max) break;
    if (groups.has(groupOf(candidate.rank))) continue;
    groups.add(groupOf(candidate.rank));
    picked.push(candidate.url);
  }
  for (const candidate of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(candidate.url)) picked.push(candidate.url);
  }
  return picked;
}

function normalizeHex(value: string): string | null {
  const hex = value.replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex.split("").map((digit) => digit + digit).join("")}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return null;
}

/** Gris, blanc et noir ne disent rien de la marque. */
function isNeutral(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 16;
}

/** Palette observée : `theme-color`, puis les couleurs des styles en ligne, des plus fréquentes aux plus rares (5 au plus). */
export function extractPalette(html: string): string[] {
  const counts = new Map<string, number>();
  const theme = normalizeHex(metaContent(html, "theme-color")?.trim() ?? "");
  // Attributs `style` bornés à 2 000 caractères : un guillemet jamais fermé ne fait pas relire toute la page.
  const css = scanElements(html, "style").map((element) => element.inner)
    .concat([...html.matchAll(/\bstyle\s*=\s*(?:"([^"<>]{0,2000})"|'([^'<>]{0,2000})')/gi)].map((match) => match[1] ?? match[2] ?? ""));
  for (const block of css) {
    for (const match of block.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      const hex = normalizeHex(match[1]);
      if (hex && !isNeutral(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  return [...new Set([...(theme && !isNeutral(theme) ? [theme] : []), ...ordered])].slice(0, 5);
}

/** Logo repéré, jamais téléchargé : icône Apple, puis icône du site, puis `og:image`. */
export function extractLogo(html: string, base: URL): string | null {
  const icons: { rank: number; href: string }[] = [];
  for (const tag of html.match(/<link\b[^<>]*>/gi) ?? []) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase();
    const href = attribute(tag, "href");
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) icons.push({ rank: 0, href });
    else if (/\bicon\b/.test(rel)) icons.push({ rank: 1, href });
  }
  const og = metaContent(html, "og:image");
  if (og) icons.push({ rank: 2, href: og });
  for (const icon of icons.sort((a, b) => a.rank - b.rank)) {
    const url = absolute(icon.href, base);
    if (url) return url.toString().slice(0, 500);
  }
  return null;
}

/** Texte rogné à `max` caractères. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Lit l'accueil puis jusqu'à quatre pages internes du même hôte (cinq requêtes au plus, chacune protégée).
 * Une page interne illisible est ignorée ; seul l'accueil décide de la rubrique.
 */
export async function readPublicSite(address: string, deps: SiteReaderDeps = {}): Promise<SiteReadResult> {
  let start: URL;
  try {
    start = new URL(address);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const home = await readPage(start, deps, start.hostname);
  if (!home.ok) return home;
  const readAt = (deps.now?.() ?? new Date()).toISOString();
  const homeLinks = extractLinks(home.html, home.url);
  const internal = pickInternalPages(homeLinks, home.url);
  const others = await Promise.all(internal.map((url) => readPage(url, deps, home.url.hostname)));
  const readPages = [home, ...others];
  const pages: SitePage[] = readPages.flatMap((page) => page.ok ? [{ url: page.url.toString(), title: extractTitle(page.html), text: truncate(htmlToText(page.html), SITE_READ_LIMITS.textPerPage) }] : []);
  const coverageLinks = readPages.flatMap((page) =>
    page.ok ? extractLinks(page.html, page.url) : []
  );
  const readLimitations: SiteReadLimitation[] = [];
  const limitedUrls = new Set<string>();
  const addLimitation = (url: string, reason: SiteReadLimitation["reason"]) => {
    if (limitedUrls.has(url) || readLimitations.length >= 10) return;
    limitedUrls.add(url);
    readLimitations.push({ url: url.slice(0, 600), reason });
  };
  for (let index = 0; index < others.length; index += 1) {
    const page = others[index];
    if (!page.ok) {
      addLimitation(internal[index].toString(), "unreadable");
    } else if (htmlToText(page.html).length < 80 && /<script\b/i.test(page.html)) {
      addLimitation(page.url.toString(), "dynamic");
    }
  }
  if (htmlToText(home.html).length < 80 && /<script\b/i.test(home.html)) {
    addLimitation(home.url.toString(), "dynamic");
  }
  const baseHost = home.url.hostname.replace(/^www\./i, "").toLowerCase();
  const selected = new Set(internal.map((url) => `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`));
  for (const link of coverageLinks) {
    const url = new URL(link.url);
    url.hash = "";
    if (/\.pdf$/i.test(url.pathname)) {
      addLimitation(url.toString(), "pdf");
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (host !== home.url.hostname.toLowerCase() && host.endsWith(`.${baseHost}`)) {
      addLimitation(url.toString(), "other_host");
      continue;
    }
    const haystack = `${url.pathname.toLowerCase()} ${link.text.toLowerCase()}`;
    const relevant = PAGE_KEYWORD_GROUPS.some((words) => words.some((word) => haystack.includes(word)));
    const key = `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    if (host === home.url.hostname.toLowerCase() && relevant && !selected.has(key)) {
      addLimitation(url.toString(), "not_selected");
    }
  }
  const socialSources = readPages.flatMap((page) =>
    page.ok
      ? socialCandidatesFromLinks(extractLinks(page.html, page.url), page.url.toString(), readAt)
      : []
  ).filter((candidate, index, sources) =>
    sources.findIndex((source) => source.url === candidate.url) === index
  ).slice(0, 8);
  return { ok: true, url: home.url.toString(), readAt, pages, socialSources, readLimitations, palette: extractPalette(home.html), logo: extractLogo(home.html, home.url) };
}
