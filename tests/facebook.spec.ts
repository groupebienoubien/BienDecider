import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireLocalDatabase } from "./support/local-database";
import { createSessionToken } from "../src/lib/session-token";
import { buildMetaAuthUrl, createMetaState, decryptFacebookAccount, encryptFacebookAccount, exchangeMetaCode,
  facebookConnectionView, FACEBOOK_SCOPES, isMetaOAuthConfigured, META_CALLBACK, META_GRAPH_VERSION, META_STATE_COOKIE,
  MetaOAuthError, revokeFacebookAuthorization, verifyFacebookPage, verifyMetaState, type FacebookAccount } from "../src/lib/oauth/meta";
import { publishProposalToFacebook } from "../src/lib/social/facebook-publish";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
// Mêmes valeurs factices que le serveur lancé par la CI (.github/workflows/ci.yml) : elles ne sont jamais envoyées à Meta.
const APP_SECRET = "ci-meta-secret";
const account: FacebookAccount = {
  userToken: "private-user-token", userId: "1000001", userName: "Dirigeante de test", scopes: [...FACEBOOK_SCOPES], selectedPageId: null,
  pages: [
    { id: "2000001", name: "Atelier Test · Page principale", token: "private-page-token-1", canPublish: true },
    { id: "2000002", name: "Page en lecture seule", token: "private-page-token-2", canPublish: false },
  ],
};

