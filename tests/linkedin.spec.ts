import { test, expect } from "@playwright/test";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireLocalDatabase } from "./support/local-database";
import { createSessionToken } from "../src/lib/session-token";
import { buildLinkedInAuthUrl, decryptLinkedInAccount, encryptLinkedInAccount, exchangeLinkedInCode,
  hashLinkedInState, isLinkedInConfigured, LINKEDIN_CALLBACK, LINKEDIN_SCOPES, LINKEDIN_STATE_COOKIE,
  verifyLinkedInIdentity } from "../src/lib/oauth/linkedin";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
const account = { token: "private-linkedin-token", subject: "member-test", name: "Profil de test", scopes: [...LINKEDIN_SCOPES] };

test.beforeEach(() => {
  process.env.LINKEDIN_CLIENT_ID = "ci-linkedin-client";
  process.env.LINKEDIN_CLIENT_SECRET = "ci-linkedin-secret";
  process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
});

test("LinkedIn auth requests only profile scopes and no client secret", () => {
  const callback = `https://www.biendecider.com${LINKEDIN_CALLBACK}`;
  const url = new URL(buildLinkedInAuthUrl(callback, "test-state", "test-nonce"));
  expect(url.searchParams.get("redirect_uri")).toBe(callback);
  expect(url.searchParams.get("state")).toBe("test-state");
  expect(url.searchParams.get("nonce")).toBe("test-nonce");
  const codeOnlyUrl = new URL(buildLinkedInAuthUrl(callback, "test-state", ""));
  expect(codeOnlyUrl.searchParams.has("nonce")).toBe(false);
  expect(codeOnlyUrl.searchParams.get("response_type")).toBe("code");
  expect(codeOnlyUrl.searchParams.get("state")).toBe("test-state");
  expect(codeOnlyUrl.searchParams.get("redirect_uri")).toBe(callback);
  expect(url.searchParams.get("enable_extended_login")).toBe("true");
  expect(url.searchParams.get("scope")?.split(" ")).toEqual(LINKEDIN_SCOPES);
  expect(url.toString()).not.toContain("ci-linkedin-secret");
  expect(url.toString()).not.toContain("organization");
  delete process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY;
  expect(isLinkedInConfigured()).toBe(false);
});

test("LinkedIn encrypted accounts are bound to company and reject tampering or missing permissions", () => {
  const encrypted = encryptLinkedInAccount(account, "company-a");
  expect(encrypted).not.toContain(account.token);
  expect(encrypted).not.toContain(account.name);
  expect(decryptLinkedInAccount(encrypted, "company-a")).toEqual(account);
  expect(() => decryptLinkedInAccount(encrypted, "company-b")).toThrow();
  expect(() => encryptLinkedInAccount({ ...account, scopes: ["openid"] }, "company-a")).toThrow();
  const parts = encrypted.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  expect(() => decryptLinkedInAccount(parts.join("."), "company-a")).toThrow();
  expect(() => decryptLinkedInAccount("plaintext-token", "company-a")).toThrow();
});

