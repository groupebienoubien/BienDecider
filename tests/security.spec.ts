import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { config } from "dotenv";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "../src/lib/session-token";
import { hashPassword } from "../src/lib/password";
import { signupDayKey } from "../src/lib/signup-rules";
import { startSmtpSink } from "./support/smtp-sink";
import { DRAFT_AMBITION, DRAFT_AMBITION_TERMS, createTestDraft, waitForAnalysis } from "./support/onboarding-draft";
import { newAnalysis } from "../src/lib/onboarding/analysis-rules";
import { readDraftState, retainedFromRules } from "../src/lib/onboarding/draft-rules";

config({ quiet: true });

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";

type Guarded = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; denied: 401 | 403 | "login" };

// Toute route API doit figurer ici ou dans PUBLIC_ROUTES : le premier test échoue sinon.
// `denied` = réponse attendue sans session valide. `[id]` est remplacé par un identifiant quelconque.
const GUARDED_ROUTES: Guarded[] = [
  { method: "GET", path: "/api/agent-runs", denied: 401 },
  { method: "GET", path: "/api/agent-runs/[id]", denied: 401 },
  { method: "POST", path: "/api/action-plan", denied: 401 },
  { method: "PATCH", path: "/api/action-plan/[id]", denied: 401 },
  { method: "POST", path: "/api/action-plan/[id]/launch", denied: 401 },
  { method: "POST", path: "/api/auth/password", denied: 401 },
  { method: "POST", path: "/api/auth/resend-verification", denied: 401 },
  { method: "DELETE", path: "/api/admin/companies/[id]", denied: 403 },
  { method: "PATCH", path: "/api/admin/companies/[id]/limits", denied: 403 },
  { method: "PATCH", path: "/api/admin/companies/[id]/suspension", denied: 403 },
  { method: "PATCH", path: "/api/admin/usage-alerts", denied: 403 },
  { method: "PATCH", path: "/api/admin/llm-credit", denied: 403 },
  { method: "PATCH", path: "/api/admin/channel-access", denied: 403 },
  { method: "POST", path: "/api/channel-access", denied: 401 },
  { method: "POST", path: "/api/agencies/search", denied: 401 },
  { method: "GET", path: "/api/missions", denied: 401 },
  { method: "POST", path: "/api/missions", denied: 401 },
  { method: "GET", path: "/api/missions/catalogue", denied: 401 },
  { method: "DELETE", path: "/api/ideas/[id]", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/transition", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/content", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/report", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/decision", denied: 401 },
  { method: "POST", path: "/api/contents/[id]", denied: 401 },
  { method: "POST", path: "/api/contents/[id]/diffusion", denied: 401 },
  { method: "POST", path: "/api/delegation", denied: 401 },
  { method: "GET", path: "/api/credits", denied: 401 },
  { method: "POST", path: "/api/feedback", denied: 401 },
  { method: "PATCH", path: "/api/admin/feedback/[id]", denied: 403 },
  { method: "GET", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "PATCH", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "PATCH", path: "/api/admin/signup-control", denied: 403 },
  { method: "POST", path: "/api/agents/contenu/run", denied: 401 },
  { method: "POST", path: "/api/agents/demarchage/run", denied: 401 },
  { method: "POST", path: "/api/agents/marketing/run", denied: 401 },
  { method: "GET", path: "/api/audit-findings", denied: 401 },
  { method: "POST", path: "/api/co-ceo/message", denied: 401 },
  { method: "GET", path: "/api/co-ceo/messages", denied: 401 },
  { method: "GET", path: "/api/co-ceo/plan", denied: 401 },
  { method: "POST", path: "/api/co-ceo/pending-actions/[id]", denied: 401 },
  { method: "POST", path: "/api/co-ceo/plan", denied: 401 },
  { method: "POST", path: "/api/co-ceo/missions", denied: 401 },
  { method: "GET", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies", denied: 401 },
  { method: "PATCH", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies/direction", denied: 401 },
  { method: "POST", path: "/api/companies/delete", denied: 401 },
  { method: "POST", path: "/api/companies/outreach", denied: 401 },
  { method: "POST", path: "/api/facebook/disconnect", denied: 401 },
  { method: "POST", path: "/api/facebook/page", denied: 401 },
  { method: "GET", path: "/api/facebook-page", denied: 401 },
  { method: "POST", path: "/api/facebook-page", denied: 401 },
  { method: "POST", path: "/api/gmail/disconnect", denied: 401 },
  { method: "POST", path: "/api/gmail/send", denied: 401 },
  { method: "GET", path: "/api/google-place", denied: 401 },
  { method: "POST", path: "/api/google-place", denied: 401 },
  { method: "POST", path: "/api/linkedin/disconnect", denied: 401 },
  { method: "GET", path: "/api/journal/export", denied: 401 },
  { method: "PATCH", path: "/api/leads/[id]", denied: 401 },
  { method: "GET", path: "/api/oauth/gmail/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/gmail/start", denied: "login" },
  { method: "GET", path: "/api/oauth/linkedin/start", denied: "login" },
  { method: "GET", path: "/api/oauth/linkedin/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/google/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/google/start", denied: "login" },
  { method: "GET", path: "/api/oauth/meta/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/meta/start", denied: "login" },
  { method: "GET", path: "/api/proposals", denied: 401 },
  { method: "PATCH", path: "/api/proposals/[id]", denied: 401 },
  { method: "POST", path: "/api/proposals/[id]/execute", denied: 401 },
  { method: "GET", path: "/api/proposals/[id]/revisions", denied: 401 },
  { method: "POST", path: "/api/proposals/[id]/restore", denied: 401 },
  { method: "POST", path: "/api/proposals/[id]/revise", denied: 401 },
  { method: "GET", path: "/api/proposals/[id]/versions", denied: 401 },
  { method: "POST", path: "/api/onboarding/interpret", denied: 401 },
  { method: "POST", path: "/api/entreprise/ambition", denied: 401 },
  { method: "POST", path: "/api/entreprise/marque", denied: 401 },
  { method: "POST", path: "/api/contents/[id]/photo", denied: 401 },
  { method: "GET", path: "/api/contents/[id]/visuel", denied: 401 },
  { method: "GET", path: "/api/site/photos", denied: 401 },
  { method: "POST", path: "/api/site/photos", denied: 401 },
  { method: "DELETE", path: "/api/site/photos/[id]", denied: 401 },
  { method: "PATCH", path: "/api/site/photos/[id]", denied: 401 },
  { method: "POST", path: "/api/site/republish", denied: 401 },
];

// Routes volontairement accessibles sans session, avec la raison.
const PUBLIC_ROUTES: Record<string, string> = {
  "/api/auth/login": "point d'entrée de la connexion",
  "/api/auth/logout": "revoque les sessions et efface le cookie de l'appelant (POST même origine)",
  "/api/auth/signup": "inscription publique avec création explicite de compte, à l'étape 5 du brouillon anonyme",
  "/api/bienvenue": "parcours d'entrée anonyme : brouillon lié au cookie pepito_draft, sans compte ni session (POST même origine)",
  "/api/bienvenue/analyse": "progression de l'analyse publique du brouillon (#280), lue avec le cookie pepito_draft, sans session (GET, état des rubriques seulement)",
  "/api/auth/forgot-password": "demande de lien de réinitialisation : réponse identique que le compte existe ou non (POST même origine)",
  "/api/auth/reset-password": "le jeton à usage unique du lien reçu par e-mail fait foi, sans session (POST même origine)",
  "/api/auth/verify-email": "le jeton à usage unique du lien reçu par e-mail fait foi, sans session (POST même origine)",
  "/api/cron/weekly-review": "protégée par CRON_SECRET, pas par la session",
  "/api/cron/publications": "protégée par CRON_SECRET, pas par la session (programmations, #261)",
  "/api/cron/drafts": "protégée par CRON_SECRET, pas par la session (purge des brouillons expirés)",
  "/api/health": "sonde publique sans donnée métier",
};

const GUARDED_PAGES = ["/admin", "/admin/risques", "/admin/entreprises/identifiant-inexistant", "/compte", "/connexions", "/dashboard", "/diagnostic", "/equipe", "/entreprise", "/prospection", "/rapport", "/studio/identifiant-inexistant"];

function requireSecret(): string {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for security tests.");
  return process.env.SESSION_SECRET;
}

function sessionCookie(email: string, sessionVersion = 0, now = Date.now(), secret = requireSecret()): string {
  return `pepito_session=${createSessionToken(email, sessionVersion, secret, now)}`;
}

function sessionSignature(cookie: string): string {
  return cookie.slice(cookie.indexOf("=") + 1).split(".")[1];
}

function openDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for security tests.");
  // Ces tests écrivent en base : refus par défaut de toute base non locale, pour ne jamais viser celle du prototype par erreur.
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
    throw new Error("Security tests refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

function call(request: APIRequestContext, route: Pick<Guarded, "method" | "path">, cookie?: string, data: unknown = {}) {
  return request.fetch(`${baseURL}${route.path.replace("[id]", "identifiant-inexistant")}`, {
    method: route.method,
    // Origin légitime : le refus attendu doit venir de la session, pas du contrôle d'origine.
    headers: { Origin: baseURL, ...(cookie ? { Cookie: cookie } : {}) },
    data: route.method === "GET" ? undefined : data,
    maxRedirects: 0,
  });
}

async function expectDenied(request: APIRequestContext, route: Guarded, cookie: string | undefined, label: string) {
  const response = await call(request, route, cookie);
  const where = `${route.method} ${route.path} (${label})`;
  if (route.denied === "login") {
    expect(response.status(), where).toBe(307);
    expect(new URL(response.headers().location, baseURL).pathname, where).toBe("/login");
  } else {
    expect(response.status(), where).toBe(route.denied);
  }
}

test("every API route is declared as guarded or deliberately public", () => {
  const apiRoot = join(process.cwd(), "src", "app", "api");
  const onDisk = (readdirSync(apiRoot, { recursive: true }) as string[])
    .filter((file) => file.endsWith(`${sep}route.ts`))
    .map((file) => `/api/${relative(apiRoot, join(apiRoot, file)).split(sep).slice(0, -1).join("/")}`)
    .sort();
  const declared = [...new Set([...GUARDED_ROUTES.map((route) => route.path), ...Object.keys(PUBLIC_ROUTES)])].sort();
  expect(onDisk, "Declare each new API route in tests/security.spec.ts").toEqual(declared);
});

test("missing, unsigned and forged session cookies are refused everywhere", async ({ request, page }) => {
  test.setTimeout(60000);
  const victim = "victime@example.invalid";
  const attacker = "attaquant@example.invalid";
  const victimPayload = createSessionToken(victim, 0, requireSecret()).split(".")[0];
  const attackerSignature = sessionSignature(sessionCookie(attacker));
  const forgeries: Record<string, string | undefined> = {
    "no cookie": undefined,
    "plain email, legacy cookie name": `pepito_session_email=${victim}`,
    "plain email": `pepito_session=${victim}`,
    "payload without signature": `pepito_session=${victimPayload}`,
    "signed with another secret": sessionCookie(victim, 0, Date.now(), "not-the-server-secret"),
    "another account's signature on the victim's email": `pepito_session=${victimPayload}.${attackerSignature}`,
    "truncated signature": sessionCookie(victim).slice(0, -1),
  };
  for (const [label, cookie] of Object.entries(forgeries)) {
    for (const route of GUARDED_ROUTES) await expectDenied(request, route, cookie, label);
    await page.context().clearCookies();
    if (cookie) {
      const separator = cookie.indexOf("=");
      await page.context().addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseURL }]);
    }
    for (const path of GUARDED_PAGES) {
      await page.goto(`${baseURL}${path}`);
      await expect(page, `${path} (${label})`).toHaveURL(`${baseURL}/login`);
      await expect(page.getByRole("button", { name: "Continuer", exact: true }), `${path} (${label})`).toBeVisible();
    }
  }
  const cron = await request.get(`${baseURL}/api/cron/weekly-review`, { headers: { Authorization: "Bearer wrong-secret" } });
  expect([401, 500]).toContain(cron.status());
  for (const authorization of [undefined, "Bearer wrong-secret"]) {
    const publications = await request.get(`${baseURL}/api/cron/publications`, { headers: authorization ? { Authorization: authorization } : {} });
    expect([401, 500]).toContain(publications.status());
    const drafts = await request.get(`${baseURL}/api/cron/drafts`, { headers: authorization ? { Authorization: authorization } : {} });
    expect([401, 500]).toContain(drafts.status());
  }
});

test("login does not create unknown accounts; signup is explicit", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-signup-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-valide";
  try {
    const missingLogin = await request.post(`${baseURL}/api/auth/login`, { data: { email, password } });
    expect(missingLogin.status()).toBe(404);
    expect((await missingLogin.json()).error).toContain("Aucun compte associé à cet email");
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(0);

    // Sans brouillon arrivé à l'étape 5, aucun compte (#279).
    const withoutDraft = await request.post(`${baseURL}/api/auth/signup`, { data: { email, password, passwordConfirmation: password } });
    expect(withoutDraft.status()).toBe(409);
    expect(await withoutDraft.json()).toMatchObject({ code: "M-10", href: "/bienvenue" });
    const early = await createTestDraft(prisma, { step: 4 });
    const earlySignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: early.cookie }, data: { email, password, passwordConfirmation: password } });
    expect(earlySignup.status()).toBe(409);
    expect(await earlySignup.json()).toMatchObject({ code: "M-10", href: "/bienvenue/missions" });
    const expired = await createTestDraft(prisma, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: expired.cookie }, data: { email, password, passwordConfirmation: password } })).status()).toBe(409);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(0);

    const draft = await createTestDraft(prisma);
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: draft.cookie }, data: { email, password, passwordConfirmation: "autre-mot-de-passe" } })).status()).toBe(400);
    const signup = await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: draft.cookie }, data: { email, password, passwordConfirmation: password } });
    expect(signup.status()).toBe(201);
    expect(signup.headers()["set-cookie"]).toContain("pepito_session=");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("httponly");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("expires=");
    expect(await signup.json()).toMatchObject({ hasCompany: true, href: "/strategie" });
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
    expect(await prisma.onboardingDraft.count({ where: { id: draft.id } })).toBe(0);

    // Adresse déjà utilisée : message neutre, brouillon conservé, aucun second compte.
    const other = await createTestDraft(prisma);
    const duplicateSignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: other.cookie }, data: { email, password, passwordConfirmation: password } });
    expect(duplicateSignup.status()).toBe(409);
    const duplicate = await duplicateSignup.json();
    expect(duplicate).toMatchObject({ code: "address_unavailable", recoverHref: "/login" });
    expect(duplicate.error).not.toMatch(/existe|a déjà un compte/);
    expect(duplicateSignup.headers()["set-cookie"]).toBeUndefined();
    expect(await prisma.onboardingDraft.count({ where: { id: other.id } })).toBe(1);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
    await prisma.onboardingDraft.deleteMany({ where: { id: { in: [early.id, expired.id, other.id] } } });
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("GH-281: the anonymous analysis cost becomes exactly one usage event of the new account, none when it cost nothing", async ({ request }) => {
  const prisma = openDatabase();
  const paidEmail = `security-analysis-cost-${randomUUID()}@example.invalid`;
  const freeEmail = `security-analysis-free-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-valide";
  const now = new Date().toISOString();
  const analysis = (cost: { usd: number; inputTokens: number; outputTokens: number; model?: string }) => ({
    runId: `run-${randomUUID()}`, status: "done", startedAt: now, finishedAt: now, input: { companyName: "Atelier Lumen", location: "Lyon", website: "" },
    rubrics: { site: { status: "unavailable", reason: "no_site" }, google: { status: "read" }, zone: { status: "read" }, identity: { status: "unavailable", reason: "no_site" } },
    findings: { trade: null, servingArea: null, targetClients: null, offers: null, tone: null, contacts: [], palette: null, logo: null, google: null, pages: [] }, cost,
  });
  try {
    const paid = await createTestDraft(prisma);
    await prisma.onboardingDraft.update({ where: { id: paid.id }, data: { analysis: analysis({ usd: 0.02, inputTokens: 3000, outputTokens: 200, model: "claude-sonnet-5-5" }) } });
    const paidSignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: paid.cookie }, data: { email: paidEmail, password, passwordConfirmation: password } });
    expect(paidSignup.status()).toBe(201);
    const paidCompany = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: paidEmail } });
    const events = await prisma.usageEvent.findMany({ where: { companyId: paidCompany.id, agent: "onboarding_analysis" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ model: "claude-sonnet-5-5", inputTokens: 3000, outputTokens: 200, costUsd: 0.02 });
    expect(await prisma.onboardingDraft.count({ where: { id: paid.id } })).toBe(0);

    const free = await createTestDraft(prisma);
    await prisma.onboardingDraft.update({ where: { id: free.id }, data: { analysis: analysis({ usd: 0, inputTokens: 0, outputTokens: 0 }) } });
    const freeSignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: free.cookie }, data: { email: freeEmail, password, passwordConfirmation: password } });
    expect(freeSignup.status()).toBe(201);
    const freeCompany = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: freeEmail } });
    expect(await prisma.usageEvent.count({ where: { companyId: freeCompany.id, agent: "onboarding_analysis" } })).toBe(0);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: { in: [paidEmail, freeEmail] } } });
    await prisma.$disconnect();
  }
});

test("GH-284: the cost of « Ce que nous retenons » becomes exactly one onboarding_synthesis event, none when it cost nothing", async ({ request }) => {
  const prisma = openDatabase();
  const paidEmail = `security-synthesis-cost-${randomUUID()}@example.invalid`;
  const freeEmail = `security-synthesis-free-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-valide";
  const ambition = (retainedCost: { usd: number; inputTokens: number; outputTokens: number; model?: string }) => ({
    text: DRAFT_AMBITION, terms: DRAFT_AMBITION_TERMS,
    retained: ["Atelier Lumen rénove l'électricité des particuliers à Lyon.", "Votre cap vise +20 % en 12 mois, à confirmer par vos premiers bilans."], retainedCost,
  });
  try {
    const paid = await createTestDraft(prisma);
    await prisma.onboardingDraft.update({ where: { id: paid.id }, data: { ambition: ambition({ usd: 0.003, inputTokens: 800, outputTokens: 120, model: "claude-sonnet-5-5" }) } });
    const paidSignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: paid.cookie }, data: { email: paidEmail, password, passwordConfirmation: password } });
    expect(paidSignup.status()).toBe(201);
    const paidCompany = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: paidEmail } });
    const events = await prisma.usageEvent.findMany({ where: { companyId: paidCompany.id, agent: "onboarding_synthesis" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ model: "claude-sonnet-5-5", inputTokens: 800, outputTokens: 120, costUsd: 0.003 });

    const free = await createTestDraft(prisma);
    await prisma.onboardingDraft.update({ where: { id: free.id }, data: { ambition: ambition({ usd: 0, inputTokens: 0, outputTokens: 0, model: "claude-sonnet-5-5" }) } });
    const freeSignup = await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: free.cookie }, data: { email: freeEmail, password, passwordConfirmation: password } });
    expect(freeSignup.status()).toBe(201);
    const freeCompany = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: freeEmail } });
    expect(await prisma.usageEvent.count({ where: { companyId: freeCompany.id, agent: "onboarding_synthesis" } })).toBe(0);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: { in: [paidEmail, freeEmail] } } });
    await prisma.$disconnect();
  }
});

