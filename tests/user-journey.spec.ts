import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient, type Company } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { encryptGmailToken } from "../src/lib/oauth/gmail";
import { companyProfileLines, objectiveLine } from "../src/lib/agents/personas";
import { getRejectionContext } from "../src/lib/agents/rejection-context";
import { createSessionToken } from "../src/lib/session-token";

config({ quiet: true });

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
const adminFixture = process.env.ADMIN_UI_TEST === "1";
const test = base.extend<{ company: Company }>({
  company: async ({ page }, runFixture) => {
    if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) throw new Error("DATABASE_URL and SESSION_SECRET are required for UX tests.");
    // Ces tests écrivent en base : refus par défaut de toute base non locale, pour ne jamais viser celle du prototype par erreur.
    const databaseHost = new URL(process.env.DATABASE_URL).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
      throw new Error("UX tests refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.");
    }
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    const ownerEmail = adminFixture
      ? "ux-admin-settings-test@example.invalid"
      : `ux-test-${randomUUID()}@example.invalid`;
    if (process.env.ADMIN_UI_TEST === "1") await prisma.company.deleteMany({ where: { ownerEmail } });
    const company = await prisma.company.create({ data: {
      ownerEmail, name: "Atelier Test Parcours", trade: "Artisan", servingArea: "Paris",
      objective: "Développer les demandes de devis", monthlyRevenue: 4000, revenueTarget: 6000, averageClientValue: 500,
      description: "Artisan de proximité", phone: "0100000000", certifications: "Label de test", openingHours: "Lundi au vendredi",
    } });
    try {
      const session = createSessionToken(ownerEmail, company.sessionVersion, process.env.SESSION_SECRET);
      await page.context().addCookies([{ name: "pepito_session", value: session, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
      await page.route("**/api/agents/**", (route) => route.fulfill({ status: 503, json: { error: "Agent indisponible pour le test" } }));
      await runFixture(company);
    } finally {
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.$disconnect();
    }
  },
});

/** L'atelier de production affiche une seule production à la fois : on la sélectionne dans la liste, puis on renvoie son panneau. */
async function openProduction(page: Page, title: string) {
  await page.locator(".production-list").getByRole("button", { name: title }).first().click();
  return page.locator("article").filter({ hasText: title });
}

test("empty screens guide the next activity without automatically starting agents", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const externalStarts: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && (/^\/api\/agents\//.test(path) || path === "/api/co-ceo/plan")) externalStarts.push(path);
  });
  try {
    await page.goto(`${baseURL}/dashboard?view=plan`);
    const plan = page.getByRole("region", { name: "Plan d'action", exact: true });
    await expect(plan.getByRole("heading", { name: "Choisir les prochaines activités à confier" })).toBeVisible();
    await expect(plan.getByRole("link", { name: "Commencer par le diagnostic" })).toHaveAttribute("href", "/diagnostic");
    await expect(plan.getByRole("button", { name: "Compléter le plan" })).toHaveCount(0);
    await plan.getByRole("link", { name: "Commencer par le diagnostic" }).click();
    await expect(page.getByRole("heading", { name: "Repérer les premières opportunités" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lancer le diagnostic" })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Passer au plan d'action" })).toHaveCount(0);
    await page.goto(`${baseURL}/dashboard?view=validation`);
    const validation = page.getByRole("region", { name: "Productions à valider" });
    await expect(validation.getByRole("link", { name: "Commencer par le diagnostic" })).toHaveAttribute("href", "/diagnostic");
    await page.goto(`${baseURL}/dashboard?view=historique`);
    await expect(page.getByRole("region", { name: "Historique à venir" }).getByRole("link", { name: "Commencer par le diagnostic" })).toHaveAttribute("href", "/diagnostic");
    await page.goto(`${baseURL}/prospection`);
    const prospects = page.getByRole("region", { name: "Prospection à préparer" });
    await expect(prospects.getByRole("link", { name: "Examiner les prospects proposés" })).toHaveAttribute("href", "/dashboard?view=validation");
    await expect(prospects.getByRole("link", { name: "Confier une recherche à Jean-Claude" })).toHaveAttribute("href", "/equipe");
    await page.goto(`${baseURL}/rapport`);
    await expect(page.getByRole("region", { name: "Résultats à venir" }).getByRole("link", { name: "Examiner les productions" })).toHaveAttribute("href", "/dashboard?view=validation");

    await prisma.auditFinding.create({ data: { companyId: company.id, category: "site_web", title: "Premier constat", content: "Une piste à examiner" } });
    await page.goto(`${baseURL}/dashboard?view=plan`);
    await expect(plan.getByRole("button", { name: "Compléter le plan" })).toBeEnabled();
    await expect(plan.getByText("Aucune action externe ne sera exécutée à cette étape.", { exact: false })).toBeVisible();
    await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Préparer une présentation", rationale: "Clarifier l'offre", timing: "Cette semaine" } });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await expect(validation.getByRole("link", { name: "Voir les actions du plan" })).toHaveAttribute("href", "/dashboard?view=plan");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(validation.getByRole("heading", { name: "Tout est à jour.", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`empty-validation-${width}.png`), fullPage: true });
    }

    const pendingProposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "social_post", title: "Un brouillon à valider", content: "Un texte prêt à relire",
    } });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.getByRole("link", { name: "Productions", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard?view=validation`);
    const proposal = page.locator("article").filter({ hasText: pendingProposal.title });
    for (const label of ["Approuver cette version", "Rejeter"]) {
      const button = proposal.getByRole("button", { name: label, exact: true });
      await expect(button).toBeVisible();
      expect(await button.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await proposal.getByRole("button", { name: "Rejeter", exact: true }).click();
    const reason = proposal.getByLabel("Précision (facultative)");
    await expect(reason).toBeVisible();
    await proposal.getByRole("button", { name: "Annuler le rejet", exact: true }).click();
    await expect(proposal.getByRole("button", { name: "Approuver cette version", exact: true })).toBeVisible();
    expect(externalStarts).toEqual([]);
  } finally {
    await prisma.$disconnect();
  }
});

test("Gmail compose requires confirmation and handles uncertain sends", async ({ page, company }, testInfo) => {
  test.skip(process.env.GMAIL_UI_TEST !== "1", "Requires the isolated Gmail UI test server with dummy credentials.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
    await prisma.channelConnection.create({ data: {
      companyId: company.id, channel: "gmail", status: "connecte",
      accessToken: encryptGmailToken("dummy-access", company.id),
      refreshToken: encryptGmailToken(JSON.stringify({ token: "dummy-refresh", email: "sender@example.invalid" }), company.id),
      expiresAt: new Date(Date.now() + 3600000),
    } });
    const requestId = randomUUID();
    const message = { to: "recipient@example.invalid", subject: "Message déjà traité", text: "Contenu confirmé", confirmed: true, requestId };
    await prisma.agentProposal.create({ data: {
      id: `gmail-${requestId}`, companyId: company.id, agent: "contenu", kind: "gmail_email", title: message.subject,
      content: JSON.stringify({ to: message.to, text: message.text }), status: "executee",
    } });
    const repeated = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: message });
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toEqual({ sent: true });
    const changed = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: { ...message, text: "Autre contenu" } });
    expect(changed.status()).toBe(409);
    const unconfirmed = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: { ...message, confirmed: false } });
    expect(unconfirmed.status()).toBe(400);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${baseURL}/connexions`);
    await expect(page.getByText("sender@example.invalid", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("dummy-access");
    await page.getByText("Écrire un email", { exact: true }).click();
    await page.getByLabel("Destinataire", { exact: true }).fill("recipient@example.invalid");
    await page.getByLabel("Objet", { exact: true }).fill("Test manuel");
    await page.getByLabel("Message", { exact: true }).fill("Contenu confirmé");
    await expect(page.getByText("Le message partira à l'extérieur et ne pourra pas être rappelé.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer avec Gmail" })).toBeDisabled();
    await page.getByLabel("Je confirme le destinataire et le contenu de cet envoi.").check();
    let firstId: string | undefined;
    await page.route("**/api/gmail/send", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.confirmed).toBe(true);
      expect(body.to).toBe("recipient@example.invalid");
      expect(body.text).toBe("Contenu confirmé");
      if (firstId) expect(body.requestId).toBe(firstId);
      firstId = body.requestId;
      await route.fulfill({ status: 502, json: { error: "Résultat incertain. Vérifiez Gmail." } });
    });
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Résultat incertain");
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Résultat incertain");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("gmail-compose-mobile.png"), fullPage: true });
    await page.getByLabel("Objet", { exact: true }).fill("Objet modifié");
    await expect(page.getByRole("button", { name: "Envoyer avec Gmail" })).toBeDisabled();
    await page.unroute("**/api/gmail/send");
    await page.route("**/api/gmail/send", (route) => route.fulfill({ json: { sent: true } }));
    await page.getByLabel("Je confirme le destinataire et le contenu de cet envoi.").check();
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("confirmé l'envoi");
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("gmail-compose-desktop.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("Gmail start, refusal and send guards do not contact providers", async ({ page, company }) => {
  expect(company.id).toBeTruthy();
  await page.goto(`${baseURL}/connexions`);
  await expect(page.getByRole("heading", { name: "Gmail · envoi de messages" })).toBeVisible();
  const start = await page.request.get(`${baseURL}/api/oauth/gmail/start`, { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const location = start.headers().location;
  if (location.includes("accounts.google.com")) {
    const authorization = new URL(location);
    expect(authorization.searchParams.get("scope")?.split(" ")).toEqual(["https://www.googleapis.com/auth/gmail.send", "openid", "email"]);
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/oauth/gmail/callback`);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    await page.goto(`${baseURL}/api/oauth/gmail/callback?state=${authorization.searchParams.get("state")}&error=access_denied`);
    await expect(page).toHaveURL(/error=gmail_denied/);
  } else {
    expect(location).toContain("error=gmail_config");
  }
  await page.goto(`${baseURL}/api/oauth/gmail/callback?state=invalid&code=not-a-real-code`);
  await expect(page).toHaveURL(/error=gmail_state/);
  const denied = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: "https://untrusted.example" }, data: {} });
  expect(denied.status()).toBe(403);
  const missingConnection = await page.request.post(`${baseURL}/api/gmail/send`, {
    headers: { Origin: baseURL }, data: { to: "recipient@example.invalid", subject: "Test", text: "Test", confirmed: true, requestId: randomUUID() },
  });
  expect([409, 503]).toContain(missingConnection.status());
});

test("risk policy API rejects non-admin sessions", async ({ page }) => {
  test.skip(process.env.ADMIN_UI_TEST === "1", "Run with the normal local environment to test a non-admin session.");
  const get = await page.request.get(`${baseURL}/api/admin/delegation-risk`);
  expect(get.status()).toBe(403);
  const patch = await page.request.patch(`${baseURL}/api/admin/delegation-risk`, {
    headers: { Origin: baseURL }, data: { actionKind: "piste_croissance", riskLevel: "eleve" },
  });
  expect(patch.status()).toBe(403);
});

test("OAuth authorization is not advertised as a verified business connection", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.channelConnection.createMany({ data: [
      { companyId: company.id, channel: "google_business_profile", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() - 60000) },
      { companyId: company.id, channel: "facebook", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() + 3600000) },
    ] });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseURL}/connexions`);
      await expect(page.getByText("Connexion expirée · reliez de nouveau le compte", { exact: true })).toBeVisible();
      // Jeton en clair de l'ancien flux Facebook : jamais présenté comme une connexion, à refaire.
      await expect(page.getByText("Autorisation à refaire · reconnectez votre Page", { exact: true })).toBeVisible();
      await expect(page.getByText("Page vérifiée", { exact: true })).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("test-token-never-visible");
      await expect(page.getByText("Connecté", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`oauth-${width}.png`), fullPage: true });
    }
    await prisma.channelConnection.deleteMany({ where: { companyId: company.id } });
    await page.reload();
    await expect(page.locator("main").getByText("Compte non relié", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Facebook · Page" }).getByText("Non autorisé", { exact: true })).toBeVisible();
  } finally { await prisma.$disconnect(); }
});

