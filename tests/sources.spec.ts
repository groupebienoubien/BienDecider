import { test as base, expect } from "@playwright/test";
import type { Company } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { requireLocalDatabase } from "./support/local-database";

// Même précaution que les tests du moteur : Next attend un AsyncLocalStorage global au chargement de ses modules.
(globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;

// Lecture des sources (US #252) : aucun appel réseau réel, aucun appel au modèle.
requireLocalDatabase("Sources tests");

const KEY = "test-places-key-0123456789";
const OWN_ID = "ChIJ_own_place_0001";
const RIVAL_ID = "ChIJ_rival_place_0001";
const OTHER_ID = "ChIJ_other_place_0001";

const OWN_PLACE = {
  id: OWN_ID,
  displayName: { text: "Atelier Test Moteur" },
  formattedAddress: "1 rue du Test, 75001 Paris, France",
  googleMapsUri: "https://maps.google.com/?cid=1",
  rating: 4.6,
  userRatingCount: 120,
  reviews: [
    { rating: 5, text: { text: "Très bon accueil et travail soigné" }, relativePublishTimeDescription: "il y a 2 semaines", authorAttribution: { displayName: "Jean Dupont" } },
    { rating: 2, originalText: { text: "Attente trop longue\u0007pour un devis" }, relativePublishTimeDescription: "il y a 3 mois" },
  ],
};
const RIVAL_PLACE = { ...OWN_PLACE, id: RIVAL_ID, displayName: { text: "Atelier Rival" }, rating: 4.1, userRatingCount: 40, reviews: [OWN_PLACE.reviews[0]] };

type Call = { url: string; method: string; fieldMask: string | null; apiKey: string | null; body: string | null };

function fakePlaces(options: { search?: string[]; places?: Record<string, unknown>; fail?: "429" | "500" | "throw" | "badjson" } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", fieldMask: headers.get("X-Goog-FieldMask"), apiKey: headers.get("X-Goog-Api-Key"), body: typeof init?.body === "string" ? init.body : null });
    if (options.fail === "throw") throw new Error("réseau SECRET_BODY");
    if (options.fail === "429") return new Response("SECRET_BODY", { status: 429 });
    if (options.fail === "500") return new Response("SECRET_BODY", { status: 500 });
    if (options.fail === "badjson") return new Response("{SECRET_BODY", { status: 200 });
    if (url.endsWith("places:searchText")) return Response.json({ places: (options.search ?? []).map((id) => ({ id })) });
    const place = options.places?.[decodeURIComponent(url.split("/places/")[1])];
    return place ? Response.json(place) : new Response("SECRET_BODY", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function captureErrors<T>(run: () => Promise<T>) {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try { return { result: await run(), lines }; } finally { console.error = original; }
}

async function withoutPlacesKey<T>(run: () => Promise<T>) {
  const original = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  try { return await run(); } finally { if (original !== undefined) process.env.GOOGLE_PLACES_API_KEY = original; }
}

const test = base.extend<{ company: Company }>({
  company: async ({}, runFixture) => {
    const { prisma } = await import("../src/lib/prisma");
    const company = await prisma.company.create({ data: {
      ownerEmail: `sources-test-${randomUUID()}@example.invalid`, name: "Atelier Test Moteur", trade: "Artisan", servingArea: "Paris",
    } });
    try { await runFixture(company); } finally { await prisma.company.delete({ where: { id: company.id } }); }
  },
});

async function reload(companyId: string) {
  const { prisma } = await import("../src/lib/prisma");
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}

test("Places client: explicit field masks, key in a header only, malformed ids never requested", async () => {
  const { searchPlaceIds, readPlaceDetails, readPlaceIdentity } = await import("../src/lib/google-places");
  const { fetchImpl, calls } = fakePlaces({ search: [OWN_ID, "../etc/passwd"], places: { [OWN_ID]: OWN_PLACE } });
  const deps = { fetchImpl, apiKey: KEY };
  expect(await searchPlaceIds("  Atelier   Test  Paris ", 3, deps)).toEqual({ ok: true, value: [OWN_ID] });
  const details = await readPlaceDetails(OWN_ID, deps);
  expect(details).toMatchObject({ ok: true, value: { id: OWN_ID, name: "Atelier Test Moteur", rating: 4.6, ratingCount: 120, link: "https://maps.google.com/?cid=1" } });
  // Le texte d'un avis est nettoyé, l'auteur n'est jamais repris.
  expect(JSON.stringify(details)).toContain("Attente trop longue pour un devis");
  expect(JSON.stringify(details)).not.toContain("Jean Dupont");
  expect(await readPlaceIdentity(OWN_ID, deps)).toMatchObject({ ok: true, value: { name: "Atelier Test Moteur", address: "1 rue du Test, 75001 Paris, France" } });
  expect(await readPlaceDetails("../secret", deps)).toEqual({ ok: false, reason: "not_found" });
  expect(calls).toHaveLength(3);
  expect(calls[0]).toMatchObject({ method: "POST", fieldMask: "places.id", apiKey: KEY });
  expect(JSON.parse(calls[0].body!)).toEqual({ textQuery: "Atelier Test Paris", languageCode: "fr", regionCode: "FR", pageSize: 3 });
  expect(calls[1].fieldMask).toBe("id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,reviews");
  expect(calls[2].fieldMask).toBe("id,displayName,formattedAddress,googleMapsUri");
  expect(calls.every((call) => !call.url.includes(KEY))).toBe(true);
});

test("Places client: without a key nothing is requested", async () => {
  const { googlePlacesConfigured, searchPlaceIds, readPlaceDetails } = await import("../src/lib/google-places");
  await withoutPlacesKey(async () => {
    const { fetchImpl, calls } = fakePlaces({ search: [OWN_ID] });
    expect(googlePlacesConfigured()).toBe(false);
    expect(await searchPlaceIds("Atelier Paris", 3, { fetchImpl })).toEqual({ ok: false, reason: "not_configured" });
    expect(await readPlaceDetails(OWN_ID, { fetchImpl })).toEqual({ ok: false, reason: "not_configured" });
    expect(calls).toHaveLength(0);
  });
});

for (const fail of ["429", "500", "throw", "badjson"] as const) {
  test(`Places client: a ${fail} failure is unavailable and never logs the key or the response body`, async () => {
    const { readPlaceDetails } = await import("../src/lib/google-places");
    const { fetchImpl } = fakePlaces({ fail });
    const { result, lines } = await captureErrors(() => readPlaceDetails(OWN_ID, { fetchImpl, apiKey: KEY }));
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(lines.join("\n")).not.toMatch(/SECRET_BODY|test-places-key/);
  });
}

test("Places client: a missing place is not found, and a link outside Google is replaced", async () => {
  const { readPlaceDetails, placeMapsLink } = await import("../src/lib/google-places");
  expect(await readPlaceDetails(OWN_ID, { fetchImpl: fakePlaces().fetchImpl, apiKey: KEY })).toEqual({ ok: false, reason: "not_found" });
  for (const googleMapsUri of ["javascript:alert(1)", "https://evil.example/maps", "http://maps.google.com/?cid=1"]) {
    const place = { ...OWN_PLACE, googleMapsUri };
    const result = await readPlaceDetails(OWN_ID, { fetchImpl: fakePlaces({ places: { [OWN_ID]: place } }).fetchImpl, apiKey: KEY });
    expect(result).toMatchObject({ ok: true, value: { link: placeMapsLink(OWN_ID) } });
  }
});

test("no key: no search, the own source is recorded as not read, Martine is told not to conclude", async ({ company }) => {
  const { readOwnGooglePlace, describeOwnReading } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  await withoutPlacesKey(async () => {
    const { fetchImpl, calls } = fakePlaces({ search: [OWN_ID] });
    const reading = await readOwnGooglePlace(company, undefined, { fetchImpl });
    expect(reading).toEqual({ status: "non_lue", reason: "not_configured" });
    expect(calls).toHaveLength(0);
    expect(describeOwnReading(reading)).toContain("NON LUE");
  });
  expect(await prisma.sourceRead.findMany({ where: { companyId: company.id } })).toMatchObject([{ source: "google_reviews", target: "own", status: "non_lue", reason: "not_configured", itemCount: null }]);
  expect((await reload(company.id)).googlePlaceCandidateId).toBeNull();
});

test("a candidate is proposed and stored, its reviews are not read before confirmation", async ({ company }) => {
  const { readOwnGooglePlace } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const { fetchImpl, calls } = fakePlaces({ search: [OWN_ID, OTHER_ID], places: { [OWN_ID]: OWN_PLACE } });
  expect(await readOwnGooglePlace(company, undefined, { fetchImpl, apiKey: KEY })).toEqual({ status: "non_lue", reason: "to_confirm" });
  expect(calls.map((call) => call.method)).toEqual(["POST"]);
  expect(JSON.parse(calls[0].body!).textQuery).toBe("Atelier Test Moteur Paris");
  const stored = await reload(company.id);
  expect(stored).toMatchObject({ googlePlaceId: null, googlePlaceCandidateId: OWN_ID });
  // Une seconde lecture ne cherche pas à nouveau : la proposition en attente est conservée.
  expect(await readOwnGooglePlace(stored, undefined, { fetchImpl, apiKey: KEY })).toEqual({ status: "non_lue", reason: "to_confirm" });
  expect(calls).toHaveLength(1);
  expect((await prisma.sourceRead.findMany({ where: { companyId: company.id } })).map((read) => read.reason)).toEqual(["to_confirm", "to_confirm"]);
});

test("the candidate view is read live, and only the proposed id can be confirmed", async ({ company }) => {
  const { getGoogleCandidateView, confirmGooglePlace } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const other = await prisma.company.create({ data: { ownerEmail: `sources-other-${randomUUID()}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Lyon", googlePlaceCandidateId: OTHER_ID } });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: OWN_ID } });
    const fake = fakePlaces({ places: { [OWN_ID]: OWN_PLACE } });
    expect(await getGoogleCandidateView(await reload(company.id), { fetchImpl: fake.fetchImpl, apiKey: KEY })).toMatchObject({ ok: true, value: { name: "Atelier Test Moteur", address: "1 rue du Test, 75001 Paris, France" } });
    // Un identifiant libre, celui d'une autre entreprise ou un second clic ne confirment rien.
    expect(await confirmGooglePlace(company.id, RIVAL_ID)).toBe(false);
    expect(await confirmGooglePlace(company.id, OTHER_ID)).toBe(false);
    expect(await confirmGooglePlace(other.id, OWN_ID)).toBe(false);
    expect(await reload(company.id)).toMatchObject({ googlePlaceId: null, googlePlaceCandidateId: OWN_ID });
    expect(await confirmGooglePlace(company.id, OWN_ID)).toBe(true);
    expect(await reload(company.id)).toMatchObject({ googlePlaceId: OWN_ID, googlePlaceCandidateId: null });
    expect(await confirmGooglePlace(company.id, OWN_ID)).toBe(false);
    expect(await reload(other.id)).toMatchObject({ googlePlaceId: null, googlePlaceCandidateId: OTHER_ID });
  } finally { await prisma.company.delete({ where: { id: other.id } }); }
});

test("a disappeared candidate is withdrawn instead of being confirmed blindly", async ({ company }) => {
  const { getGoogleCandidateView } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: OWN_ID } });
  expect(await getGoogleCandidateView(await reload(company.id), { fetchImpl: fakePlaces().fetchImpl, apiKey: KEY })).toEqual({ ok: false, reason: "not_found" });
  expect((await reload(company.id)).googlePlaceCandidateId).toBeNull();
});

test("a declined place is never proposed again, however many are declined; with no other candidate the place is not found", async ({ company }) => {
  const { readOwnGooglePlace, declineGooglePlace, confirmGooglePlace, removeGooglePlace } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const deps = (search: string[]) => ({ fetchImpl: fakePlaces({ search }).fetchImpl, apiKey: KEY });
  await readOwnGooglePlace(company, undefined, deps([OWN_ID, OTHER_ID]));
  expect(await declineGooglePlace(company.id, OTHER_ID)).toBe(false);
  expect(await declineGooglePlace(company.id, OWN_ID)).toBe(true);
  expect(await reload(company.id)).toMatchObject({ googlePlaceCandidateId: null, googlePlaceDeclinedIds: [OWN_ID] });
  // Le candidat suivant est proposé ; si Google ne renvoie que des fiches refusées, rien n'est proposé.
  expect(await readOwnGooglePlace(await reload(company.id), undefined, deps([OWN_ID, OTHER_ID]))).toEqual({ status: "non_lue", reason: "to_confirm" });
  expect((await reload(company.id)).googlePlaceCandidateId).toBe(OTHER_ID);
  expect(await declineGooglePlace(company.id, OTHER_ID)).toBe(true);
  expect((await reload(company.id)).googlePlaceDeclinedIds).toEqual([OWN_ID, OTHER_ID]);
  expect(await readOwnGooglePlace(await reload(company.id), undefined, deps([OWN_ID, OTHER_ID]))).toEqual({ status: "non_lue", reason: "not_found" });
  expect(await readOwnGooglePlace(await reload(company.id), undefined, deps([]))).toEqual({ status: "non_lue", reason: "not_found" });
  // Une fiche confirmée puis retirée n'est pas reproposée.
  await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: RIVAL_ID } });
  expect(await confirmGooglePlace(company.id, RIVAL_ID)).toBe(true);
  expect(await removeGooglePlace(company.id)).toBe(true);
  expect(await reload(company.id)).toMatchObject({ googlePlaceId: null, googlePlaceDeclinedIds: [OWN_ID, OTHER_ID, RIVAL_ID] });
  expect(await removeGooglePlace(company.id)).toBe(false);
});

test("a confirmed place is read: rating and reviews go to Martine, only a count is recorded", async ({ company }) => {
  const { readOwnGooglePlace, describeOwnReading } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const confirmed = { ...company, googlePlaceId: OWN_ID };
  const { fetchImpl, calls } = fakePlaces({ places: { [OWN_ID]: OWN_PLACE } });
  const reading = await readOwnGooglePlace(confirmed, undefined, { fetchImpl, apiKey: KEY });
  expect(reading.status).toBe("lue");
  expect(calls).toHaveLength(1);
  const text = describeOwnReading(reading, new Date("2026-10-25T10:00:00Z"));
  expect(text).toContain("lue le 25 octobre 2026");
  expect(text).toContain("Google Maps");
  expect(text).toContain("\"note\":4.6");
  expect(text).toContain("Ne les cite pas mot pour mot");
  expect(text).not.toContain("Jean Dupont");
  expect(await prisma.sourceRead.findMany({ where: { companyId: company.id } })).toMatchObject([{ target: "own", status: "lue", reason: null, itemCount: 2, subject: null }]);
});

test("a confirmed place without reviews is read with a zero count, and an outage is recorded as unavailable", async ({ company }) => {
  const { readOwnGooglePlace, describeOwnReading } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const confirmed = { ...company, googlePlaceId: OWN_ID };
  const empty = fakePlaces({ places: { [OWN_ID]: { ...OWN_PLACE, reviews: undefined, rating: undefined, userRatingCount: 0 } } });
  const none = await readOwnGooglePlace(confirmed, undefined, { fetchImpl: empty.fetchImpl, apiKey: KEY });
  expect(none.status).toBe("lue");
  expect(describeOwnReading(none)).toContain("\"avisLus\":[]");
  for (const fail of ["429", "500", "throw"] as const) {
    const { result } = await captureErrors(() => readOwnGooglePlace(confirmed, undefined, { fetchImpl: fakePlaces({ fail }).fetchImpl, apiKey: KEY }));
    expect(result).toEqual({ status: "non_lue", reason: "unavailable" });
  }
  // Une fiche disparue côté Google est aussi « indisponible » pour l'analyse, la confirmation reste enregistrée.
  expect(await readOwnGooglePlace(confirmed, undefined, { fetchImpl: fakePlaces().fetchImpl, apiKey: KEY })).toEqual({ status: "non_lue", reason: "unavailable" });
  expect((await prisma.sourceRead.findMany({ where: { companyId: company.id } })).map((read) => `${read.status}:${read.reason}:${read.itemCount}`).sort())
    .toEqual(["lue:null:0", "non_lue:unavailable:null", "non_lue:unavailable:null", "non_lue:unavailable:null", "non_lue:unavailable:null"]);
});

test("competitor reads are capped per run, in parallel too, and each one is recorded", async ({ company }) => {
  const { readCompetitorGooglePlace, COMPETITOR_READ_CAP } = await import("../src/lib/google-place");
  const { createAgentExecution, withAgentExecution } = await import("../src/lib/agent-run-execution");
  const { prisma } = await import("../src/lib/prisma");
  const run = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "running", attempts: 1, startedAt: new Date(Date.now() - 5_000) } });
  const { fetchImpl, calls } = fakePlaces({ search: [RIVAL_ID], places: { [RIVAL_ID]: RIVAL_PLACE } });
  const context = createAgentExecution({ companyId: company.id, agentRunId: run.id, attempt: 1, startedAt: run.startedAt! });
  const outputs = await withAgentExecution(context, () => Promise.all(
    [1, 2, 3, 4, 5].map((n) => readCompetitorGooglePlace(company.id, run.id, `Atelier Rival ${n} Paris`, { fetchImpl, apiKey: KEY })),
  ));
  expect(COMPETITOR_READ_CAP).toBe(3);
  expect(outputs.filter((output) => output.startsWith("Concurrent trouvé : Atelier Rival"))).toHaveLength(3);
  expect(outputs.filter((output) => output.startsWith("Plafond atteint"))).toHaveLength(2);
  expect(outputs.every((output) => !output.includes("Jean Dupont"))).toBe(true);
  // Une lecture refusée par le plafond n'appelle pas Google : 3 recherches, 3 lectures.
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(3);
  expect(calls.filter((call) => call.method === "GET")).toHaveLength(3);
  const reads = await prisma.sourceRead.findMany({ where: { companyId: company.id, agentRunId: run.id } });
  expect(reads).toHaveLength(3);
  expect(reads.every((read) => read.target === "competitor" && read.status === "lue" && read.itemCount === 1 && /^Atelier Rival \d Paris$/.test(read.subject ?? ""))).toBe(true);
});

test("a competitor that is not found or unavailable is recorded as not read", async ({ company }) => {
  const { readCompetitorGooglePlace } = await import("../src/lib/google-place");
  const { prisma } = await import("../src/lib/prisma");
  const notFound = await readCompetitorGooglePlace(company.id, undefined, "Concurrent inconnu Paris", { fetchImpl: fakePlaces({ search: [] }).fetchImpl, apiKey: KEY });
  expect(notFound).toContain("NON LU");
  const { result } = await captureErrors(() => readCompetitorGooglePlace(company.id, undefined, "Concurrent en panne Paris", { fetchImpl: fakePlaces({ fail: "500" }).fetchImpl, apiKey: KEY }));
  expect(result).toContain("NON LU");
  expect(await readCompetitorGooglePlace(company.id, undefined, "   ", { fetchImpl: fakePlaces().fetchImpl, apiKey: KEY })).toContain("Requête vide");
  const reads = await prisma.sourceRead.findMany({ where: { companyId: company.id } });
  expect(reads.map((read) => `${read.target}:${read.status}:${read.reason}`).sort()).toEqual(["competitor:non_lue:not_found", "competitor:non_lue:not_found", "competitor:non_lue:unavailable"]);
});

for (const withKey of [false, true]) {
  test(`Martine ${withKey ? "receives the real Google reading and the competitor tool" : "is told the Google source was not read, and gets no competitor tool, without a key"}`, async ({ company }) => {
    const { runMarketingAgent } = await import("../src/lib/agents/marketing");
    const { anthropic } = await import("../src/lib/anthropic");
    const { prisma } = await import("../src/lib/prisma");
    await prisma.company.update({ where: { id: company.id }, data: { googlePlaceId: OWN_ID, website: "https://atelier-test.example" } });
    const messages = anthropic.beta.messages as unknown as { toolRunner: (params: unknown) => unknown };
    const originalRunner = messages.toolRunner;
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GOOGLE_PLACES_API_KEY;
    const fake = fakePlaces({ places: { [OWN_ID]: OWN_PLACE } });
    const captured: { params?: { tools: { name: string; max_uses?: number }[]; messages: { content: string }[]; system: { text: string }[] } } = {};
    messages.toolRunner = (params: unknown) => { captured.params = params as typeof captured.params; throw new Error("intercepted"); };
    globalThis.fetch = fake.fetchImpl;
    if (withKey) process.env.GOOGLE_PLACES_API_KEY = KEY; else delete process.env.GOOGLE_PLACES_API_KEY;
    try {
      await expect(runMarketingAgent(company.id)).rejects.toThrow("intercepted");
    } finally {
      messages.toolRunner = originalRunner;
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = originalKey;
    }
    const { tools, messages: sent, system } = captured.params!;
    const toolNames = tools.map((tool) => tool.name);
    expect(system.map((block) => block.text).join(" ")).toContain("Ne recopie aucun avis");
    // Le site est lu au-delà de l'accueil : budget de lectures relevé et consigne de lire les pages utiles.
    expect(system.map((block) => block.text).join(" ")).toContain("Lis ensuite les pages utiles de ce site");
    expect(tools.find((tool) => tool.name === "web_fetch")?.max_uses).toBe(6);
    if (withKey) {
      expect(toolNames).toContain("read_competitor_google_reviews");
      expect(sent[0].content).toContain("Fiche Google de l'entreprise, lue le");
      expect(sent[0].content).toContain("\"note\":4.6");
      expect(fake.calls.filter((call) => call.method === "GET")).toHaveLength(1);
    } else {
      expect(toolNames).not.toContain("read_competitor_google_reviews");
      expect(sent[0].content).toContain("Fiche Google de l'entreprise : NON LUE");
      expect(fake.calls).toHaveLength(0);
    }
    expect(toolNames).toEqual(expect.arrayContaining(["record_audit_finding", "propose_action", "propose_facebook_page", "web_fetch", "web_search"]));
  });
}

test("the coverage lists the reads of the latest finished audit with their reason", async ({ company }) => {
  const { getSourceCoverage, describeSourceRead } = await import("../src/lib/source-coverage");
  const { prisma } = await import("../src/lib/prisma");
  expect(await getSourceCoverage(company.id)).toEqual([]);
  const old = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", attempts: 1, startedAt: new Date("2026-10-01T10:00:00Z"), finishedAt: new Date("2026-10-01T10:05:00Z") } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: old.id, source: "google_reviews", target: "own", status: "lue", itemCount: 9 } });
  const startedAt = new Date(Date.now() - 60_000);
  const latest = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", attempts: 2, startedAt, finishedAt: new Date() } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: latest.id, source: "google_reviews", target: "own", status: "non_lue", reason: "to_confirm", createdAt: new Date(startedAt.getTime() - 30_000) } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: latest.id, source: "google_reviews", target: "own", status: "non_lue", reason: "to_confirm" } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: latest.id, source: "google_reviews", target: "competitor", subject: "Atelier Rival Paris", status: "lue", itemCount: 0 } });
  const coverage = await getSourceCoverage(company.id);
  // Les lectures d'une tentative précédente du même passage et celles d'un ancien audit sont exclues.
  expect(coverage.map(({ label, status, detail }) => ({ label, status, detail })).sort((a, b) => (a.status < b.status ? -1 : 1))).toEqual([
    { label: "Avis Google d'un concurrent (« Atelier Rival Paris »)", status: "lue", detail: "Lue, aucun avis" },
    { label: "Avis Google de votre fiche", status: "non_lue", detail: "Non lue : la fiche Google n'est pas encore confirmée par le dirigeant" },
  ]);
  expect(describeSourceRead({ id: "x", source: "google_reviews", target: "own", subject: null, status: "lue", reason: null, itemCount: 7 }).detail).toBe("Lue, 7 avis lus");
  for (const [reason, expected] of [["not_configured", "n'est pas activée"], ["not_found", "aucune fiche Google"], ["unavailable", "n'a pas répondu"]]) {
    expect(describeSourceRead({ id: "x", source: "google_reviews", target: "own", subject: null, status: "non_lue", reason, itemCount: null }).detail).toContain(expected);
  }
});

test("deleting a company deletes its source reads", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const company = await prisma.company.create({ data: { ownerEmail: `sources-delete-${randomUUID()}@example.invalid`, name: "À supprimer", trade: "Artisan", servingArea: "Paris", googlePlaceId: OWN_ID } });
  await prisma.sourceRead.create({ data: { companyId: company.id, source: "google_reviews", target: "own", status: "lue", itemCount: 1 } });
  await prisma.company.delete({ where: { id: company.id } });
  expect(await prisma.sourceRead.count({ where: { companyId: company.id } })).toBe(0);
});

// --- Page Facebook (US #253) : aucune requête réelle vers Meta ---

const PAGE_ID = "2000001";
const PAGE_TOKEN = "private-page-token-1";
const PAGE_INFO = { id: PAGE_ID, name: "Atelier Test · Page principale", link: "https://www.facebook.com/atelier.test", category: "Artisan", followers_count: 321 };
const PAGE_POSTS = {
  data: [
    { message: "Nouveau chantier terminé", created_time: "2026-10-20T10:00:00+0000", reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } } },
    { created_time: "2026-10-10T10:00:00+0000" },
  ],
};

async function withMetaEnv<T>(run: () => Promise<T>, overrides: { configured?: boolean } = {}) {
  const names = ["META_APP_ID", "META_APP_SECRET", "META_TOKEN_ENCRYPTION_KEY"] as const;
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  if (overrides.configured === false) for (const name of names) delete process.env[name];
  else { process.env.META_APP_ID = "ci-meta-app"; process.env.META_APP_SECRET = "ci-meta-secret"; process.env.META_TOKEN_ENCRYPTION_KEY = "d".repeat(64); }
  try { return await run(); } finally {
    for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
  }
}

type GraphFailure = "401" | "190" | "403" | "500" | "throw" | "badjson";
function fakeGraph(options: { info?: unknown; infoFail?: GraphFailure; posts?: unknown; postsFail?: GraphFailure } = {}) {
  const calls: { url: string; authorization: string | null }[] = [];
  const fail = (kind: GraphFailure) => {
    if (kind === "throw") throw new Error("réseau SECRET_BODY");
    if (kind === "badjson") return new Response("{SECRET_BODY", { status: 200 });
    const status = kind === "190" ? 400 : Number(kind);
    return new Response(JSON.stringify({ error: { code: kind === "190" || kind === "401" ? 190 : 10, message: "SECRET_BODY" } }), { status });
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
    const isPosts = new URL(url).pathname.endsWith("/posts");
    const failure = isPosts ? options.postsFail : options.infoFail;
    if (failure) return fail(failure);
    return Response.json(isPosts ? options.posts ?? PAGE_POSTS : options.info ?? PAGE_INFO);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function connectFacebook(companyId: string, options: { scopes?: string[]; selectedPageId?: string | null } = {}) {
  const { encryptFacebookAccount, FACEBOOK_SCOPES, FACEBOOK_POSTS_SCOPE } = await import("../src/lib/oauth/meta");
  const { prisma } = await import("../src/lib/prisma");
  const accessToken = encryptFacebookAccount({
    userToken: "private-user-token", userId: "1000001", userName: "Dirigeante de test",
    scopes: options.scopes ?? [...FACEBOOK_SCOPES, FACEBOOK_POSTS_SCOPE],
    selectedPageId: options.selectedPageId === undefined ? PAGE_ID : options.selectedPageId,
    pages: [{ id: PAGE_ID, name: PAGE_INFO.name, token: PAGE_TOKEN, canPublish: true }],
  }, companyId);
  await prisma.channelConnection.create({ data: { companyId, channel: "facebook", status: "connecte", accessToken } });
}

test("Facebook links: only the plain https link of a Page is accepted, in canonical form", async () => {
  const { canonicalFacebookPageUrl, declaredFacebookPageUrl } = await import("../src/lib/facebook-page-url");
  for (const [input, expected] of [
    ["https://www.facebook.com/atelier.test", "https://www.facebook.com/atelier.test"],
    ["https://facebook.com/atelier.test/", "https://www.facebook.com/atelier.test"],
    ["https://m.facebook.com/Atelier-Test", "https://www.facebook.com/Atelier-Test"],
    ["  https://WWW.FACEBOOK.COM/100012345678901 ", "https://www.facebook.com/100012345678901"],
  ] as const) expect(canonicalFacebookPageUrl(input)).toBe(expected);
  for (const input of [
    "http://www.facebook.com/atelier.test", "https://www.facebook.com/atelier.test?ref=share", "https://www.facebook.com/atelier.test#a",
    "https://www.facebook.com/", "https://www.facebook.com/atelier/posts/1", "https://www.facebook.com/profile.php?id=1",
    "https://www.facebook.com/groups", "https://www.facebook.com/sharer.php", "https://www.facebook.com/share", "https://www.facebook.com/login",
    "https://www.facebook.com/abc", "https://www.facebook.com/atelier test", "https://www.facebook.com/%61telier", "https://www.facebook.com/atelier..test",
    "https://evil.example/https://www.facebook.com/atelier.test", "https://www.facebook.com.evil.example/atelier.test",
    "https://user:pass@www.facebook.com/atelier.test", "https://www.facebook.com:8443/atelier.test", "javascript:alert(1)", "atelier.test", "",
    `https://www.facebook.com/${"a".repeat(300)}`,
  ]) expect(canonicalFacebookPageUrl(input), input).toBeNull();
  for (const bad of [null, undefined, 12, {}, ["https://www.facebook.com/atelier.test"]]) expect(canonicalFacebookPageUrl(bad)).toBeNull();
  // Dans un texte libre déclaré, un paramètre de suivi n'empêche pas de retrouver la Page.
  expect(declaredFacebookPageUrl("Instagram @atelier, https://www.facebook.com/atelier.test/?ref=bio, merci")).toBe("https://www.facebook.com/atelier.test");
  expect(declaredFacebookPageUrl("https://www.facebook.com/groups/12345 puis https://facebook.com/atelier.test")).toBe("https://www.facebook.com/atelier.test");
  expect(declaredFacebookPageUrl("@atelier_test")).toBeNull();
  expect(declaredFacebookPageUrl(null)).toBeNull();
});

test("Graph read: explicit fields, proof and token in headers only, posts only when requested", () => withMetaEnv(async () => {
  const { readFacebookPageOverview } = await import("../src/lib/oauth/meta");
  const page = { id: PAGE_ID, token: PAGE_TOKEN };
  const graph = fakeGraph();
  const outcome = await readFacebookPageOverview(page, { withPosts: true }, graph.fetchImpl);
  expect(outcome).toEqual({ status: "read", overview: {
    name: PAGE_INFO.name, link: PAGE_INFO.link, category: "Artisan", followers: 321,
    posts: [
      { message: "Nouveau chantier terminé", createdAt: "2026-10-20T10:00:00+0000", reactions: 12, comments: 3 },
      { message: "", createdAt: "2026-10-10T10:00:00+0000", reactions: null, comments: null },
    ],
  } });
  expect(graph.calls).toHaveLength(2);
  const [info, posts] = graph.calls.map((call) => new URL(call.url));
  expect(info.pathname).toBe(`/v26.0/${PAGE_ID}`);
  expect(info.searchParams.get("fields")).toBe("id,name,link,category,followers_count,fan_count");
  expect(posts.pathname).toBe(`/v26.0/${PAGE_ID}/posts`);
  expect(posts.searchParams.get("limit")).toBe("10");
  for (const url of [info, posts]) expect(url.searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
  expect(graph.calls.every((call) => call.authorization === `Bearer ${PAGE_TOKEN}` && !call.url.includes(PAGE_TOKEN))).toBe(true);
  const withoutPosts = fakeGraph();
  const infosOnly = await readFacebookPageOverview(page, { withPosts: false }, withoutPosts.fetchImpl);
  expect(infosOnly).toMatchObject({ status: "read", overview: { posts: null } });
  expect(withoutPosts.calls).toHaveLength(1);
}));

for (const [fail, expected] of [
  ["401", { status: "refused", tokenRejected: true }],
  ["190", { status: "refused", tokenRejected: true }],
  ["403", { status: "refused", tokenRejected: false }],
  ["500", { status: "unavailable" }],
  ["throw", { status: "unavailable" }],
  ["badjson", { status: "unavailable" }],
] as const) {
  test(`Graph read: a ${fail} failure is ${expected.status} and never logs the body or the token`, () => withMetaEnv(async () => {
    const { readFacebookPageOverview } = await import("../src/lib/oauth/meta");
    const { result, lines } = await captureErrors(() => readFacebookPageOverview({ id: PAGE_ID, token: PAGE_TOKEN }, { withPosts: true }, fakeGraph({ infoFail: fail }).fetchImpl));
    expect(result).toEqual(expected);
    expect(lines.join("\n")).not.toMatch(/SECRET_BODY|private-page-token/);
  }));
}

test("Graph read: a posts failure or another Page's answer does not invalidate the page information", () => withMetaEnv(async () => {
  const { readFacebookPageOverview } = await import("../src/lib/oauth/meta");
  const page = { id: PAGE_ID, token: PAGE_TOKEN };
  expect(await readFacebookPageOverview(page, { withPosts: true }, fakeGraph({ postsFail: "403" }).fetchImpl)).toMatchObject({ status: "read", overview: { posts: null } });
  expect(await readFacebookPageOverview(page, { withPosts: true }, fakeGraph({ posts: { data: "nope" } }).fetchImpl)).toMatchObject({ status: "read", overview: { posts: null } });
  expect(await readFacebookPageOverview(page, { withPosts: true }, fakeGraph({ info: { ...PAGE_INFO, id: "9999" } }).fetchImpl)).toEqual({ status: "unavailable" });
}));

test("Facebook source: not enabled and not connected are recorded as not read, with no request", async ({ company }) => {
  const { readOwnFacebookPage } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  const graph = fakeGraph();
  expect(await withMetaEnv(() => readOwnFacebookPage(company, undefined, graph.fetchImpl), { configured: false })).toMatchObject({ status: "non_lue", reason: "not_configured" });
  expect(await withMetaEnv(() => readOwnFacebookPage(company, undefined, graph.fetchImpl))).toMatchObject({ status: "non_lue", reason: "not_connected" });
  expect(graph.calls).toHaveLength(0);
  const reads = await prisma.sourceRead.findMany({ where: { companyId: company.id } });
  expect(reads.map((read) => `${read.source}:${read.subject}:${read.status}:${read.reason}`).sort()).toEqual([
    "facebook_page:informations:non_lue:not_configured", "facebook_page:informations:non_lue:not_connected",
  ]);
});

test("Facebook source: a connection that cannot be read is to redo, and a Page not selected is not read", async ({ company }) => {
  const { readOwnFacebookPage } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  await withMetaEnv(async () => {
    await connectFacebook(company.id, { selectedPageId: null });
    const graph = fakeGraph();
    expect(await readOwnFacebookPage(company, undefined, graph.fetchImpl)).toMatchObject({ status: "non_lue", reason: "reauthorization" });
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { accessToken: "jeton-en-clair" } });
    expect(await readOwnFacebookPage(company, undefined, graph.fetchImpl)).toMatchObject({ status: "non_lue", reason: "reauthorization" });
    expect(graph.calls).toHaveLength(0);
  });
});

test("Facebook source: a connected Page is read, its link proposed, and the reads recorded", async ({ company }) => {
  const { readOwnFacebookPage, describeFacebookReading } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  await withMetaEnv(async () => {
    await connectFacebook(company.id);
    const graph = fakeGraph();
    const reading = await readOwnFacebookPage(company, undefined, graph.fetchImpl);
    expect(reading).toMatchObject({ status: "lue", postsReason: null, overview: { name: PAGE_INFO.name, followers: 321 } });
    const text = describeFacebookReading(reading, new Date("2026-10-25T10:00:00Z"));
    expect(text).toContain("lue le 25 octobre 2026");
    expect(text).toContain("Nouveau chantier terminé");
    expect(text).toContain("\"abonnes\":321");
    expect(text).not.toContain(PAGE_TOKEN);
    // Le lien de la Page est seulement proposé : rien n'est confirmé sans le dirigeant.
    expect(await reload(company.id)).toMatchObject({ facebookPageUrl: null, facebookPageCandidateUrl: "https://www.facebook.com/atelier.test" });
    const reads = await prisma.sourceRead.findMany({ where: { companyId: company.id } });
    expect(reads.map((read) => `${read.subject}:${read.status}:${read.itemCount}`).sort()).toEqual(["informations:lue:null", "publications:lue:2"]);
  });
});

test("Facebook source: without the posts permission the information is read and the posts are not", async ({ company }) => {
  const { readOwnFacebookPage, describeFacebookReading } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  const { FACEBOOK_SCOPES } = await import("../src/lib/oauth/meta");
  await withMetaEnv(async () => {
    await connectFacebook(company.id, { scopes: [...FACEBOOK_SCOPES] });
    const graph = fakeGraph();
    const reading = await readOwnFacebookPage(company, undefined, graph.fetchImpl);
    expect(reading).toMatchObject({ status: "lue", postsReason: "permission" });
    expect(graph.calls).toHaveLength(1);
    expect(describeFacebookReading(reading)).toContain("non lues (la permission de lire les publications n'est pas accordée)");
    const reads = await prisma.sourceRead.findMany({ where: { companyId: company.id } });
    expect(reads.map((read) => `${read.subject}:${read.status}:${read.reason}`).sort()).toEqual(["informations:lue:null", "publications:non_lue:permission"]);
  });
});

test("Facebook source: a rejected token puts the connection in error once, an unavailable Facebook does not", async ({ company }) => {
  const { readOwnFacebookPage } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  await withMetaEnv(async () => {
    await connectFacebook(company.id);
    const status = async () => (await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } })).status;
    expect(await readOwnFacebookPage(company, undefined, fakeGraph({ infoFail: "500" }).fetchImpl)).toMatchObject({ status: "non_lue", reason: "unavailable" });
    expect(await status()).toBe("connecte");
    expect(await readOwnFacebookPage(company, undefined, fakeGraph({ infoFail: "403" }).fetchImpl)).toMatchObject({ status: "non_lue", reason: "unavailable" });
    expect(await status()).toBe("connecte");
    expect(await readOwnFacebookPage(company, undefined, fakeGraph({ infoFail: "190" }).fetchImpl)).toMatchObject({ status: "non_lue", reason: "reauthorization" });
    expect(await status()).toBe("erreur");
    // Une fois la connexion en erreur, plus aucun appel : la lecture est simplement non faite.
    const graph = fakeGraph();
    expect(await readOwnFacebookPage(company, undefined, graph.fetchImpl)).toMatchObject({ status: "non_lue", reason: "not_connected" });
    expect(graph.calls).toHaveLength(0);
  });
});

