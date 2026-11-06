import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { config } from "dotenv";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "../src/lib/session-token";
import { hashPassword } from "../src/lib/password";
import { signupDayKey } from "../src/lib/signup-rules";
import { startSmtpSink } from "./support/smtp-sink";

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
  { method: "GET", path: "/api/missions", denied: 401 },
  { method: "POST", path: "/api/missions", denied: 401 },
  { method: "GET", path: "/api/missions/catalogue", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/transition", denied: 401 },
  { method: "POST", path: "/api/missions/[id]/content", denied: 401 },
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
  "/api/auth/signup": "inscription publique avec création explicite de compte",
  "/api/auth/forgot-password": "demande de lien de réinitialisation : réponse identique que le compte existe ou non (POST même origine)",
  "/api/auth/reset-password": "le jeton à usage unique du lien reçu par e-mail fait foi, sans session (POST même origine)",
  "/api/auth/verify-email": "le jeton à usage unique du lien reçu par e-mail fait foi, sans session (POST même origine)",
  "/api/cron/weekly-review": "protégée par CRON_SECRET, pas par la session",
  "/api/cron/publications": "protégée par CRON_SECRET, pas par la session (programmations, #261)",
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

    const signup = await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } });
    expect(signup.status()).toBe(201);
    expect(signup.headers()["set-cookie"]).toContain("pepito_session=");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("httponly");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("expires=");
    expect(await signup.json()).toMatchObject({ hasCompany: false });
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);

    const duplicateSignup = await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } });
    expect(duplicateSignup.status()).toBe(409);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
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

    const login = await request.post(`${baseURL}/api/auth/login`, { data: { email, password: "nouveau-mot-de-passe" } });
    expect(login.status()).toBe(200);
    const renewedCookie = login.headers()["set-cookie"].split(";")[0];
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);

    const forgedLogout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: "https://attacker.invalid" }, maxRedirects: 0 });
    expect(forgedLogout.status()).toBe(403);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);
    const logout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: baseURL }, maxRedirects: 0 });
    expect(logout.status()).toBe(307);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(401);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).sessionVersion).toBe(2);
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
    expect((await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } })).status()).toBe(201);
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

test("one IP cannot flood login or signup, and other IPs and successful logins are unaffected", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-ip-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-correct";
  const flooder = { "x-real-ip": `test-${randomUUID()}` };
  const bystander = { "x-real-ip": `test-${randomUUID()}` };
  const login = (address: Record<string, string>, who = `absent-${randomUUID()}@example.invalid`, candidate = "mauvais-mot-de-passe") =>
    request.post(`${baseURL}/api/auth/login`, { headers: address, data: { email: who, password: candidate } });
  try {
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: bystander, data: { email, password } })).status()).toBe(201);
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

    const registrar = { "x-real-ip": `test-${randomUUID()}` };
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await request.post(`${baseURL}/api/auth/signup`, { headers: registrar, data: { email, password } })).status(), `signup ${attempt}`).toBe(409);
    }
    const signupBlocked = await request.post(`${baseURL}/api/auth/signup`, { headers: registrar, data: { email, password } });
    expect(signupBlocked.status()).toBe(429);
    expect(Number(signupBlocked.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
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
  const signup = (email: string) => request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}` }, data: { email, password } });
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
    await page.goto(`${baseURL}/signup`);
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
    await page.goto(`${baseURL}/signup`);
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
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: { "x-real-ip": `test-${randomUUID()}` }, data: { email, password: "mot-de-passe-valide" } })).status()).toBe(201);
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
    expect((await request.post(`${baseURL}/api/auth/signup`, { headers: ip(), data: { email: `security-pw-${randomUUID()}@example.invalid`, password: "1234567" } })).status()).toBe(400);
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
    expect(catalogue.map((template) => template.key)).toEqual(["social_post", "site_page", "custom"]);
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
