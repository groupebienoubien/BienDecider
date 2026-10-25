import { z } from "zod";

/**
 * Client Places API (New), lecture seule. Le Place ID est le seul contenu Google
 * conservé par BienDecider ; nom, adresse, note et avis sont lus en direct.
 * Aucun corps de réponse ni clé n'est journalisé.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 10_000;
const PLACE_ID = /^[A-Za-z0-9_-]{8,256}$/;
const QUERY_MAX = 200;
const REVIEW_TEXT_MAX = 500;

export type PlacesFailure = "not_configured" | "not_found" | "unavailable";
export type PlacesResult<T> = { ok: true; value: T } | { ok: false; reason: PlacesFailure };
export type PlacesDeps = { fetchImpl?: typeof fetch; apiKey?: string };

export type PlaceIdentity = { id: string; name: string; address: string | null; link: string };
export type PlaceReview = { rating: number | null; text: string; publishedAgo: string | null };
export type PlaceDetails = PlaceIdentity & { rating: number | null; ratingCount: number | null; reviews: PlaceReview[] };

function configuredKey(deps: PlacesDeps = {}): string | null {
  return (deps.apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? "").trim() || null;
}

export function googlePlacesConfigured(deps: PlacesDeps = {}): boolean {
  return configuredKey(deps) !== null;
}

export function isPlaceId(value: unknown): value is string {
  return typeof value === "string" && PLACE_ID.test(value);
}

/** Lien Google Maps vers une fiche, au format documenté des Maps URLs. */
export function placeMapsLink(placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

/** Le lien renvoyé par Google n'est affiché que s'il est en https sur un domaine Google. */
function safeGoogleLink(value: string | undefined, placeId: string): string {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "https:" && /(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return url.toString();
  } catch {
    // Lien absent ou invalide : repli sur le lien documenté.
  }
  return placeMapsLink(placeId);
}

type RequestInitLite = { method: "GET" | "POST"; fieldMask: string; body?: unknown };

async function placesRequest(url: string, init: RequestInitLite, deps: PlacesDeps): Promise<PlacesResult<unknown>> {
  const key = configuredKey(deps);
  if (!key) return { ok: false, reason: "not_configured" };
  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      method: init.method,
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": init.fieldMask,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 404) return { ok: false, reason: "not_found" };
    if (!response.ok) {
      console.error(`Places API : statut ${response.status}.`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, value: await response.json() };
  } catch {
    console.error("Places API injoignable ou réponse illisible.");
    return { ok: false, reason: "unavailable" };
  }
}

const searchSchema = z.object({ places: z.array(z.object({ id: z.string() })).optional() });

/** Identifiants des fiches les plus pertinentes pour une requête, du plus au moins pertinent. */
export async function searchPlaceIds(query: string, limit: number, deps: PlacesDeps = {}): Promise<PlacesResult<string[]>> {
  const textQuery = query.replace(/\s+/g, " ").trim().slice(0, QUERY_MAX);
  if (!textQuery) return { ok: false, reason: "not_found" };
  const result = await placesRequest(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    fieldMask: "places.id",
    body: { textQuery, languageCode: "fr", regionCode: "FR", pageSize: Math.min(Math.max(limit, 1), 20) },
  }, deps);
  if (!result.ok) return result;
  const parsed = searchSchema.safeParse(result.value);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const ids = (parsed.data.places ?? []).map((place) => place.id).filter(isPlaceId);
  return ids.length ? { ok: true, value: ids } : { ok: false, reason: "not_found" };
}

const localizedText = z.object({ text: z.string() });
const placeSchema = z.object({
  id: z.string(),
  displayName: localizedText.optional(),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().int().optional(),
  reviews: z.array(z.object({
    rating: z.number().optional(),
    text: localizedText.optional(),
    originalText: localizedText.optional(),
    relativePublishTimeDescription: z.string().optional(),
  })).optional(),
});

async function readPlace(placeId: string, fieldMask: string, deps: PlacesDeps): Promise<PlacesResult<z.infer<typeof placeSchema>>> {
  if (!isPlaceId(placeId)) return { ok: false, reason: "not_found" };
  const result = await placesRequest(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, { method: "GET", fieldMask }, deps);
  if (!result.ok) return result;
  const parsed = placeSchema.safeParse(result.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "unavailable" };
}

function identityOf(place: z.infer<typeof placeSchema>, placeId: string): PlaceIdentity {
  return {
    id: placeId,
    name: place.displayName?.text.trim() || "Fiche Google",
    address: place.formattedAddress?.trim() || null,
    link: safeGoogleLink(place.googleMapsUri, placeId),
  };
}

/** Nom, adresse et lien d'une fiche, pour la faire confirmer par le dirigeant. */
export async function readPlaceIdentity(placeId: string, deps: PlacesDeps = {}): Promise<PlacesResult<PlaceIdentity>> {
  const result = await readPlace(placeId, "id,displayName,formattedAddress,googleMapsUri", deps);
  return result.ok ? { ok: true, value: identityOf(result.value, placeId) } : result;
}

/** Note, volume et avis d'une fiche, lus en direct (jamais conservés). */
export async function readPlaceDetails(placeId: string, deps: PlacesDeps = {}): Promise<PlacesResult<PlaceDetails>> {
  const result = await readPlace(placeId, "id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,reviews", deps);
  if (!result.ok) return result;
  const place = result.value;
  const reviews = (place.reviews ?? []).flatMap((review): PlaceReview[] => {
    const text = (review.text ?? review.originalText)?.text.replace(/\p{Cc}+/gu, " ").trim().slice(0, REVIEW_TEXT_MAX);
    return text ? [{ rating: review.rating ?? null, text, publishedAgo: review.relativePublishTimeDescription ?? null }] : [];
  });
  return {
    ok: true,
    value: { ...identityOf(place, placeId), rating: place.rating ?? null, ratingCount: place.userRatingCount ?? null, reviews },
  };
}