test("growth journey shows progress, the current step and can be hidden and restored", async ({ page, company }) => {
  expect(company.name).toBe("Atelier Test Parcours");
  await page.goto(`${baseURL}/dashboard`);
  const journey = page.getByRole("region", { name: "Votre parcours" });
  await expect(journey.getByRole("progressbar", { name: "Avancement du parcours" })).toHaveAttribute("aria-valuenow", "1");
  await expect(journey.getByText("Étape 2 sur 5", { exact: false })).toBeVisible();
  await expect(journey.getByRole("link", { name: "Lancer le diagnostic" })).toHaveAttribute("href", "/diagnostic");

  await journey.getByRole("button", { name: "Masquer le parcours" }).click();
  await expect(journey.getByText("Parcours 1/5 étapes terminées")).toBeVisible();
  await journey.getByRole("button", { name: "Afficher le parcours" }).click();
  await expect(journey.getByRole("progressbar", { name: "Avancement du parcours" })).toBeVisible();
});

test("a draft is saved without approval, then a precise version is approved without executing it", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const draftContent = "Texte corrigé par le dirigeant, à reprendre plus tard.";
  const finalContent = "Texte final approuvé par le dirigeant.";
  try {
    const item = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Action à relire", rationale: "Test", timing: "Cette semaine", status: "lance" } });
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, planItemId: item.id, agent: "contenu", kind: "social_post", title: "Publication à corriger", content: "Version initiale à corriger.",
    } });
    const patch = (data: unknown) => page.request.patch(`${baseURL}/api/proposals/${proposal.id}`, { data });

    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    await card.getByRole("textbox", { name: "Modifier le contenu" }).fill(draftContent);
    await card.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(card.getByText(/Brouillon enregistré le .*, non approuvé/)).toBeVisible();

    // Le brouillon survit au rechargement sans valoir décision ni terminer l'action.
    await page.reload();
    await expect(card.getByText("À relire", { exact: true })).toBeVisible();
    let saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved).toMatchObject({ content: draftContent, version: 2, status: "en_attente", approvedVersion: null, decidedAt: null });
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("lance");

    // Écritures sans version, ou depuis une version périmée : refusées sans rien modifier.
    expect((await patch({ status: "validee" })).status()).toBe(400);
    expect((await patch({ status: "validee", expectedVersion: 1 })).status()).toBe(409);
    expect((await patch({ status: "brouillon", content: "Écrasement depuis un autre onglet", expectedVersion: 1 })).status()).toBe(409);
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).content).toBe(draftContent);

    // Un échec réseau garde le texte dans l'éditeur, sans indication trompeuse.
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    await card.getByRole("textbox", { name: "Modifier le contenu" }).fill(finalContent);
    await page.route(`**/api/proposals/${proposal.id}`, (route) => route.fulfill({ status: 500, json: { error: "Enregistrement impossible" } }));
    await card.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Enregistrement impossible");
    await expect(card.getByRole("textbox", { name: "Modifier le contenu" })).toHaveValue(finalContent);
    await page.unroute(`**/api/proposals/${proposal.id}`);

    await card.getByRole("dialog").getByRole("button", { name: "Approuver cette version", exact: true }).click();
    await expect(card.getByText("À publier manuellement", { exact: true })).toBeVisible();
    saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved).toMatchObject({ content: finalContent, version: 3, approvedVersion: 3, status: "modifiee" });
    expect(saved.approvedAt).not.toBeNull();
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("termine");
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);

    // Modifier après approbation crée une version non approuvée et rouvre l'action.
    expect((await patch({ status: "brouillon", content: "Nouvelle idée après approbation", expectedVersion: 3 })).status()).toBe(200);
    saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved).toMatchObject({ version: 4, approvedVersion: 3, status: "en_attente" });
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("lance");
  } finally {
    await prisma.$disconnect();
  }
});

test("a site is published only from its approved version", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const execute = (id: string, data?: unknown) => page.request.post(`${baseURL}/api/proposals/${id}/execute`, { headers: { Origin: baseURL }, data });
    // Approbation antérieure au versionnage : aucune version désignée, rien n'est publié.
    const legacy = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site approuvé avant versionnage", content: "Brief", status: "validee",
    } });
    expect((await execute(legacy.id, { expectedVersion: 1 })).status()).toBe(400);
    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = await openProduction(page, legacy.title);
    await expect(card.getByRole("button", { name: "Préparer la publication" })).toHaveCount(0);
    await card.getByRole("button", { name: /Confirmer l.approbation de cette version/ }).click();
    await expect(card.getByRole("button", { name: "Préparer la publication" })).toBeVisible();
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: legacy.id } })).approvedVersion).toBe(1);

    // Une confirmation pour une version remplacée est refusée par le serveur, même en contournant l'interface.
    const changed = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site modifié après aperçu", content: "Brief v2", status: "modifiee", version: 2, approvedVersion: 2,
    } });
    expect((await execute(changed.id)).status()).toBe(400);
    expect((await execute(changed.id, { expectedVersion: 1, confirmed: true })).status()).toBe(409);
    for (const id of [legacy.id, changed.id]) {
      expect(await prisma.executionLog.count({ where: { proposalId: id } })).toBe(0);
    }
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).siteHtml).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("critical content checks cannot be bypassed by a generic publish confirmation", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { certifications: null } });
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Certification à vérifier", content: "Entreprise certifiée RGE.", status: "validee", approvedVersion: 1,
    } });
    const execute = (data: unknown) => page.request.post(`${baseURL}/api/proposals/${proposal.id}/execute`, { headers: { Origin: baseURL }, data });
    const genericConfirmation = await execute({ expectedVersion: 1, confirmed: true });
    expect(genericConfirmation.status()).toBe(409);
    expect((await genericConfirmation.json()).error).toContain("Certification non étayée");
    const forgedAcknowledgement = await execute({ expectedVersion: 1, confirmed: true, acknowledgedReviewIds: ["certification_unsupported"] });
    expect(forgedAcknowledgement.status()).toBe(409);
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).siteHtml).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("publication sends human review acknowledgements for the approved content version", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Tarifs à confirmer", content: "Nos tarifs sont attractifs.", status: "validee", approvedVersion: 1,
    } });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await expect(card.getByText("Prix évoqué sans montant vérifiable", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Préparer la publication" }).click();
    const confirm = card.getByRole("dialog").getByRole("button", { name: "Confirmer la publication" });
    await expect(confirm).toBeDisabled();
    await card.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
    await card.getByRole("checkbox", { name: /J.ai vérifié ce point pour cette version/ }).check();
    await card.getByRole("button", { name: "Préparer la publication" }).click();
    await expect(confirm).toBeEnabled();
    await page.route(`**/api/proposals/${proposal.id}/execute`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1, confirmed: true, acknowledgedReviewIds: ["price_not_specified"] });
      await route.fulfill({ json: { url: "/site/test" } });
    });
    await confirm.click();
  } finally {
    await prisma.$disconnect();
  }
});