test("Facebook source: a Page whose link is already confirmed is not proposed again", async ({ company }) => {
  const { readOwnFacebookPage } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  await withMetaEnv(async () => {
    await connectFacebook(company.id);
    await prisma.company.update({ where: { id: company.id }, data: { facebookPageUrl: "https://www.facebook.com/deja.confirmee" } });
    await readOwnFacebookPage(await reload(company.id), undefined, fakeGraph().fetchImpl);
    expect(await reload(company.id)).toMatchObject({ facebookPageUrl: "https://www.facebook.com/deja.confirmee", facebookPageCandidateUrl: null });
  });
});

test("proposing a Page: strict link, one proposal at a time, never a declined, known or confirmed Page", async ({ company }) => {
  const { proposeFacebookPage, confirmFacebookPage, declineFacebookPage, removeFacebookPage } = await import("../src/lib/facebook-page");
  const GOOD = "https://www.facebook.com/atelier.test";
  expect(await proposeFacebookPage(company.id, undefined, "https://www.facebook.com/profile.php?id=1")).toContain("Lien refusé");
  expect(await proposeFacebookPage(company.id, undefined, "https://evil.example/atelier.test")).toContain("Lien refusé");
  expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: null });
  expect(await proposeFacebookPage(company.id, undefined, `${GOOD}/`)).toContain("doit encore la confirmer");
  expect(await reload(company.id)).toMatchObject({ facebookPageUrl: null, facebookPageCandidateUrl: GOOD });
  expect(await proposeFacebookPage(company.id, undefined, "https://www.facebook.com/autre.page")).toContain("déjà en attente");
  expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: GOOD });

  // Confirmer exige le lien exactement proposé ; un autre lien ou un lien invalide ne change rien.
  expect(await confirmFacebookPage(company.id, "https://www.facebook.com/autre.page")).toBe(false);
  expect(await confirmFacebookPage(company.id, "javascript:alert(1)")).toBe(false);
  expect(await declineFacebookPage(company.id, GOOD)).toBe(true);
  expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: null, facebookPageDeclinedUrls: [GOOD] });
  expect(await declineFacebookPage(company.id, GOOD)).toBe(false);
  expect(await proposeFacebookPage(company.id, undefined, GOOD)).toContain("déjà été refusée");
  expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: null });

  const OTHER = "https://www.facebook.com/autre.page";
  expect(await proposeFacebookPage(company.id, undefined, OTHER)).toContain("doit encore la confirmer");
  expect(await confirmFacebookPage(company.id, OTHER)).toBe(true);
  expect(await confirmFacebookPage(company.id, OTHER)).toBe(false);
  expect(await reload(company.id)).toMatchObject({ facebookPageUrl: OTHER, facebookPageCandidateUrl: null });
  expect(await proposeFacebookPage(company.id, undefined, "https://www.facebook.com/encore.une")).toContain("déjà identifiée");
  expect(await removeFacebookPage(company.id)).toBe(true);
  expect(await removeFacebookPage(company.id)).toBe(false);
  expect(await reload(company.id)).toMatchObject({ facebookPageUrl: null, facebookPageDeclinedUrls: [GOOD, OTHER] });
  expect(await proposeFacebookPage(company.id, undefined, OTHER)).toContain("déjà été refusée");
});