test("LinkedIn OIDC rejects signature, issuer, audience, nonce and expiry mismatches", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test-key", alg: "RS256" }] });
  const sign = (claims: Record<string, unknown> = {}) => new SignJWT({ nonce: "test-nonce", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer("https://www.linkedin.com/oauth")
    .setAudience("ci-linkedin-client").setSubject("member-test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const valid = await sign();
  expect(await verifyLinkedInIdentity(valid, "test-nonce", keys)).toBe("member-test");
  await expect(verifyLinkedInIdentity(valid, "wrong-nonce", keys)).rejects.toMatchObject({ diagnostic: "linkedin_identity_nonce" });
  const withoutNonce = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://www.linkedin.com/oauth").setAudience("ci-linkedin-client").setSubject("member-test")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  await expect(verifyLinkedInIdentity(withoutNonce, "test-nonce", keys)).rejects.toMatchObject({ diagnostic: "linkedin_identity_nonce_missing" });
  expect(await verifyLinkedInIdentity(withoutNonce, "", keys)).toBe("member-test");
  await expect(verifyLinkedInIdentity(valid, "", keys)).rejects.toMatchObject({ diagnostic: "linkedin_identity_nonce" });
  const expired = await new SignJWT({ nonce: "test-nonce" }).setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://www.linkedin.com/oauth").setAudience("ci-linkedin-client").setSubject("member-test")
    .setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
  await expect(verifyLinkedInIdentity(expired, "test-nonce", keys)).rejects.toThrow();
  for (const [issuer, audience] of [["https://attacker.invalid", "ci-linkedin-client"], ["https://www.linkedin.com", "ci-linkedin-client"], ["https://www.linkedin.com/oauth", "other-client"]]) {
    const token = await new SignJWT({ nonce: "test-nonce" }).setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer).setAudience(audience).setSubject("member-test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    await expect(verifyLinkedInIdentity(token, "test-nonce", keys)).rejects.toThrow();
  }
  const otherKeys = await generateKeyPair("RS256");
  const forged = await new SignJWT({ nonce: "test-nonce" }).setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://www.linkedin.com/oauth").setAudience("ci-linkedin-client").setSubject("member-test")
    .setIssuedAt().setExpirationTime("5m").sign(otherKeys.privateKey);
  await expect(verifyLinkedInIdentity(forged, "test-nonce", keys)).rejects.toThrow();
});

test("LinkedIn exchange accepts verified identity without email and rejects incomplete scopes or account mismatch", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "test-key", alg: "RS256" }] });
  let idToken = await new SignJWT({ nonce: "test-nonce" }).setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://www.linkedin.com/oauth").setAudience("ci-linkedin-client").setSubject(account.subject)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const originalFetch = globalThis.fetch;
  let scope = LINKEDIN_SCOPES.join(" ");
  let subject = account.subject;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_id")).toBe("ci-linkedin-client");
      expect(body.get("client_secret")).toBe("ci-linkedin-secret");
      expect(body.get("code")).toBe("code");
      expect(body.get("redirect_uri")).toBe(`https://example.invalid${LINKEDIN_CALLBACK}`);
      expect(url).not.toContain("ci-linkedin-secret");
      return Response.json({ access_token: account.token, expires_in: 3600, id_token: idToken, scope });
    }
    if (url === "https://api.linkedin.com/v2/userinfo") return Response.json({ sub: subject, name: account.name });
    throw new Error("Unexpected network request");
  };
  try {
    const result = await exchangeLinkedInCode("code", `https://example.invalid${LINKEDIN_CALLBACK}`, "test-nonce", keys);
    expect(result.account).toEqual(account);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    idToken = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://www.linkedin.com/oauth").setAudience("ci-linkedin-client").setSubject(account.subject)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const codeFlowResult = await exchangeLinkedInCode("code", `https://example.invalid${LINKEDIN_CALLBACK}`, "", keys);
    expect(codeFlowResult.account).toEqual(account);
    await expect(exchangeLinkedInCode("code", `https://example.invalid${LINKEDIN_CALLBACK}`, "test-nonce", keys)).rejects.toMatchObject({ diagnostic: "linkedin_identity_nonce_missing" });
    scope = "openid profile";
    await expect(exchangeLinkedInCode("code", `https://example.invalid${LINKEDIN_CALLBACK}`, "", keys)).rejects.toMatchObject({ diagnostic: "linkedin_scope" });
    scope = LINKEDIN_SCOPES.join(" ");
    subject = "another-member";
    await expect(exchangeLinkedInCode("code", `https://example.invalid${LINKEDIN_CALLBACK}`, "", keys)).rejects.toMatchObject({ diagnostic: "linkedin_profile_subject" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LinkedIn exchange diagnostics never disclose provider responses or tokens", async () => {
  const originalFetch = globalThis.fetch;
  const privateMarker = "private-code-token-secret";
  const scenarios = [
    { response: () => new Response(privateMarker, { status: 401 }), diagnostic: "linkedin_token_request" },
    { response: () => new Response(privateMarker, { status: 200 }), diagnostic: "linkedin_token_response" },
    { response: () => Response.json({ access_token: privateMarker, id_token: privateMarker, expires_in: 3600 }), diagnostic: "linkedin_token_response" },
    { response: () => { throw new Error(privateMarker); }, diagnostic: "linkedin_token_request" },
  ];
  try {
    for (const scenario of scenarios) {
      globalThis.fetch = async () => scenario.response();
      let failure: unknown;
      try {
        await exchangeLinkedInCode(privateMarker, "https://example.invalid/callback", "nonce");
      } catch (caught) {
        failure = caught;
      }
      expect(failure).toMatchObject({ diagnostic: scenario.diagnostic });
      expect(String(failure)).not.toContain(privateMarker);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LinkedIn routes reject invalid state, preserve prior identity on cancellation and isolate disconnect", async ({ request, page }, testInfo) => {
  requireLocalDatabase("LinkedIn route tests");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const owner = await prisma.company.create({ data: { ownerEmail: `linkedin-${randomUUID()}@example.invalid`, name: "LinkedIn Test", trade: "Artisan", servingArea: "Paris" } });
  const other = await prisma.company.create({ data: { ownerEmail: `linkedin-${randomUUID()}@example.invalid`, name: "Other Test", trade: "Artisan", servingArea: "Paris" } });
  const sessionValue = (email: string) => createSessionToken(email, 0, process.env.SESSION_SECRET!);
  const session = sessionValue(owner.ownerEmail);
  const headers = { Cookie: `pepito_session=${session}`, Origin: baseURL };
  const redirectUri = `${baseURL}${LINKEDIN_CALLBACK}`;
  try {
    for (const company of [owner, other]) await prisma.channelConnection.create({ data: {
      companyId: company.id, channel: "linkedin", status: "connecte", accessToken: encryptLinkedInAccount(account, company.id), expiresAt: new Date(Date.now() + 3600000),
    } });
    // Canal désactivé (#301) : aucun flux fournisseur ne démarre ; le retour du fournisseur reste contrôlé.
    const start = await request.get(`${baseURL}/api/oauth/linkedin/start`, { headers, maxRedirects: 0 });
    expect(start.status()).toBe(307);
    expect(start.headers().location).toContain("/connexions?error=channel_unavailable");
    expect(await prisma.linkedInAuthorization.count({ where: { companyId: owner.id } })).toBe(0);
    const state = randomUUID();
    await prisma.linkedInAuthorization.create({ data: { stateHash: hashLinkedInState(state), companyId: owner.id, sessionHash: hashLinkedInState(session), nonce: "", redirectUri, expiresAt: new Date(Date.now() + 600000) } });
    const callbackHeaders = { Cookie: `${headers.Cookie}; ${LINKEDIN_STATE_COOKIE}=${state}` };
    const callback = (stateValue: string, cookie = callbackHeaders.Cookie) => request.get(`${redirectUri}?state=${encodeURIComponent(stateValue)}&error=user_cancelled_authorize`, { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect((await callback("wrong-state")).headers().location).toContain("linkedin_state");
    expect((await callback(state, `pepito_session=${sessionValue(other.ownerEmail)}; ${LINKEDIN_STATE_COOKIE}=${state}`)).headers().location).toContain("linkedin_state");
    expect((await callback(state)).headers().location).toContain("linkedin_denied");
    expect((await callback(state)).headers().location).toContain("linkedin_state");
    expect(await prisma.linkedInAuthorization.count({ where: { companyId: owner.id } })).toBe(0);
    expect(decryptLinkedInAccount((await prisma.channelConnection.findUniqueOrThrow({ where: { companyId_channel: { companyId: owner.id, channel: "linkedin" } } })).accessToken!, owner.id).subject).toBe(account.subject);
    await prisma.linkedInAuthorization.create({ data: { stateHash: hashLinkedInState(state), companyId: owner.id, sessionHash: hashLinkedInState(session), nonce: "test-nonce", redirectUri, expiresAt: new Date(Date.now() - 1000) } });
    expect((await callback(state)).headers().location).toContain("linkedin_state");
    await page.context().addCookies([{ name: "pepito_session", value: session, url: baseURL, httpOnly: true }]);
    await page.goto(`${baseURL}/connexions`);
    await expect(page.getByRole("heading", { level: 1, name: "Canaux & délégation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "LinkedIn · profil personnel" })).toHaveCount(0);
    expect(await page.content()).not.toContain(account.token);
    await page.screenshot({ path: testInfo.outputPath("linkedin-desktop.png"), fullPage: true });
    // Une connexion LinkedIn existante se retire toujours, isolée par entreprise.
    expect((await request.post(`${baseURL}/api/linkedin/disconnect`, { headers: { ...headers, Origin: "https://attacker.invalid" }, data: { confirmed: true } })).status()).toBe(403);
    expect((await request.post(`${baseURL}/api/linkedin/disconnect`, { headers, data: { confirmed: false } })).status()).toBe(400);
    expect((await request.post(`${baseURL}/api/linkedin/disconnect`, { headers, data: { confirmed: true } })).status()).toBe(200);
    expect(await prisma.channelConnection.count({ where: { companyId: owner.id, channel: "linkedin" } })).toBe(0);
    expect(await prisma.linkedInAuthorization.count({ where: { companyId: owner.id } })).toBe(0);
    expect(await prisma.channelConnection.count({ where: { companyId: other.id, channel: "linkedin" } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
});