test("a prospect without a public source cannot be added to the follow-up funnel", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "demarchage", kind: "prospect", title: "Association locale", content: "Organisation à vérifier.",
    } });
    const lead = await prisma.lead.create({ data: {
      companyId: company.id, proposalId: proposal.id, name: proposal.title, reason: "Correspond au segment", source: null,
    } });
    const decide = (data: unknown) => page.request.patch(`${baseURL}/api/proposals/${proposal.id}`, { data });
    const missingSource = await decide({ status: "validee", expectedVersion: 1 });
    expect(missingSource.status()).toBe(409);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("propose");
    expect((await page.request.patch(`${baseURL}/api/proposals/${proposal.id}`, { data: { leadSource: "http://localhost/private" } })).status()).toBe(400);
    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await expect(card.getByLabel("URL de la source")).toBeVisible();
    await card.getByLabel("URL de la source").fill("https://example.org/association");
    await card.getByRole("button", { name: "Enregistrer la source" }).click();
    await expect(card.getByLabel("URL de la source")).toHaveValue("https://example.org/association");
    await card.getByRole("button", { name: "Approuver cette version", exact: true }).click();
    await expect(card.getByText("Approuvée", { exact: true })).toBeVisible();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("a_contacter");
  } finally {
    await prisma.$disconnect();
  }
});

test("single validation queue, persistent decisions, publishing and error recovery", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const item = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Préparer la communication", rationale: "Attirer des demandes qualifiées", timing: "Cette semaine", status: "lance" } });
    await prisma.agentProposal.createMany({ data: [
      { companyId: company.id, planItemId: item.id, agent: "contenu", kind: "social_post", title: "Publication issue du plan", content: "Contenu du plan" },
      { companyId: company.id, agent: "contenu", kind: "social_post", title: "Demande manuelle", content: "Contenu manuel" },
      { companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site approuvé à publier", content: "Contenu du site", status: "validee", approvedVersion: 1 },
    ] });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}/dashboard?view=plan`);
    await expect(page.getByRole("heading", { name: "Préparer la communication" })).toBeVisible();
    // Story 1.4 : une action lancée avec une production en attente renvoie vers Décisions.
    await expect(page.locator(`#plan-item-${item.id}`).getByRole("link", { name: "1 à examiner" })).toHaveAttribute("href", "/dashboard?view=validation");
    await expect(page.getByRole("button", { name: "Approuver cette version" })).toHaveCount(0);
    await page.getByRole("link", { name: "Productions", exact: true }).click();
    await expect(page.locator(".production-list button")).toHaveCount(3);
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("nav .nav-count")).toContainText("3");
    await expect(page.getByText("Risque élevé", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Risque modéré", { exact: true })).toHaveCount(0);
    await expect(page.getByText("toute action réelle reste soumise à votre validation.", { exact: true })).toHaveCount(0);
    await page.locator("article summary").filter({ hasText: "Risque élevé" }).first().click();
    await expect(page.getByText("Dans ce prototype, toute action réelle reste soumise à votre validation.", { exact: true }).first()).toBeVisible();
    const planCard = await openProduction(page, "Publication issue du plan");
    await expect(planCard.getByText("Exposition publique", { exact: true })).toBeVisible();
    // Charte : la justification est repliée dans la file de relecture.
    await expect(planCard.getByText("Attirer des demandes qualifiées")).toBeHidden();
    await planCard.getByText("Pourquoi cette action", { exact: true }).click();
    await expect(planCard.getByText("Attirer des demandes qualifiées")).toBeVisible();
    const unapprovedSite = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site encore en attente", content: "Proposition non validée",
    } });
    const crossOriginAttempt = await page.request.post(`${baseURL}/api/proposals/${unapprovedSite.id}/execute`, { headers: { Origin: "https://untrusted.example" } });
    expect(crossOriginAttempt.status()).toBe(403);
    const bypassAttempt = await page.request.post(`${baseURL}/api/proposals/${unapprovedSite.id}/execute`, { headers: { Origin: baseURL } });
    expect(bypassAttempt.status()).toBe(400);
    expect(await prisma.executionLog.count({ where: { proposalId: unapprovedSite.id } })).toBe(0);
    await prisma.agentProposal.delete({ where: { id: unapprovedSite.id } });
    await expect(page.locator("nav .nav-count")).toContainText("3");
    await expect(page.getByRole("button", { name: "À vérifier (0)" })).toBeVisible();
    await page.getByRole("button", { name: "À vérifier (0)" }).click();
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByText("Aucune production ne correspond à ce filtre. 3 production(s) restent dans la file.")).toBeVisible();
    await page.getByRole("button", { name: "Afficher toutes les productions" }).click();
    await expect(page.locator("article")).toHaveCount(1);
    const manual = await openProduction(page, "Demande manuelle");
    await manual.getByText("Pourquoi cette action", { exact: true }).click();
    await expect(manual.getByText("Demande ponctuelle à l’équipe, hors plan d’action.")).toBeVisible();
    await expect(manual.getByText(/^Valider approuve ce contenu\./)).toBeVisible();
    await expect(manual.getByText("Contenu manuel")).toBeVisible();
    await page.route("**/api/proposals/*", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, json: { error: "Décision non enregistrée" } });
      else await route.continue();
    });
    await manual.getByRole("button", { name: "Approuver cette version", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Décision non enregistrée");
    await expect(manual.getByRole("button", { name: "Approuver cette version", exact: true })).toBeEnabled();
    await page.unroute("**/api/proposals/*");
    await manual.getByRole("button", { name: "Approuver cette version", exact: true }).click();
    await expect(manual.getByText("À publier manuellement", { exact: true })).toBeVisible();
    await expect(page.locator("nav .nav-count")).toContainText("2");
    await expect(manual).toBeVisible();
    const planned = await openProduction(page, "Publication issue du plan");
    await planned.getByRole("button", { name: "Rejeter", exact: true }).click();
    await planned.getByRole("button", { name: "Rejeter cette version", exact: true }).click();
    // File de relecture : après un rejet, la production suivante encore à traiter s'affiche d'elle-même.
    await expect(page.locator(".production-head h2")).toHaveText("Site approuvé à publier");
    await expect(page.locator("nav .nav-count")).toContainText("1");
    const reopened = await openProduction(page, "Publication issue du plan");
    await expect(reopened.getByText("À repenser", { exact: true })).toBeVisible();
    const site = await prisma.agentProposal.findFirstOrThrow({ where: { companyId: company.id, kind: "site_web_content" } });
    await page.route(`**/api/proposals/${site.id}/execute`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ expectedVersion: site.version, confirmed: true, acknowledgedReviewIds: [] });
      await prisma.agentProposal.update({ where: { id: site.id }, data: { status: "executee" } });
      await route.fulfill({ json: { url: "/site/test" } });
    });
    const siteCard = await openProduction(page, site.title);
    await siteCard.getByRole("button", { name: "Préparer la publication" }).click();
    await siteCard.getByRole("dialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.locator("article").filter({ hasText: site.title }).getByText("En ligne", { exact: true })).toBeVisible();
    // Charte : une diffusion confirmée est saluée par l'agent qui l'a préparée.
    await expect(page.locator(".celebration")).toContainText("Camille : « C’est fait ! Votre page est en ligne. »");
    await page.locator(".celebration").getByRole("button", { name: "Fermer" }).click();
    await expect(page.locator(".celebration")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Productions", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("validation-desktop.png"), fullPage: true });
    await page.reload();
    await expect(page.getByText("Tout est à jour.", { exact: false })).toBeVisible();
    await page.goto(`${baseURL}/rapport`);
    await expect(page.getByRole("heading", { level: 1, name: "Ce que vos actions ont donné." })).toBeVisible();
    // Une diffusion confirmée apparaît dans sa semaine, distinguée des déclarations.
    const diffusion = page.locator(".results-item.diffusion").filter({ hasText: site.title });
    await expect(diffusion).toContainText("Page mise en ligne");
    await expect(diffusion).toContainText("Confirmé par le canal");
    await expect(page.getByRole("button", { name: "Approuver cette version", exact: true })).toHaveCount(0);
    await page.goto(`${baseURL}/equipe`);
    await expect(page.locator("article")).toHaveCount(0);
    await page.getByText("Demande ponctuelle", { exact: true }).first().click();
    await page.getByRole("button", { name: "Confier la demande" }).first().click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Agent indisponible pour le test");
    await expect(page.getByRole("button", { name: "Confier la demande" }).first()).toBeEnabled();
  } finally { await prisma.$disconnect(); }
});