test.beforeEach(() => {
  process.env.META_APP_ID = "ci-meta-app";
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Faux Meta : répond selon le chemin appelé et garde la trace des requêtes, sans aucun accès réseau.
function fakeMeta(overrides: Record<string, () => Response> = {}) {
  const calls: { url: URL; authorization: string | null; method: string }[] = [];
  const routes: Record<string, () => Response> = {
    "oauth/access_token": () => json({ access_token: "private-user-token", expires_in: 5184000 }),
    "me/permissions": () => json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }),
    "me": () => json({ id: account.userId, name: account.userName }),
    "me/accounts": () => json({ data: [
      { id: "2000001", name: "Atelier Test · Page principale", access_token: "private-page-token-1", tasks: ["ADVERTISE", "CREATE_CONTENT"] },
      { id: "2000002", name: "Page en lecture seule", access_token: "private-page-token-2", tasks: ["ANALYZE"] },
    ] }),
    ...overrides,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization"), method: init?.method ?? "GET" });
    const path = url.pathname.replace(`/${META_GRAPH_VERSION}/`, "");
    return (routes[path] ?? (() => json({ error: { message: "unknown" } }, 404)))();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function diagnosticOf(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error instanceof MetaOAuthError ? error.diagnostic : `other:${String(error)}`; }
  return "no error";
}

test("Facebook auth asks only for Page permissions on the verified Graph version, without the app secret", () => {
  expect(isMetaOAuthConfigured()).toBe(true);
  const callback = `https://www.biendecider.com${META_CALLBACK}`;
  const url = new URL(buildMetaAuthUrl(callback, "test-state"));
  expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
  expect(url.searchParams.get("redirect_uri")).toBe(callback);
  expect(url.searchParams.get("state")).toBe("test-state");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")?.split(",")).toEqual(["pages_show_list", "pages_read_engagement", "pages_manage_posts"]);
  expect(url.toString()).not.toContain(APP_SECRET);
  expect(url.toString()).not.toContain("instagram");
  expect(url.searchParams.has("config_id")).toBe(false);

  // Facebook Login for Business : la configuration Meta remplace la liste des permissions.
  process.env.META_LOGIN_CONFIG_ID = "1978189152852667";
  const business = new URL(buildMetaAuthUrl(callback, "test-state"));
  expect(business.searchParams.get("config_id")).toBe("1978189152852667");
  expect(business.searchParams.has("scope")).toBe(false);
  expect(business.searchParams.get("response_type")).toBe("code");
  process.env.META_LOGIN_CONFIG_ID = "not-an-id";
  expect(new URL(buildMetaAuthUrl(callback, "test-state")).searchParams.has("config_id")).toBe(false);
  delete process.env.META_LOGIN_CONFIG_ID;

  process.env.META_TOKEN_ENCRYPTION_KEY = "too-short";
  expect(isMetaOAuthConfigured()).toBe(false);
  expect(() => buildMetaAuthUrl(callback, "test-state")).toThrow();
});

test("the OAuth state is bound to the company, the session and the callback, and expires", () => {
  const binding = { companyId: "company-a", session: "session-a", redirectUri: `https://www.biendecider.com${META_CALLBACK}` };
  const now = Date.now();
  const state = createMetaState(binding, now);
  expect(verifyMetaState(state, binding, now + 1000)).toBe(true);
  expect(createMetaState(binding, now)).not.toBe(state);

  expect(verifyMetaState(state, binding, now + 10 * 60 * 1000 + 1)).toBe(false);
  expect(verifyMetaState(state, { ...binding, companyId: "company-b" }, now)).toBe(false);
  expect(verifyMetaState(state, { ...binding, session: "session-b" }, now)).toBe(false);
  expect(verifyMetaState(state, { ...binding, redirectUri: "https://attacker.example/callback" }, now)).toBe(false);
  const [nonce, expires, signature] = state.split(".");
  expect(verifyMetaState(`${nonce}.${Number(expires) + 60000}.${signature}`, binding, now)).toBe(false);
  const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  expect(verifyMetaState(`${nonce}.${expires}.${changedSignature}`, binding, now)).toBe(false);
  for (const malformed of [null, undefined, "", "a.b", `${state}.extra`, "a.not-a-number.c"]) expect(verifyMetaState(malformed, binding, now)).toBe(false);
});

test("Facebook tokens are encrypted, bound to the company and reject tampering", () => {
  const encrypted = encryptFacebookAccount(account, "company-a");
  expect(encrypted.startsWith("v1.")).toBe(true);
  for (const secret of ["private-user-token", "private-page-token-1", "Dirigeante"]) expect(encrypted).not.toContain(secret);
  expect(encryptFacebookAccount(account, "company-a")).not.toBe(encrypted);
  expect(decryptFacebookAccount(encrypted, "company-a")).toEqual(account);

  expect(() => decryptFacebookAccount(encrypted, "company-b")).toThrow();
  const parts = encrypted.split(".");
  expect(() => decryptFacebookAccount([parts[0], parts[1], parts[2], parts[3].slice(0, -2) + "AA"].join("."), "company-a")).toThrow();
  expect(() => decryptFacebookAccount("private-user-token", "company-a")).toThrow();
  process.env.META_TOKEN_ENCRYPTION_KEY = "e".repeat(64);
  expect(() => decryptFacebookAccount(encrypted, "company-a")).toThrow();
  expect(() => encryptFacebookAccount({ ...account, scopes: ["pages_show_list"] }, "company-a")).toThrow();
});

test("the code exchange checks granted permissions and lists Pages, with tokens kept out of URLs", async () => {
  const callback = `https://www.biendecider.com${META_CALLBACK}`;
  const meta = fakeMeta();
  const result = await exchangeMetaCode("auth-code", callback, meta.fetchImpl);
  expect(result.account).toEqual(account);
  expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 60 * 60 * 1000);

  const paths = meta.calls.map((call) => call.url.pathname.replace(`/${META_GRAPH_VERSION}/`, ""));
  expect(paths).toEqual(["oauth/access_token", "oauth/access_token", "me/permissions", "me", "me/accounts"]);
  expect(meta.calls.every((call) => call.url.origin === "https://graph.facebook.com")).toBe(true);
  expect(meta.calls[0].url.searchParams.get("code")).toBe("auth-code");
  expect(meta.calls[0].url.searchParams.get("redirect_uri")).toBe(callback);
  expect(meta.calls[1].url.searchParams.get("grant_type")).toBe("fb_exchange_token");
  const proof = createHmac("sha256", APP_SECRET).update("private-user-token").digest("hex");
  for (const call of meta.calls.slice(2)) {
    expect(call.authorization).toBe("Bearer private-user-token");
    expect(call.url.searchParams.get("appsecret_proof")).toBe(proof);
    expect(call.url.toString()).not.toContain("private-user-token");
    expect(call.url.toString()).not.toContain(APP_SECRET);
  }

  const declined = fakeMeta({ "me/permissions": () => json({ data: [
    { permission: "pages_show_list", status: "granted" }, { permission: "pages_read_engagement", status: "granted" }, { permission: "pages_manage_posts", status: "declined" },
  ] }) });
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, declined.fetchImpl))).toBe("meta_scope");
  expect(declined.calls.map((call) => call.url.pathname)).not.toContain(`/${META_GRAPH_VERSION}/me/accounts`);

  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "me/accounts": () => json({ data: [] }) }).fetchImpl))).toBe("meta_no_page");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "oauth/access_token": () => json({ error: { message: "bad code" } }, 400) }).fetchImpl))).toBe("meta_token_request");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "oauth/access_token": () => json({ token: "wrong shape" }) }).fetchImpl))).toBe("meta_token_response");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "me": () => json({}, 500) }).fetchImpl))).toBe("meta_profile");
  const offline = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, offline))).toBe("meta_token_request");
});

