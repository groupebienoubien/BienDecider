import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { config } from "dotenv";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "../src/lib/session-token";
import { hashPassword } from "../src/lib/password";

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
  { method: "DELETE", path: "/api/admin/companies/[id]", denied: 403 },
  { method: "PATCH", path: "/api/admin/companies/[id]/limits", denied: 403 },
  { method: "GET", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "PATCH", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "POST", path: "/api/agents/contenu/run", denied: 401 },
  { method: "POST", path: "/api/agents/demarchage/run", denied: 401 },
  { method: "POST", path: "/api/agents/marketing/run", denied: 401 },
  { method: "GET", path: "/api/audit-findings", denied: 401 },
  { method: "POST", path: "/api/co-ceo/message", denied: 401 },
  { method: "GET", path: "/api/co-ceo/messages", denied: 401 },
  { method: "GET", path: "/api/co-ceo/plan", denied: 401 },
  { method: "POST", path: "/api/co-ceo/plan", denied: 401 },
  { method: "GET", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies", denied: 401 },
  { method: "PATCH", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies/direction", denied: 401 },
  { method: "POST", path: "/api/companies/delete", denied: 401 },
  { method: "POST", path: "/api/companies/outreach", denied: 401 },
  { method: "POST", path: "/api/facebook/disconnect", denied: 401 },
  { method: "POST", path: "/api/facebook/page", denied: 401 },
  { method: "POST", path: "/api/gmail/disconnect", denied: 401 },
  { method: "POST", path: "/api/gmail/send", denied: 401 },
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
  { method: "POST", path: "/api/onboarding/interpret", denied: 401 },
];

// Routes volontairement accessibles sans session, avec la raison.
const PUBLIC_ROUTES: Record<string, string> = {
  "/api/auth/login": "point d'entrée de la connexion",
  "/api/auth/logout": "revoque les sessions et efface le cookie de l'appelant (POST même origine)",
  "/api/auth/signup": "inscription publique avec création explicite de compte",
  "/api/cron/weekly-review": "protégée par CRON_SECRET, pas par la session",
  "/api/health": "sonde publique sans donnée métier",
};

const GUARDED_PAGES = ["/admin", "/admin/risques", "/compte", "/connexions", "/dashboard", "/diagnostic", "/equipe", "/entreprise", "/prospection", "/rapport"];

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
      ["POST", "/api/action-plan"],
      ["PATCH", `/api/action-plan/${planItem.id}`],
      ["POST", "/api/companies"],
      ["POST", "/api/companies/direction"],
      ["POST", "/api/companies/outreach"],
      ["PATCH", `/api/proposals/${proposal.id}`],
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
    const updated = await request.patch(path, { headers: adminHeaders, data: {
      dailyAgentRunLimit: 4, monthlyAgentRunLimit: 30, dailySpendLimitUsd: 2.5, monthlySpendLimitUsd: 20,
    } });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({ companyId: company.id, dailyAgentRunLimit: 4, monthlyAgentRunLimit: 30, dailySpendLimitUsd: 2.5, monthlySpendLimitUsd: 20 });
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ dailyAgentRunLimit: 4, monthlyAgentRunLimit: 30, dailySpendLimitUsd: 2.5, monthlySpendLimitUsd: 20 });
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
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