test("rejection reasons are optional, persisted in history and available to agents", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "demarchage", kind: "prospect", title: "Prospect hors cible", content: "Organisation proposée",
    } });
    const lead = await prisma.lead.create({ data: {
      companyId: company.id, proposalId: proposal.id, name: "Prospect hors cible", reason: "Proximité géographique", stage: "propose",
    } });
    const patch = (data: unknown) => page.request.patch(`${baseURL}/api/proposals/${proposal.id}`, { data });
    for (const rejectionReason of ["x".repeat(1001), 42, null]) {
      expect((await patch({ status: "rejetee", rejectionReason })).status()).toBe(400);
    }
    expect((await patch({ status: "validee", rejectionReason: "Pas ma cible" })).status()).toBe(400);
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("en_attente");

    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await card.getByRole("button", { name: "Rejeter", exact: true }).click();
    await card.getByLabel("Précision (facultative)").fill("Hors de ma zone d'intervention");
    await card.getByRole("button", { name: "Annuler le rejet", exact: true }).click();
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("en_attente");

    await card.getByRole("button", { name: "Rejeter", exact: true }).click();
    await card.getByLabel("Motif").selectOption("Autre");
    await card.getByLabel("Précision (facultative)").fill("  Hors de ma zone d'intervention  ");
    await card.getByRole("button", { name: "Rejeter cette version", exact: true }).click();
    await expect(card.getByText("À repenser", { exact: true })).toBeVisible();
    const saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved.rejectionReason).toBe("Autre : Hors de ma zone d'intervention");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("ecarte");
    expect(await getRejectionContext(company.id)).toContain(saved.rejectionReason!);
    expect(await getRejectionContext("nonexistent-company")).not.toContain(saved.rejectionReason!);

    await page.goto(`${baseURL}/dashboard?view=historique`);
    await page.reload();
    await page.locator(".history-item").filter({ hasText: proposal.title }).getByRole("button", { name: /Voir/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Raison du rejet : Autre : Hors de ma zone d'intervention");

    // Un rejet se rouvre tant que rien n'a été exécuté : retour à relire, motif effacé, prospect de nouveau proposé.
    expect((await patch({ status: "a_relire" })).status()).toBe(400);
    await page.getByRole("dialog").getByRole("button", { name: "Rouvrir pour relecture" }).click();
    await expect(page.getByText("Production rouverte", { exact: false })).toBeVisible();
    const reopened = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(reopened).toMatchObject({ status: "en_attente", rejectionReason: null, decidedAt: null });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("propose");
    expect((await patch({ status: "a_relire", expectedVersion: reopened.version })).status()).toBe(409);

    const optional = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "social_post", title: "Refus sans motif", content: "Publication proposée",
    } });
    expect((await page.request.patch(`${baseURL}/api/proposals/${optional.id}`, { data: { status: "rejetee" } })).status()).toBe(200);
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: optional.id } })).rejectionReason).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("diagnostic to plan, keyboard dialog and responsive navigation", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.auditFinding.create({ data: {
      companyId: company.id, category: "site_web", title: "Visibilité locale à renforcer", content: "Votre offre pourrait être plus visible.",
      whatWorks: "Une activité bien identifiée", toImprove: "Préciser la zone d'intervention",
      actionItems: [{ agent: "contenu", title: "Clarifier la zone d'intervention", rationale: "Améliorer les demandes locales" }],
    } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/diagnostic`);
    await page.getByRole("button", { name: /Voir le détail : Visibilité locale à renforcer/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /Voir le détail : Visibilité locale à renforcer/ }).click();
    await page.getByRole("button", { name: "Ajouter au plan" }).click();
    await expect(page.getByRole("button", { name: /Ajouté/ })).toBeDisabled();
    await page.getByRole("link", { name: /Voir dans le plan d.action/ }).click();
    await expect(page.getByRole("heading", { name: "Clarifier la zone d'intervention", exact: true }).last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("plan-mobile.png"), fullPage: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, title] of [
        ["/dashboard", "Développer les demandes de devis"],
        ["/dashboard?view=validation", "Vos productions à relire."],
        ["/diagnostic", "Ce que Martine a constaté."],
        ["/equipe", "Votre équipe."],
        ["/rapport", "Ce que vos actions ont donné."],
      ]) {
        await page.goto(`${baseURL}${path}`);
        await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // Sur téléphone : barre du bas (les quatre temps), puis onglets des pages du temps choisi.
    await page.getByRole("navigation", { name: "Parcours" }).getByRole("link", { name: "Objectif" }).click();
    await page.getByRole("navigation", { name: "Pages : Objectif" }).getByRole("link", { name: "Diagnostic", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ce que Martine a constaté." })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("diagnostic-mobile.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("workspace sections track the active view and account budget is company scoped", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.usageEvent.create({ data: { companyId: company.id, agent: "contenu", model: "test", inputTokens: 100, outputTokens: 20, costUsd: 1.25 } });
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [view, label] of [["", "Mon objectif"], ["?view=plan", "Plan d’action"], ["?view=validation", "Productions"], ["?view=historique", "Historique"]]) {
      await page.goto(`${baseURL}/dashboard${view}`);
      const navigation = page.locator("aside").getByRole("navigation", { name: "Navigation principale" });
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
    // Charte : la navigation suit les quatre temps du parcours, les réglages restent à part.
    const journey = page.locator("aside").getByRole("navigation", { name: "Navigation principale" });
    await expect(journey.locator(".journey-stage-label")).toHaveText([/Objectif/, /Plan/, /Décisions/, /Résultats/]);
    await expect(journey.getByRole("link", { name: "Mon entreprise" })).toHaveCount(0);
    await page.goto(`${baseURL}/compte`);
    await expect(page.getByRole("heading", { name: "Crédits & limites", exact: true })).toBeVisible();
    await expect(page.locator("main")).toContainText("1,25 $");
    await expect(page.locator("main")).toContainText(company.ownerEmail);
    await expect(page.getByRole("link", { name: "Politique de confidentialité" })).toHaveAttribute("href", "/confidentialite");
  } finally { await prisma.$disconnect(); }
});

test("the home page shows the objective, declared progress and at most three prepared decisions", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.agentProposal.createMany({ data: ["Premier post", "Deuxième post", "Troisième post", "Quatrième post"].map((title) => ({
      companyId: company.id, agent: "contenu", kind: "social_post", title, content: "Texte à relire",
    })) });
    await prisma.lead.create({ data: { companyId: company.id, name: "Syndic test", reason: "Cible", stage: "contacte", contactedAt: new Date() } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/dashboard`);
    const hero = page.getByRole("region", { name: "Mon objectif" });
    await expect(hero.getByRole("heading", { level: 1, name: "Développer les demandes de devis" })).toBeVisible();
    // Progression strictement déclarative : chiffres saisis par le dirigeant et échanges enregistrés.
    await expect(hero.getByText(/Chiffre d’affaires mensuel déclaré/)).toContainText(/4\s000/);
    await expect(hero.getByRole("progressbar")).toHaveAttribute("value", "67");
    await expect(hero.locator(".objective-week")).toContainText("Cette semaine : 1 prospect contacté");
    await expect(page.locator(".decision-cards .decision-card")).toHaveCount(3);
    // Charte : le travail est présenté comme celui d'une personne, avec son nom (jamais la couleur seule).
    await expect(page.locator(".decision-card").first()).toContainText("Camille vous propose un post Facebook");
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await expect(page.locator(".production-list button").first()).toContainText("Camille vous propose un post Facebook");
    await expect(page.locator(".production-head")).toContainText("Camille vous propose un post Facebook");
    await page.goto(`${baseURL}/dashboard`);
    await expect(page.getByRole("link", { name: "Toutes les décisions (4) →" })).toHaveAttribute("href", "/dashboard?view=validation");
    await expect(page.locator("main .primary:visible")).toHaveCount(1);

    await prisma.company.update({ where: { id: company.id }, data: { objective: null } });
    await page.reload();
    await expect(hero.getByRole("heading", { level: 1, name: "Quel résultat voulez-vous atteindre ?" })).toBeVisible();
    await expect(page.locator("main .primary:visible")).toHaveText(["En parler avec Paul"]);
    await hero.getByRole("button", { name: "En parler avec Paul" }).click();
    await expect(page.getByRole("dialog", { name: "Discussion avec Paul" })).toBeVisible();
  } finally { await prisma.$disconnect(); }
});