test("a Page is verified with its own token, and revocation never throws", async () => {
  const page = { id: "2000001", token: "private-page-token-1" };
  const meta = fakeMeta({ "2000001": () => json({ id: "2000001", name: "Nom actuel de la Page" }) });
  expect(await verifyFacebookPage(page, meta.fetchImpl)).toEqual({ id: "2000001", name: "Nom actuel de la Page" });
  expect(meta.calls[0].authorization).toBe("Bearer private-page-token-1");
  expect(meta.calls[0].url.toString()).not.toContain("private-page-token-1");
  expect(await verifyFacebookPage(page, fakeMeta({ "2000001": () => json({ id: "9999999", name: "Autre Page" }) }).fetchImpl)).toBeNull();
  expect(await verifyFacebookPage(page, fakeMeta({ "2000001": () => json({ error: {} }, 400) }).fetchImpl)).toBeNull();

  const revocation = fakeMeta({ "1000001/permissions": () => json({ success: true }) });
  expect(await revokeFacebookAuthorization(account, revocation.fetchImpl)).toBe(true);
  expect(revocation.calls[0].method).toBe("DELETE");
  expect(await revokeFacebookAuthorization(account, fakeMeta().fetchImpl)).toBe(false);
  expect(await revokeFacebookAuthorization(account, (async () => { throw new Error("network down"); }) as unknown as typeof fetch)).toBe(false);
});

test("the connection view never exposes a token and never calls an unreadable row a connection", () => {
  const now = Date.now();
  const soon = new Date(now + 60000);
  expect(facebookConnectionView(undefined, "company-a", now)).toEqual({ status: "disconnected" });
  // Jeton en clair de l'ancien flux, ou ligne d'une autre entreprise : à refaire.
  expect(facebookConnectionView({ status: "connecte", accessToken: "legacy-plain-token", expiresAt: soon }, "company-a", now)).toEqual({ status: "error" });
  const pending = encryptFacebookAccount(account, "company-a");
  expect(facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: soon }, "company-b", now)).toEqual({ status: "error" });

  const selection = facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: soon }, "company-a", now);
  expect(selection).toEqual({ status: "selection", userName: "Dirigeante de test", pages: [
    { id: "2000001", name: "Atelier Test · Page principale", canPublish: true }, { id: "2000002", name: "Page en lecture seule", canPublish: false },
  ] });
  expect(JSON.stringify(selection)).not.toContain("private-");
  expect(facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: new Date(now - 1) }, "company-a", now)).toEqual({ status: "error" });
  // Autorisé sans Page choisie n'est jamais « connecté ».
  expect(facebookConnectionView({ status: "connecte", accessToken: pending, expiresAt: null }, "company-a", now)).toEqual({ status: "error" });

  const chosen = encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, "company-a");
  expect(facebookConnectionView({ status: "connecte", accessToken: chosen, expiresAt: null }, "company-a", now))
    .toEqual({ status: "connected", userName: "Dirigeante de test", pageName: "Atelier Test · Page principale" });
});

