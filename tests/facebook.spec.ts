import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { requireLocalDatabase } from "./support/local-database";
import { createSessionToken } from "../src/lib/session-token";
import { revokeCompanyAuthorizations } from "../src/lib/account-deletion";
import { buildMetaAuthUrl, createMetaState, decryptFacebookAccount, encryptFacebookAccount, exchangeMetaCode,
  facebookConnectionView, FACEBOOK_SCOPES, isMetaOAuthConfigured, META_CALLBACK, META_GRAPH_VERSION, META_STATE_COOKIE,
  MetaOAuthError, revokeFacebookAuthorization, verifyFacebookPage, verifyMetaState, type FacebookAccount } from "../src/lib/oauth/meta";
import { publishProposalToFacebook } from "../src/lib/social/facebook-publish";
import { persistGoogleBusinessProfileConnection } from "../src/lib/oauth/google-connection";
import { decryptGoogleToken, encryptGoogleConnectionTokens, encryptGoogleToken, isEncryptedTokenEnvelope, isGoogleTokenEncryptionConfigured } from "../src/lib/oauth/google-token";
import { exchangeGoogleCode, googleOAuthConfigurationError, isGoogleOAuthConfigured } from "../src/lib/oauth/google";
import { handleGoogleOAuthCallback } from "../src/lib/oauth/google-callback";

const require = createRequire(resolve("tests/facebook.spec.ts"));
type MigrationCrypto = {
  encryptGoogleToken: typeof encryptGoogleToken;
  decryptGoogleToken: typeof decryptGoogleToken;
  isEncryptedTokenEnvelope: typeof isEncryptedTokenEnvelope;
};
type MigrationClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };
const oauthMigration = require("../scripts/migrate-oauth-token-encryption.cjs") as {
  buildMigrationPlan: (rows: Record<string, unknown>[], crypto: MigrationCrypto, options?: { purgeGoogleConnections?: boolean }) => Array<
    { action: "update"; id: string; companyId: string; accessToken: string | null; refreshToken: string | null } |
    { action: "delete"; id: string; companyId: string; channel: string }
  >;
  executeMigration: (client: MigrationClient, options: { apply: boolean; purgeGoogleConnections?: boolean }, crypto: MigrationCrypto, target: { local: boolean }) => Promise<{
    mode: string; target: string; encryptedGoogleRows: number; purgedGoogleRows: number; purgedLegacyMetaRows: number; unchangedRows: number;
  }>;
  guardTarget: (databaseUrl: string, options: { apply: boolean; allowRemote: boolean; expectedDatabase: string | null; confirmation: string | null; purgeGoogleConnections?: boolean; googleRevocationConfirmation?: string | null }) => { databaseName: string; local: boolean };
};

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

test("Google Business Profile tokens are encrypted, company-bound and reject tampering", () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "f".repeat(64);
  expect(isGoogleTokenEncryptionConfigured()).toBe(true);

  const token = "private-google-token";
  const encrypted = encryptGoogleToken(token, "company-a");
  expect(encrypted.startsWith("v1.")).toBe(true);
  expect(encrypted).not.toContain(token);
  expect(encryptGoogleToken(token, "company-a")).not.toBe(encrypted);
  expect(decryptGoogleToken(encrypted, "company-a")).toBe(token);
  expect(() => decryptGoogleToken(encrypted, "company-b")).toThrow();
  expect(() => decryptGoogleToken(token, "company-a")).toThrow();
  expect(isEncryptedTokenEnvelope(encrypted)).toBe(true);
  const stored = encryptGoogleConnectionTokens({ access_token: "callback-access", refresh_token: "callback-refresh", expires_in: 3600 }, "company-a");
  expect(decryptGoogleToken(stored.accessToken, "company-a")).toBe("callback-access");
  expect(decryptGoogleToken(stored.refreshToken!, "company-a")).toBe("callback-refresh");
  expect(encryptGoogleConnectionTokens({ access_token: "access-without-refresh", expires_in: 3600 }, "company-a")).not.toHaveProperty("refreshToken");
  const withoutNewRefresh = encryptGoogleConnectionTokens({ access_token: "reauthorized-access", expires_in: 3600 }, "company-a");
  expect(withoutNewRefresh).not.toHaveProperty("refreshToken");

  const parts = encrypted.split(".");
  const changedCiphertext = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
  expect(() => decryptGoogleToken([parts[0], parts[1], parts[2], changedCiphertext].join("."), "company-a")).toThrow();

  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "e".repeat(64);
  expect(() => decryptGoogleToken(encrypted, "company-a")).toThrow();
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "short";
  expect(isGoogleTokenEncryptionConfigured()).toBe(false);
  expect(() => encryptGoogleToken(token, "company-a")).toThrow();
});