test("Paul has a single conversation: the home summary opens it and the team instruction is a company setting", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.chatMessage.createMany({ data: [
      { companyId: company.id, role: "user", content: "Que faire cette semaine ?" },
      { companyId: company.id, role: "assistant", content: "Commencez par relire les **deux posts** préparés par Camille." },
    ] });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/dashboard`);
    const summary = page.getByRole("complementary", { name: "Conversation avec Paul" });
    await expect(summary).toContainText("Commencez par relire les deux posts préparés par Camille.");
    await summary.getByRole("button", { name: "Reprendre la conversation" }).click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    await expect(panel.getByText("Que faire cette semaine ?")).toBeVisible();
    expect(await prisma.chatMessage.count({ where: { companyId: company.id } })).toBe(2);

    await page.goto(`${baseURL}/dashboard?view=plan`);
    await expect(page.getByLabel("Consigne pour l’équipe")).toHaveCount(0);

    await page.goto(`${baseURL}/entreprise`);
    // La page est diffusée en streaming : on attend que React ait pris la main sur le champ avant de saisir.
    await page.waitForFunction(() => {
      const field = document.querySelector("#direction");
      return Boolean(field && Object.keys(field).some((key) => key.startsWith("__reactFiber")));
    });
    await page.getByLabel("Consigne pour l’équipe").fill("Priorité aux syndics du 3e arrondissement");
    await page.getByRole("button", { name: "Enregistrer la consigne" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Consigne enregistrée" })).toBeVisible();
    await expect.poll(async () => (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).direction).toBe("Priorité aux syndics du 3e arrondissement");
  } finally { await prisma.$disconnect(); }
});

test("the plan shows the expected result and folds the agent instruction away", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.actionPlanItem.create({ data: {
      companyId: company.id, agent: "demarchage", title: "Contacter les syndics du secteur", theme: "Prospection", priority: 1,
      timing: "Demandé dans le chat", outcome: "Des syndics pensent à vous pour leurs petites interventions.",
      rationale: "Consigne technique : préparer 15 fiches, ton professionnel, sans promesse de délai.",
    } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/dashboard?view=plan`);
    const card = page.locator(".plan-row").filter({ hasText: "Contacter les syndics du secteur" });
    await expect(card).toContainText("Jean-Claude s’en charge");
    await expect(card.getByRole("button", { name: "Examiner et lancer" })).toBeVisible();
    await expect(card).toContainText("Résultat attendu : Des syndics pensent à vous pour leurs petites interventions.");
    // La consigne donnée à l'agent n'est jamais affichée d'office.
    await expect(card.getByText(/Consigne technique/)).toBeHidden();
    await card.getByText("Détails", { exact: true }).click();
    await expect(card.getByText(/Consigne donnée à Jean-Claude/)).toBeVisible();
    await expect(page.getByText("La diffusion reste une décision distincte.")).toHaveCount(0);
  } finally { await prisma.$disconnect(); }
});