test("a Page link already given by the owner is known and never proposed", async ({ company }) => {
  const { proposeFacebookPage, knownFacebookPageUrl } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  const updated = await prisma.company.update({ where: { id: company.id }, data: { socialHandles: "https://www.facebook.com/atelier.test/" } });
  expect(knownFacebookPageUrl(updated)).toBe("https://www.facebook.com/atelier.test");
  expect(await proposeFacebookPage(company.id, undefined, "https://www.facebook.com/autre.page")).toContain("déjà identifiée");
  expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: null });
});

test("a Page decision only applies to the company's own proposal", async ({ company }) => {
  const { proposeFacebookPage, confirmFacebookPage, declineFacebookPage, removeFacebookPage } = await import("../src/lib/facebook-page");
  const { prisma } = await import("../src/lib/prisma");
  const other = await prisma.company.create({ data: { ownerEmail: `sources-other-${randomUUID()}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Lyon" } });
  try {
    await proposeFacebookPage(company.id, undefined, "https://www.facebook.com/atelier.test");
    expect(await confirmFacebookPage(other.id, "https://www.facebook.com/atelier.test")).toBe(false);
    expect(await declineFacebookPage(other.id, "https://www.facebook.com/atelier.test")).toBe(false);
    expect(await removeFacebookPage(other.id)).toBe(false);
    expect(await reload(company.id)).toMatchObject({ facebookPageCandidateUrl: "https://www.facebook.com/atelier.test" });
  } finally {
    await prisma.company.delete({ where: { id: other.id } });
  }
});

test("Martine receives the Facebook reading and the propose tool only while no Page is known", async ({ company }) => {
  const { runMarketingAgent } = await import("../src/lib/agents/marketing");
  const { anthropic } = await import("../src/lib/anthropic");
  const { prisma } = await import("../src/lib/prisma");
  const messages = anthropic.beta.messages as unknown as { toolRunner: (params: unknown) => unknown };
  const originalRunner = messages.toolRunner;
  const run = async (): Promise<{ tools: { name: string }[]; messages: { content: string }[]; system: { text: string }[] }> => {
    let captured: unknown;
    messages.toolRunner = (params: unknown) => { captured = params; throw new Error("intercepted"); };
    try { await expect(runMarketingAgent(company.id)).rejects.toThrow("intercepted"); } finally { messages.toolRunner = originalRunner; }
    return captured as Awaited<ReturnType<typeof run>>;
  };
  await withMetaEnv(async () => {
    const first = await run();
    expect(first.tools.map((tool) => tool.name)).toContain("propose_facebook_page");
    expect(first.messages[0].content).toContain("Page Facebook de l'entreprise : NON LUE (la Page Facebook n'est pas connectée à BienDecider)");
    expect(first.system.map((block) => block.text).join(" ")).toContain("ne la présente jamais comme confirmée");

    await prisma.company.update({ where: { id: company.id }, data: { facebookPageUrl: "https://www.facebook.com/atelier.test" } });
    const second = await run();
    expect(second.tools.map((tool) => tool.name)).not.toContain("propose_facebook_page");
    expect(second.messages[0].content).toContain("Page Facebook à consulter avec web_fetch : https://www.facebook.com/atelier.test");
  });
});

test("the coverage describes the Facebook reads of the latest audit", async ({ company }) => {
  const { getSourceCoverage, describeSourceRead } = await import("../src/lib/source-coverage");
  const { prisma } = await import("../src/lib/prisma");
  const run = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", attempts: 1, startedAt: new Date(Date.now() - 60_000), finishedAt: new Date() } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: run.id, source: "facebook_page", target: "own", subject: "informations", status: "lue" } });
  await prisma.sourceRead.create({ data: { companyId: company.id, agentRunId: run.id, source: "facebook_page", target: "own", subject: "publications", status: "non_lue", reason: "permission" } });
  expect((await getSourceCoverage(company.id)).map(({ label, status, detail }) => ({ label, status, detail }))).toEqual([
    { label: "Informations de votre Page Facebook", status: "lue", detail: "Lues" },
    { label: "Publications de votre Page Facebook", status: "non_lue", detail: "Non lues : la permission de lire les publications n'est pas accordée" },
  ]);
  const posts = { id: "x", source: "facebook_page", target: "own", subject: "publications", status: "lue", reason: null };
  expect(describeSourceRead({ ...posts, itemCount: 4 }).detail).toBe("Lues, 4 publications lues");
  expect(describeSourceRead({ ...posts, itemCount: 0 }).detail).toBe("Lues, aucune publication");
  for (const [reason, expected] of [["not_configured", "pas activée"], ["not_connected", "n'est pas connectée"], ["reauthorization", "à refaire"], ["unavailable", "Facebook n'a pas répondu"]]) {
    expect(describeSourceRead({ ...posts, subject: "informations", status: "non_lue", reason, itemCount: null }).detail).toContain(expected);
  }
});