test("Google OAuth requires its encryption key and never exposes provider error bodies", async () => {
  const previous = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  };
  try {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-secret";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
    expect(isGoogleOAuthConfigured()).toBe(true);
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "missing";
    expect(isGoogleOAuthConfigured()).toBe(false);
    expect(googleOAuthConfigurationError()).toBe("GOOGLE_TOKEN_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.");
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    expect(googleOAuthConfigurationError()).toBe("GOOGLE_TOKEN_ENCRYPTION_KEY manquante.");
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "b".repeat(64);

    let errorMessage = "";
    try {
      await exchangeGoogleCode("test-code", "https://example.invalid/callback", async () =>
        new Response("private-provider-response-and-token", { status: 401 }));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(errorMessage).toBe("Échange OAuth Google refusé.");
    expect(errorMessage).not.toContain("private-provider-response-and-token");
  } finally {
    if (previous.clientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previous.clientSecret;
    if (previous.encryptionKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previous.encryptionKey;
  }
});

test("Google OAuth start refuses a valid session when provider configuration is absent", async ({ request }) => {
  requireLocalDatabase("Google OAuth configuration tests");
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) throw new Error("DATABASE_URL and SESSION_SECRET are required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const previous = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  };
  const company = await prisma.company.create({ data: {
    ownerEmail: `google-start-${randomUUID()}@example.invalid`, name: "Atelier Google Test", trade: "Artisan", servingArea: "Paris",
  } });
  try {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "ci-google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "ci-google-secret";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
    const session = createSessionToken(company.ownerEmail, company.sessionVersion, process.env.SESSION_SECRET);
    const response = await request.get(`${baseURL}/api/oauth/google/start`, {
      headers: { Cookie: `pepito_session=${session}` }, maxRedirects: 0,
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toContain("GOOGLE_OAUTH_CLIENT_ID");
  } finally {
    if (previous.clientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previous.clientSecret;
    if (previous.encryptionKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previous.encryptionKey;
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("Google OAuth callback persists encrypted tokens for the authorized company", async () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
  const saved: { companyId: string; accessToken: string; refreshToken: string | null }[] = [];
  const request = new NextRequest("https://www.biendecider.com/api/oauth/google/callback?code=authorized-code&state=valid-state");
  const response = await handleGoogleOAuthCallback(request, {
    getSessionEmail: async () => "owner@example.invalid",
    findCompany: async (ownerEmail) => ownerEmail === "owner@example.invalid" ? { id: "company-google-a" } : null,
    verifyAndClearOAuthState: async (state) => state === "valid-state",
    exchangeGoogleCode: async (code, redirectUri) => {
      expect(code).toBe("authorized-code");
      expect(redirectUri).toBe("https://www.biendecider.com/api/oauth/google/callback");
      return { access_token: "google-access-secret", refresh_token: "google-refresh-secret", expires_in: 3600 };
    },
    persistConnection: async (companyId, tokens) => {
      const encrypted = encryptGoogleConnectionTokens(tokens, companyId);
      saved.push({ companyId, accessToken: encrypted.accessToken, refreshToken: encrypted.refreshToken ?? null });
    },
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://www.biendecider.com/connexions?connected=google_business_profile");
  expect(saved).toHaveLength(1);
  expect(saved[0].companyId).toBe("company-google-a");
  expect(saved[0].accessToken).not.toContain("google-access-secret");
  expect(saved[0].refreshToken).not.toContain("google-refresh-secret");
  expect(decryptGoogleToken(saved[0].accessToken, saved[0].companyId)).toBe("google-access-secret");
  expect(decryptGoogleToken(saved[0].refreshToken!, saved[0].companyId)).toBe("google-refresh-secret");
});

test("OAuth token migration encrypts GBP rows, purges only legacy Meta rows and guards remote targets", () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  const googleAccess = "legacy-google-access";
  const googleRefresh = "legacy-google-refresh";
  const encryptedGoogleAccess = encryptGoogleToken("current-access", "company-b");
  const encryptedMeta = encryptFacebookAccount(account, "company-c");
  const plan = oauthMigration.buildMigrationPlan([
    { id: "google-legacy", companyId: "company-a", channel: "google_business_profile", accessToken: googleAccess, refreshToken: googleRefresh },
    { id: "google-current", companyId: "company-b", channel: "google_business_profile", accessToken: encryptedGoogleAccess, refreshToken: null },
    { id: "facebook-legacy", companyId: "company-a", channel: "facebook", accessToken: "legacy-facebook-token", refreshToken: null },
    { id: "facebook-current", companyId: "company-c", channel: "facebook", accessToken: encryptedMeta, refreshToken: null },
    { id: "instagram-legacy", companyId: "company-a", channel: "instagram", accessToken: "legacy-instagram-token", refreshToken: null },
  ], { encryptGoogleToken, decryptGoogleToken, isEncryptedTokenEnvelope });

  expect(plan.map((entry) => [entry.action, entry.id])).toEqual([
    ["update", "google-legacy"], ["delete", "facebook-legacy"], ["delete", "instagram-legacy"],
  ]);
  const googleUpdate = plan[0];
  if (googleUpdate.action !== "update") throw new Error("Expected GBP row update.");
  expect(decryptGoogleToken(googleUpdate.accessToken!, "company-a")).toBe(googleAccess);
  expect(decryptGoogleToken(googleUpdate.refreshToken!, "company-a")).toBe(googleRefresh);
  expect(() => oauthMigration.buildMigrationPlan([
    { id: "google-tampered", companyId: "company-a", channel: "google_business_profile", accessToken: "v1.bad.bad.bad", refreshToken: null },
  ], { encryptGoogleToken, decryptGoogleToken, isEncryptedTokenEnvelope })).toThrow();

  expect(oauthMigration.guardTarget("postgresql://user:pass@localhost:5432/test", {
    apply: false, allowRemote: false, expectedDatabase: null, confirmation: null,
  }).local).toBe(true);
  expect(() => oauthMigration.guardTarget("postgresql://user:pass@db.example:5432/prod", {
    apply: true, allowRemote: false, expectedDatabase: null, confirmation: "BACKUP_VERIFIED",
  })).toThrow();
  expect(() => oauthMigration.guardTarget("postgresql://user:pass@db.example:5432/prod", {
    apply: true, allowRemote: true, expectedDatabase: "other", confirmation: "BACKUP_VERIFIED",
  })).toThrow();
  expect(() => oauthMigration.guardTarget("postgresql://user:pass@localhost:5432/test", {
    apply: true, allowRemote: false, expectedDatabase: null, confirmation: "BACKUP_VERIFIED", purgeGoogleConnections: true,
  })).toThrow();
  expect(oauthMigration.guardTarget("postgresql://user:pass@localhost:5432/test", {
    apply: true, allowRemote: false, expectedDatabase: null, confirmation: "BACKUP_VERIFIED",
    purgeGoogleConnections: true, googleRevocationConfirmation: "GOOGLE_ACCESS_REVOKED",
  }).local).toBe(true);
  expect(oauthMigration.buildMigrationPlan([
    { id: "google-rotation", companyId: "company-a", channel: "google_business_profile", accessToken: "v1.a.b.c", refreshToken: null },
  ], { encryptGoogleToken, decryptGoogleToken, isEncryptedTokenEnvelope }, { purgeGoogleConnections: true })).toEqual([
    { action: "delete", id: "google-rotation", companyId: "company-a", channel: "google_business_profile" },
  ]);
});

test("OAuth token migration dry-run does not write and failed apply rolls back", async () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
  const rows = [
    { id: "google-legacy", companyId: "company-a", channel: "google_business_profile", accessToken: "legacy-access", refreshToken: "legacy-refresh" },
    { id: "facebook-legacy", companyId: "company-a", channel: "facebook", accessToken: "legacy-meta", refreshToken: null },
  ];
  const commandName = (sql: string) => ["BEGIN", "SELECT", "UPDATE", "DELETE", "COMMIT", "ROLLBACK"].find((name) => sql.trimStart().startsWith(name));
  const fakeClient = (selectedRows = rows) => {
    const commands: (string | undefined)[] = [];
    const client: MigrationClient = { query: async (sql) => {
      const command = commandName(sql);
      commands.push(command);
      return command === "SELECT" ? { rows: selectedRows, rowCount: null } : { rows: [], rowCount: command === "UPDATE" || command === "DELETE" ? 1 : null };
    } };
    return { client, commands };
  };

  const dryRun = fakeClient();
  const tokenCrypto = { encryptGoogleToken, decryptGoogleToken, isEncryptedTokenEnvelope };
  const dryResult = await oauthMigration.executeMigration(dryRun.client, { apply: false }, tokenCrypto, { local: true });
  expect(dryResult).toMatchObject({ mode: "dry-run", encryptedGoogleRows: 1, purgedLegacyMetaRows: 1 });
  expect(dryRun.commands).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);

  const apply = fakeClient();
  const applyResult = await oauthMigration.executeMigration(apply.client, { apply: true }, tokenCrypto, { local: true });
  expect(applyResult.mode).toBe("applied");
  expect(apply.commands).toEqual(["BEGIN", "SELECT", "UPDATE", "DELETE", "COMMIT"]);

  const googleRotation = fakeClient([{ id: "google-rotation", companyId: "company-a", channel: "google_business_profile", accessToken: "v1.invalid.envelope.value", refreshToken: null }]);
  const rotationResult = await oauthMigration.executeMigration(googleRotation.client, { apply: false, purgeGoogleConnections: true }, tokenCrypto, { local: true });
  expect(rotationResult).toMatchObject({ purgedGoogleRows: 1, purgedLegacyMetaRows: 0 });
  expect(googleRotation.commands).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);

  const invalid = fakeClient([{ id: "broken", companyId: "company-a", channel: "google_business_profile", accessToken: "v1.bad.bad.bad", refreshToken: null }]);
  await expect(oauthMigration.executeMigration(invalid.client, { apply: true }, tokenCrypto, { local: true })).rejects.toThrow();
  expect(invalid.commands).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
});

test("OAuth token migration updates only a local fixture and rolls back invalid rows", async () => {
  requireLocalDatabase("OAuth token migration tests");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for OAuth token migration tests.");
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let clientConnected = false;
  const profile = { name: "Atelier Migration OAuth", trade: "Artisan", servingArea: "Lyon" };
  const company = await prisma.company.create({ data: { ...profile, ownerEmail: `oauth-migration-${randomUUID()}@example.invalid` } });
  const corruptCompany = await prisma.company.create({ data: { ...profile, ownerEmail: `oauth-migration-corrupt-${randomUUID()}@example.invalid` } });
  const callbackCompany = await prisma.company.create({ data: { ...profile, ownerEmail: `oauth-callback-${randomUUID()}@example.invalid` } });
  try {
    const savedCallback = await persistGoogleBusinessProfileConnection(callbackCompany.id, {
      access_token: "callback-google-access", refresh_token: "callback-google-refresh", expires_in: 3600,
    });
    expect(decryptGoogleToken(savedCallback.accessToken!, callbackCompany.id)).toBe("callback-google-access");
    expect(decryptGoogleToken(savedCallback.refreshToken!, callbackCompany.id)).toBe("callback-google-refresh");
    expect(savedCallback.accessToken).not.toContain("callback-google-access");

    await prisma.channelConnection.createMany({ data: [
      { companyId: company.id, channel: "google_business_profile", status: "connecte", accessToken: "legacy-google-access", refreshToken: "legacy-google-refresh" },
      { companyId: company.id, channel: "facebook", status: "erreur", accessToken: "legacy-facebook-token" },
      { companyId: company.id, channel: "instagram", status: "erreur", accessToken: "legacy-instagram-token" },
    ] });
    await client.connect();
    clientConnected = true;

    const tokenCrypto = { encryptGoogleToken, decryptGoogleToken, isEncryptedTokenEnvelope };
    const dryRun = await oauthMigration.executeMigration(client, { apply: false }, tokenCrypto, { local: true });
    expect(dryRun).toMatchObject({ mode: "dry-run", encryptedGoogleRows: 1, purgedLegacyMetaRows: 2 });
    expect((await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "google_business_profile" } } })).accessToken).toBe("legacy-google-access");

    await prisma.channelConnection.create({ data: {
      companyId: corruptCompany.id, channel: "google_business_profile", status: "connecte", accessToken: "v1.bad.bad.bad",
    } });
    await expect(oauthMigration.executeMigration(client, { apply: true }, tokenCrypto, { local: true })).rejects.toThrow();
    expect((await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "google_business_profile" } } })).accessToken).toBe("legacy-google-access");
    expect(await prisma.channelConnection.count({ where: { companyId: company.id, channel: { in: ["facebook", "instagram"] } } })).toBe(2);

    await prisma.channelConnection.delete({ where: { companyId_channel: { companyId: corruptCompany.id, channel: "google_business_profile" } } });
    const encryptedFacebook = encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: account.pages[0].id }, company.id);
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { accessToken: encryptedFacebook } });

    const applied = await oauthMigration.executeMigration(client, { apply: true }, tokenCrypto, { local: true });
    expect(applied).toMatchObject({ mode: "applied", encryptedGoogleRows: 1, purgedLegacyMetaRows: 1 });
    const google = await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "google_business_profile" } } });
    expect(google.accessToken).not.toBe("legacy-google-access");
    expect(decryptGoogleToken(google.accessToken!, company.id)).toBe("legacy-google-access");
    expect(decryptGoogleToken(google.refreshToken!, company.id)).toBe("legacy-google-refresh");
    expect(await prisma.channelConnection.count({ where: { companyId: company.id, channel: "instagram" } })).toBe(0);
    expect((await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } })).accessToken).toBe(encryptedFacebook);
  } finally {
    try {
      if (clientConnected) await client.end();
    } finally {
      await prisma.company.deleteMany({ where: { id: { in: [company.id, corruptCompany.id, callbackCompany.id] } } });
      await prisma.$disconnect();
    }
  }
});