test("the diagnostic is grouped by topic with a one-line summary, and a link to a finding opens its topic", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const [, , competitor] = await Promise.all([
      prisma.auditFinding.create({ data: { companyId: company.id, category: "site_web", title: "Pas de page de contact", content: "Aucun formulaire.", toImprove: "Ajouter un formulaire." } }),
      prisma.auditFinding.create({ data: { companyId: company.id, category: "site_web", title: "Numéro bien visible", content: "Le numéro est cliquable.", whatWorks: "Numéro cliquable." } }),
      prisma.auditFinding.create({ data: { companyId: company.id, category: "concurrence", title: "Concurrents mieux notés", content: "Plus d'avis chez eux.", toImprove: "Collecter des avis." } }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/diagnostic`);
    const site = page.locator("details.diagnostic-group").filter({ hasText: "Site web" });
    await expect(site.locator("summary")).toContainText("1 point à renforcer · 1 point positif");
    // Plusieurs sujets : repliés d'office, on creuse seulement ce qui intéresse.
    await expect(site.getByRole("heading", { name: "Pas de page de contact" })).toBeHidden();
    await site.locator("summary").click();
    await expect(site.getByRole("heading", { name: "Pas de page de contact" })).toBeVisible();
    await expect(site.getByText("Aucun formulaire.")).toBeHidden();
    await page.goto(`${baseURL}/diagnostic#finding-${competitor.id}`);
    await expect(page.locator(`#finding-${competitor.id}`)).toBeVisible();
  } finally { await prisma.$disconnect(); }
});

test("the review queue shows one production at a time, moves forward and filters by agent", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.agentProposal.createMany({ data: [
      { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post de Camille", content: "Texte" },
      { companyId: company.id, agent: "demarchage", kind: "prospecting_email", title: "Email de Jean-Claude", content: "Bonjour" },
    ] });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await expect(page.locator("main article")).toHaveCount(1);
    await expect(page.locator(".queue-position")).toContainText("Production 1 sur 2");
    const first = await page.locator(".production-head h2").textContent();
    await page.getByRole("button", { name: "Suivante →" }).click();
    await expect(page.locator(".queue-position")).toContainText("Production 2 sur 2");
    await expect(page.locator(".production-head h2")).not.toHaveText(first ?? "");
    const filters = page.getByRole("group", { name: "Filtrer par agent" });
    await filters.getByRole("button", { name: "Jean-Claude" }).click();
    await expect(page.locator(".production-list button")).toHaveCount(1);
    await expect(page.locator(".production-head h2")).toHaveText("Email de Jean-Claude");
    await filters.getByRole("button", { name: "Toute l’équipe" }).click();
    await expect(page.locator(".production-list button")).toHaveCount(2);
    await expect(page.getByText("Approuver ou rejeter ne publie ni n’envoie rien.")).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(page.getByRole("button", { name: "Suivante →" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await prisma.$disconnect(); }
});

test("prospects are contact cards whose next step is one click, filtered by stage", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const contacted = await prisma.lead.create({ data: { companyId: company.id, name: "Régie du Centre", reason: "Petites interventions", stage: "contacte", contactedAt: new Date() } });
    await prisma.lead.create({ data: { companyId: company.id, name: "Syndic du Parc", reason: "Copropriétés", stage: "a_contacter" } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/prospection`);
    // Les personnes sont des fiches ; seul le bilan par type de cible reste un tableau.
    await expect(page.locator("table").filter({ hasText: "Régie du Centre" })).toHaveCount(0);
    await expect(page.locator("main select")).toHaveCount(0);
    const card = page.getByRole("article", { name: "Régie du Centre" });
    await card.getByRole("button", { name: "Il a répondu" }).click();
    await expect.poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: contacted.id } })).stage).toBe("repondu");
    await expect(card.getByRole("button", { name: "RDV pris" })).toBeVisible();
    const filters = page.getByRole("group", { name: "Filtrer par étape" });
    await filters.getByRole("button", { name: /À contacter/ }).click();
    await expect(page.locator(".lead-tile")).toHaveCount(1);
    await expect(page.getByRole("article", { name: "Syndic du Parc" }).getByRole("button", { name: "Préparer un message" })).toBeVisible();
    await page.getByRole("article", { name: "Syndic du Parc" }).getByRole("button", { name: "Préparer un message" }).click();
    await expect(page.getByLabel(/Message préparé/)).toHaveValue(/Syndic du Parc/);
  } finally { await prisma.$disconnect(); }
});

test("explicit admin can tune global risk level but cannot lower the effective floor", async ({ page, company }) => {
  test.skip(!adminFixture, "Requires an isolated local server with ADMIN_EMAILS for the fixture admin.");
  expect(company.ownerEmail).toBe("ux-admin-settings-test@example.invalid");
  const settings = [{
    kind: "piste_croissance", label: "Piste de croissance", configuredLevel: null,
    minimumLevel: "modere", effectiveLevel: "modere", updatedBy: null, updatedAt: null,
  }];
  await page.route("**/api/admin/delegation-risk", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
    const input = route.request().postDataJSON();
    expect(input).toEqual({ actionKind: "piste_croissance", riskLevel: "eleve" });
    return route.fulfill({ json: {
      actionKind: input.actionKind, configuredLevel: input.riskLevel, effectiveLevel: "eleve",
      minimumLevel: "modere", updatedBy: "ux-admin-settings-test@example.invalid", updatedAt: new Date().toISOString(),
    } });
  });
  await page.goto(`${baseURL}/admin/risques`);
  await expect(page.getByRole("heading", { name: "Politique de risque des actions" })).toBeVisible();
  const risk = page.getByLabel("Risque pour Piste de croissance");
  await expect(risk).toHaveValue("modere");
  await expect(risk.locator('option[value="faible"]')).toBeDisabled();
  const belowFloor = await page.request.patch(`${baseURL}/api/admin/delegation-risk`, {
    headers: { Origin: baseURL }, data: { actionKind: "site_web_content", riskLevel: "faible" },
  });
  expect(belowFloor.status()).toBe(400);
  await risk.selectOption("eleve");
  await expect(page.getByRole("status")).toContainText("Niveau de risque mis à jour");
  await expect(risk).toHaveValue("eleve");
    await expect(page.getByText("Niveau effectif : Élevé")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const otherContext = await page.context().browser()!.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherContext.addCookies([{ name: "pepito_session", value: createSessionToken(company.ownerEmail, company.sessionVersion, process.env.SESSION_SECRET!), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    const denied = await otherPage.request.get(`${baseURL}/api/admin/delegation-risk`);
    expect(denied.status()).toBe(403);
    const deniedUpdate = await otherPage.request.patch(`${baseURL}/api/admin/delegation-risk`, {
      headers: { Origin: baseURL }, data: { actionKind: "piste_croissance", riskLevel: "eleve" },
    });
    expect(deniedUpdate.status()).toBe(403);
  } finally {
    await otherContext.close();
  }
});

test("clearing optional company profile fields removes them from storage and agent context", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const previousProfile = {
    website: "https://old.example.invalid",
    socialHandles: "@old_profile",
    objective: "Ancien objectif à remplacer",
    description: "Ancienne description de test",
    phone: "+33102030405",
    certifications: "Ancien label de test",
    openingHours: "Anciennes heures de test",
  };

  try {
    await prisma.company.update({ where: { id: company.id }, data: previousProfile });
    await page.goto(`${baseURL}/entreprise`);
    await expect(page.getByPlaceholder("Site web (optionnel — beaucoup de TPE n'en ont pas)")).toHaveValue(previousProfile.website);
    await expect(page.locator('input[placeholder^="Compte Instagram/Facebook"]')).toHaveValue(previousProfile.socialHandles);

    await page.getByRole("button", { name: "Objectifs", exact: true }).click();
    await page.getByPlaceholder("ex: 10 nouveaux clients par mois").fill("");
    await page.getByRole("button", { name: "Informations", exact: true }).click();
    await page.locator("#profile-description").fill("");
    await page.getByPlaceholder("Téléphone affiché aux clients (optionnel)").fill("");
    await page.getByPlaceholder("Certifications / labels (ex: RGE, optionnel)").fill("");
    await page.getByPlaceholder("Horaires d'ouverture (optionnel)").fill("");
    await page.getByPlaceholder("Site web (optionnel — beaucoup de TPE n'en ont pas)").fill("");
    await page.locator('input[placeholder^="Compte Instagram/Facebook"]').fill("");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);

    const cleared = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    for (const field of Object.keys(previousProfile) as (keyof typeof previousProfile)[]) {
      expect(cleared[field], `${field} should be cleared`).toBeNull();
    }
    const agentContext = `${companyProfileLines(cleared)}\n${objectiveLine(cleared)}`;
    for (const value of Object.values(previousProfile)) {
      expect(agentContext).not.toContain(value);
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("natural-language onboarding previews extracted fields and asks for missing required details one at a time", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { name: "", trade: "", servingArea: "", objective: null } });
    await page.route("**/api/onboarding/interpret", (route) => route.fulfill({ json: { profile: {
      name: "Atelier Exemple", trade: "Plomberie", servingArea: "", objective: "",
    } } }));

    await page.goto(`${baseURL}/onboarding`);
    const sentencePanel = page.getByRole("region", { name: "Démarrer en une phrase" });
    await sentencePanel.getByLabel("Décrivez votre activité et votre objectif en une phrase").fill("Je suis plombier et je cherche cinq clients par mois.");
    await sentencePanel.getByRole("button", { name: "Préremplir mon profil" }).click();

    await expect(sentencePanel.getByText("Information manquante : zone de chalandise")).toBeVisible();
    await expect(page.getByPlaceholder("Nom commercial")).toHaveValue("Atelier Exemple");
    await expect(page.getByPlaceholder("Votre métier (ex: plombier, restaurant...)")).toHaveValue("Plomberie");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).name).toBe("");

    await sentencePanel.locator("input").fill("Lille et alentours");
    await sentencePanel.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(sentencePanel.getByText("Information manquante : objectif")).toBeVisible();
    await expect(page.getByPlaceholder("ex: 10 nouveaux clients par mois")).toHaveValue("");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).servingArea).toBe("");

    await sentencePanel.locator("input").fill("Trouver cinq nouveaux clients par mois");
    await sentencePanel.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(sentencePanel.getByText("Voici ce que j'ai compris. Vérifiez et corrigez les champs avant d'enregistrer.")).toBeVisible();
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).name).toBe("");

    await page.getByRole("button", { name: "Valider et lancer mon audit" }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.name).toBe("Atelier Exemple");
    expect(saved.trade).toBe("Plomberie");
    expect(saved.servingArea).toBe("Lille et alentours");
    expect(saved.objective).toBe("Trouver cinq nouveaux clients par mois");
  } finally {
    await prisma.$disconnect();
  }
});

test("guided onboarding starts with three fields and keeps the full company page available", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: {
      name: "", trade: "", servingArea: "", objective: null, description: null, phone: null,
      certifications: null, openingHours: null, website: null, socialHandles: null,
    } });
    await page.goto(`${baseURL}/onboarding`);
    await expect(page.getByRole("button", { name: "Valider et lancer mon audit" })).toBeEnabled();
    await expect(page.locator("form input")).toHaveCount(3);
    await expect(page.getByPlaceholder("CA mensuel actuel (€)")).toHaveCount(0);
    await page.getByPlaceholder("Nom commercial").fill("Atelier Minimal");
    await page.getByPlaceholder("Votre métier (ex: plombier, restaurant...)").fill("Plomberie");
    await page.getByPlaceholder("Zone de chalandise (ex: Lyon et alentours)").fill("Lille");
    // Le premier audit est lancé par le serveur : le navigateur n'appelle plus aucun agent.
    let agentCalls = 0;
    await page.route("**/api/agents/**", (route) => {
      agentCalls += 1;
      return route.continue();
    });
    await page.getByRole("button", { name: "Valider et lancer mon audit" }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    await page.unroute("**/api/agents/**");
    expect(agentCalls).toBe(0);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.name).toBe("Atelier Minimal");
    expect(saved.trade).toBe("Plomberie");
    expect(saved.servingArea).toBe("Lille");
    expect(saved.objective).toBeNull();
    expect(saved.phone).toBeNull();
    await page.getByRole("link", { name: "Mon entreprise", exact: true }).first().click();
    await expect(page).toHaveURL(`${baseURL}/entreprise`);
    await expect(page.getByRole("heading", { name: "Le contexte commun à votre équipe.", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Nom commercial")).toHaveValue("Atelier Minimal");
    await expect(page.getByPlaceholder("Téléphone affiché aux clients (optionnel)")).toBeVisible();
    await page.getByPlaceholder("Téléphone affiché aux clients (optionnel)").fill("0102030405");
    await page.getByRole("button", { name: "Objectifs", exact: true }).click();
    await expect(page.getByPlaceholder("CA mensuel actuel (€)")).toBeVisible();
    await page.getByPlaceholder("CA mensuel actuel (€)").fill("4200");
    await page.getByRole("button", { name: "Informations", exact: true }).click();
    await expect(page.getByPlaceholder("Téléphone affiché aux clients (optionnel)")).toHaveValue("0102030405");
    await page.getByRole("button", { name: "Objectifs", exact: true }).click();
    await expect(page.getByPlaceholder("CA mensuel actuel (€)")).toHaveValue("4200");
    await expect(page.getByRole("region", { name: "Démarrer en une phrase" })).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("a prospect is verified, a message is prepared and copied without contact, then the real contact is declared, corrected, deferred or discarded", async ({ page, company, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const DAY = 24 * 60 * 60 * 1000;
  const dayAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const display = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  try {
    const base = { companyId: company.id, stage: "a_contacter", reason: "Organise des événements de quartier" };
    const bare = await prisma.lead.create({ data: { ...base, name: "Association Sans Contact", createdAt: new Date(Date.now() - 3 * DAY) } });
    const usable = await prisma.lead.create({ data: { ...base, name: "Association Complète", publicContact: "Formulaire sur asso.example", source: "https://asso.example/contact", segment: "associations" } });
    const reload = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

    await page.goto(`${baseURL}/prospection`);
    const next = page.getByRole("region", { name: "Prochain prospect à traiter" });
    await expect(next.getByText("Association Complète")).toBeVisible();
    await next.getByRole("button", { name: "Traiter ce prospect" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "source" })).toBeVisible();

    await dialog.getByRole("button", { name: "Préparer un message" }).click();
    await expect(dialog.getByLabel(/Message préparé/)).toHaveValue(/Association Complète/);
    expect(await dialog.getByLabel(/Message préparé/).inputValue()).not.toMatch(/@/);
    await dialog.getByRole("button", { name: "Copier le message" }).click();
    await expect(dialog.getByRole("status")).toContainText("Rien n'a été envoyé");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Association Complète");
    expect(await reload(usable.id)).toMatchObject({ stage: "a_contacter", contactedAt: null });

    const first = dayAgo(2);
    await dialog.getByRole("button", { name: "J'ai pris contact" }).click();
    await dialog.getByLabel("Date du contact").fill(first);
    await dialog.getByRole("button", { name: "Enregistrer le contact" }).click();
    await expect(dialog.getByText(`Contact déclaré le ${display(first)}.`)).toBeVisible();
    expect(await reload(usable.id)).toMatchObject({ stage: "contacte" });
    expect((await reload(usable.id)).contactedAt!.toISOString().slice(0, 10)).toBe(first);

    const corrected = dayAgo(3);
    await dialog.getByRole("button", { name: "Modifier la date du contact" }).click();
    await dialog.getByLabel("Date du contact").fill(corrected);
    await dialog.getByRole("button", { name: "Enregistrer la date" }).click();
    await expect(dialog.getByText(`Contact déclaré le ${display(corrected)}.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Ce n'était pas un contact" }).click();
    await expect(dialog.getByRole("button", { name: "Différer", exact: true })).toBeVisible();
    expect(await reload(usable.id)).toMatchObject({ stage: "a_contacter", contactedAt: null });

    await dialog.getByRole("button", { name: "Différer", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Différer ce prospect" })).toBeDisabled();
    await dialog.getByLabel(/Raison du report/).fill("Salon la semaine prochaine");
    await dialog.getByRole("button", { name: "Différer ce prospect" }).click();
    await expect.poll(async () => (await reload(usable.id)).statusReason).toBe("Salon la semaine prochaine");
    expect((await reload(usable.id)).deferredUntil).not.toBeNull();
    await page.keyboard.press("Escape");
    await expect(next.getByText("Association Sans Contact")).toBeVisible();

    await next.getByRole("button", { name: "Traiter ce prospect" }).click();
    await dialog.getByRole("button", { name: "Écarter", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Écarter ce prospect" })).toBeDisabled();
    await dialog.getByLabel(/Raison de l'écart/).fill("Hors zone");
    await dialog.getByRole("button", { name: "Écarter ce prospect" }).click();
    await expect.poll(async () => (await reload(bare.id)).stage).toBe("ecarte");
    expect(await reload(bare.id)).toMatchObject({ stage: "ecarte", statusReason: "Hors zone" });
    await page.keyboard.press("Escape");
    await expect(next).toHaveCount(0);
    const discarded = page.getByRole("article", { name: "Association Sans Contact" });
    await discarded.getByText("Détails", { exact: true }).click();
    await discarded.getByRole("button", { name: /Gérer/ }).click();
    await dialog.getByRole("button", { name: "Reprendre ce prospect" }).click();
    await expect.poll(async () => (await reload(bare.id)).stage).toBe("a_contacter");
    expect((await reload(bare.id)).statusReason).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("the prospect follow-up API refuses invented progress, future contacts and unexplained discards", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const DAY = 24 * 60 * 60 * 1000;
  const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  try {
    const lead = await prisma.lead.create({ data: { companyId: company.id, name: "Association A", reason: "Cible locale", stage: "a_contacter" } });
    await prisma.lead.create({ data: { companyId: company.id, name: "Association C", reason: "Autre cible", stage: "a_contacter" } });
    const pending = await prisma.lead.create({ data: { companyId: company.id, name: "Association B", reason: "Cible locale", stage: "propose" } });
    const patch = (id: string, data: object) => page.request.patch(`${baseURL}/api/leads/${id}`, { data });
    await page.goto(`${baseURL}/prospection`);
    await page.getByRole("searchbox", { name: "Rechercher" }).fill("Association A");
    await expect(page.getByRole("article", { name: "Association A" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Association C" })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Rechercher" }).clear();

    expect((await patch(lead.id, { stage: "gagne" })).status()).toBe(409);
    expect((await patch(lead.id, { stage: "perdu" })).status()).toBe(409);
    expect((await patch(lead.id, { stage: "ecarte" })).status()).toBe(400);
    expect((await patch(lead.id, { stage: "contacte", contactedAt: day(5) })).status()).toBe(400);
    expect((await patch(lead.id, { stage: "contacte", contactedAt: "2026-13-45" })).status()).toBe(400);
    expect((await patch(lead.id, { deferUntil: day(-2), reason: "Trop tôt" })).status()).toBe(400);
    expect((await patch(lead.id, { deferUntil: day(7) })).status()).toBe(400);
    expect((await patch(lead.id, { contactedAt: day(-1) })).status()).toBe(409);
    expect((await patch(pending.id, { stage: "contacte" })).status()).toBe(409);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ stage: "a_contacter", contactedAt: null, deferredUntil: null, statusReason: null });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: pending.id } })).stage).toBe("propose");

    expect((await patch(lead.id, { stage: "contacte", contactedAt: day(-1) })).status()).toBe(200);
    expect((await patch(lead.id, { stage: "ecarte", reason: "Hors zone" })).status()).toBe(409);
  } finally {
    await prisma.$disconnect();
  }
});

test("Paul is reachable from any page, keeps the conversation and the draft, and knows the page and the consulted element", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.chatMessage.createMany({ data: [
      { companyId: company.id, role: "user", content: "Bonjour Paul", createdAt: new Date(Date.now() - 60_000) },
      { companyId: company.id, role: "assistant", content: "Bonjour, que puis-je faire ?", createdAt: new Date(Date.now() - 30_000) },
    ] });
    const proposal = await prisma.agentProposal.create({ data: { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post du lundi", content: "Texte du post" } });
    const finding = await prisma.auditFinding.create({ data: { companyId: company.id, category: "site_web", title: "Constat mobile", content: "Résumé du constat" } });
    const lead = await prisma.lead.create({ data: { companyId: company.id, name: "Association suivie", reason: "Cible locale", stage: "a_contacter" } });
    const sent: Array<{ message: string; context: { path: string; view?: string; element?: { type: string; id: string } } }> = [];
    await page.route("**/api/co-ceo/message", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ json: {
        reply: `Voici l'explication. [[bd:proposal:${proposal.id}]] [[bd:finding:${finding.id}]] [[bd:lead:${lead.id}]]`,
        references: [
          { marker: `[[bd:proposal:${proposal.id}]]`, type: "proposal", id: proposal.id, label: "Post du lundi", href: `/dashboard?proposal=${proposal.id}#proposal-${proposal.id}` },
          { marker: `[[bd:finding:${finding.id}]]`, type: "finding", id: finding.id, label: "Constat mobile", href: `/diagnostic#finding-${finding.id}` },
          { marker: `[[bd:lead:${lead.id}]]`, type: "lead", id: lead.id, label: "Association suivie", href: `/prospection#lead-${lead.id}` },
        ],
      } });
    });

    await page.goto(`${baseURL}/dashboard?view=validation`);
    const toggle = page.getByRole("button", { name: "Échanger avec Paul", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Échanger avec Paul sur cette production" }).first().click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Bonjour Paul")).toBeVisible();
    await expect(panel.getByText(/sait que vous êtes sur : Productions à valider/)).toBeVisible();
    await expect(panel.getByText("À propos de : production « Post du lundi »")).toBeVisible();

    await panel.getByLabel("Message à Paul").fill("Explique-moi ça");
    await panel.getByRole("button", { name: "Envoyer" }).click();
    await expect(panel.getByText("Voici l'explication.")).toBeVisible();
    const proposalLink = panel.getByRole("link", { name: "Post du lundi" });
    await expect(proposalLink).toHaveAttribute("href", `/dashboard?proposal=${proposal.id}#proposal-${proposal.id}`);
    await expect(panel.getByRole("link", { name: "Constat mobile" })).toHaveAttribute("href", `/diagnostic#finding-${finding.id}`);
    await expect(panel.getByRole("link", { name: "Association suivie" })).toHaveAttribute("href", `/prospection#lead-${lead.id}`);
    await proposalLink.click();
    await expect(page).toHaveURL(new RegExp(`proposal=${proposal.id}`));
    await expect(panel).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toBe("Explique-moi ça");
    expect(sent[0].context).toEqual({ path: "/dashboard", view: "validation", element: { type: "proposal", id: proposal.id } });

    await panel.getByLabel("Message à Paul").fill("Une autre question");
    await page.goto(`${baseURL}/prospection`);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByLabel("Message à Paul")).toHaveValue("Une autre question");
    await expect(panel.getByText("Bonjour Paul")).toBeVisible();
    await expect(panel.getByText(/sait que vous êtes sur : Prospection/)).toBeVisible();
    await expect(panel.getByText(/À propos de/)).toHaveCount(0);

    await panel.getByLabel("Message à Paul").press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  } finally {
    await prisma.$disconnect();
  }
});

test("Paul answers as a stream with Enter to send, and a hands-free voice exchange reads the reply then stops after silence", async ({ page, company }) => {
  expect(company.ownerEmail).toContain("@");
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let heard = 0;
    Object.assign(window, { __spoken: spoken });
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          if (heard++ === 0) this.onresult?.({ results: [Object.assign([{ transcript: "Où en est mon plan" }], { isFinal: true })] });
          else this.onerror?.({ error: "no-speech" });
          this.onend?.();
        }, 30);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
    class FakeUtterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; text: string; constructor(text: string) { this.text = text; } }
    Object.assign(window, { SpeechSynthesisUtterance: FakeUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak(utterance: FakeUtterance) { spoken.push(utterance.text); setTimeout(() => utterance.onend?.(), 20); } },
    });
  });
  const sent: Array<{ message: string }> = [];
  await page.route("**/api/co-ceo/message", async (route) => {
    sent.push(route.request().postDataJSON());
    const reply = `Réponse ${sent.length}.`;
    expect(route.request().headers().accept).toContain("application/x-ndjson");
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: [
        { type: "delta", text: "Réponse " },
        { type: "reset" },
        { type: "delta", text: `Réponse ${sent.length}. [[bd:proposal:abc` },
        { type: "done", reply, references: [] },
      ].map((event) => `${JSON.stringify(event)}\n`).join(""),
    });
  });

  await page.goto(`${baseURL}/dashboard`);
  await page.getByRole("button", { name: "Échanger avec Paul", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
  const input = panel.getByLabel("Message à Paul");
  await input.fill("Bonjour, on commence ?");
  await input.press("Enter");
  await expect(panel.getByText("Bonjour, on commence ?")).toBeVisible();
  await expect(panel.getByText("Réponse 1.")).toBeVisible();
  await expect(input).toHaveValue("");
  expect(await panel.getByText(/\[\[bd/).count()).toBe(0);
  await input.fill("Ligne 1");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Ligne 1\n");
  expect(sent).toHaveLength(1);
  await input.fill("");

  await panel.getByRole("button", { name: "Échange vocal" }).click();
  await expect(panel.getByText("Où en est mon plan")).toBeVisible();
  await expect(panel.getByText("Réponse 2.")).toBeVisible();
  expect(sent[1].message).toBe("Où en est mon plan");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toEqual(["Réponse 2."]);
  await expect(panel.getByText("Échange vocal arrêté : je n'ai rien entendu.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Échange vocal" })).toBeVisible();
  expect(sent).toHaveLength(2);
});

test("a running agent shows indicative steps, is followed again after leaving the page, and its end is announced", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const seeded = await prisma.agentRun.create({ data: {
      companyId: company.id, agent: "contenu", requestKey: `seed-${randomUUID()}`, activeDedupeKey: `seed-${randomUUID()}`,
      payload: { kind: "direct", agent: "contenu" }, status: "running", startedAt: new Date(Date.now() - 5000), attempts: 1,
    } });
    const view = { id: seeded.id, agent: "contenu", planItemId: null, attempts: 1, maxDurationSeconds: 60, queuedAt: seeded.queuedAt.toISOString(), startedAt: seeded.startedAt!.toISOString(), errorMessage: null };
    let finished = false;
    await page.route(`**/api/agent-runs/${seeded.id}`, (route) => route.fulfill({ json: { run: finished
      ? { ...view, status: "succeeded", finishedAt: new Date().toISOString(), resultCount: 3 }
      : { ...view, status: "running", finishedAt: null, resultCount: 0 } } }));

    await page.goto(`${baseURL}/equipe`);
    const tracker = page.getByRole("region", { name: "Exécutions récentes" });
    await expect(tracker.getByText("Lecture de votre activité et du diagnostic").first()).toBeVisible();
    await expect(tracker.getByText("Rédaction des contenus")).toBeVisible();
    await expect(tracker.getByText(/Durée habituelle : environ 30 s/)).toBeVisible();
    await expect(tracker.getByText(/Vous pouvez quitter cette page/)).toBeVisible();

    await page.goto(`${baseURL}/dashboard`);
    await page.goBack();
    await expect(tracker.getByText("Lecture de votre activité et du diagnostic").first()).toBeVisible();

    finished = true;
    await expect(page.getByRole("status")).toContainText("Demande traitée");
    await expect(tracker.getByText("Camille a terminé : 3 élément(s) à examiner.")).toBeVisible();
    await expect(tracker.getByRole("link", { name: "Voir le résultat" })).toHaveAttribute("href", "/dashboard?view=validation");
  } finally {
    await prisma.$disconnect();
  }
});