test("sessions expire and logout or password changes revoke every active cookie", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-session-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: {
    ownerEmail: email, passwordHash: await hashPassword("ancien-mot-de-passe"), name: "Session Test", trade: "Artisan", servingArea: "Paris",
  } });
  const firstSession = sessionCookie(email, company.sessionVersion);
  const secondSession = sessionCookie(email, company.sessionVersion);
  const expiredSession = sessionCookie(email, company.sessionVersion, Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
  try {
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: firstSession } })).status()).toBe(200);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: expiredSession } })).status()).toBe(401);

    const passwordChange = await request.post(`${baseURL}/api/auth/password`, {
      headers: { Cookie: firstSession, Origin: baseURL },
      data: { currentPassword: "ancien-mot-de-passe", newPassword: "nouveau-mot-de-passe" },
    });
    expect(passwordChange.status()).toBe(200);
    expect(await passwordChange.json()).toEqual({ passwordChanged: true, reconnectRequired: true });
    for (const cookie of [firstSession, secondSession]) {
      expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: cookie } })).status()).toBe(401);
    }

    const login = await request.post(`${baseURL}/api/auth/login`, { data: { email: ` ${email.toUpperCase()} `, password: "nouveau-mot-de-passe" } });
    expect(login.status()).toBe(200);
    const renewedCookie = login.headers()["set-cookie"].split(";")[0];
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);

    const forgedLogout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: "https://attacker.invalid" }, maxRedirects: 0 });
    expect(forgedLogout.status()).toBe(403);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);
    const logout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: baseURL }, maxRedirects: 0 });
    // 303 : le navigateur suit en GET (une 307 renvoyait le POST vers /login, page statique : 405).
    expect(logout.status()).toBe(303);
    expect(new URL(logout.headers()["location"], baseURL).pathname).toBe("/login");
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(401);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).sessionVersion).toBe(2);
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("an account created before lowercase e-mails logs in whatever the case typed, and its session works", async ({ request }) => {
  const prisma = openDatabase();
  const stored = `Legacy-Case-${randomUUID()}@Example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail: stored, passwordHash: await hashPassword("mot-de-passe-ancien"), name: "Casse Test", trade: "Artisan", servingArea: "Paris" } });
  try {
    const login = await request.post(`${baseURL}/api/auth/login`, { data: { email: stored.toLowerCase(), password: "mot-de-passe-ancien" } });
    expect(login.status()).toBe(200);
    const cookie = login.headers()["set-cookie"].split(";")[0];
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: cookie } })).status()).toBe(200);
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("five wrong passwords lock the account, even for the right password", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-lock-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-correct";
  const login = (candidate: string) => request.post(`${baseURL}/api/auth/login`, { data: { email, password: candidate } });
  try {
    const draft = await createTestDraft(prisma);
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { Cookie: draft.cookie }, data: { email, password, passwordConfirmation: password } })).status()).toBe(201);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrong = await login("mauvais-mot-de-passe");
      expect(wrong.status(), `attempt ${attempt}`).toBe(401);
      expect(wrong.headers()["set-cookie"], `attempt ${attempt}`).toBeUndefined();
    }
    expect((await login("mauvais-mot-de-passe")).status()).toBe(429);
    const locked = await login(password);
    expect(locked.status()).toBe(429);
    expect(locked.headers()["set-cookie"]).toBeUndefined();
    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email } });
    expect(company.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Le verrou expiré, le bon mot de passe reconnecte et remet le compteur à zéro.
    await prisma.company.update({ where: { id: company.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login(password)).status()).toBe(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).failedLoginAttempts).toBe(0);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("one IP cannot flood login or signup, and other IPs and successful logins are unaffected", async ({ request, playwright }) => {
  const prisma = openDatabase();
  const email = `security-ip-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-correct";
  const flooder = { "x-real-ip": `test-${randomUUID()}` };
  const bystander = { "x-real-ip": `test-${randomUUID()}` };
  const login = (address: Record<string, string>, who = `absent-${randomUUID()}@example.invalid`, candidate = "mauvais-mot-de-passe") =>
    request.post(`${baseURL}/api/auth/login`, { headers: address, data: { email: who, password: candidate } });
  try {
    const draft = await createTestDraft(prisma);
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { ...bystander, Cookie: draft.cookie }, data: { email, password, passwordConfirmation: password } })).status()).toBe(201);
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect((await login(flooder)).status(), `attempt ${attempt}`).toBe(404);
    }
    const blocked = await login(flooder);
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
    // Même un compte valide est refusé depuis l'IP bloquée, mais pas depuis une autre.
    expect((await login(flooder, email, password)).status()).toBe(429);
    expect((await login(bystander, email, password)).status()).toBe(200);

    // Les connexions réussies sont rendues : elles ne consomment pas la limite.
    const regular = { "x-real-ip": `test-${randomUUID()}` };
    for (let attempt = 1; attempt <= 25; attempt++) {
      expect((await login(regular, email, password)).status(), `success ${attempt}`).toBe(200);
    }

    // Le brouillon est conservé quand l'adresse est déjà utilisée : le même sert à chaque essai.
    const registrar = { "x-real-ip": `test-${randomUUID()}`, Cookie: (await createTestDraft(prisma)).cookie };
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await request.post(`${baseURL}/api/auth/signup`, { headers: registrar, data: { email, password, passwordConfirmation: password } })).status(), `signup ${attempt}`).toBe(409);
    }
    const signupBlocked = await request.post(`${baseURL}/api/auth/signup`, { headers: registrar, data: { email, password, passwordConfirmation: password } });
    expect(signupBlocked.status()).toBe(429);
    expect(Number(signupBlocked.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);

    // Brouillons anonymes : 20 par IP et par jour ; une autre IP n'est pas touchée.
    // Un contexte neuf par visiteur : ni la session ni le brouillon d'un appel précédent ne sont renvoyés.
    const starter = { "x-real-ip": `test-${randomUUID()}`, Origin: baseURL };
    const discover = async (headers: Record<string, string>) => {
      const visitor = await playwright.request.newContext();
      try {
        const response = await visitor.post(`${baseURL}/api/bienvenue`, { headers, data: { action: "discover", firstName: "Claire", companyName: "Atelier", location: "Lyon" } });
        const [status, responseHeaders] = [response.status(), response.headers()];
        return { status: () => status, headers: () => responseHeaders };
      } finally {
        await visitor.dispose();
      }
    };
    const createdDrafts: string[] = [];
    for (let attempt = 1; attempt <= 20; attempt++) {
      const response = await discover(starter);
      // Au-delà de 3 analyses par IP (#280), le brouillon est créé sans analyse : 429, mais l'étape 2 reste ouverte.
      expect(response.status(), `draft ${attempt}`).toBe(attempt <= 3 ? 200 : 429);
      createdDrafts.push(/pepito_draft=([^;]+)/.exec(response.headers()["set-cookie"] ?? "")?.[1] ?? "");
    }
    expect(createdDrafts.every(Boolean)).toBe(true);
    const draftBlocked = await discover(starter);
    expect(draftBlocked.status()).toBe(429);
    expect(draftBlocked.headers()["set-cookie"] ?? "").not.toContain("pepito_draft=");
    expect(Number(draftBlocked.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await discover({ "x-real-ip": `test-${randomUUID()}`, Origin: baseURL })).status()).toBe(200);
    const hashes = createdDrafts.map((token) => createHash("sha256").update(token).digest("hex"));
    expect(await prisma.onboardingDraft.count({ where: { tokenHash: { in: hashes } } })).toBe(20);
    await prisma.onboardingDraft.deleteMany({ where: { tokenHash: { in: hashes } } });
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("malformed or oversized input gets a clear 4xx, never a server error", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-input-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail: email, name: "Input Test", trade: "Artisan", servingArea: "Paris" } });
  const planItem = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "marketing", title: "Action", rationale: "Raison", timing: "bientôt" } });
  const proposal = await prisma.agentProposal.create({ data: { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post", content: "Contenu" } });
  const card = await prisma.paulPendingAction.create({ data: {
    companyId: company.id, type: "update_profile", payload: { website: "https://atelier-input.fr" }, expiresAt: new Date(Date.now() + 3_600_000),
  } });
  const cookie = sessionCookie(email, company.sessionVersion);
  const send = (method: string, path: string, body: string, authenticated = true) => request.fetch(`${baseURL}${path}`, {
    method,
    headers: { Origin: baseURL, "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) },
    data: body,
    maxRedirects: 0,
  });
  const long = (length: number) => "x".repeat(length);
  try {
    const targets: [string, string, boolean?][] = [
      ["POST", "/api/auth/login", false],
      ["POST", "/api/auth/signup", false],
      ["POST", "/api/bienvenue", false],
      ["POST", "/api/auth/verify-email", false],
      ["POST", "/api/auth/forgot-password", false],
      ["POST", "/api/auth/reset-password", false],
      ["POST", "/api/action-plan"],
      ["PATCH", `/api/action-plan/${planItem.id}`],
      ["POST", "/api/companies"],
      ["POST", "/api/companies/direction"],
      ["POST", "/api/companies/outreach"],
      ["PATCH", `/api/proposals/${proposal.id}`],
      ["POST", `/api/co-ceo/pending-actions/${card.id}`],
    ];
    for (const [method, path, authenticated] of targets) {
      for (const body of ["pas du json", "null", "[]", "\"texte\"", "42"]) {
        expect((await send(method, path, body, authenticated)).status(), `${method} ${path} ${body}`).toBe(400);
      }
    }

    const oversized: [string, string, unknown, boolean?][] = [
      ["POST", "/api/auth/login", { email: `${long(250)}@example.invalid`, password: "mot-de-passe" }, false],
      ["POST", "/api/auth/login", { email: "a@example.invalid", password: long(1025) }, false],
      ["POST", "/api/auth/signup", { email: `${long(250)}@example.invalid`, password: "mot-de-passe" }, false],
      ["POST", "/api/auth/signup", { email: "a@example.invalid", password: long(1025) }, false],
      ["POST", "/api/action-plan", { agent: "marketing", title: long(301), rationale: "Raison" }],
      ["POST", "/api/action-plan", { agent: "marketing", title: "Titre", rationale: long(3001) }],
      ["PATCH", `/api/action-plan/${planItem.id}`, { status: "ecarte", feedback: long(1001) }],
      ["PATCH", `/api/action-plan/${planItem.id}`, { status: "ecarte", feedback: 12 }],
      ["POST", "/api/companies", { name: long(161), trade: "Artisan", servingArea: "Paris" }],
      ["POST", "/api/companies", { name: ["Nom"], trade: "Artisan", servingArea: "Paris" }],
      ["POST", "/api/companies", { name: "Nom", trade: "Artisan", servingArea: "Paris", monthlyRevenue: 5_000_000_000 }],
      ["POST", "/api/companies", { name: "Nom", trade: "Artisan", servingArea: "Paris", description: long(2001) }],
      ["POST", "/api/companies", { name: "Nom", trade: "Artisan", servingArea: "Paris", targetDate: 5 }],
      ["POST", "/api/companies", { name: "Nom", trade: "Artisan", servingArea: "Paris", newClientsPerMonth: "0.55" }],
      ["POST", `/api/co-ceo/pending-actions/${card.id}`, { decision: "valider" }],
      ["POST", "/api/companies/direction", { direction: long(2001) }],
      ["PATCH", `/api/proposals/${proposal.id}`, { status: "brouillon", content: long(100_001), expectedVersion: 1 }],
      ["PATCH", `/api/proposals/${proposal.id}`, { leadSource: long(2001) }],
    ];
    for (const [method, path, body, authenticated] of oversized) {
      const response = await send(method, path, JSON.stringify(body), authenticated);
      expect(response.status(), `${method} ${path} ${JSON.stringify(body).slice(0, 80)}`).toBe(400);
      expect(typeof (await response.json()).error).toBe("string");
    }
    expect(await prisma.company.count({ where: { ownerEmail: { startsWith: "a@example" } } })).toBe(0);
    // Une carte de Paul ne se confirme pas depuis une autre origine.
    const forged = await request.post(`${baseURL}/api/co-ceo/pending-actions/${card.id}`, { headers: { Cookie: cookie, Origin: "https://attacker.invalid" }, data: { decision: "confirm" } });
    expect(forged.status()).toBe(403);
    // Le parcours d'entrée ne crée aucun brouillon depuis une autre origine (#279).
    const forgedDraft = await request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: "https://attacker.invalid" }, data: { action: "discover", firstName: "Claire", companyName: "Atelier", location: "Lyon" } });
    expect(forgedDraft.status()).toBe(403);
    expect(forgedDraft.headers()["set-cookie"] ?? "").not.toContain("pepito_draft=");
    expect((await prisma.paulPendingAction.findUniqueOrThrow({ where: { id: card.id } })).status).toBe("pending");
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("account deletion needs the password and an explicit confirmation, then erases every linked row", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-delete-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-correct";
  const company = await prisma.company.create({ data: {
    ownerEmail: email, passwordHash: await hashPassword(password), name: "Delete Test", trade: "Artisan", servingArea: "Paris",
  } });
  await prisma.channelConnection.create({ data: { companyId: company.id, channel: "instagram", status: "connecte", accessToken: "jeton-a-effacer" } });
  await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "marketing", title: "Action", rationale: "Raison", timing: "bientôt" } });
  await prisma.agentProposal.create({ data: { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post", content: "Contenu" } });
  await prisma.chatMessage.create({ data: { companyId: company.id, role: "user", content: "Bonjour" } });
  const other = await prisma.company.create({ data: { ownerEmail: `security-delete-other-${randomUUID()}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Lyon" } });
  const cookie = sessionCookie(email, company.sessionVersion);
  const remove = (data: unknown, headers: Record<string, string> = { Origin: baseURL, Cookie: cookie }) =>
    request.post(`${baseURL}/api/companies/delete`, { headers, data });
  const linked = () => Promise.all([
    prisma.channelConnection.count({ where: { companyId: company.id } }),
    prisma.actionPlanItem.count({ where: { companyId: company.id } }),
    prisma.agentProposal.count({ where: { companyId: company.id } }),
    prisma.chatMessage.count({ where: { companyId: company.id } }),
  ]);
  try {
    expect((await remove({ confirmed: true, password }, { Origin: "https://attacker.invalid", Cookie: cookie })).status()).toBe(403);
    expect((await remove({ password })).status()).toBe(400);
    expect((await remove({ confirmed: true })).status()).toBe(400);
    expect((await remove({ confirmed: true, password: "mauvais-mot-de-passe" })).status()).toBe(401);
    expect(await linked()).toEqual([1, 1, 1, 1]);

    const deleted = await remove({ confirmed: true, password });
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toMatchObject({ deleted: true });
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(0);
    expect(await linked()).toEqual([0, 0, 0, 0]);
    expect(await prisma.company.count({ where: { id: other.id } })).toBe(1);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: cookie } })).status()).toBe(401);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    await prisma.$disconnect();
  }
});

test("only an explicit administrator can configure company agent quotas", async ({ request }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Quota administration requires ADMIN_EMAILS, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const ownerEmail = `security-quota-${randomUUID()}@example.invalid`;
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin quota test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const company = await prisma.company.create({ data: { ownerEmail, name: "Quota test", trade: "Artisan", servingArea: "Paris" } });
  const original = {
    dailyAgentRunLimit: company.dailyAgentRunLimit,
    monthlyAgentRunLimit: company.monthlyAgentRunLimit,
    dailyChatMessageLimit: company.dailyChatMessageLimit,
    monthlyChatMessageLimit: company.monthlyChatMessageLimit,
    dailySpendLimitUsd: company.dailySpendLimitUsd,
    monthlySpendLimitUsd: company.monthlySpendLimitUsd,
  };
  const path = `${baseURL}/api/admin/companies/${company.id}/limits`;
  const adminHeaders = { Cookie: sessionCookie(adminEmail, adminCompany.sessionVersion), Origin: baseURL };
  const userHeaders = { Cookie: sessionCookie(ownerEmail, company.sessionVersion), Origin: baseURL };
  try {
    expect((await request.patch(path, { headers: userHeaders, data: original })).status()).toBe(403);
    expect((await request.patch(path, { headers: { ...adminHeaders, Origin: "https://attacker.invalid" }, data: original })).status()).toBe(403);
    expect((await request.patch(path, { headers: adminHeaders, data: { ...original, dailyAgentRunLimit: 31, monthlyAgentRunLimit: 30 } })).status()).toBe(400);
    // Story 4.1 : messages à Paul, jour au plus égal au mois.
    const chatRefused = await request.patch(path, { headers: adminHeaders, data: { ...original, dailyChatMessageLimit: 501, monthlyChatMessageLimit: 500 } });
    expect(chatRefused.status()).toBe(400);
    expect((await chatRefused.json()).error).toContain("messages à Paul");
    expect((await request.patch(path, { headers: adminHeaders, data: { ...original, monthlyChatMessageLimit: undefined } })).status()).toBe(400);
    const limits = { dailyAgentRunLimit: 4, monthlyAgentRunLimit: 30, dailyChatMessageLimit: 60, monthlyChatMessageLimit: 600, dailySpendLimitUsd: 2.5, monthlySpendLimitUsd: 20 };
    const updated = await request.patch(path, { headers: adminHeaders, data: limits });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({ companyId: company.id, ...limits });
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject(limits);
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("an explicit administrator closes or caps signups, and the server enforces it", async ({ request, page }) => {
  test.setTimeout(90000);
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Signup control requires ADMIN_EMAILS, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const password = "mot-de-passe-valide";
  const created: string[] = [];
  const fresh = () => { const email = `security-cap-${randomUUID()}@example.invalid`; created.push(email); return email; };
  // Une adresse IP distincte par appel : la limite par IP ne doit pas masquer ce que ce test vérifie.
  // Et un brouillon à l'étape 5 par appel (#279).
  const signup = async (email: string) => request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: (await createTestDraft(prisma)).cookie }, data: { email, password, passwordConfirmation: password } });
  const openAccountStep = async () => {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_draft", value: (await createTestDraft(prisma)).token, url: baseURL }]);
    await page.goto(`${baseURL}/bienvenue/compte`);
  };
  const today = signupDayKey(new Date());
  const controlPath = `${baseURL}/api/admin/signup-control`;
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin signup test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const previousControl = await prisma.signupControl.findUnique({ where: { id: "global" } });
  const previousDay = await prisma.signupDay.findUnique({ where: { day: today } });
  const adminCookie = sessionCookie(adminEmail, adminCompany.sessionVersion);
  const adminHeaders = { Cookie: adminCookie, Origin: baseURL };
  const setControl = (data: unknown) => request.patch(controlPath, { headers: adminHeaders, data });
  try {
    expect((await request.patch(controlPath, { headers: { ...adminHeaders, Origin: "https://attacker.invalid" }, data: { open: false } })).status()).toBe(403);
    for (const invalid of [{ open: true, dailyCap: 0 }, { open: true, dailyCap: 2.5 }, { dailyCap: 5 }, "texte"]) {
      expect((await setControl(invalid)).status(), JSON.stringify(invalid)).toBe(400);
    }

    // Fermées : refus côté serveur sans compte créé, message sur la page, connexion des comptes existants inchangée.
    const existing = fresh();
    await prisma.company.create({ data: { ownerEmail: existing, passwordHash: await hashPassword(password), name: "Existant", trade: "Artisan", servingArea: "Paris" } });
    expect((await setControl({ open: false, dailyCap: null })).status()).toBe(200);
    const closedEmail = fresh();
    const closed = await signup(closedEmail);
    expect(closed.status()).toBe(403);
    expect((await closed.json()).error).toContain("fermées");
    expect(closed.headers()["set-cookie"]).toBeUndefined();
    expect(await prisma.company.count({ where: { ownerEmail: closedEmail } })).toBe(0);
    await openAccountStep();
    await expect(page.getByText("Les inscriptions sont fermées pour le moment.")).toBeVisible();
    await expect(page.getByLabel("Adresse e-mail")).toHaveCount(0);
    const login = await request.post(`${baseURL}/api/auth/login`, { headers: { "x-real-ip": `test-${randomUUID()}` }, data: { email: existing, password } });
    expect(login.status()).toBe(200);

    // Un seul emplacement, deux inscriptions simultanées : une seule est acceptée.
    await prisma.signupDay.deleteMany({ where: { day: today } });
    expect((await setControl({ open: true, dailyCap: 1 })).status()).toBe(200);
    const [first, second] = [fresh(), fresh()];
    const raced = await Promise.all([signup(first), signup(second)]);
    expect(raced.map((response) => response.status()).sort()).toEqual([201, 429]);
    const refused = raced.find((response) => response.status() === 429)!;
    expect((await refused.json()).error).toContain("revenez demain");
    expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.company.count({ where: { ownerEmail: { in: [first, second] } } })).toBe(1);
    expect((await prisma.signupDay.findUniqueOrThrow({ where: { day: today } })).count).toBe(1);
    await openAccountStep();
    await expect(page.getByText("Inscriptions complètes aujourd'hui, revenez demain.")).toBeVisible();

    // Un e-mail déjà inscrit ne consomme pas d'emplacement ; le compteur du jour et l'alerte s'affichent dans l'administration.
    await prisma.signupDay.deleteMany({ where: { day: today } });
    expect((await setControl({ open: true, dailyCap: 2 })).status()).toBe(200);
    const taken = fresh();
    expect((await signup(taken)).status()).toBe(201);
    expect((await signup(taken)).status()).toBe(409);
    expect((await prisma.signupDay.findUniqueOrThrow({ where: { day: today } })).count).toBe(1);
    expect((await signup(fresh())).status()).toBe(201);
    expect((await signup(fresh())).status()).toBe(429);
    expect((await prisma.signupDay.findUniqueOrThrow({ where: { day: today } })).count).toBe(2);
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: adminCookie.slice(adminCookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByRole("heading", { name: "Inscriptions", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administration", exact: true })).toBeVisible();
    await expect(page.getByText("Le plafond du jour est atteint")).toBeVisible();
    await expect(page.getByText("2 inscriptions aujourd'hui sur 2")).toBeVisible();
  } finally {
    if (previousControl) {
      await prisma.signupControl.update({ where: { id: "global" }, data: { open: previousControl.open, dailyCap: previousControl.dailyCap, updatedBy: previousControl.updatedBy } });
    } else {
      await prisma.signupControl.deleteMany({ where: { id: "global" } });
    }
    if (previousDay) {
      await prisma.signupDay.upsert({ where: { day: today }, create: { day: today, count: previousDay.count }, update: { count: previousDay.count } });
    } else {
      await prisma.signupDay.deleteMany({ where: { day: today } });
    }
    await prisma.company.deleteMany({ where: { ownerEmail: { in: created } } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await page.context().clearCookies();
    await prisma.$disconnect();
  }
});

test("a signed-in user who is not listed in ADMIN_EMAILS neither sees nor reaches the administration", async ({ request, page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const email = `security-noadmin-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail: email, name: "Sans admin", trade: "Artisan", servingArea: "Paris" } });
  const cookie = sessionCookie(email, company.sessionVersion);
  try {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: cookie.slice(cookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByText("Accès réservé")).toBeVisible();
    await expect(page.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);
    await page.goto(`${baseURL}/compte`);
    await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);
    const removal = await request.delete(`${baseURL}/api/admin/companies/${company.id}`, { headers: { Cookie: cookie, Origin: baseURL } });
    expect(removal.status()).toBe(403);
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(1);
  } finally {
    await page.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("an unverified address blocks Paul and every send until the emailed link is used once", async ({ request, page }) => {
  test.setTimeout(90000);
  const smtp = process.env.SERVICE_SMTP_URL ? new URL(process.env.SERVICE_SMTP_URL) : null;
  test.skip(!smtp || smtp.protocol !== "smtp:" || smtp.hostname !== "127.0.0.1", "Requires SERVICE_SMTP_URL=smtp://127.0.0.1:<port> on the server, as configured in CI.");
  const prisma = openDatabase();
  const sink = await startSmtpSink(Number(smtp!.port));
  const email = `security-verify-${randomUUID()}@example.invalid`;
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const tokenIn = (mail: { text: string }) => /\/verifier-email\?token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1] ?? "";
  const headers = (cookie: string) => ({ Cookie: cookie, Origin: baseURL });
  const verify = (token: string) => request.post(`${baseURL}/api/auth/verify-email`, { headers: { Origin: baseURL, "x-real-ip": `test-${randomUUID()}` }, data: { token } });
  try {
    // Le blocage n'existe que si REQUIRE_EMAIL_VERIFICATION=true est posée sur le serveur, comme en CI (#279).
    test.skip(process.env.REQUIRE_EMAIL_VERIFICATION !== "true", "Requires REQUIRE_EMAIL_VERIFICATION=true on the server, as configured in CI.");
    const draft = await createTestDraft(prisma);
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}`, Cookie: draft.cookie }, data: { email, password: "mot-de-passe-valide", passwordConfirmation: "mot-de-passe-valide" } })).status()).toBe(201);
    await expect.poll(() => sink.messages.length, { timeout: 15000 }).toBe(1);
    expect(sink.messages[0]).toMatchObject({ to: [email], subject: "Confirmez votre adresse e-mail BienDecider" });
    const first = tokenIn(sink.messages[0]);
    expect(first).toHaveLength(43);

    // Seule l'empreinte du jeton est conservée ; le compte n'est pas confirmé.
    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email } });
    expect(company.emailVerifiedAt).toBeNull();
    await prisma.company.update({ where: { id: company.id }, data: { name: "Sans confirmation", trade: "Artisan", servingArea: "Paris" } });
    expect(await prisma.emailToken.findMany({ where: { companyId: company.id } })).toMatchObject([{ kind: "verify_email", tokenHash: sha(first), usedAt: null }]);
    expect(await prisma.emailToken.count({ where: { tokenHash: first } })).toBe(0);
    const cookie = sessionCookie(email, company.sessionVersion);

    // Rien ne consomme de budget IA ni ne part vers l'extérieur, avant tout appel au modèle ou à un fournisseur.
    const paul = await request.post(`${baseURL}/api/co-ceo/message`, { headers: headers(cookie), data: { message: "Bonjour" } });
    expect(paul.status()).toBe(429);
    expect(await paul.json()).toMatchObject({ reason: "email_not_verified", error: "Confirmez votre adresse e-mail avant toute diffusion." });
    const gmail = await request.post(`${baseURL}/api/gmail/send`, { headers: headers(cookie), data: {} });
    expect(gmail.status()).toBe(403);
    expect((await gmail.json()).error).toContain("Confirmez votre adresse e-mail");
    expect((await request.post(`${baseURL}/api/proposals/identifiant-inexistant/execute`, { headers: headers(cookie), data: {} })).status()).toBe(403);
    expect(await prisma.usageReservation.count({ where: { companyId: company.id } })).toBe(0);

    // Bandeau : renvoi limité à un par minute, puis nouveau lien qui annule l'ancien.
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: cookie.slice(cookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/compte`);
    const banner = page.getByTestId("email-verification-banner");
    await expect(banner).toContainText("Confirmez votre adresse e-mail avant toute diffusion.");
    await banner.getByRole("button", { name: "Renvoyer le lien" }).click();
    await expect(banner).toContainText("Réessayez dans");
    expect(sink.messages).toHaveLength(1);
    await prisma.emailToken.updateMany({ where: { companyId: company.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await banner.getByRole("button", { name: "Renvoyer le lien" }).click();
    await expect(banner).toContainText("Un nouveau lien vient d'être envoyé.");
    await expect.poll(() => sink.messages.length, { timeout: 15000 }).toBe(2);
    const second = tokenIn(sink.messages[1]);
    expect(second).not.toBe(first);
    expect((await verify(first)).status()).toBe(400);

    // Le chargement de la page ne consomme pas le jeton ; le clic le consomme une seule fois.
    await page.goto(`${baseURL}/verifier-email?token=${second}`);
    expect((await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: sha(second) } })).usedAt).toBeNull();
    await page.getByRole("button", { name: "Confirmer mon adresse" }).click();
    await expect(page.getByText("Votre adresse e-mail est confirmée.")).toBeVisible();
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).emailVerifiedAt).not.toBeNull();
    expect((await verify(second)).status()).toBe(400);

    // Un jeton expiré ou mal formé est refusé sans distinction.
    const expired = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({ data: { companyId: company.id, kind: "verify_email", tokenHash: sha(expired), expiresAt: new Date(Date.now() - 1000) } });
    for (const token of [expired, "trop-court", "", 42]) {
      const response = await verify(token as string);
      expect(response.status(), String(token)).toBe(400);
    }
    expect((await request.post(`${baseURL}/api/auth/verify-email`, { headers: { Origin: "https://attacker.invalid" }, data: { token: second } })).status()).toBe(403);

    // Confirmée : les envois ne sont plus refusés pour ce motif, et le bandeau disparaît.
    const afterGmail = await request.post(`${baseURL}/api/gmail/send`, { headers: headers(cookie), data: {} });
    expect((await afterGmail.json().catch(() => ({}))).error ?? "").not.toContain("Confirmez votre adresse e-mail");
    await page.goto(`${baseURL}/compte`);
    await expect(page.getByTestId("email-verification-banner")).toHaveCount(0);
  } finally {
    await page.context().clearCookies();
    await sink.close();
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("password recovery: a one-hour single-use link replaces the password, closes sessions and never reveals which accounts exist", async ({ request, page }) => {
  test.setTimeout(120000);
  const smtp = process.env.SERVICE_SMTP_URL ? new URL(process.env.SERVICE_SMTP_URL) : null;
  test.skip(!smtp || smtp.protocol !== "smtp:" || smtp.hostname !== "127.0.0.1", "Requires SERVICE_SMTP_URL=smtp://127.0.0.1:<port> on the server, as configured in CI.");
  const prisma = openDatabase();
  const sink = await startSmtpSink(Number(smtp!.port));
  const email = `security-reset-${randomUUID()}@example.invalid`;
  const shortEmail = `security-short-${randomUUID()}@example.invalid`;
  const oldPassword = "ancien-mot-de-passe";
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const tokenIn = (mail: { text: string }) => /\/reinitialiser\?token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1] ?? "";
  const ip = () => ({ "x-real-ip": `test-${randomUUID()}` });
  const forgot = (who: string, headers: Record<string, string> = ip()) => request.post(`${baseURL}/api/auth/forgot-password`, { headers: { Origin: baseURL, ...headers }, data: { email: who } });
  const reset = (token: string, password: string) => request.post(`${baseURL}/api/auth/reset-password`, { headers: { Origin: baseURL, "x-real-ip": `test-${randomUUID()}` }, data: { token, password } });
  const login = (who: string, password: string) => request.post(`${baseURL}/api/auth/login`, { headers: ip(), data: { email: who, password } });
  const company = await prisma.company.create({ data: {
    ownerEmail: email, passwordHash: await hashPassword(oldPassword), name: "Reset Test", trade: "Artisan", servingArea: "Paris",
    emailVerifiedAt: null, failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 600_000),
  } });
  const legacy = await prisma.company.create({ data: { ownerEmail: shortEmail, passwordHash: await hashPassword("abc123"), name: "Legacy", trade: "Artisan", servingArea: "Paris" } });
  const oldSession = sessionCookie(email, company.sessionVersion);
  try {
    // Un mot de passe existant de 6 caractères continue de fonctionner à la connexion ; la règle de 8 caractères ne vaut que pour les nouveaux.
    expect((await login(shortEmail, "abc123")).status()).toBe(200);
    // Cookie explicite : la session ouverte par la connexion ci-dessus n'est pas renvoyée (une session refuse l'inscription, 409).
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { ...ip(), Cookie: "pepito_draft=absent" }, data: { email: `security-pw-${randomUUID()}@example.invalid`, password: "1234567" } })).status()).toBe(400);
    const change = await request.post(`${baseURL}/api/auth/password`, { headers: { Cookie: sessionCookie(shortEmail, legacy.sessionVersion), Origin: baseURL }, data: { currentPassword: "abc123", newPassword: "1234567" } });
    expect(change.status()).toBe(400);
    expect((await change.json()).error).toBe("Le mot de passe doit contenir au moins 8 caractères.");

    // Même réponse pour un compte connu et inconnu ; rien n'est envoyé à une adresse inconnue.
    const known = await forgot(email);
    const unknown = await forgot(`inconnu-${randomUUID()}@example.invalid`);
    expect(known.status()).toBe(200);
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    await expect.poll(() => sink.messages.length, { timeout: 15000 }).toBe(1);
    expect(sink.messages[0]).toMatchObject({ to: [email], subject: "Réinitialisez votre mot de passe BienDecider" });
    const first = tokenIn(sink.messages[0]);
    expect(first).toHaveLength(43);
    expect(await prisma.emailToken.findMany({ where: { companyId: company.id } })).toMatchObject([{ kind: "reset_password", tokenHash: sha(first), usedAt: null }]);
    expect(await prisma.emailToken.count({ where: { tokenHash: first } })).toBe(0);
    expect((await forgot(email)).status()).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(sink.messages).toHaveLength(1);

    // Mot de passe trop court : refusé sans consommer le lien. Un jeton d'un autre type ou expiré est refusé.
    const tooShort = await reset(first, "1234567");
    expect(tooShort.status()).toBe(400);
    expect((await tooShort.json()).error).toBe("Le mot de passe doit contenir au moins 8 caractères.");
    expect((await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: sha(first) } })).usedAt).toBeNull();
    const verifyKind = randomBytes(32).toString("base64url");
    const expired = randomBytes(32).toString("base64url");
    await prisma.emailToken.createMany({ data: [
      { companyId: company.id, kind: "verify_email", tokenHash: sha(verifyKind), expiresAt: new Date(Date.now() + 3_600_000) },
      { companyId: company.id, kind: "reset_password", tokenHash: sha(expired), expiresAt: new Date(Date.now() - 1000) },
    ] });
    for (const token of [verifyKind, expired, "trop-court"]) expect((await reset(token, "un-nouveau-mot-de-passe")).status(), token).toBe(400);
    expect((await request.post(`${baseURL}/api/auth/reset-password`, { headers: { Origin: "https://attacker.invalid" }, data: { token: first, password: "un-nouveau-mot-de-passe" } })).status()).toBe(403);

    // Le lien remplace le mot de passe, ferme les sessions, lève le verrouillage et confirme l'adresse, une seule fois.
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: oldSession } })).status()).toBe(200);
    expect((await reset(first, "un-nouveau-mot-de-passe")).status()).toBe(200);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: oldSession } })).status()).toBe(401);
    expect((await login(email, oldPassword)).status()).toBe(401);
    expect((await login(email, "un-nouveau-mot-de-passe")).status()).toBe(200);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).emailVerifiedAt).not.toBeNull();
    expect((await reset(first, "encore-un-autre-mot-de-passe")).status()).toBe(400);

    // Parcours dans l'interface : demande, puis nouveau mot de passe avec confirmation.
    await prisma.emailToken.updateMany({ where: { companyId: company.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await page.goto(`${baseURL}/mot-de-passe-oublie`);
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.getByText("Si un compte existe pour cette adresse, un lien vient d'être envoyé.")).toBeVisible();
    await expect.poll(() => sink.messages.length, { timeout: 15000 }).toBe(2);
    const second = tokenIn(sink.messages[1]);
    await page.goto(`${baseURL}/reinitialiser?token=${second}`);
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("interface-mot-de-passe");
    await page.getByLabel("Confirmation du mot de passe").fill("interface-autre-chose");
    await page.getByRole("button", { name: "Changer mon mot de passe" }).click();
    await expect(page.getByText("Les deux mots de passe ne correspondent pas.")).toBeVisible();
    expect((await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: sha(second) } })).usedAt).toBeNull();
    await page.getByLabel("Confirmation du mot de passe").fill("interface-mot-de-passe");
    await page.getByRole("button", { name: "Changer mon mot de passe" }).click();
    await expect(page.getByText("Votre mot de passe a été modifié.")).toBeVisible();
    expect((await login(email, "interface-mot-de-passe")).status()).toBe(200);

    // Au plus cinq demandes par heure et par adresse IP.
    const flooder = ip();
    for (let attempt = 1; attempt <= 5; attempt++) expect((await forgot(`inconnu-${randomUUID()}@example.invalid`, flooder)).status(), `attempt ${attempt}`).toBe(200);
    const blocked = await forgot(`inconnu-${randomUUID()}@example.invalid`, flooder);
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  } finally {
    await sink.close();
    await prisma.company.deleteMany({ where: { id: { in: [company.id, legacy.id] } } });
    await prisma.$disconnect();
  }
});