test("company deletion revocation decrypts GBP tokens and refuses corrupted envelopes", async () => {
  requireLocalDatabase("Google token revocation tests");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Google token revocation tests.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const company = await prisma.company.create({ data: {
    ownerEmail: `google-revoke-${randomUUID()}@example.invalid`, name: "Atelier révocation Google", trade: "Artisan", servingArea: "Paris",
  } });
  let receivedToken: string | null = null;
  let providerCalls = 0;
  try {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
    await prisma.channelConnection.create({ data: {
      companyId: company.id, channel: "google_business_profile", status: "connecte",
      accessToken: encryptGoogleToken("google-token-to-revoke", company.id),
    } });
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      providerCalls += 1;
      receivedToken = new URLSearchParams(String(init?.body ?? "")).get("token");
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    expect(await revokeCompanyAuthorizations(company.id)).toEqual({ google_business_profile: "revoque" });
    expect(receivedToken).toBe("google-token-to-revoke");

    await prisma.channelConnection.update({
      where: { companyId_channel: { companyId: company.id, channel: "google_business_profile" } },
      data: { accessToken: "v1.bad.bad.bad" },
    });
    providerCalls = 0;
    let revocationLog = "";
    console.error = (...values) => { revocationLog = values.join(" "); };
    expect(await revokeCompanyAuthorizations(company.id)).toEqual({ google_business_profile: "non_revoque" });
    expect(providerCalls).toBe(0);
    expect(revocationLog).toBe("Révocation Google ignorée: enveloppe GBP invalide.");
    expect(revocationLog).not.toContain("v1.bad.bad.bad");
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
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
    await expect(page.locator(".history-item").filter({ hasText: proposal.title })).toBeVisible();
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