test("agents request only missing profile details and wait for successful partial saving", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  let agentCalls = 0;
  try {
    await prisma.company.update({ where: { id: company.id }, data: {
      description: null, phone: null, certifications: null, openingHours: null, website: null,
    } });
    const successfulRun = { id: "run-test-camille", agent: "contenu", planItemId: null, status: "succeeded", attempts: 1, maxDurationSeconds: 60, queuedAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), resultCount: 0, errorMessage: null };
    await page.route("**/api/agents/contenu/run", (route) => {
      agentCalls += 1;
      return route.fulfill({ status: 202, json: { run: successfulRun } });
    });
    await page.route("**/api/agent-runs/run-test-camille", (route) => route.fulfill({ json: { run: successfulRun } }));
    await page.goto(`${baseURL}/equipe`);
    const camille = page.locator("section").filter({ has: page.getByRole("heading", { name: "Camille", exact: true }) });
    await camille.getByText("Demande ponctuelle", { exact: true }).click();
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    const dialog = page.getByRole("dialog", { name: "Compléments pour Camille" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Objectif principal (facultatif)")).toHaveCount(0);
    await expect(dialog.getByLabel("Site web (facultatif)")).toHaveCount(0);
    expect(agentCalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("profile-details-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("profile-details-mobile.png"), fullPage: true });
    await dialog.getByLabel("Activité et savoir-faire (facultatif)").fill("Dépannage et rénovation");
    await dialog.getByLabel("Téléphone affiché aux clients (facultatif)").fill("0102030405");
    await page.route("**/api/companies", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, json: { error: "Compléments non enregistrés" } });
      else await route.continue();
    });
    await dialog.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Compléments non enregistrés");
    expect(agentCalls).toBe(0);
    await expect(dialog.getByLabel("Téléphone affiché aux clients (facultatif)")).toHaveValue("0102030405");
    await page.unroute("**/api/companies");
    await dialog.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("Demande traitée");
    expect(agentCalls).toBe(1);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.description).toBe("Dépannage et rénovation");
    expect(saved.phone).toBe("0102030405");
    expect(saved.monthlyRevenue).toBe(company.monthlyRevenue);
    expect(saved.objective).toBe(company.objective);
    expect(saved.website).toBeNull();
    for (const invalid of [{ phone: 42 }, { phone: "x".repeat(101) }, { companyId: "another-company", phone: "999" }]) {
      expect((await page.request.patch(`${baseURL}/api/companies`, { data: invalid })).status()).toBe(400);
    }
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Téléphone affiché aux clients (facultatif)")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(agentCalls).toBe(1);
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    await dialog.getByRole("button", { name: "Continuer sans complément" }).click();
    await expect(page.getByRole("status")).toContainText("Demande traitée");
    expect(agentCalls).toBe(2);
  } finally {
    await prisma.$disconnect();
  }
});
test("Paul's objective card is confirmed in one click and stays confirmed in the history", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const { attachPendingActions, createPendingAction, toPendingActionView } = await import("../src/lib/agents/pending-actions");
    // L'entreprise de test a déjà un objectif chiffré : la carte doit le laisser intact jusqu'au clic.
    const before = (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).revenueTarget;
    const card = await createPendingAction(company.id, "update_objective", {
      revenueTarget: 200000, targetPeriod: "year", currentRevenue: 140000, currentPeriod: "year", averageClientValue: 18000, newClients: 6, newClientsPeriod: "year",
    });
    const view = toPendingActionView(card)!;
    await page.route("**/api/co-ceo/message", (route) => route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "done", reply: "Voici votre objectif, à confirmer.", references: [], actions: [view] })}\n`,
    }));

    await page.goto(`${baseURL}/dashboard`);
    await page.getByRole("button", { name: "Échanger avec Paul", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    const input = panel.getByLabel("Message à Paul");
    await input.fill("Je veux passer de 140 000 à 200 000 € par an.");
    await input.press("Enter");
    const cardGroup = panel.getByRole("group", { name: "Proposition de Paul à confirmer" });
    for (const line of view.lines) await expect(cardGroup.getByText(line, { exact: true })).toBeVisible();
    // Rien n'est écrit avant le clic.
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).revenueTarget).toBe(before);

    await cardGroup.getByRole("button", { name: "Confirmer" }).click();
    await expect(cardGroup.getByText("C’est enregistré.")).toBeVisible();
    await expect.poll(async () => (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).revenueTarget).toBe(16667);

    // Le tour réel rattache la carte au message de Paul : l'historique la montre confirmée après rechargement.
    const message = await prisma.chatMessage.create({ data: { companyId: company.id, role: "assistant", content: "Voici votre objectif, à confirmer." } });
    await attachPendingActions(company.id, [card.id], message.id);
    await page.unroute("**/api/co-ceo/message");
    await page.reload();
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Échanger avec Paul", exact: true }).click();
    await expect(panel.getByRole("group", { name: "Proposition de Paul à confirmer" }).getByText("C’est enregistré.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Confirmer" })).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});