test("suspending a company cuts its sessions and launches but keeps its data and public site; deletion needs its name", async ({ request, page }) => {
  test.setTimeout(90000);
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const password = "mot-de-passe-valide";
  const email = `security-suspend-${randomUUID()}@example.invalid`;
  const slug = `suspension-${randomUUID().slice(0, 8)}`;
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin suspension test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const company = await prisma.company.create({ data: {
    ownerEmail: email, passwordHash: await hashPassword(password), name: "Atelier Suspendu", trade: "Artisan", servingArea: "Paris", siteSlug: slug, siteHtml: "<p>Site public conservé</p>", sitePublishedAt: new Date(),
  } });
  const adminCookie = sessionCookie(adminEmail, adminCompany.sessionVersion);
  const userCookie = sessionCookie(email, company.sessionVersion);
  const admin = { Cookie: adminCookie, Origin: baseURL };
  const suspension = `${baseURL}/api/admin/companies/${company.id}/suspension`;
  const login = (who: string, secret: string) => request.post(`${baseURL}/api/auth/login`, { headers: { "x-real-ip": `test-${randomUUID()}` }, data: { email: who, password: secret } });
  try {
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: userCookie } })).status()).toBe(200);

    // Refus : non-administrateur, autre origine, corps invalide, son propre compte, entreprise inconnue.
    expect((await request.patch(suspension, { headers: { Cookie: userCookie, Origin: baseURL }, data: { suspended: true } })).status()).toBe(403);
    expect((await request.patch(suspension, { headers: { ...admin, Origin: "https://attacker.invalid" }, data: { suspended: true } })).status()).toBe(403);
    expect((await request.patch(suspension, { headers: admin, data: { suspended: "oui" } })).status()).toBe(400);
    expect((await request.patch(`${baseURL}/api/admin/companies/${adminCompany.id}/suspension`, { headers: admin, data: { suspended: true } })).status()).toBe(400);
    expect((await request.patch(`${baseURL}/api/admin/companies/identifiant-inexistant/suspension`, { headers: admin, data: { suspended: true } })).status()).toBe(404);

    // Suspension : la session ouverte est coupée, la connexion refusée avec le bon mot de passe seulement.
    expect((await request.patch(suspension, { headers: admin, data: { suspended: true } })).status()).toBe(200);
    const firstDate = (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).suspendedAt;
    expect(firstDate).not.toBeNull();
    expect((await request.patch(suspension, { headers: admin, data: { suspended: true } })).status()).toBe(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).suspendedAt?.getTime()).toBe(firstDate!.getTime());
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: userCookie } })).status()).toBe(401);
    const refused = await login(email, password);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toContain("Ce compte est suspendu.");
    expect(refused.headers()["set-cookie"]).toBeUndefined();
    expect((await login(email, "mauvais-mot-de-passe")).status()).toBe(401);

    // Données et site public conservés.
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(1);
    expect((await request.get(`${baseURL}/site/${slug}`)).status()).toBe(200);

    // L'administration montre l'état.
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: adminCookie.slice(adminCookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByText("Suspendue", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Réactiver" }).first()).toBeVisible();

    // Réactivation : tout refonctionne.
    expect((await request.patch(suspension, { headers: admin, data: { suspended: false } })).status()).toBe(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).suspendedAt).toBeNull();
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: userCookie } })).status()).toBe(200);
    expect((await login(email, password)).status()).toBe(200);

    // Suppression définitive : le nom exact est exigé, et seul un administrateur peut la demander.
    const deletion = `${baseURL}/api/admin/companies/${company.id}`;
    expect((await request.delete(deletion, { headers: { Cookie: userCookie, Origin: baseURL }, data: { confirmName: "Atelier Suspendu" } })).status()).toBe(403);
    expect((await request.delete(deletion, { headers: { ...admin, Origin: "https://attacker.invalid" }, data: { confirmName: "Atelier Suspendu" } })).status()).toBe(403);
    for (const data of [{}, { confirmName: "atelier suspendu" }, { confirmName: "" }, { confirmName: 42 }]) {
      expect((await request.delete(deletion, { headers: admin, data })).status(), JSON.stringify(data)).toBe(400);
    }
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(1);
    expect((await request.delete(deletion, { headers: admin, data: { confirmName: "Atelier Suspendu" } })).status()).toBe(200);
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(0);
  } finally {
    await page.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: company.id } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("the activity page of a company is for administrators only, scoped to that company, and never shows a secret", async ({ page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const marker = randomUUID().slice(0, 8);
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin activity test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const target = await prisma.company.create({ data: { ownerEmail: `security-activity-${marker}@example.invalid`, passwordHash: "hash-que-la-page-ne-lit-jamais", name: `Cible ${marker}`, trade: "Plombier", servingArea: "Lyon" } });
  const other = await prisma.company.create({ data: { ownerEmail: `security-activity-other-${marker}@example.invalid`, name: `Autre ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const empty = await prisma.company.create({ data: { ownerEmail: `security-activity-empty-${marker}@example.invalid`, name: `Vide ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const secrets = "Bearer abcdef1234567890SECRETTOKEN password=hunter2-motdepasse sk-ant-api03-abcdefghijklmnopqrstuvwx postgresql://user:dbpassword@db.example.invalid:5432/prod";
  await prisma.agentRun.create({ data: { companyId: target.id, agent: "marketing", requestKey: randomUUID(), payload: { kind: "plan_generation" }, status: "failed", failureReason: "outage", errorMessage: `Échec fournisseur : ${secrets}`, resultCount: 0, finishedAt: new Date() } });
  await prisma.agentRun.create({ data: { companyId: other.id, agent: "contenu", requestKey: randomUUID(), payload: { kind: "plan_generation" }, status: "failed", failureReason: "outage", errorMessage: `Erreur privée de l'autre entreprise ${marker}`, resultCount: 0, finishedAt: new Date() } });
  const cookieFor = (email: string, version: number) => { const cookie = sessionCookie(email, version); return { name: "pepito_session", value: cookie.slice(cookie.indexOf("=") + 1), url: baseURL }; };
  try {
    // Un dirigeant simple ne voit rien.
    await page.context().clearCookies();
    await page.context().addCookies([cookieFor(other.ownerEmail, other.sessionVersion)]);
    await page.goto(`${baseURL}/admin/entreprises/${target.id}`);
    await expect(page.getByText("Accès réservé")).toBeVisible();
    expect(await page.content()).not.toContain(`Cible ${marker}`);

    // L'administrateur voit les lancements de cette entreprise seulement, sans secret.
    await page.context().clearCookies();
    await page.context().addCookies([cookieFor(adminEmail, adminCompany.sessionVersion)]);
    await page.goto(`${baseURL}/admin/entreprises/${target.id}`);
    await expect(page.getByRole("heading", { name: `Activité de Cible ${marker}` })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Échec", exact: true }).first()).toBeVisible();
    const html = await page.content();
    expect(html).toContain("Bearer [masqué]");
    for (const secret of ["SECRETTOKEN", "hunter2", "abcdefghijklmnopqrstuvwx", "dbpassword", "hash-que-la-page-ne-lit-jamais"]) expect(html, secret).not.toContain(secret);
    expect(html).not.toContain(`Erreur privée de l'autre entreprise ${marker}`);

    // Entreprise sans lancement : état vide ; identifiant inconnu : introuvable.
    await page.goto(`${baseURL}/admin/entreprises/${empty.id}`);
    await expect(page.getByText("Aucun lancement pour cette entreprise.")).toBeVisible();
    await page.goto(`${baseURL}/admin/entreprises/identifiant-inexistant`);
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();

    // Lien depuis la liste des entreprises.
    await page.goto(`${baseURL}/admin`);
    await expect(page.locator(`a[href="/admin/entreprises/${target.id}"]`)).toBeVisible();
  } finally {
    await page.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: { in: [target.id, other.id, empty.id] } } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("feedback is attached to the session company, validated, rate limited and mailed to the administrators", async ({ request }) => {
  test.setTimeout(60000);
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-feedback-a-${marker}@example.invalid`, name: `Feedback A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-feedback-b-${marker}@example.invalid`, name: `Feedback B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const post = (company: typeof a, data: unknown, extra: Record<string, string> = {}) => request.post(`${baseURL}/api/feedback`, { headers: { ...headers(company), ...extra }, data });
  const smtp = process.env.SERVICE_SMTP_URL ? new URL(process.env.SERVICE_SMTP_URL) : null;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  const sink = smtp && smtp.protocol === "smtp:" && smtp.hostname === "127.0.0.1" && admins.length > 0 ? await startSmtpSink(Number(smtp.port)) : null;
  try {
    expect((await request.post(`${baseURL}/api/feedback`, { headers: { Origin: baseURL }, data: { kind: "problem", text: "Sans session" } })).status()).toBe(401);
    expect((await request.post(`${baseURL}/api/feedback`, { headers: { Cookie: headers(a).Cookie, Origin: "https://attacker.invalid" }, data: { kind: "problem", text: "Autre origine" } })).status()).toBe(403);
    for (const data of [{}, { kind: "autre", text: "x" }, { kind: "problem", text: "   " }, { kind: "problem", text: "x".repeat(1001) }, "texte"]) {
      expect((await post(a, data)).status(), JSON.stringify(data)).toBe(400);
    }
    expect(await prisma.feedback.count({ where: { companyId: a.id } })).toBe(0);

    // Le texte hostile est conservé tel quel ; l'identifiant d'entreprise du corps est ignoré ; seul le chemin de la page est gardé.
    const hostile = `<script>alert("${marker}")</script>`;
    const sent = await post(a, { kind: "confusion", text: hostile, page: "/equipe?token=secret#frag", companyId: b.id });
    expect(sent.status()).toBe(201);
    expect(await prisma.feedback.findMany({ where: { companyId: b.id } })).toHaveLength(0);
    expect(await prisma.feedback.findMany({ where: { companyId: a.id } })).toMatchObject([{ kind: "confusion", text: hostile, page: "/equipe", handledAt: null }]);

    if (sink) {
      await expect.poll(() => sink.messages.length, { timeout: 15000 }).toBe(admins.length);
      expect(sink.messages.flatMap((message) => message.to).sort()).toEqual([...admins].sort());
      expect(sink.messages[0].subject).toContain(`Feedback A ${marker}`);
      expect(sink.messages[0].text).toContain("Page : /equipe");
      expect(sink.messages[0].text).toContain(hostile);
    }

    // Limite : 10 par heure et par entreprise, au-delà 429 avec Retry-After ; l'autre entreprise n'est pas touchée.
    for (let index = 1; index < 10; index++) expect((await post(a, { kind: "problem", text: `Signalement ${index}` })).status()).toBe(201);
    const limited = await post(a, { kind: "problem", text: "Le onzième" });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.feedback.count({ where: { companyId: a.id } })).toBe(10);
    expect((await post(b, { kind: "idea", text: "Une idée" })).status()).toBe(201);
  } finally {
    await sink?.close();
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("feedback is listed for administrators only, shown as text, and can be marked handled", async ({ request, page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const marker = randomUUID().slice(0, 8);
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin feedback test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const user = await prisma.company.create({ data: { ownerEmail: `security-feedback-list-${marker}@example.invalid`, name: `Dirigeant ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const hostile = `<b id="hostile-${marker}">gras</b> & <script>window.__feedback${marker}=1</script>`;
  const item = await prisma.feedback.create({ data: { companyId: user.id, kind: "problem", page: "/plan", text: hostile } });
  const adminCookie = sessionCookie(adminEmail, adminCompany.sessionVersion);
  const patch = (headers: Record<string, string>, data: unknown) => request.patch(`${baseURL}/api/admin/feedback/${item.id}`, { headers, data });
  try {
    expect((await patch({ Cookie: sessionCookie(user.ownerEmail, user.sessionVersion), Origin: baseURL }, { handled: true })).status()).toBe(403);
    expect((await patch({ Cookie: adminCookie, Origin: "https://attacker.invalid" }, { handled: true })).status()).toBe(403);
    expect((await patch({ Cookie: adminCookie, Origin: baseURL }, { handled: "oui" })).status()).toBe(400);
    expect((await request.patch(`${baseURL}/api/admin/feedback/inexistant`, { headers: { Cookie: adminCookie, Origin: baseURL }, data: { handled: true } })).status()).toBe(404);
    expect((await prisma.feedback.findUniqueOrThrow({ where: { id: item.id } })).handledAt).toBeNull();

    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: adminCookie.slice(adminCookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    const row = page.locator(`tr[data-feedback-id="${item.id}"]`);
    await expect(row).toContainText(hostile);
    await expect(row).toContainText(`Dirigeant ${marker}`);
    await expect(row).toContainText("/plan");
    await expect(row).toContainText("À traiter");
    expect(await page.locator(`#hostile-${marker}`).count()).toBe(0);
    expect(await page.evaluate((name) => (window as unknown as Record<string, unknown>)[name], `__feedback${marker}`)).toBeUndefined();
    await row.getByRole("button", { name: "Marquer traité" }).click();
    await expect(row).toContainText("Traité");
    expect((await prisma.feedback.findUniqueOrThrow({ where: { id: item.id } })).handledAt).not.toBeNull();
    await row.getByRole("button", { name: "Remettre à traiter" }).click();
    await expect(row).toContainText("À traiter");
    expect((await prisma.feedback.findUniqueOrThrow({ where: { id: item.id } })).handledAt).toBeNull();
  } finally {
    await page.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: user.id } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("every company is on the V5.2 workspace: its pages need a session, old addresses lead to them, and a mission stays in its company", async ({ page: browser }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const user = await prisma.company.create({ data: { ownerEmail: `security-v52-${marker}@example.invalid`, name: `Espace ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const other = await prisma.company.create({ data: { ownerEmail: `security-v52-other-${marker}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Paris" } });
  const userCookie = sessionCookie(user.ownerEmail, user.sessionVersion);
  // Les pages diffusent leur contenu en continu : la redirection se constate dans le navigateur, par l'adresse finale.
  const landing = async (target: string, signedIn: boolean) => {
    await browser.context().clearCookies();
    if (signedIn) await browser.context().addCookies([{ name: "pepito_session", value: userCookie.slice(userCookie.indexOf("=") + 1), url: baseURL }]);
    await browser.goto(`${baseURL}${target}`);
    await browser.waitForLoadState("networkidle");
    return new URL(browser.url()).pathname;
  };
  try {
    expect(user.workspaceV52).toBe(true);
    for (const target of ["/strategie", "/missions", "/missions/nouvelle", "/atelier", "/resultats"]) {
      expect(await landing(target, false), target).toBe("/login");
      expect(await landing(target, true), target).toBe(target);
    }
    for (const [from, to] of [["/dashboard", "/strategie"], ["/cockpit", "/strategie"], ["/equipe", "/strategie"], ["/prospection", "/missions"], ["/rapport", "/resultats"]]) {
      expect(await landing(from, true), from).toBe(to);
    }
    const foreign = await prisma.mission.create({ data: { companyId: other.id, template: "custom", title: "Mission \u00e9trang\u00e8re", outcome: "Rien \u00e0 voir", originalOutcome: "Rien \u00e0 voir", finding: "Une autre entreprise", position: 1 } });
    await landing(`/missions/${foreign.id}`, true);
    await expect(browser.getByText("Mission \u00e9trang\u00e8re")).toHaveCount(0);
  } finally {
    await browser.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
});

test("missions and credits belong to the session company: validated, refused across companies and origins, one debit", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-missions-a-${marker}@example.invalid`, name: `Missions A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-missions-b-${marker}@example.invalid`, name: `Missions B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const create = (company: typeof a, data: unknown, extra: Record<string, string> = {}) => request.post(`${baseURL}/api/missions`, { headers: { ...headers(company), ...extra }, data });
  const transition = (company: typeof a, id: string, data: unknown) => request.post(`${baseURL}/api/missions/${id}/transition`, { headers: headers(company), data });
  const body = { template: "social_post", title: "Publier un chantier", outcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers de novembre" } };
  try {
    expect((await request.post(`${baseURL}/api/missions`, { headers: { Origin: baseURL }, data: body })).status()).toBe(401);
    expect((await create(a, body, { Origin: "https://attacker.invalid" })).status()).toBe(403);
    expect((await create(a, "texte")).status()).toBe(400);
    const refused = await create(a, { ...body, title: "abc" });
    expect(refused.status()).toBe(422);
    expect(await refused.json()).toMatchObject({ code: "M-20" });
    expect(await (await create(a, { ...body, template: "leads" })).json()).toMatchObject({ code: "M-76" });
    expect(await (await create(a, { ...body, channel: "instagram" })).json()).toMatchObject({ code: "M-67", error: "Instagram n'est pas disponible pour le moment. Choisissez un autre canal." });

    // Le corps ne choisit jamais l'entreprise : une mission est toujours celle de la session.
    const made = await create(a, { ...body, companyId: b.id, status: "active", version: 9 });
    expect(made.status()).toBe(201);
    const mission = (await made.json()).mission;
    expect(mission).toMatchObject({ companyId: a.id, status: "proposed", version: 1, createdBy: "owner" });
    expect(await prisma.mission.count({ where: { companyId: b.id } })).toBe(0);
    expect((await (await request.get(`${baseURL}/api/missions`, { headers: headers(b) })).json()).missions).toHaveLength(0);
    expect((await (await request.get(`${baseURL}/api/missions`, { headers: headers(a) })).json()).missions).toHaveLength(1);
    const catalogue = (await (await request.get(`${baseURL}/api/missions/catalogue`, { headers: headers(a) })).json()).templates as { key: string; channels: { key: string }[] }[];
    expect(catalogue.map((template) => template.key)).toEqual(["agencies", "social_post", "site_page", "custom"]);
    expect(catalogue.flatMap((template) => template.channels.map((channel) => channel.key))).not.toContain("instagram");

    // Transitions : autre entreprise, autre origine, corps illisible, version perimee.
    expect((await transition(b, mission.id, { action: "launch", expectedVersion: 1 })).status()).toBe(404);
    expect((await request.post(`${baseURL}/api/missions/${mission.id}/transition`, { headers: { ...headers(a), Origin: "https://attacker.invalid" }, data: { action: "launch", expectedVersion: 1 } })).status()).toBe(403);
    expect((await transition(a, mission.id, { action: "detruire", expectedVersion: 1 })).status()).toBe(400);
    expect((await transition(a, mission.id, { action: "launch" })).status()).toBe(400);
    const stale = await transition(a, mission.id, { action: "launch", expectedVersion: 7 });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "M-02" });

    // Lancement : un seul debit de 3 credits, solde et historique de l'API.
    const launched = await transition(a, mission.id, { action: "launch", expectedVersion: 1 });
    expect(launched.status()).toBe(200);
    expect(await launched.json()).toMatchObject({ mission: { status: "active", version: 2 }, balance: 17 });
    const again = await transition(a, mission.id, { action: "launch", expectedVersion: 2 });
    expect(await again.json()).toMatchObject({ mission: { status: "active", version: 2 }, balance: null });
    const credits = await (await request.get(`${baseURL}/api/credits`, { headers: headers(a) })).json();
    expect(credits).toMatchObject({ balance: 17, history: [{ delta: -3, balanceAfter: 17 }, { delta: 20, balanceAfter: 20 }] });
    expect(await (await request.get(`${baseURL}/api/credits`, { headers: headers(b) })).json()).toMatchObject({ balance: 20, history: [{ delta: 20 }] });

    // Credits insuffisants : refus M-15 avec le besoin et le solde.
    await prisma.company.update({ where: { id: b.id }, data: { creditBalance: 1 } });
    const second = await (await create(b, body)).json();
    const broke = await transition(b, second.mission.id, { action: "launch", expectedVersion: 1 });
    expect(broke.status()).toBe(422);
    expect(await broke.json()).toMatchObject({ code: "M-15", error: "Crédits insuffisants : il en faut 3, il vous en reste 1." });
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("mission contents belong to the session company: versions, validation and refusal decided by the server", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-contents-a-${marker}@example.invalid`, name: `Contenus A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-contents-b-${marker}@example.invalid`, name: `Contenus B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const mission = await prisma.mission.create({ data: { companyId: a.id, template: "social_post", channel: "facebook", title: "Publier un chantier", outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers" }, position: 1 } });
  const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, versions: { create: { number: 1, title: "Nos chantiers de novembre", body: "Une salle de bains refaite à neuf.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });
  const act = (company: typeof a, data: unknown, extra: Record<string, string> = {}) => request.post(`${baseURL}/api/contents/${content.id}`, { headers: { ...headers(company), ...extra }, data });
  try {
    expect((await request.post(`${baseURL}/api/contents/${content.id}`, { headers: { Origin: baseURL }, data: { action: "validate", number: 1 } })).status()).toBe(401);
    expect((await act(a, { action: "validate", number: 1, reviewed: true }, { Origin: "https://attacker.invalid" })).status()).toBe(403);
    expect((await act(b, { action: "validate", number: 1, reviewed: true })).status()).toBe(404);
    expect((await request.post(`${baseURL}/api/missions/${mission.id}/content`, { headers: headers(b) })).status()).toBe(404);
    expect((await act(a, { action: "publier", number: 1 })).status()).toBe(400);
    expect((await act(a, { action: "validate" })).status()).toBe(400);
    expect(await (await act(a, { action: "validate", number: 4, reviewed: true })).json()).toMatchObject({ code: "M-02" });

    // Le premier brouillon existe déjà : il est rendu tel quel, sans appel à Paul.
    const prepared = await request.post(`${baseURL}/api/missions/${mission.id}/content`, { headers: headers(a) });
    expect(prepared.status()).toBe(201);
    expect(await prepared.json()).toMatchObject({ contentId: content.id, currentNumber: 1 });

    // Validation : mission en cours (M-47), case « J'ai relu » (M-77), puis trace « Aucun envoi effectué ».
    expect(await (await act(a, { action: "validate", number: 1, reviewed: true })).json()).toMatchObject({ code: "M-47" });
    await prisma.mission.update({ where: { id: mission.id }, data: { status: "active" } });
    expect(await (await act(a, { action: "validate", number: 1, reviewed: false })).json()).toMatchObject({ code: "M-77" });
    expect((await act(a, { action: "validate", number: 1, reviewed: true })).status()).toBe(200);
    expect(await prisma.missionContent.findUnique({ where: { id: content.id } })).toMatchObject({ validatedNumber: 1 });
    expect(await prisma.journalEntry.findFirst({ where: { companyId: a.id, code: "J-20" } })).toMatchObject({ params: { n: "1", titre: "Nos chantiers de novembre" } });

    // Retouche : nouvelle version, validation retirée ; le corps ne choisit ni l'auteur ni le numéro.
    const saved = await act(a, { action: "save", number: 1, title: "Nos chantiers", body: "Une salle de bains refaite.", author: "paul", currentNumber: 9 });
    expect(await saved.json()).toMatchObject({ currentNumber: 2 });
    expect(await prisma.missionContent.findUnique({ where: { id: content.id } })).toMatchObject({ currentNumber: 2, validatedNumber: null });
    expect(await prisma.contentVersion.findFirst({ where: { contentId: content.id, number: 2 } })).toMatchObject({ author: "owner", note: "Retouche directe par vous" });
    expect(await (await act(a, { action: "save", number: 2, title: "", body: "x" })).json()).toMatchObject({ code: "M-16", error: "Accroche doit être compris entre 1 et 100 caractères." });

    // Refus : motif obligatoire, gardé sur la version.
    expect(await (await act(a, { action: "reject", number: 2, reason: "" })).json()).toMatchObject({ code: "M-16" });
    expect((await act(a, { action: "reject", number: 2, reason: "Trop commercial" })).status()).toBe(200);
    expect(await prisma.contentVersion.findFirst({ where: { contentId: content.id, number: 2 } })).toMatchObject({ rejectionReason: "Trop commercial" });

    // Proposition de Paul : rien à garder (M-02), puis gardée contre 1 crédit, une seule fois.
    expect((await act(a, { action: "accept_variant", number: 2 })).status()).toBe(409);
    await prisma.missionContent.update({ where: { id: content.id }, data: { suggestion: { basedOn: 2, variant: { kind: "shorter", instruction: null }, title: "Chantier livré", body: "Salle de bains refaite." } } });
    const kept = await act(a, { action: "accept_variant", number: 2 });
    expect(await kept.json()).toMatchObject({ currentNumber: 3, balance: 19 });
    expect((await act(a, { action: "accept_variant", number: 3 })).status()).toBe(409);
    expect(await prisma.creditLedger.count({ where: { companyId: a.id, kind: "paul_version" } })).toBe(1);
    expect(await prisma.missionContent.count({ where: { companyId: b.id } })).toBe(0);

    // Mission arrêtée : le contenu reste en lecture seule (M-44).
    await prisma.mission.update({ where: { id: mission.id }, data: { status: "stopped" } });
    expect(await (await act(a, { action: "save", number: 3, title: "Autre", body: "Autre texte" })).json()).toMatchObject({ code: "M-44" });
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("brand confirmation gates visual validation, versions each visual and keeps archives unchanged (#290)", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-brand-a-${marker}@example.invalid`, name: `Marque A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-brand-b-${marker}@example.invalid`, name: `Marque B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a, origin = baseURL) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: origin });
  const mission = await prisma.mission.create({ data: { companyId: a.id, template: "social_post", channel: "facebook", title: "Publier un chantier", outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers" }, status: "active", position: 1 } });
  const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, versions: { create: { number: 1, title: "Nos chantiers de novembre", body: "Une salle de bains refaite à neuf.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });
  const act = (data: unknown) => request.post(`${baseURL}/api/contents/${content.id}`, { headers: headers(a), data });
  const brand = (company: typeof a, data: unknown, origin = baseURL) => request.post(`${baseURL}/api/entreprise/marque`, { headers: headers(company, origin), data });
  const kit = { primary: "#1f5f4a", accent: "#e0a030", tone: "clair", confirmed: true };
  const versions = () => prisma.contentVersion.findMany({ where: { contentId: content.id }, orderBy: { number: "asc" } });
  try {
    // Formulaire : origine, case obligatoire, couleurs et ton valides.
    expect((await brand(a, kit, "https://attacker.invalid")).status()).toBe(403);
    expect(await (await brand(a, { ...kit, confirmed: false })).json()).toMatchObject({ errors: { confirmed: expect.any(String) } });
    expect(await (await brand(a, { ...kit, primary: "vert", tone: "drôle" })).json()).toMatchObject({ errors: { primary: expect.any(String), tone: expect.any(String) } });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: a.id } })).brandConfirmedAt).toBeNull();

    // Un visuel est ajouté : nouvelle version, sans instantané tant que la marque n'est pas confirmée ; sa validation est refusée (M-93).
    expect(await (await act({ action: "set_visual", number: 1, composition: "inconnue" })).json()).toMatchObject({ code: "M-95" });
    expect(await (await act({ action: "set_visual", number: 1, composition: "photo_signature" })).json()).toMatchObject({ currentNumber: 2 });
    expect(await prisma.missionContent.findUniqueOrThrow({ where: { id: content.id } })).toMatchObject({ visualComposition: "photo_signature" });
    expect((await versions())[1]).toMatchObject({ note: "Visuel : Photo & signature", brandSnapshot: null });
    expect(await (await act({ action: "validate", number: 2, reviewed: true })).json()).toMatchObject({ code: "M-93", error: "Confirmez votre marque avant de valider un visuel." });
    const image = await request.get(`${baseURL}/api/contents/${content.id}/visuel?n=2`, { headers: headers(a) });
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/svg+xml");
    expect(await image.text()).toContain(a.name);
    expect((await request.get(`${baseURL}/api/contents/${content.id}/visuel?n=2`, { headers: headers(b) })).status()).toBe(404);
    expect((await request.get(`${baseURL}/api/contents/${content.id}/visuel?n=1`, { headers: headers(a) })).status()).toBe(404);

    // Première confirmation : le visuel reçoit une version à valider, avec l'instantané de la marque ; J-32 au journal.
    expect(await (await brand(a, kit)).json()).toMatchObject({ ok: true, changed: true });
    expect(await prisma.company.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ brandPrimary: "#1f5f4a", brandAccent: "#e0a030", brandTone: "clair" });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: a.id } })).brandConfirmedAt).not.toBeNull();
    expect((await versions())[2]).toMatchObject({ number: 3, author: "system", note: "Marque modifiée : visuel à valider à nouveau", brandSnapshot: { primary: "#1f5f4a", tone: "clair", composition: "photo_signature", name: a.name } });
    expect(await prisma.journalEntry.count({ where: { companyId: a.id, code: "J-32" } })).toBe(1);
    expect((await act({ action: "validate", number: 3, reviewed: true })).status()).toBe(200);

    // Marque inchangée : rien n'est écrit. Marque modifiée : version suivante, validation retirée, l'archive garde l'ancienne marque.
    expect(await (await brand(a, kit)).json()).toMatchObject({ ok: true, changed: false });
    expect((await versions()).length).toBe(3);
    expect(await (await brand(a, { ...kit, primary: "#123456", tone: "expert" })).json()).toMatchObject({ ok: true, changed: true });
    const after = await versions();
    expect(after.length).toBe(4);
    expect(after[3]).toMatchObject({ brandSnapshot: { primary: "#123456", tone: "expert" } });
    expect(after[2]).toMatchObject({ brandSnapshot: { primary: "#1f5f4a", tone: "clair" } });
    expect(await prisma.missionContent.findUniqueOrThrow({ where: { id: content.id } })).toMatchObject({ currentNumber: 4, validatedNumber: null });
    expect(await prisma.journalEntry.count({ where: { companyId: a.id, code: "J-32" } })).toBe(2);
    const archive = await (await request.get(`${baseURL}/api/contents/${content.id}/visuel?n=3`, { headers: headers(a) })).text();
    expect(archive).toContain("#1f5f4a");
    expect(archive).not.toContain("#123456");

    // Un visuel programmé : modifier la marque est refusé (M-94) ; rien n'est écrit.
    expect((await act({ action: "validate", number: 4, reviewed: true })).status()).toBe(200);
    await prisma.publication.create({ data: { companyId: a.id, missionId: mission.id, contentId: content.id, versionNumber: 4, title: "Nos chantiers de novembre", channel: "facebook", channelLabel: "Page Facebook", mode: "confirmed", status: "scheduled", scheduledAt: new Date(Date.now() + 86_400_000), timezone: "Europe/Paris", idempotencyKey: `brand-${marker}` } });
    expect(await (await brand(a, { ...kit, primary: "#654321" })).json()).toMatchObject({ code: "M-94" });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: a.id } })).brandPrimary).toBe("#123456");
    expect((await versions()).length).toBe(4);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("a visual photo is controlled by the server, carried by versions, and its rights are confirmed per version (#291)", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-photo-a-${marker}@example.invalid`, name: `Photo A ${marker}`, trade: "Artisan", servingArea: "Paris", brandPrimary: "#1f5f4a", brandAccent: "#e0a030", brandTone: "clair", brandConfirmedAt: new Date() } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-photo-b-${marker}@example.invalid`, name: `Photo B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a, origin = baseURL) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: origin });
  const mission = await prisma.mission.create({ data: { companyId: a.id, template: "social_post", channel: "facebook", title: "Publier un chantier", outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers" }, status: "active", position: 1 } });
  const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, visualComposition: "photo_signature", versions: { create: { number: 1, title: "Nos chantiers de novembre", body: "Une salle de bains refaite à neuf.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });
  const act = (data: unknown) => request.post(`${baseURL}/api/contents/${content.id}`, { headers: headers(a), data });
  const upload = (company: typeof a, fields: { file?: { name: string; mimeType: string; buffer: Buffer }; alt?: string; number?: string }, id = content.id, origin = baseURL) => {
    const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
    if (fields.file) multipart.file = fields.file;
    if (fields.alt !== undefined) multipart.alt = fields.alt;
    if (fields.number !== undefined) multipart.number = fields.number;
    return request.post(`${baseURL}/api/contents/${id}/photo`, { headers: headers(company, origin), multipart });
  };
  const png = (width: number, height: number, extra = 0) => {
    const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 0, 0, 0, 0, 0, 8, 2, 0, 0, 0]);
    head.writeUInt32BE(width, 16);
    head.writeUInt32BE(height, 20);
    return Buffer.concat([head, Buffer.alloc(extra)]);
  };
  const file = (buffer: Buffer, name = "photo.png") => ({ name, mimeType: "image/png", buffer });
  const versions = () => prisma.contentVersion.findMany({ where: { contentId: content.id }, orderBy: { number: "asc" } });
  try {
    // Contrôles du fichier, décidés par le serveur avant tout stockage.
    expect((await upload(a, { file: file(png(800, 600)), alt: "Salle", number: "1" }, content.id, "https://attacker.invalid")).status()).toBe(403);
    expect((await upload(a, { alt: "Salle", number: "1" })).status()).toBe(400);
    expect((await upload(a, { file: file(png(800, 600)), alt: "  ", number: "1" })).status()).toBe(400);
    expect((await upload(a, { file: file(png(800, 600)), alt: "Salle", number: "x" })).status()).toBe(400);
    expect(await (await upload(a, { file: file(png(800, 600, 1024 * 1024)), alt: "Salle", number: "1" })).json()).toMatchObject({ error: expect.stringContaining("1 Mo") });
    expect((await upload(a, { file: file(Buffer.from("<svg onload=alert(1)></svg>"), "photo.png"), alt: "Salle", number: "1" })).status()).toBe(415);
    expect((await upload(a, { file: file(png(0, 0)), alt: "Salle", number: "1" })).status()).toBe(415);
    expect((await upload(b, { file: file(png(800, 600)), alt: "Salle", number: "1" })).status()).toBe(404);
    // Version obsolète : refusée avant le stockage, rien n'est rattaché.
    expect(await (await upload(a, { file: file(png(800, 600)), alt: "Salle", number: "7" })).json()).toMatchObject({ code: "M-02" });
    expect((await versions()).length).toBe(1);

    // Version portant une photo : les droits sont demandés en plus de la relecture (M-96), puis portés par la version.
    const photo = { url: "https://blob.example.invalid/photo.jpg", pathname: `content-photos/${a.id}/${content.id}/p1.jpg`, alt: "Salle de bains refaite", width: 800, height: 600 };
    await prisma.contentVersion.create({ data: { contentId: content.id, number: 2, title: "Nos chantiers de novembre", body: "Une salle de bains refaite à neuf.", author: "owner", note: "Photo importée par vous, droits à reconfirmer", photo } });
    await prisma.missionContent.update({ where: { id: content.id }, data: { currentNumber: 2 } });
    expect(await (await act({ action: "validate", number: 2, reviewed: true })).json()).toMatchObject({ code: "M-96", error: expect.stringContaining("droits d'utilisation") });
    expect(await (await act({ action: "validate", number: 2, reviewed: true, rights: false })).json()).toMatchObject({ code: "M-96" });
    expect(await prisma.missionContent.findUniqueOrThrow({ where: { id: content.id } })).toMatchObject({ validatedNumber: null });
    expect((await act({ action: "validate", number: 2, reviewed: true, rights: true })).status()).toBe(200);
    expect((await versions())[1].rightsConfirmedAt).not.toBeNull();
    const image = await (await request.get(`${baseURL}/api/contents/${content.id}/visuel?n=2`, { headers: headers(a) })).text();
    expect(image).toContain(photo.url);
    expect(image).toContain("Photo : Salle de bains refaite");

    // Tout changement invalide les droits : la version suivante garde la photo, mais pas la confirmation.
    expect(await (await act({ action: "save", number: 2, title: "Nos chantiers", body: "Une salle de bains refaite." })).json()).toMatchObject({ currentNumber: 3 });
    const third = (await versions())[2];
    expect(third.photo).toMatchObject({ url: photo.url, alt: photo.alt });
    expect(third.rightsConfirmedAt).toBeNull();
    expect(await (await act({ action: "validate", number: 3, reviewed: true })).json()).toMatchObject({ code: "M-96" });

    // Retrait de la photo : nouvelle version sans photo, plus de droits à confirmer.
    expect(await (await act({ action: "remove_photo", number: 3 })).json()).toMatchObject({ currentNumber: 4 });
    expect((await versions())[3]).toMatchObject({ photo: null, note: "Photo retirée par vous", rightsConfirmedAt: null });
    expect((await act({ action: "validate", number: 4, reviewed: true })).status()).toBe(200);
    expect((await versions())[3].rightsConfirmedAt).toBeNull();

    // Un contenu qui n'est pas une publication de réseau social n'a pas de visuel (M-97).
    const other = await prisma.mission.create({ data: { companyId: a.id, template: "site_page", channel: "site", title: "Page tarifs", outcome: "Des demandes", originalOutcome: "Des demandes", finding: "Pas de page tarifs", scope: { page: "Nos tarifs" }, status: "active", position: 2 } });
    const page = await prisma.missionContent.create({ data: { companyId: a.id, missionId: other.id, channel: "site", format: "site_page", currentNumber: 1, versions: { create: { number: 1, title: "Nos tarifs", body: "Tarifs.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });
    expect(await (await upload(a, { file: file(png(800, 600)), alt: "Salle", number: "1" }, page.id)).json()).toMatchObject({ code: "M-97" });
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("diffusion is decided by the server for the session company, and « Préparer seulement » refuses every external execution", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-diffusion-a-${marker}@example.invalid`, name: `Diffusion A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-diffusion-b-${marker}@example.invalid`, name: `Diffusion B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const mission = await prisma.mission.create({ data: { companyId: a.id, template: "site_page", channel: "site", title: "Page tarifs", outcome: "Des demandes", originalOutcome: "Des demandes", finding: "Pas de page tarifs", scope: { page: "Nos tarifs" }, status: "active", position: 1 } });
  const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "site", format: "site_page", currentNumber: 1, validatedNumber: 1, versions: { create: { number: 1, title: "Nos tarifs <script>alert(1)</script>", body: "Sur devis.", author: "paul" } } } });
  const diffuse = (company: typeof a, data: unknown, extra: Record<string, string> = {}) => request.post(`${baseURL}/api/contents/${content.id}/diffusion`, { headers: { ...headers(company), ...extra }, data });
  try {
    expect((await request.post(`${baseURL}/api/contents/${content.id}/diffusion`, { headers: { Origin: baseURL }, data: { action: "publish", number: 1, confirmed: true } })).status()).toBe(401);
    expect((await diffuse(a, { action: "publish", number: 1, confirmed: true }, { Origin: "https://attacker.invalid" })).status()).toBe(403);
    expect((await diffuse(b, { action: "publish", number: 1, confirmed: true })).status()).toBe(404);
    expect((await diffuse(a, { action: "envoyer", number: 1 })).status()).toBe(400);
    expect((await diffuse(a, { action: "resolve", number: 1 })).status()).toBe(400);
    expect(await (await diffuse(a, { action: "publish", number: 1 })).json()).toMatchObject({ code: "M-82" });
    expect(await (await diffuse(a, { action: "publish", number: 1, confirmed: true, scheduledAt: "demain 9h" })).json()).toMatchObject({ code: "M-61" });
    expect(await (await diffuse(a, { action: "publish", number: 1, confirmed: true, scheduledAt: "2020-01-01T09:00:00.000Z" })).json()).toMatchObject({ code: "M-61" });
    expect(await (await diffuse(a, { action: "cancel", number: 1 })).json()).toMatchObject({ code: "M-87" });

    // Mise en ligne : la page publique sert exactement la version validée, en texte.
    const published = await diffuse(a, { action: "publish", number: 1, confirmed: true, status: "sent" });
    expect(published.status()).toBe(200);
    const { url } = await published.json();
    expect(url).toMatch(/^\/site\/[a-z0-9-]+\/nos-tarifs$/);
    const page = await request.get(`${baseURL}${url}`);
    expect(page.status()).toBe(200);
    const html = await page.text();
    expect(html).toContain("Nos tarifs &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(await (await diffuse(a, { action: "publish", number: 1, confirmed: true })).json()).toMatchObject({ code: "M-53" });
    expect(await prisma.publication.count({ where: { companyId: b.id } })).toBe(0);

    // Délégation : niveau inconnu refusé ; « Préparer seulement » ferme toutes les portes d'exécution, même contournées.
    expect((await request.post(`${baseURL}/api/delegation`, { headers: { ...headers(a), Origin: "https://attacker.invalid" }, data: { level: "prepare" } })).status()).toBe(403);
    expect(await (await request.post(`${baseURL}/api/delegation`, { headers: headers(a), data: { level: "tout" } })).json()).toMatchObject({ code: "M-85" });
    expect(await (await request.post(`${baseURL}/api/delegation`, { headers: headers(b), data: { level: "prepare" } })).json()).toEqual({ level: "prepare", cancelled: 0 });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: a.id } })).delegationLevel).toBe("review");
    const prepareOnly = { code: "M-55", error: "Votre règle autorise uniquement la préparation. Diffusez vous-même ou modifiez les règles." };
    for (const [path, data] of [["/api/gmail/send", { to: "x@example.invalid", subject: "S", text: "T", confirmed: true, requestId: randomUUID() }], ["/api/proposals/inconnue/execute", { expectedVersion: 1 }], ["/api/site/republish", {}]] as const) {
      const refused = await request.post(`${baseURL}${path}`, { headers: headers(b), data });
      expect(refused.status(), path).toBe(403);
      expect(await refused.json(), path).toEqual(prepareOnly);
    }
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("a channel reserved to authorized companies is requested, granted by an administrator, and refused before any provider flow otherwise", async ({ request, page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const marker = randomUUID().slice(0, 8);
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin canaux", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const a = await prisma.company.create({ data: { ownerEmail: `security-access-a-${marker}@example.invalid`, name: `Accès A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-access-b-${marker}@example.invalid`, name: `Accès B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const admin = { Cookie: sessionCookie(adminEmail, adminCompany.sessionVersion), Origin: baseURL };
  const path = `${baseURL}/api/admin/channel-access`;
  const previous = await prisma.channelRollout.findUnique({ where: { channel: "gmail" } });
  try {
    // Ouvert à tous par défaut : la demande ne change rien.
    expect(await (await request.post(`${baseURL}/api/channel-access`, { headers: headers(a), data: { channel: "gmail" } })).json()).toEqual({ state: "open" });
    expect((await request.post(`${baseURL}/api/channel-access`, { headers: headers(a), data: { channel: "site" } })).status()).toBe(400);
    expect((await request.post(`${baseURL}/api/channel-access`, { headers: { ...headers(a), Origin: "https://attacker.invalid" }, data: { channel: "gmail" } })).status()).toBe(403);

    // Réservé par un administrateur seulement.
    expect((await request.patch(path, { headers: headers(a), data: { channel: "gmail", openToAll: false } })).status()).toBe(403);
    expect((await request.patch(path, { headers: { ...admin, Origin: "https://attacker.invalid" }, data: { channel: "gmail", openToAll: false } })).status()).toBe(403);
    expect((await request.patch(path, { headers: admin, data: { channel: "site", openToAll: false } })).status()).toBe(400);
    expect((await request.patch(path, { headers: admin, data: { channel: "gmail", openToAll: false } })).status()).toBe(200);

    // Non autorisée : aucun flux fournisseur, une demande visible en administration.
    const start = await request.get(`${baseURL}/api/oauth/gmail/start`, { headers: { Cookie: headers(a).Cookie }, maxRedirects: 0 });
    expect(start.status()).toBe(307);
    expect(start.headers().location).toMatch(/\/connexions\?error=(channel_unavailable|gmail_config)$/);
    expect(await (await request.post(`${baseURL}/api/channel-access`, { headers: headers(a), data: { channel: "gmail" } })).json()).toEqual({ state: "requested" });
    expect(await prisma.channelAccess.findUniqueOrThrow({ where: { companyId_channel: { companyId: a.id, channel: "gmail" } } })).toMatchObject({ status: "requested" });
    expect(await prisma.channelAccess.count({ where: { companyId: b.id } })).toBe(0);
    expect((await request.patch(path, { headers: admin, data: { channel: "gmail", companyId: "inconnue", granted: true } })).status()).toBe(404);
    expect((await request.patch(path, { headers: admin, data: { channel: "gmail", companyId: a.id, granted: true } })).status()).toBe(200);
    expect(await (await request.post(`${baseURL}/api/channel-access`, { headers: headers(a), data: { channel: "gmail" } })).json()).toEqual({ state: "granted" });
    expect(await (await request.post(`${baseURL}/api/channel-access`, { headers: headers(b), data: { channel: "gmail" } })).json()).toEqual({ state: "requested" });

    // Canaux désactivés : aucun démarrage, quelle que soit l'entreprise.
    const linkedin = await request.get(`${baseURL}/api/oauth/linkedin/start`, { headers: { Cookie: headers(a).Cookie }, maxRedirects: 0 });
    expect(linkedin.headers().location).toMatch(/\/connexions\?error=(channel_unavailable|linkedin_config)$/);

    // Administration : la demande apparaît et s'accorde en un clic.
    await page.context().addCookies([{ name: "pepito_session", value: admin.Cookie.slice(admin.Cookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    const panel = page.getByRole("region", { name: "Accès aux canaux" });
    await expect(panel).toContainText("Email avec Gmail · entreprises autorisées seulement");
    await panel.getByRole("button", { name: `Autoriser Accès B ${marker} sur Email avec Gmail` }).click();
    await expect(panel.getByRole("button", { name: `Retirer Accès B ${marker} sur Email avec Gmail` })).toBeVisible();
    expect(await prisma.channelAccess.findUniqueOrThrow({ where: { companyId_channel: { companyId: b.id, channel: "gmail" } } })).toMatchObject({ status: "granted", grantedBy: adminEmail });
  } finally {
    await page.context().clearCookies();
    if (previous) await prisma.channelRollout.update({ where: { channel: "gmail" }, data: { openToAll: previous.openToAll } });
    else await prisma.channelRollout.deleteMany({ where: { channel: "gmail" } });
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("the model credit and the server errors are for administrators, validated, and shown in the administration", async ({ request, page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const marker = randomUUID().slice(0, 8);
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin credit test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const user = await prisma.company.create({ data: { ownerEmail: `security-credit-${marker}@example.invalid`, name: "Dirigeant simple", trade: "Artisan", servingArea: "Paris" } });
  const previous = await prisma.llmCreditSetting.findUnique({ where: { id: "global" } });
  const adminCookie = sessionCookie(adminEmail, adminCompany.sessionVersion);
  const admin = { Cookie: adminCookie, Origin: baseURL };
  const path = `${baseURL}/api/admin/llm-credit`;
  const failure = await prisma.errorEvent.create({ data: { fingerprint: `seed-${marker}`, message: `Boom ${marker} <b>gras</b>`, path: `/api/seed-${marker}`, method: "POST", routeType: "route", digest: "seed-digest" } });
  try {
    expect((await request.patch(path, { headers: { Cookie: sessionCookie(user.ownerEmail, user.sessionVersion), Origin: baseURL }, data: { balanceUsd: 10, alertBelowUsd: 1 } })).status()).toBe(403);
    expect((await request.patch(path, { headers: { ...admin, Origin: "https://attacker.invalid" }, data: { balanceUsd: 10, alertBelowUsd: 1 } })).status()).toBe(403);
    for (const data of [{}, { balanceUsd: -1, alertBelowUsd: 1 }, { balanceUsd: "10", alertBelowUsd: 1 }, { balanceUsd: 10 }, { balanceUsd: 10, alertBelowUsd: 5_000_000 }, "texte"]) {
      expect((await request.patch(path, { headers: admin, data })).status(), JSON.stringify(data)).toBe(400);
    }
    const saved = await request.patch(path, { headers: admin, data: { balanceUsd: 250, alertBelowUsd: 20 } });
    expect(saved.status()).toBe(200);
    expect(await prisma.llmCreditSetting.findUniqueOrThrow({ where: { id: "global" } })).toMatchObject({ balanceUsd: 250, alertBelowUsd: 20, updatedBy: adminEmail });

    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: adminCookie.slice(adminCookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByRole("heading", { name: "Crédit du modèle" })).toBeVisible();
    await expect(page.getByText("Crédit restant estimé")).toBeVisible();
    await expect(page.getByLabel("Solde constaté chez le fournisseur en dollars")).toHaveValue("250");
    await page.getByLabel("Solde constaté chez le fournisseur en dollars").fill("300");
    await page.getByRole("button", { name: "Enregistrer le solde" }).click();
    await expect(page.getByText("Solde enregistré.")).toBeVisible();
    expect((await prisma.llmCreditSetting.findUniqueOrThrow({ where: { id: "global" } })).balanceUsd).toBe(300);

    await expect(page.getByRole("heading", { name: "Erreurs en production" })).toBeVisible();
    await expect(page.getByText(`Boom ${marker} <b>gras</b>`)).toBeVisible();
    await expect(page.getByText(`POST /api/seed-${marker}`)).toBeVisible();
    expect(await page.locator("b", { hasText: "gras" }).count()).toBe(0);
  } finally {
    await page.context().clearCookies();
    await prisma.errorEvent.deleteMany({ where: { id: failure.id } });
    if (previous) await prisma.llmCreditSetting.update({ where: { id: "global" }, data: { balanceUsd: previous.balanceUsd, balanceAt: previous.balanceAt, alertBelowUsd: previous.alertBelowUsd } });
    else await prisma.llmCreditSetting.deleteMany({ where: { id: "global" } });
    await prisma.usageAlert.deleteMany({ where: { scope: "credit-llm" } });
    await prisma.company.deleteMany({ where: { id: user.id } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});

test("usage alert thresholds are for administrators, validated, and today's alert shows in the administration", async ({ request, page }) => {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  test.skip(admins.length === 0, "Requires ADMIN_EMAILS on the server, as configured in CI.");
  const prisma = openDatabase();
  const adminEmail = admins[0];
  const marker = randomUUID().slice(0, 8);
  const today = signupDayKey(new Date());
  let createdAdmin = false;
  let adminCompany = await prisma.company.findUnique({ where: { ownerEmail: adminEmail } });
  if (!adminCompany) {
    adminCompany = await prisma.company.create({ data: { ownerEmail: adminEmail, name: "Admin alert test", trade: "Artisan", servingArea: "Paris" } });
    createdAdmin = true;
  }
  const user = await prisma.company.create({ data: { ownerEmail: `security-alert-${marker}@example.invalid`, name: "Dirigeant simple", trade: "Artisan", servingArea: "Paris" } });
  const previous = await prisma.usageAlertSetting.findUnique({ where: { id: "global" } });
  const adminCookie = sessionCookie(adminEmail, adminCompany.sessionVersion);
  const admin = { Cookie: adminCookie, Origin: baseURL };
  const path = `${baseURL}/api/admin/usage-alerts`;
  const seeded = await prisma.usageAlert.create({ data: { day: today, scope: `company:seed-${marker}`, label: `Atelier Alerte ${marker}`, thresholdUsd: 3, costUsd: 3.5 } });
  try {
    expect((await request.patch(path, { headers: { Cookie: sessionCookie(user.ownerEmail, user.sessionVersion), Origin: baseURL }, data: { companyDailyUsd: 3, totalDailyUsd: 10 } })).status()).toBe(403);
    expect((await request.patch(path, { headers: { ...admin, Origin: "https://attacker.invalid" }, data: { companyDailyUsd: 3, totalDailyUsd: 10 } })).status()).toBe(403);
    for (const data of [{}, { companyDailyUsd: 0, totalDailyUsd: 10 }, { companyDailyUsd: -1, totalDailyUsd: 10 }, { companyDailyUsd: "3", totalDailyUsd: 10 }, { companyDailyUsd: 3, totalDailyUsd: 1_000_000 }, "texte"]) {
      expect((await request.patch(path, { headers: admin, data })).status(), JSON.stringify(data)).toBe(400);
    }
    const saved = await request.patch(path, { headers: admin, data: { companyDailyUsd: 2.5, totalDailyUsd: 20 } });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ companyDailyUsd: 2.5, totalDailyUsd: 20 });
    expect(await prisma.usageAlertSetting.findUniqueOrThrow({ where: { id: "global" } })).toMatchObject({ companyDailyUsd: 2.5, totalDailyUsd: 20, updatedBy: adminEmail });

    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: adminCookie.slice(adminCookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByRole("heading", { name: "Alertes de consommation" })).toBeVisible();
    await expect(page.getByText("Seuil franchi aujourd'hui")).toBeVisible();
    await expect(page.getByText(`Atelier Alerte ${marker} : 3.50 $ pour un seuil de 3.00 $`)).toBeVisible();
    await expect(page.getByLabel("Seuil par entreprise et par jour en dollars")).toHaveValue("2.5");
    await page.getByLabel("Seuil total par jour en dollars").fill("30");
    await page.getByRole("button", { name: "Enregistrer les seuils" }).click();
    await expect(page.getByText("Seuils enregistrés.")).toBeVisible();
    expect((await prisma.usageAlertSetting.findUniqueOrThrow({ where: { id: "global" } })).totalDailyUsd).toBe(30);
  } finally {
    await page.context().clearCookies();
    await prisma.usageAlert.deleteMany({ where: { id: seeded.id } });
    if (previous) await prisma.usageAlertSetting.update({ where: { id: "global" }, data: { companyDailyUsd: previous.companyDailyUsd, totalDailyUsd: previous.totalDailyUsd } });
    else await prisma.usageAlertSetting.deleteMany({ where: { id: "global" } });
    await prisma.company.deleteMany({ where: { id: user.id } });
    if (createdAdmin) await prisma.company.delete({ where: { id: adminCompany.id } });
    await prisma.$disconnect();
  }
});
test("company run history and a run detail never cross company boundaries", async ({ request }) => {
  const prisma = openDatabase();
  const owner = await prisma.company.create({ data: { ownerEmail: `security-run-owner-${randomUUID()}@example.invalid`, name: "Run owner", trade: "Artisan", servingArea: "Lyon" } });
  const other = await prisma.company.create({ data: { ownerEmail: `security-run-other-${randomUUID()}@example.invalid`, name: "Other run owner", trade: "Artisan", servingArea: "Paris" } });
  const run = await prisma.agentRun.create({ data: {
    companyId: other.id, agent: "contenu", requestKey: `security-${randomUUID()}`, payload: { kind: "direct", agent: "contenu" }, status: "failed", errorMessage: "internal test error",
  } });
  try {
    const cookie = sessionCookie(owner.ownerEmail, owner.sessionVersion);
    const list = await request.get(`${baseURL}/api/agent-runs`, { headers: { Cookie: cookie } });
    expect(list.status()).toBe(200);
    expect(await list.json()).toEqual({ runs: [] });
    const detail = await request.get(`${baseURL}/api/agent-runs/${run.id}`, { headers: { Cookie: cookie } });
    expect(detail.status()).toBe(404);
    expect(await detail.text()).not.toContain("internal test error");
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
});

test("a signed-in company cannot read or change another company's data", async ({ request }) => {
  const prisma = openDatabase();
  const secretMarker = `secret-${randomUUID()}`;
  const profile = { trade: "Artisan", servingArea: "Paris" };
  const intruder = await prisma.company.create({ data: { ...profile, ownerEmail: `security-a-${randomUUID()}@example.invalid`, name: "Intrus Test" } });
  const target = await prisma.company.create({ data: { ...profile, ownerEmail: `security-b-${randomUUID()}@example.invalid`, name: secretMarker } });
  try {
    const planItem = await prisma.actionPlanItem.create({ data: { companyId: target.id, agent: "contenu", title: secretMarker, rationale: secretMarker, timing: "Cette semaine" } });
    const proposal = await prisma.agentProposal.create({ data: { companyId: target.id, agent: "contenu", kind: "site_web_content", title: secretMarker, content: secretMarker, status: "validee" } });
    const lead = await prisma.lead.create({ data: { companyId: target.id, name: secretMarker, reason: secretMarker, stage: "a_contacter" } });
    await prisma.auditFinding.create({ data: { companyId: target.id, category: "site_web", title: secretMarker, content: secretMarker } });
    await prisma.chatMessage.create({ data: { companyId: target.id, role: "assistant", content: secretMarker } });

    const cookie = sessionCookie(intruder.ownerEmail, intruder.sessionVersion);
    const writes: [Pick<Guarded, "method" | "path">, unknown][] = [
      [{ method: "PATCH", path: `/api/proposals/${proposal.id}` }, { status: "rejetee" }],
      [{ method: "POST", path: `/api/proposals/${proposal.id}/execute` }, {}],
      [{ method: "GET", path: `/api/proposals/${proposal.id}/revisions` }, {}],
      [{ method: "PATCH", path: `/api/leads/${lead.id}` }, { stage: "gagne" }],
      [{ method: "PATCH", path: `/api/action-plan/${planItem.id}` }, { status: "ecarte" }],
      [{ method: "POST", path: `/api/action-plan/${planItem.id}/launch` }, {}],
    ];
    for (const [route, data] of writes) {
      expect((await call(request, route, cookie, data)).status(), `${route.method} ${route.path}`).toBe(404);
    }
    // Suppose ADMIN_EMAILS défini côté serveur, comme en CI : sans liste, l'administration reste ouverte à tout connecté.
    const removal = await call(request, { method: "DELETE", path: `/api/admin/companies/${target.id}` }, cookie);
    expect(removal.status(), "DELETE /api/admin/companies/[id] needs ADMIN_EMAILS on the server").toBe(403);

    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("validee");
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("a_contacter");
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: planItem.id } })).status).toBe("propose");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: target.id } })).siteHtml).toBeNull();

    for (const path of ["/api/companies", "/api/proposals", "/api/audit-findings", "/api/co-ceo/messages", "/api/co-ceo/plan"]) {
      const response = await call(request, { method: "GET", path }, cookie);
      expect(response.status(), path).toBe(200);
      const body = await response.text();
      expect(body, path).not.toContain(secretMarker);
      expect(body, path).not.toContain(target.id);
    }
    for (const path of ["/dashboard", "/dashboard?view=validation", "/dashboard?view=historique", "/prospection", "/diagnostic", "/rapport"]) {
      const page = await request.get(`${baseURL}${path}`, { headers: { Cookie: cookie } });
      expect(page.status(), path).toBe(200);
      expect(await page.text(), path).not.toContain(secretMarker);
    }
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [intruder.id, target.id] } } });
    await prisma.$disconnect();
  }
});

test("story 5.5: site photo and republish routes refuse another origin, even with a valid session", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-photos-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail: email, name: "Photos Test", trade: "Artisan", servingArea: "Paris" } });
  const headers = { Cookie: sessionCookie(email, company.sessionVersion), Origin: "https://attacker.invalid" };
  try {
    expect((await request.post(`${baseURL}/api/site/photos`, { headers, multipart: { alt: "Photo" } })).status()).toBe(403);
    expect((await request.delete(`${baseURL}/api/site/photos/identifiant-inexistant`, { headers })).status()).toBe(403);
    expect((await request.patch(`${baseURL}/api/site/photos/identifiant-inexistant`, { headers, data: { alt: "Photo" } })).status()).toBe(403);
    expect((await request.post(`${baseURL}/api/site/republish`, { headers, data: {} })).status()).toBe(403);
    // Même origine : une photo inconnue ou d'une autre entreprise est introuvable.
    const sameOrigin = { ...headers, Origin: baseURL };
    expect((await request.patch(`${baseURL}/api/site/photos/identifiant-inexistant`, { headers: sameOrigin, data: { alt: "Photo" } })).status()).toBe(404);
  } finally {
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("GH-284: « Préparer mes missions » needs a session and the same origin, a request id, and a current diagnostic (409 otherwise)", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-missions-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail: email, name: "Missions Test", trade: "Artisan", servingArea: "Paris" } });
  const other = await prisma.company.create({ data: { ownerEmail: `security-missions-other-${randomUUID()}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Lyon" } });
  const cookie = sessionCookie(email, company.sessionVersion);
  const post = (headers: Record<string, string>, data: unknown = { requestId: randomUUID() }) => request.post(`${baseURL}/api/co-ceo/missions`, { headers, data });
  try {
    expect((await post({ Origin: baseURL })).status()).toBe(401);
    expect((await post({ Cookie: cookie, Origin: "https://attacker.invalid" })).status()).toBe(403);
    expect((await post({ Cookie: cookie, Origin: baseURL }, { requestId: "pas-un-uuid" })).status()).toBe(400);
    expect((await post({ Cookie: cookie, Origin: baseURL }, {})).status()).toBe(400);
    // Le diagnostic d'une autre entreprise ne compte pas : 409 « no_diagnostic », rien n'est lancé.
    const audit = await prisma.agentRun.create({ data: { companyId: other.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", finishedAt: new Date() } });
    await prisma.auditFinding.create({ data: { companyId: other.id, agentRunId: audit.id, category: "site_web", title: "Constat voisin", content: "Secret" } });
    const refused = await post({ Cookie: cookie, Origin: baseURL });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ reason: "no_diagnostic", href: "/diagnostic" });
    expect(await prisma.agentRun.count({ where: { companyId: company.id } })).toBe(0);

    // Diagnostic courant mais 10 missions non arrêtées : 409 « cap » avec le message M-75, aucune exécution consommée.
    const ownAudit = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", finishedAt: new Date() } });
    await prisma.auditFinding.create({ data: { companyId: company.id, agentRunId: ownAudit.id, category: "site_web", title: "Constat courant", content: "Le site ne présente pas les offres." } });
    await prisma.mission.createMany({ data: Array.from({ length: 10 }, (_, index) => ({
      companyId: company.id, template: "custom", title: `Mission ouverte ${index + 1}`, outcome: "Un premier pas concret", originalOutcome: "Un premier pas concret", finding: "Constat déclaré par le dirigeant",
      scope: { description: "Une action menée par le dirigeant" }, stopRuleDays: 30, createdBy: "owner", position: index,
    })) });
    const capped = await post({ Cookie: cookie, Origin: baseURL });
    expect(capped.status()).toBe(409);
    expect(await capped.json()).toEqual({ reason: "cap", error: "Vous avez déjà 10 missions non arrêtées. Arrêtez-en une avant d'en créer une autre." });
    expect(await prisma.agentRun.count({ where: { companyId: company.id } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    await prisma.$disconnect();
  }
});

test("Partenariats: the agency list belongs to its company, the scope names one or two of them, and the e-mail preview shows each address", async ({ request, page }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-agencies-a-${marker}@example.invalid`, name: `Agences A ${marker}`, trade: "Artisan", servingArea: "Paris", emailVerifiedAt: new Date() } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-agencies-b-${marker}@example.invalid`, name: `Agences B ${marker}`, trade: "Artisan", servingArea: "Lyon" } });
  const headers = (company: typeof a) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: baseURL });
  const agency = (company: typeof a, name: string, email: string) => prisma.lead.create({ data: { companyId: company.id, segment: "agence", name, sector: "Agence immobilière", email, source: "https://exemple.invalid/agence", reason: "Elle vend des maisons à rénover." } });
  try {
    // Recherche : même origine seulement ; sans modèle configuré, refus en clair (M-91).
    expect((await request.post(`${baseURL}/api/agencies/search`, { headers: { ...headers(a), Origin: "https://attacker.invalid" } })).status()).toBe(403);
    const search = await request.post(`${baseURL}/api/agencies/search`, { headers: headers(a) });
    if (search.status() === 503) expect(await search.json()).toMatchObject({ code: "M-91" });

    const parc = await agency(a, "Agence du Parc", `parc-${marker}@example.invalid`);
    await agency(a, "Syndic Horizon", `horizon-${marker}@example.invalid`);
    const foreign = await agency(b, "Agence voisine", `voisine-${marker}@example.invalid`);
    const created = await request.post(`${baseURL}/api/missions`, { headers: headers(a), data: { template: "agencies", title: "Deux agences de ma zone", outcome: "Un rendez-vous qualifié", finding: "Aucune agence ne me recommande" } });
    expect(created.status()).toBe(201);
    const { mission } = await created.json();
    const transition = (data: unknown) => request.post(`${baseURL}/api/missions/${mission.id}/transition`, { headers: headers(a), data });
    expect(await (await transition({ action: "set_scope", scope: { agencyIds: [foreign.id] }, expectedVersion: mission.version })).json()).toMatchObject({ code: "M-30" });

    // Choix dans la page de la mission : 2 agences au plus, résumé nommé.
    await page.context().addCookies([{ name: "pepito_session", value: headers(a).Cookie.slice(headers(a).Cookie.indexOf("=") + 1), url: baseURL }]);
    await page.goto(`${baseURL}/missions/${mission.id}`);
    const choice = page.getByRole("group", { name: "Agences à contacter (1 ou 2)" });
    await expect(choice).toContainText(`parc-${marker}@example.invalid`);
    await expect(choice).not.toContainText("Agence voisine");
    await choice.getByRole("checkbox", { name: /Agence du Parc/ }).check();
    await page.getByRole("button", { name: "Enregistrer le périmètre" }).click();
    await expect(page.getByText("Périmètre enregistré.")).toBeVisible();
    await expect(page.locator(".mission-status")).toContainText("Agence du Parc");

    // Aperçu e-mail : chaque adresse, envois séparés.
    const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "gmail", format: "email", currentNumber: 1, versions: { create: { number: 1, title: "Travailler ensemble ?", body: "Bonjour,", author: "paul" } } } });
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await expect(page.getByRole("article", { name: "Aperçu destinataire" })).toContainText(`Agence du Parc <parc-${marker}@example.invalid> · envois séparés`);
    expect((await prisma.mission.findUniqueOrThrow({ where: { id: mission.id } })).scope).toEqual({ agencyIds: [parc.id] });
  } finally {
    await page.context().clearCookies();
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("a mission report and its decision belong to the session company, are validated by the server and refused from another origin", async ({ request }) => {
  const prisma = openDatabase();
  const marker = randomUUID().slice(0, 8);
  const a = await prisma.company.create({ data: { ownerEmail: `security-report-a-${marker}@example.invalid`, name: `Bilan A ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const b = await prisma.company.create({ data: { ownerEmail: `security-report-b-${marker}@example.invalid`, name: `Bilan B ${marker}`, trade: "Artisan", servingArea: "Paris" } });
  const headers = (company: typeof a, origin = baseURL) => ({ Cookie: sessionCookie(company.ownerEmail, company.sessionVersion), Origin: origin });
  const mission = await prisma.mission.create({ data: { companyId: a.id, template: "site_page", channel: "site", title: "Page tarifs", outcome: "Deux demandes", originalOutcome: "Deux demandes", finding: "Pas de page tarifs", scope: { page: "Nos tarifs" }, status: "active", firstLaunchedAt: new Date(), position: 1 } });
  const content = await prisma.missionContent.create({ data: { companyId: a.id, missionId: mission.id, channel: "site", format: "site_page", currentNumber: 1, validatedNumber: 1, versions: { create: { number: 1, title: "Nos tarifs", body: "Sur devis.", author: "paul" } } } });
  const report = (company: typeof a, data: unknown, origin?: string) => request.post(`${baseURL}/api/missions/${mission.id}/report`, { headers: headers(company, origin), data });
  const decide = (company: typeof a, data: unknown) => request.post(`${baseURL}/api/missions/${mission.id}/decision`, { headers: headers(company), data });
  try {
    expect((await report(a, { qualifiedLeads: 1, meetings: 0 }, "https://attacker.invalid")).status()).toBe(403);
    expect(await (await report(a, { qualifiedLeads: 1, meetings: 0 })).json()).toMatchObject({ code: "M-37" });
    await prisma.publication.create({ data: { companyId: a.id, missionId: mission.id, contentId: content.id, versionNumber: 1, title: "Nos tarifs", channel: "site", channelLabel: "Votre site vitrine", mode: "confirmed", status: "sent", sentAt: new Date(), idempotencyKey: `${content.id}:v1:1` } });
    expect((await report(b, { qualifiedLeads: 1, meetings: 0 })).status()).toBe(404);
    expect(await (await report(a, { qualifiedLeads: "<b>1</b>", meetings: 0 })).json()).toMatchObject({ code: "M-39" });
    expect((await report(a, { qualifiedLeads: 2, meetings: 1, signedRevenue: 1500, note: "<script>x</script>" })).status()).toBe(201);
    expect((await decide(a, { choice: "élargir", expectedVersion: mission.version })).status()).toBe(400);
    expect((await decide(b, { choice: "stop", expectedVersion: mission.version })).status()).toBe(404);
    expect(await (await decide(a, { choice: "stop", expectedVersion: mission.version + 5 })).json()).toMatchObject({ code: "M-02" });
    expect(await (await decide(a, { choice: "continue", expectedVersion: mission.version })).json()).toEqual({ choice: "continue" });
    expect(await prisma.missionReport.count({ where: { missionId: mission.id } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});

test("GH-280: the public analysis refuses internal sites, a second launch and a fourth daily run, and step 2 stays open", async ({ playwright }) => {
  test.setTimeout(90000);
  const prisma = openDatabase();
  const ip = { "x-real-ip": `test-${randomUUID()}` };
  const visitors: APIRequestContext[] = [];
  const draftIds: string[] = [];
  const visitor = async () => {
    const context = await playwright.request.newContext();
    visitors.push(context);
    return context;
  };
  const post = (context: APIRequestContext, data: Record<string, unknown>) => context.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL, ...ip }, data });
  const draftOf = async (context: APIRequestContext) => {
    const token = (await context.storageState()).cookies.find((cookie) => cookie.name === "pepito_draft")!.value;
    const draft = await prisma.onboardingDraft.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    draftIds.push(draft.id);
    return draft;
  };
  const identity = { firstName: "Claire", companyName: `Atelier Sécurité ${randomUUID().slice(0, 8)}`, location: "Lyon" };
  try {
    const companiesBefore = await prisma.company.count();
    // Site interne : aucune lecture, « Non disponible (accès refusé) », la suite continue.
    for (const website of ["http://127.0.0.1", "http://10.0.0.5", "http://[::1]"]) {
      const first = await visitor();
      const launched = await post(first, { action: "discover", ...identity, website });
      expect(launched.status(), website).toBe(200);
      expect((await launched.json()).analysis).toMatchObject({ status: "running", finished: false });
      const view = await waitForAnalysis(first, baseURL, ip);
      expect(view.rubrics.find((rubric) => rubric.key === "site")?.label, website).toBe("Non disponible (accès refusé)");
      expect(view.rubrics.find((rubric) => rubric.key === "identity")?.label, website).toBe("Non disponible (accès refusé)");
      const draft = await draftOf(first);
      expect(draft.analysis).toMatchObject({ status: "done", cost: { usd: expect.any(Number) }, rubrics: { site: { reason: "refused" } } });
      expect(draft.step).toBe(1);
      // Relancer la même entreprise ne relance rien : les constats restent.
      expect((await post(first, { action: "discover", ...identity, website })).status()).toBe(200);
      expect((await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).analysis).toMatchObject({ runId: (draft.analysis as { runId: string }).runId });
      const seen = await post(first, { action: "see_findings" });
      expect(seen.status()).toBe(200);
      expect(await seen.json()).toMatchObject({ step: 2, href: "/bienvenue" });
      expect((await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).profileConfirmed).toBe(false);
    }

    // Quatrième analyse du jour pour cette IP : pas d'analyse, « revenez plus tard », l'étape 2 reste ouverte.
    const fourth = await visitor();
    const limited = await post(fourth, { action: "discover", ...identity, website: "" });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    const limitedBody = await limited.json();
    expect(limitedBody).toMatchObject({ code: "limited", analysis: { status: "limited", finished: true } });
    expect(limitedBody.error).toContain("depuis cette connexion (3 lectures par jour) : ce n'est pas une panne");
    expect(limitedBody.analysis.rubrics[0].label).toBe("Non disponible (limite du jour atteinte)");
    expect((await post(fourth, { action: "see_findings" })).status()).toBe(200);
    expect((await draftOf(fourth)).step).toBe(2);
    expect(await prisma.company.count()).toBe(companiesBefore);

    // Double clic : une analyse en cours refuse un second lancement et l'étape 2 ; elle continue.
    const busyDraft = await createTestDraft(prisma, { step: 1, profile: { website: "" } });
    draftIds.push(busyDraft.id);
    const running = { runId: "run-en-cours", status: "running", startedAt: new Date().toISOString(), finishedAt: null, input: { companyName: "Atelier Lumen", location: "Lyon", website: "" },
      rubrics: { site: { status: "unavailable", reason: "no_site" }, google: { status: "pending" }, zone: { status: "pending" }, identity: { status: "unavailable", reason: "no_site" } },
      findings: { trade: null, servingArea: null, targetClients: null, offers: null, tone: null, contacts: [], palette: null, logo: null, google: null, pages: [] }, cost: { usd: 0, inputTokens: 0, outputTokens: 0 } };
    await prisma.onboardingDraft.update({ where: { id: busyDraft.id }, data: { analysis: running } });
    const headers = { Origin: baseURL, Cookie: busyDraft.cookie, "x-real-ip": `test-${randomUUID()}` };
    const again = await playwright.request.newContext();
    visitors.push(again);
    const second = await again.post(`${baseURL}/api/bienvenue`, { headers, data: { action: "discover", firstName: "Claire", companyName: "Atelier Lumen", location: "Lyon", website: "https://autre.invalid" } });
    expect(second.status()).toBe(409);
    expect(await second.json()).toMatchObject({ code: "busy", analysis: { finished: false } });
    expect((await again.post(`${baseURL}/api/bienvenue`, { headers, data: { action: "see_findings" } })).status()).toBe(409);
    const progress = await again.get(`${baseURL}/api/bienvenue/analyse`, { headers: { Cookie: busyDraft.cookie } });
    expect(progress.status()).toBe(200);
    const progressBody = await progress.json();
    expect(progressBody).toMatchObject({ step: 1, analysis: { status: "running", finished: false } });
    expect(JSON.stringify(progressBody)).not.toMatch(/inputTokens|companyName|usd/);
    const kept = await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: busyDraft.id } });
    expect(kept.analysis).toMatchObject({ runId: "run-en-cours" });
    expect(kept.profile).toMatchObject({ website: "" });

    // Sans brouillon, la progression renvoie à l'étape 1 ; l'entrée et le coût ne sont jamais exposés.
    const stranger = await playwright.request.newContext();
    visitors.push(stranger);
    const none = await stranger.get(`${baseURL}/api/bienvenue/analyse`);
    expect(none.status()).toBe(404);
    expect(await none.json()).toMatchObject({ href: "/bienvenue" });
  } finally {
    for (const context of visitors) await context.dispose();
    await prisma.onboardingDraft.deleteMany({ where: { id: { in: draftIds } } });
    await prisma.$disconnect();
  }
});

test("GH-280: the global daily cap refuses everyone and refunds the per-IP attempt", async ({ playwright }) => {
  // Import différé : ces modules ouvrent la base dès leur chargement, après la lecture de .env.
  const { ANALYSIS_GLOBAL_KEY } = await import("../src/lib/auth-throttle");
  const prisma = openDatabase();
  const original = await prisma.authThrottle.findUnique({ where: { key: ANALYSIS_GLOBAL_KEY } });
  const ip = `test-${randomUUID()}`;
  const ipKey = `analysis:${createHmac("sha256", requireSecret()).update(ip).digest("hex")}`;
  const visitor = await playwright.request.newContext();
  let draftToken = "";
  try {
    // Le compteur global est au-delà de tout plafond : la prochaine analyse est refusée pour tout le monde.
    await prisma.authThrottle.upsert({ where: { key: ANALYSIS_GLOBAL_KEY }, create: { key: ANALYSIS_GLOBAL_KEY, count: 1_000_000, windowStart: new Date() }, update: { count: 1_000_000, windowStart: new Date() } });
    const response = await visitor.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL, "x-real-ip": ip }, data: { action: "discover", firstName: "Claire", companyName: "Atelier Plafond", location: "Lyon" } });
    expect(response.status()).toBe(429);
    expect(await response.json()).toMatchObject({ code: "limited", analysis: { status: "limited", finished: true } });
    draftToken = (await visitor.storageState()).cookies.find((cookie) => cookie.name === "pepito_draft")?.value ?? "";
    // La tentative de l'IP a été rendue : le refus vient du plafond global, pas d'elle.
    expect((await prisma.authThrottle.findUnique({ where: { key: ipKey } }))?.count ?? 0).toBe(0);
  } finally {
    if (original) await prisma.authThrottle.update({ where: { key: ANALYSIS_GLOBAL_KEY }, data: { count: original.count, windowStart: original.windowStart } });
    else await prisma.authThrottle.deleteMany({ where: { key: ANALYSIS_GLOBAL_KEY } });
    await prisma.authThrottle.deleteMany({ where: { key: ipKey } });
    if (draftToken) await prisma.onboardingDraft.deleteMany({ where: { tokenHash: createHash("sha256").update(draftToken).digest("hex") } });
    await visitor.dispose();
    await prisma.$disconnect();
  }
});

test("GH-282: the ambition is confirmed only with the token of the exact interpreted text, and a spent model quota falls back silently", async ({ playwright }) => {
  const prisma = openDatabase();
  const draft = await createTestDraft(prisma, { step: 3 });
  const ip = `test-${randomUUID()}`;
  const ipKey = `ambition:${createHmac("sha256", requireSecret()).update(ip).digest("hex")}`;
  const visitor = await playwright.request.newContext();
  const post = (data: Record<string, unknown>, origin = baseURL) => visitor.post(`${baseURL}/api/bienvenue`, { headers: { Origin: origin, Cookie: draft.cookie, "x-real-ip": ip }, data });
  const text = "+20 % de CA en 12 mois, sans embaucher, 300 € de pub par mois";
  const reinterpret = "Interprétez de nouveau votre ambition avant de la confirmer.";
  try {
    // 9 caractères : M-06 ; une autre origine : refusée.
    const short = await post({ action: "interpret_ambition", ambition: "123456789" });
    expect(short.status()).toBe(422);
    expect(await short.json()).toMatchObject({ code: "M-06" });
    expect((await post({ action: "interpret_ambition", ambition: text }, "https://attacker.invalid")).status()).toBe(403);

    // Quota du modèle épuisé pour cette IP : l'analyseur de secours répond, sans erreur.
    await prisma.authThrottle.upsert({ where: { key: ipKey }, create: { key: ipKey, count: 10, windowStart: new Date() }, update: { count: 10, windowStart: new Date() } });
    const interpreted = await post({ action: "interpret_ambition", ambition: text });
    expect(interpreted.status()).toBe(200);
    const { interpretation, token } = await interpreted.json();
    expect(interpretation).toMatchObject({ text, terms: { gainPercent: 20, horizonMonths: 12, mediaBudgetPerMonth: 300, recruitment: "no" } });
    expect(interpretation.reformulation).toContain("n'autorise aucune dépense");
    expect(typeof token).toBe("string");
    // L'interprétation n'est jamais enregistrée seule.
    expect(await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ step: 3, ambition: null, diagnosticReady: false });

    // Jeton falsifié, texte modifié d'un caractère, éléments changés ou absents : 422 et rien n'est enregistré.
    for (const forged of [
      { ambition: text, terms: interpretation.terms, token: "jeton-falsifie" },
      { ambition: `${text}!`, terms: interpretation.terms, token },
      { ambition: text, terms: { ...interpretation.terms, gainPercent: 50 }, token },
      { ambition: text, token },
      { ambition: text, terms: interpretation.terms },
    ]) {
      const refused = await post({ action: "confirm_ambition", ...forged });
      expect(refused.status(), JSON.stringify(forged)).toBe(422);
      expect(await refused.json()).toMatchObject({ code: "reinterpret", error: reinterpret, errors: { ambition: reinterpret } });
    }
    expect(await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ step: 3, ambition: null, diagnosticReady: false });

    // Le bon jeton : le texte tel quel et les éléments retenus, étape 4.
    const confirmed = await post({ action: "confirm_ambition", ambition: text, terms: interpretation.terms, token });
    expect(confirmed.status()).toBe(200);
    expect(await confirmed.json()).toMatchObject({ step: 4, href: "/bienvenue/missions" });
    const stored = await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored).toMatchObject({ step: 4, diagnosticReady: true, ambition: { text, terms: interpretation.terms } });
    // #284 : « Ce que nous retenons » est enregistré au clic ; sans clé de modèle sur le serveur de test, ce sont les règles.
    const retained = (stored.ambition as { retained?: unknown }).retained as string[];
    expect(retained.length).toBeGreaterThanOrEqual(2);
    expect(retained.length).toBeLessThanOrEqual(3);
    expect(retained).toEqual(retainedFromRules(readDraftState(stored)));
    // Étape 4 : plus d'interprétation possible depuis le brouillon.
    expect((await post({ action: "interpret_ambition", ambition: text })).status()).toBe(409);

    // Entreprise : sans session 401, autre origine 403 ; un jeton du parcours ne vaut que pour le même texte et les mêmes éléments.
    const anonymous = await visitor.post(`${baseURL}/api/entreprise/ambition`, { headers: { Origin: baseURL }, data: { action: "interpret", ambition: text } });
    expect(anonymous.status()).toBe(401);
    const email = `security-ambition-${randomUUID()}@example.invalid`;
    const company = await prisma.company.create({ data: { ownerEmail: email, name: "Atelier Ambition", trade: "Artisan", servingArea: "Lyon", workspaceV52: true, objective: "Ancien cap" } });
    try {
      const session = sessionCookie(email, company.sessionVersion);
      const entreprise = (data: Record<string, unknown>, origin = baseURL) => visitor.post(`${baseURL}/api/entreprise/ambition`, { headers: { Origin: origin, Cookie: session }, data });
      expect((await entreprise({ action: "interpret", ambition: text }, "https://attacker.invalid")).status()).toBe(403);
      expect((await entreprise({ action: "launch", ambition: text })).status()).toBe(400);
      expect((await entreprise({ action: "confirm", ambition: `${text}!`, terms: interpretation.terms, token })).status()).toBe(422);
      expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).objective).toBe("Ancien cap");
      const read = await entreprise({ action: "interpret", ambition: "Doubler mon CA en 5 ans" });
      expect(read.status()).toBe(200);
      const outOfBounds = await read.json();
      expect(outOfBounds.interpretation.terms).toMatchObject({ gainPercent: null, horizonMonths: null });
      const saved = await entreprise({ action: "confirm", ambition: "Doubler mon CA en 5 ans", terms: outOfBounds.interpretation.terms, token: outOfBounds.token });
      expect(saved.status()).toBe(200);
      const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id }, include: { journalEntries: true } });
      expect(after).toMatchObject({ ambitionText: "Doubler mon CA en 5 ans", objective: "Doubler mon CA en 5 ans" });
      expect(after.journalEntries.map((entry) => [entry.code, entry.actor, entry.params])).toEqual([["J-03", "owner", { cap: "Doubler mon CA en 5 ans" }]]);
    } finally {
      await prisma.company.deleteMany({ where: { ownerEmail: email } });
    }
  } finally {
    await prisma.authThrottle.deleteMany({ where: { key: ipKey } });
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await visitor.dispose();
    await prisma.$disconnect();
  }
});