test("Facebook routes: start, refused or forged callbacks, Page choice guards and disconnection", async ({ request }) => {
  requireLocalDatabase("Facebook tests");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for Facebook tests.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const profile = { name: "Atelier Test Facebook", trade: "Artisan", servingArea: "Paris" };
  const company = await prisma.company.create({ data: { ...profile, ownerEmail: `facebook-test-${randomUUID()}@example.invalid` } });
  const other = await prisma.company.create({ data: { ...profile, ownerEmail: `facebook-other-${randomUUID()}@example.invalid` } });
  const session = (email: string, sessionVersion: number) => createSessionToken(email, sessionVersion, process.env.SESSION_SECRET!);
  // Le jeton contient l'heure d'émission à la seconde : on réutilise le même pour vérifier le state.
  const companySession = session(company.ownerEmail, company.sessionVersion);
  const headers = { Cookie: `pepito_session=${companySession}`, Origin: baseURL };
  const redirectUri = `${baseURL}${META_CALLBACK}`;
  const connection = () => prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } });
  try {
    // Départ : redirection vers Facebook avec un state signé, posé en cookie restreint au flux.
    const start = await request.get(`${baseURL}/api/oauth/meta/start`, { headers, maxRedirects: 0 });
    expect(start.status()).toBe(307);
    const authorization = new URL(start.headers().location);
    expect(authorization.hostname).toBe("www.facebook.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe(redirectUri);
    const state = authorization.searchParams.get("state")!;
    const setCookie = start.headers()["set-cookie"];
    expect(setCookie).toContain(`${META_STATE_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toContain("Path=/api/oauth/meta");
    expect(verifyMetaState(state, { companyId: company.id, session: companySession, redirectUri })).toBe(true);
    expect((await request.get(`${baseURL}/api/oauth/meta/start`, { headers: { ...headers, "Sec-Fetch-Site": "cross-site" }, maxRedirects: 0 })).status()).toBe(403);

    // Retour : une connexion existante n'est jamais modifiée par un refus ou un state invalide.
    const existing = encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, company.id);
    await prisma.channelConnection.create({ data: { companyId: company.id, channel: "facebook", status: "connecte", accessToken: existing } });
    const callback = (query: string, cookie: string) => request.get(`${redirectUri}?${query}`, { headers: { Cookie: cookie }, maxRedirects: 0 });
    const withState = `${headers.Cookie}; ${META_STATE_COOKIE}=${state}`;
    const outcome = async (query: string, cookie: string) => new URL((await callback(query, cookie)).headers().location, baseURL).searchParams.get("error");
    expect(await outcome(`state=${encodeURIComponent(state)}&error=access_denied`, withState)).toBe("meta_denied");
    expect(await outcome(`state=${encodeURIComponent(state)}&code=abc`, headers.Cookie)).toBe("meta_state");
    expect(await outcome(`state=forged&code=abc`, withState)).toBe("meta_state");
    expect(await outcome(`state=forged&code=abc`, `${headers.Cookie}; ${META_STATE_COOKIE}=forged`)).toBe("meta_state");
    const foreignState = createMetaState({ companyId: other.id, session: session(other.ownerEmail, other.sessionVersion), redirectUri });
    expect(await outcome(`state=${encodeURIComponent(foreignState)}&code=abc`, `${headers.Cookie}; ${META_STATE_COOKIE}=${foreignState}`)).toBe("meta_state");
    expect(await outcome(`state=${encodeURIComponent(state)}`, withState)).toBe("meta_state");
    expect((await connection())?.accessToken).toBe(existing);

    // Choix de la Page : rien en attente, Page inconnue, rôle insuffisant. Aucun de ces refus n'appelle Meta.
    const choose = (pageId: unknown, extra: Record<string, string> = headers) => request.post(`${baseURL}/api/facebook/page`, { headers: extra, data: { pageId } });
    expect((await choose("2000001")).status()).toBe(409);
    const pending = encryptFacebookAccount(account, company.id);
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { status: "selection_requise", accessToken: pending, expiresAt: new Date(Date.now() + 600000) } });
    expect((await choose("")).status()).toBe(400);
    expect((await choose("9999999")).status()).toBe(400);
    expect((await choose("2000002")).status()).toBe(400);
    expect((await choose("2000001", { ...headers, Origin: "https://untrusted.example" })).status()).toBe(403);
    expect((await choose("2000001", { Cookie: `pepito_session=${session(other.ownerEmail, other.sessionVersion)}`, Origin: baseURL })).status()).toBe(409);
    expect((await connection())?.status).toBe("selection_requise");

    // La page Connexions propose les Pages par leur nom, sans aucun jeton.
    const page = await (await request.get(`${baseURL}/connexions`, { headers })).text();
    expect(page).toContain("Autorisation reçue · choisissez la Page à connecter");
    expect(page).toContain("Atelier Test · Page principale");
    expect(page).toContain("Page en lecture seule");
    expect(page).not.toContain("private-");
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await choose("2000001")).status()).toBe(409);

    // Déconnexion : confirmation exigée, effacement local même si la ligne est illisible, isolée par entreprise.
    const legacy = { status: "connecte", accessToken: "legacy-plain-token" };
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: legacy });
    await prisma.channelConnection.create({ data: { companyId: other.id, channel: "facebook", ...legacy } });
    const disconnect = (data: unknown) => request.post(`${baseURL}/api/facebook/disconnect`, { headers, data });
    expect((await disconnect({})).status()).toBe(400);
    expect(await connection()).not.toBeNull();
    const removed = await disconnect({ confirmed: true });
    expect(await removed.json()).toEqual({ disconnected: true, revoked: false });
    expect(await connection()).toBeNull();
    expect(await prisma.channelConnection.count({ where: { companyId: other.id, channel: "facebook" } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    await prisma.$disconnect();
  }
});

// Faux point de publication Meta : garde la trace de chaque appel, avec son corps, sans accès réseau.
function fakeFeed(respond: () => Response | Promise<Response>) {
  const calls: { url: URL; method: string; authorization: string | null; body: string }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), method: init?.method ?? "GET", authorization: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") });
    return respond();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function refusalOf(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return (error as { status?: number }).status ?? `other:${String(error)}`; }
  return "no error";
}

test("an approved post is published once, on the chosen Page, from its approved version only", async () => {
  requireLocalDatabase("Facebook tests");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const company = await prisma.company.create({ data: { name: "Atelier Publication", trade: "Artisan", servingArea: "Paris", ownerEmail: `facebook-publish-${randomUUID()}@example.invalid` } });
  const post = (data: Record<string, unknown> = {}) => prisma.agentProposal.create({ data: {
    companyId: company.id, agent: "contenu", kind: "social_post", title: "Post à publier", content: "Nouveau chantier terminé à Paris.",
    status: "modifiee", version: 2, approvedVersion: 2, ...data,
  } });
  const state = (id: string) => prisma.agentProposal.findUniqueOrThrow({ where: { id }, include: { executionLog: true } });
  try {
    // Sans Page connectée : refus avant tout appel.
    const first = await post();
    const none = fakeFeed(() => json({ id: "never" }));
    expect(await refusalOf(publishProposalToFacebook(first.id, company.id, 2, { fetchImpl: none.fetchImpl }))).toBe(409);
    await prisma.channelConnection.create({ data: { companyId: company.id, channel: "facebook", status: "connecte",
      accessToken: encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, company.id) } });

    // Version non approuvée, approbation sans version, version périmée, autre entreprise : rien n'est envoyé à Meta.
    const draft = await post({ status: "en_attente", approvedVersion: 1 });
    const legacy = await post({ status: "validee", version: 1, approvedVersion: null });
    expect(await refusalOf(publishProposalToFacebook(draft.id, company.id, 2, { fetchImpl: none.fetchImpl }))).toBe(400);
    expect(await refusalOf(publishProposalToFacebook(legacy.id, company.id, 1, { fetchImpl: none.fetchImpl }))).toBe(400);
    expect(await refusalOf(publishProposalToFacebook(first.id, company.id, 1, { fetchImpl: none.fetchImpl }))).toBe(409);
    expect(await refusalOf(publishProposalToFacebook(first.id, "other-company", 2, { fetchImpl: none.fetchImpl }))).toBe(404);
    expect(none.calls).toHaveLength(0);

    // Publication : la Page choisie, son jeton, la preuve d'application et exactement le texte approuvé.
    const meta = fakeFeed(() => json({ id: "2000001_42" }));
    const published = await publishProposalToFacebook(first.id, company.id, 2, { fetchImpl: meta.fetchImpl });
    expect(published.message).toContain("Atelier Test · Page principale");
    expect(meta.calls).toHaveLength(1);
    expect(meta.calls[0].method).toBe("POST");
    expect(meta.calls[0].url.pathname).toBe(`/${META_GRAPH_VERSION}/2000001/feed`);
    expect(meta.calls[0].authorization).toBe("Bearer private-page-token-1");
    expect(meta.calls[0].url.searchParams.get("appsecret_proof")).toBe(createHmac("sha256", APP_SECRET).update("private-page-token-1").digest("hex"));
    expect(new URLSearchParams(meta.calls[0].body).get("message")).toBe("Nouveau chantier terminé à Paris.");
    const done = await state(first.id);
    expect(done.status).toBe("executee");
    expect(done.executionLog).toMatchObject({ result: "succes" });
    expect(done.executionLog!.detail).toContain("version 2");
    expect(done.executionLog!.detail).toContain("2000001_42");
    expect(done.executionLog!.detail).not.toContain("private-");

    // Double clic ou second onglet : aucune seconde publication.
    expect(await refusalOf(publishProposalToFacebook(first.id, company.id, 2, { fetchImpl: meta.fetchImpl }))).toBe(409);
    const concurrent = await post();
    const slow = fakeFeed(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); return json({ id: "2000001_43" }); });
    const results = await Promise.allSettled([1, 2].map(() => publishProposalToFacebook(concurrent.id, company.id, 2, { fetchImpl: slow.fetchImpl })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(slow.calls).toHaveLength(1);

    // Refus explicite : rien n'est publié, la version reste approuvée et le journal ne garde aucun secret.
    const refused = await post();
    const rejecting = fakeFeed(() => json({ error: { message: "private-page-token-1 invalid", code: 100 } }, 400));
    expect(await refusalOf(publishProposalToFacebook(refused.id, company.id, 2, { fetchImpl: rejecting.fetchImpl }))).toBe(502);
    const afterRefusal = await state(refused.id);
    expect(afterRefusal.status).toBe("modifiee");
    expect(afterRefusal.executionLog).toMatchObject({ result: "echec" });
    expect(afterRefusal.executionLog!.detail).not.toContain("private-");

    // Jeton révoqué : la connexion passe en erreur pour être refaite.
    const expired = await post();
    expect(await refusalOf(publishProposalToFacebook(expired.id, company.id, 2, { fetchImpl: fakeFeed(() => json({ error: { code: 190 } }, 400)).fetchImpl }))).toBe(502);
    expect((await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } })).status).toBe("erreur");
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { status: "connecte" } });

    // Coupure ou erreur serveur Meta : résultat incertain, jamais republié automatiquement.
    const flakyResponses: (() => Response)[] = [() => json({ error: {} }, 503), () => { throw new Error("network"); }, () => json({ unexpected: true })];
    for (const respond of flakyResponses) {
      const uncertain = await post();
      const flaky = fakeFeed(respond);
      expect(await refusalOf(publishProposalToFacebook(uncertain.id, company.id, 2, { fetchImpl: flaky.fetchImpl }))).toBe(502);
      expect((await state(uncertain.id)).status).toBe("publication_incertaine");
      expect(await refusalOf(publishProposalToFacebook(uncertain.id, company.id, 2, { fetchImpl: flaky.fetchImpl }))).toBe(409);
      expect(flaky.calls).toHaveLength(1);
    }
  } finally {
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("the dashboard names the Page and asks for an explicit confirmation before publishing", async ({ page }) => {
  requireLocalDatabase("Facebook tests");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for Facebook tests.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const company = await prisma.company.create({ data: { name: "Atelier Tableau de bord", trade: "Artisan", servingArea: "Paris", ownerEmail: `facebook-ui-${randomUUID()}@example.invalid` } });
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "social_post", title: "Post approuvé pour Facebook", content: "Texte approuvé.", status: "validee", approvedVersion: 1,
    } });
    await page.context().addCookies([{ name: "pepito_session", value: createSessionToken(company.ownerEmail, company.sessionVersion, process.env.SESSION_SECRET!), url: baseURL, httpOnly: true, sameSite: "Lax" }]);

    // Sans Page connectée, aucune commande de publication n'est proposée.
    await page.goto(`${baseURL}/dashboard?view=historique`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await expect(page.getByRole("row").filter({ hasText: proposal.title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Préparer la publication" })).toHaveCount(0);

    await prisma.channelConnection.create({ data: { companyId: company.id, channel: "facebook", status: "connecte",
      accessToken: encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, company.id) } });
    let executed = 0;
    await page.route(`**/api/proposals/${proposal.id}/execute`, async (route) => {
      executed += 1;
      expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1, confirmed: true, acknowledgedReviewIds: [] });
      await prisma.agentProposal.update({ where: { id: proposal.id }, data: { status: "executee" } });
      await route.fulfill({ json: { message: "Publication mise en ligne sur la Page Facebook « Atelier Test · Page principale »." } });
    });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await card.getByRole("button", { name: "Préparer la publication" }).click();
    await expect(card.getByRole("dialog")).toContainText("Page « Atelier Test · Page principale » · Public");
    await card.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
    expect(executed).toBe(0);
    await card.getByRole("button", { name: "Préparer la publication" }).click();
    await card.getByRole("dialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.getByText("Publication mise en ligne sur la Page Facebook « Atelier Test · Page principale ».")).toBeVisible();
    await expect(card.getByText("En ligne", { exact: true })).toBeVisible();
    expect(executed).toBe(1);
    expect(await page.content()).not.toContain("private-");
  } finally {
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});