test("GH-280: background writes need the current run, and two launches on one draft never both start", async () => {
  const { saveAnalysis, startAnalysis } = await import("../src/lib/onboarding/draft");
  const prisma = openDatabase();
  const draft = await createTestDraft(prisma, { step: 1 });
  try {
    const input = { companyName: "Atelier Lumen", location: "Lyon", website: "" };
    const first = newAnalysis(input, "run-a");
    expect(await startAnalysis(draft.id, first)).toBe("started");
    // Un second lancement pendant que la première analyse court : refusé.
    expect(await startAnalysis(draft.id, newAnalysis(input, "run-b"))).toBe("busy");
    // L'analyse se termine, une nouvelle (run-b) la remplace ; une écriture tardive de run-a ne l'écrase pas.
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { analysis: { ...first, status: "done" } } });
    const second = newAnalysis(input, "run-b");
    expect(await startAnalysis(draft.id, second)).toBe("started");
    expect(await saveAnalysis(draft.id, { ...first, status: "done" })).toBe(false);
    expect((await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).analysis).toMatchObject({ runId: "run-b", status: "running" });
    expect(await saveAnalysis(draft.id, { ...second, status: "done" })).toBe(true);
    expect(await startAnalysis("brouillon-inexistant", newAnalysis(input, "run-c"))).toBe("missing");
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.$disconnect();
  }
});
