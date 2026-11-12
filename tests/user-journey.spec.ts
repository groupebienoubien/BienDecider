import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient, type Company } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { encryptGmailToken } from "../src/lib/oauth/gmail";
import { companyProfileLines, objectiveLine } from "../src/lib/agents/personas";
import { getRejectionContext } from "../src/lib/agents/rejection-context";
import { createSessionToken } from "../src/lib/session-token";
import { createTestDraft, discoverThenSeeFindings, interpretThenConfirmAmbition, testIpHeader, waitForIntelligence } from "./support/onboarding-draft";
import { intelligenceInputFor, readDraftState } from "../src/lib/onboarding/draft-rules";
import { INTELLIGENCE_MESSAGES, newIntelligence } from "../src/lib/onboarding/intelligence-rules";

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
      // L'ancien parcours n'existe plus que pour ces tests : il est retiré, avec eux, au fil des US V5.2.
      workspaceV52: false,
      objective: "Développer les demandes de devis", monthlyRevenue: 4000, revenueTarget: 6000, averageClientValue: 500,
      description: "Artisan de proximité", phone: "0100000000", certifications: "Label de test", openingHours: "Lundi au vendredi",
    } });
    try {
      const session = createSessionToken(ownerEmail, company.sessionVersion, process.env.SESSION_SECRET);
      await page.context().addCookies([{ name: "pepito_session", value: session, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
      await page.route("**/api/agents/**", (route) => route.fulfill({ status: 503, json: { error: "Agent indisponible pour le test" } }));
      await runFixture(company);
    } finally {
      // L'audit d'inscription tourne en arrière-plan (story 1.3) : la suppression peut croiser ses écritures (P2034).
      for (let attempt = 1; ; attempt++) {
        try {
          await prisma.company.delete({ where: { id: company.id } });
          break;
        } catch (error) {
          const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
          if (!conflict || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
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

test("a manager reports a problem from any page, on desktop and on a phone, and gets an acknowledgement", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await page.goto(`${baseURL}/dashboard`);
    const footer = page.locator("footer.workspace-footer");
    await footer.getByRole("button", { name: "Signaler un problème" }).click();
    const dialog = page.getByRole("dialog", { name: "Signaler un problème" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.setViewportSize({ width: 320, height: 720 });
    await footer.getByRole("button", { name: "Signaler un problème" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Type de signalement").selectOption("idea");
    await dialog.getByLabel("Votre message").fill("Un raccourci vers mes devis serait utile.");
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(dialog.getByRole("status")).toContainText("bien transmis");
    await dialog.getByRole("button", { name: "Fermer" }).first().click();
    await expect(dialog).toBeHidden();
    const saved = await prisma.feedback.findMany({ where: { companyId: company.id } });
    expect(saved).toMatchObject([{ kind: "idea", page: "/dashboard", text: "Un raccourci vers mes devis serait utile.", handledAt: null }]);
  } finally { await prisma.$disconnect(); }
});

test("Mon compte shows the credit balance, the scale and the latest movements", async ({ page, company }) => {
  const created = await page.request.post(`${baseURL}/api/missions`, { headers: { Origin: baseURL }, data: { template: "social_post", title: "Publier un chantier", outcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers de novembre" } } });
  expect(created.status()).toBe(201);
  await page.goto(`${baseURL}/compte`);
  const credits = page.getByRole("region", { name: "Mes crédits" });
  await expect(credits).toContainText("20 crédits restants");
  await expect(credits).toContainText("Lancer une mission");
  await expect(credits).toContainText("Crédits offerts à l'inscription · +20");
  const mission = (await created.json()).mission;
  const launched = await page.request.post(`${baseURL}/api/missions/${mission.id}/transition`, { headers: { Origin: baseURL }, data: { action: "launch", expectedVersion: 1 } });
  expect(launched.status()).toBe(200);
  await page.reload();
  await expect(credits).toContainText("17 crédits restants");
  await expect(credits.getByRole("list", { name: "Derniers mouvements de crédits" })).toContainText("Lancement de la mission « Publier un chantier » · −3");
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(company.id).toBeTruthy();
});

test("V5.2 workspace: four pages, a single next decision, and a mission created, launched, paused, resumed and re-aimed", async ({ page, company }) => {
  test.setTimeout(90000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true, ownerName: "Rémi Durand" } });
    await page.goto(`${baseURL}/dashboard`);
    await expect(page).toHaveURL(/\/strategie$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bonjour Rémi." })).toBeVisible();
    const pages = page.getByRole("navigation", { name: "Pages" });
    for (const name of ["Stratégie", "Missions", "Atelier", "Résultats"]) await expect(pages.getByRole("link", { name })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mon compte\s*20 crédits/ })).toBeVisible();
    await expect(page.locator(".goal-mini")).toContainText("Développer les demandes de devis");
    await expect(page.getByRole("button", { name: "Laisser un avis" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discuter avec Paul" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aucune mission en cours" })).toBeVisible();
    for (const name of ["Martine", "Camille", "Jean-Claude"]) await expect(page.locator("body")).not.toContainText(name);

    // Créer une mission : 0 crédit, à décider, aucune diffusion.
    await page.getByRole("link", { name: "Créer une mission" }).first().click();
    await expect(page).toHaveURL(/\/missions\/nouvelle$/);
    await page.getByLabel("Le constat de départ").fill("Aucune publication depuis trois mois sur la Page.");
    await page.getByLabel("Nom de la mission").fill("Publier un chantier");
    await page.getByLabel("Type d'action").selectOption("social_post");
    await page.getByLabel("Sujet de la publication").fill("Notre chantier de cuisine à Paris");
    await page.getByLabel("Résultat recherché").fill("Deux demandes de devis");
    await page.getByRole("button", { name: "Créer la mission" }).click();
    await expect(page).toHaveURL(/\/missions\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Publier un chantier" })).toBeVisible();
    await expect(page.locator(".mission-heading .tags").first()).toContainText("À décider");

    // Lancer dans un cadre confirmé : 3 crédits, solde affiché, rien n'est diffusé.
    await page.getByRole("button", { name: "Confirmer et lancer" }).click();
    const launch = page.getByRole("dialog", { name: "Confirmer le cadre de la mission" });
    await expect(launch).toContainText("3 crédits · solde 20");
    await expect(launch).toContainText("0 € engagé");
    await expect(launch).toContainText("Sujet : Notre chantier de cuisine à Paris");
    await launch.getByRole("button", { name: "Confirmer le lancement" }).click();
    await expect(page.locator(".mission-heading .tags").first()).toContainText("En cours");
    await expect(page.getByRole("link", { name: /Mon compte\s*17 crédits/ })).toBeVisible();
    await expect(pages.getByRole("link", { name: /Missions\s*1/ })).toBeVisible();

    // Pause puis reprise sans frais.
    await page.getByRole("button", { name: "Mettre en pause" }).click();
    await page.getByRole("dialog", { name: "Mettre cette mission en pause ?" }).getByRole("button", { name: "Confirmer la pause" }).click();
    await expect(page.locator(".mission-heading .tags").first()).toContainText("En pause");
    await page.getByRole("button", { name: "Reprendre la mission" }).click();
    const resume = page.getByRole("dialog", { name: "Confirmer le cadre de la mission" });
    await expect(resume).toContainText("Reprise sans frais");
    await resume.getByRole("button", { name: "Reprendre la mission" }).click();
    await expect(page.locator(".mission-heading .tags").first()).toContainText("En cours");
    await expect(page.getByRole("link", { name: /Mon compte\s*17 crédits/ })).toBeVisible();

    // Modifier l'objectif, puis y revenir.
    await page.getByRole("button", { name: "Modifier l'objectif" }).click();
    const edit = page.getByRole("dialog", { name: "Modifier l'objectif de la mission" });
    await edit.getByLabel("Résultat recherché").fill("Trois demandes de devis");
    await edit.getByRole("button", { name: "Enregistrer l'objectif" }).click();
    await expect(edit).toBeHidden();
    await expect(page.locator(".mission-heading h1 + p")).toHaveText("Trois demandes de devis");
    await page.getByRole("button", { name: "Modifier l'objectif" }).click();
    await edit.getByRole("button", { name: "Y revenir" }).click();
    await expect(edit.getByLabel("Résultat recherché")).toHaveValue("Deux demandes de devis");
    await edit.getByRole("button", { name: "Enregistrer l'objectif" }).click();
    await expect(edit).toBeHidden();
    await expect(page.locator(".mission-heading h1 + p")).toHaveText("Deux demandes de devis");

    // Une deuxième mission à décider passe avant la mission en préparation dans le prochain pas.
    await page.goto(`${baseURL}/missions/nouvelle`);
    await page.getByLabel("Le constat de départ").fill("Un salon a lieu près de chez nous ce printemps.");
    await page.getByLabel("Nom de la mission").fill("Salon du quartier");
    await page.getByLabel("Type d'action").selectOption("custom");
    await page.getByLabel("Canal").selectOption("");
    await page.getByLabel("Ce que vous voulez faire").fill("Tenir un stand au salon de printemps du quartier");
    await page.getByLabel("Résultat recherché").fill("Dix contacts utiles");
    await page.getByRole("button", { name: "Créer la mission" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Salon du quartier" })).toBeVisible();
    await pages.getByRole("link", { name: "Stratégie" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Examiner « Salon du quartier »" })).toBeVisible();
    await expect(page.getByText("Rien ne sera lancé ou diffusé sans votre accord.")).toBeVisible();
    await expect(page.getByRole("article", { name: "Publier un chantier" })).toContainText("Déclaré par vous");

    // Liste filtrée par statut, filtre gardé dans l'adresse.
    await pages.getByRole("link", { name: /Missions/ }).click();
    await expect(page.getByRole("button", { name: "Toutes (2)" })).toBeVisible();
    await page.getByRole("button", { name: "En cours (1)" }).click();
    await expect(page).toHaveURL(/statut=en-cours/);
    await expect(page.locator(".mission-card")).toHaveCount(1);
    await expect(page.locator(".mission-card")).toContainText("Publier un chantier");
    await page.reload();
    await expect(page.locator(".mission-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Écartées (0)" }).click();
    await expect(page.getByText("Aucune mission dans cette vue")).toBeVisible();

    // Anciennes adresses et pages encore vides, honnêtes.
    await page.goto(`${baseURL}/rapport`);
    await expect(page).toHaveURL(/\/resultats$/);
    await expect(page.getByText("Rien n'a encore été diffusé.")).toBeVisible();
    await expect(page.getByText("Faites d'abord une première diffusion de cette mission : sans envoi, il n'y a rien à mesurer.")).toBeVisible();

    // Téléphone : menu repliable, page derrière inerte, Échap ferme.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${baseURL}/strategie`);
    await expect(pages).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(pages).toBeVisible();
    expect(await page.locator(".mq .workspace").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(pages).toBeHidden();
    expect(await page.locator(".mq .workspace").evaluate((element) => (element as HTMLElement).inert)).toBe(false);
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await pages.getByRole("link", { name: /Missions/ }).click();
    await expect(page).toHaveURL(/\/missions$/);
    await expect(pages).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto(`${baseURL}/missions/nouvelle`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const journal = await prisma.journalEntry.findMany({ where: { companyId: company.id }, select: { code: true } });
    expect(journal.map((entry) => entry.code).sort()).toEqual(["J-01", "J-01", "J-11", "J-11", "J-17", "J-17", "J-18"]);
  } finally { await prisma.$disconnect(); }
});

test("V5.2 atelier: a mission content is retouched, refused with a motive, restored, checked and validated without sending, then reworked with Paul", async ({ page, company }, testInfo) => {
  test.setTimeout(90000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "social_post", channel: "facebook", title: "Publier un chantier", outcome: "Deux demandes de devis", originalOutcome: "Deux demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Notre chantier de cuisine" }, status: "active", firstLaunchedAt: new Date(), position: 1 } });
    const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, versions: { create: { number: 1, title: "Nos chantiers de novembre", body: "Votre salle de bains refaite en 5 jours, à partir de 49 € le m². Appelez-nous au 06 12 34 56 78.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });

    // Stratégie : le contenu attend votre accord, l'atelier s'ouvre sur lui.
    await page.goto(`${baseURL}/strategie`);
    await expect(page.getByRole("heading", { level: 2, name: "Relire et valider le contenu" })).toBeVisible();
    await expect(page.getByRole("region", { name: "À valider par vous" }).locator(".decision").first()).toContainText("Publier un chantier · V1 · Page Facebook · prête à relire");
    await page.locator(".next-step").getByRole("link", { name: "Ouvrir l'atelier" }).click();
    await page.waitForURL(new RegExp(`/atelier/${content.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "L'atelier" })).toBeVisible();
    const preview = page.getByRole("article", { name: "Aperçu Page Facebook" });
    await expect(preview).toContainText("Nos chantiers de novembre");
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V1 · courante\s*Brouillon/);
    await expect(page.getByRole("link", { name: /V1\s*Premier brouillon préparé par Paul\s*par Paul/ })).toBeVisible();

    // Retouche : gardée dans l'onglet si la page est rechargée, puis enregistrée en V2.
    await page.getByLabel("Accroche").fill("Une cuisine livrée à Paris");
    await expect(page.getByRole("status").filter({ hasText: "Retouches non enregistrées." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Demander à Paul" })).toBeDisabled();
    await page.reload();
    await expect(page.getByLabel("Accroche")).toHaveValue("Une cuisine livrée à Paris");
    await expect(page.getByRole("status").filter({ hasText: "Retouches non enregistrées retrouvées." })).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V2 · courante\s*Brouillon/);
    await expect(preview).toContainText("Une cuisine livrée à Paris");
    await expect(page.getByRole("link", { name: /V2\s*Retouche directe par vous\s*par vous/ })).toBeVisible();

    // Refus : motif obligatoire, retenu par Paul.
    await page.getByRole("button", { name: "Je ne veux pas de cette version" }).click();
    const reject = page.getByRole("dialog", { name: "Je ne veux pas de cette version" });
    await expect(reject.getByRole("button", { name: "Refuser V2" })).toBeDisabled();
    await reject.getByLabel("Pourquoi ? (obligatoire)").fill("On ne parle pas de prix en ligne");
    await reject.getByRole("button", { name: "Refuser V2" }).click();
    await expect(reject).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V2 refusée" })).toBeVisible();
    await expect(page.locator(".atelier-decision")).toContainText("Votre motif : « On ne parle pas de prix en ligne ». Paul en tiendra compte");

    // Ancienne version en lecture seule ; y revenir crée V3.
    await page.getByRole("link", { name: /V1\s*Premier brouillon/ }).click();
    await page.waitForURL(/\?v=1$/);
    await expect(page.getByRole("heading", { level: 2, name: "V1 · archive en lecture seule" })).toBeVisible();
    await expect(page.getByLabel("Accroche")).toBeDisabled();
    await page.getByRole("button", { name: "Revenir à cette version" }).click();
    await page.waitForURL(new RegExp(`/atelier/${content.id}$`));
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V3 · courante\s*Brouillon/);
    await expect(preview).toContainText("Nos chantiers de novembre");

    // Valider : qui le verra, ce qui engage l'entreprise, case « J'ai relu » obligatoire, aucun envoi.
    await page.getByRole("button", { name: "Valider cette version" }).click();
    const validate = page.getByRole("dialog", { name: "Valider la version V3" });
    await expect(validate).toContainText("Les personnes qui suivent votre Page Facebook");
    await expect(validate.getByRole("listitem").filter({ hasText: "Prix, remises et montants" })).toContainText("« 49 € »");
    await expect(validate.getByRole("listitem").filter({ hasText: "Numéros de téléphone" })).toContainText("« 06 12 34 56 78 »");
    await expect(validate).toContainText("Paul repère ces éléments pour vous aider, mais ne peut pas les vérifier");
    await expect(validate.getByRole("button", { name: "Valider sans diffuser" })).toBeDisabled();
    await validate.getByLabel("J'ai relu le contenu et vérifié les informations qui engagent mon entreprise").check();
    await validate.getByRole("button", { name: "Valider sans diffuser" }).click();
    await expect(validate).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V3 validée" })).toBeVisible();
    await expect(page.locator(".atelier-decision")).toContainText("Aucun envoi effectué.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("atelier-1440.png"), fullPage: true });

    // Proposition de Paul : gardée contre 1 crédit, elle devient V4 et retire la validation.
    await prisma.missionContent.update({ where: { id: content.id }, data: { suggestion: { basedOn: 3, variant: { kind: "shorter", instruction: null }, title: "Cuisine livrée", body: "Une cuisine livrée à Paris. Parlons de votre projet." } } });
    await page.reload();
    await expect(page.getByText("Proposition de Paul · plus court")).toBeVisible();
    await page.getByRole("button", { name: "Garder cette version (1 crédit)" }).click();
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V4 · courante\s*Brouillon/);
    await expect(page.getByRole("link", { name: /Mon compte\s*19 crédits/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /V4\s*Préparée avec Paul : plus court\s*par Paul/ })).toBeVisible();

    const journal = await prisma.journalEntry.findMany({ where: { companyId: company.id, missionId: mission.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { code: true } });
    expect(journal.map((entry) => entry.code)).toEqual(["J-19", "J-27", "J-19", "J-20", "J-19"]);

    // La mission renvoie vers son contenu ; sur téléphone, l'atelier ne déborde pas.
    await page.goto(`${baseURL}/missions/${mission.id}`);
    await expect(page.getByRole("link", { name: "Ouvrir le contenu (V4) dans l'atelier" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "L'atelier" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("atelier-390.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("V5.2 diffusion: a validated page goes online once, an uncertain result is checked, a self-made diffusion is declared, and « Préparer seulement » is set in one place", async ({ page, company }, testInfo) => {
  test.setTimeout(90000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const seed = async (template: string, channel: string | null, title: string, position: number, scope: object = {}) => {
      const mission = await prisma.mission.create({ data: { companyId: company.id, template, channel, title, outcome: "Deux demandes de devis", originalOutcome: "Deux demandes de devis", finding: "Un constat", scope, status: "active", firstLaunchedAt: new Date(), position } });
      return prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel, format: channel === "site" ? "site_page" : "text", currentNumber: 1, validatedNumber: 1, validatedAt: new Date(), versions: { create: { number: 1, title, body: "Sur devis, sous 48 heures.\n\nAppelez-nous pour en parler.", author: "paul" } } } });
    };
    const sitePage = await seed("site_page", "site", "Nos tarifs", 1, { page: "Nos tarifs" });
    const offGrid = await seed("custom", null, "Stand au salon", 2);
    const doubtful = await seed("site_page", "site", "Nos horaires", 3, { page: "Nos horaires" });
    await prisma.publication.create({ data: { companyId: company.id, missionId: doubtful.missionId, contentId: doubtful.id, versionNumber: 1, title: "Nos horaires", channel: "site", channelLabel: "Votre site vitrine", mode: "confirmed", status: "uncertain", idempotencyKey: `${doubtful.id}:v1:1` } });

    // Mise en ligne confirmée : version, destination, moment, case ; la version ne bouge plus.
    await page.goto(`${baseURL}/atelier/${sitePage.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "V1 validée" })).toBeVisible();
    await page.getByRole("button", { name: "Préparer la publication" }).click();
    const publish = page.getByRole("dialog", { name: "Confirmer la diffusion" });
    await expect(publish).toContainText("Votre site vitrine");
    await expect(publish).toContainText("Maintenant");
    await expect(publish.getByRole("button", { name: "Diffuser maintenant" })).toBeDisabled();
    await publish.getByLabel("Je confirme cette version, cette destination et ce moment").check();
    await publish.getByRole("button", { name: "Diffuser maintenant" }).click();
    await expect(publish).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V1 diffusée" })).toBeVisible();
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V1 · courante\s*Diffusée/);
    await expect(page.getByLabel("Titre de la page")).toBeDisabled();
    const href = await page.getByRole("link", { name: "Voir la page publiée" }).getAttribute("href");
    expect(href).toMatch(/^\/site\/[a-z0-9-]+\/nos-tarifs$/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("diffusion-1440.png"), fullPage: true });
    await page.getByRole("button", { name: "Créer V2 à partir de V1" }).click();
    await expect(page.locator(".atelier .tags").first()).toHaveText(/V2 · courante\s*Brouillon/);
    await expect(page.getByRole("link", { name: /V1\s*Version\s*par Paul.*Diffusée · archive/ })).toBeVisible();
    await page.goto(`${baseURL}${href}`);
    await expect(page.getByRole("heading", { level: 1, name: "Nos tarifs" })).toBeVisible();
    await expect(page.getByText("Appelez-nous pour en parler.")).toBeVisible();

    // Résultat incertain : signalé dans la Stratégie, vérifié par vous, jamais renvoyé seul.
    await page.goto(`${baseURL}/strategie`);
    await expect(page.getByRole("region", { name: "À valider par vous" })).toContainText("Nos horaires · V1 · Site vitrine · diffusion à vérifier");
    await page.goto(`${baseURL}/atelier/${doubtful.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "Résultat incertain" })).toBeVisible();
    await page.getByRole("button", { name: "Ce n'est pas parti" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "V1 validée" })).toBeVisible();
    await expect(page.locator(".atelier-decision")).toContainText("La dernière tentative n'a pas abouti : non parti, vérifié par vous.");
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();

    // Hors canal : récupérer le texte, puis déclarer la diffusion faite par vous.
    await page.goto(`${baseURL}/atelier/${offGrid.id}`);
    await expect(page.getByRole("button", { name: "Récupérer le texte" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Préparer la publication" })).toHaveCount(0);
    await page.getByRole("button", { name: "Je l'ai diffusé moi-même" }).click();
    const declare = page.getByRole("dialog", { name: "Je l'ai diffusé moi-même" });
    await declare.getByLabel("Où l'avez-vous diffusé ?").fill("Salon du quartier");
    await declare.getByLabel("Je confirme avoir diffusé cette version").check();
    await declare.getByRole("button", { name: "Déclarer la diffusion" }).click();
    await expect(declare).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V1 diffusée" })).toBeVisible();
    await expect(page.locator(".atelier-decision")).toContainText("Diffusée par vous sur Salon du quartier");
    await expect(page.locator(".atelier-decision")).toContainText("déclarée par vous");

    // Délégation réglée dans Canaux & délégation : « Préparer seulement » remplace la diffusion par « Récupérer le texte ».
    await page.goto(`${baseURL}/connexions`);
    const delegation = page.getByRole("region", { name: "Ma délégation" });
    await expect(delegation.getByLabel(/Valider avant chaque action/)).toBeChecked();
    await delegation.getByLabel(/Préparer seulement/).check();
    await delegation.getByRole("button", { name: "Enregistrer les règles" }).click();
    await page.getByRole("dialog", { name: "Passer en « Préparer seulement » ?" }).getByRole("button", { name: "Passer en préparation seule" }).click();
    await expect(delegation.getByRole("status")).toContainText("Règle enregistrée : Préparer seulement.");
    await page.goto(`${baseURL}/atelier/${doubtful.id}`);
    await expect(page.getByRole("button", { name: "Récupérer le texte" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer" })).toHaveCount(0);
    await expect(page.locator(".atelier-frame")).toContainText("Préparer seulement");

    const journal = await prisma.journalEntry.findMany({ where: { companyId: company.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { code: true } });
    expect(journal.map((entry) => entry.code)).toEqual(["J-22", "J-19", "J-25", "J-24", "J-26"]);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${baseURL}/atelier/${sitePage.id}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await prisma.$disconnect(); }
});

test("V5.2 programmation: a validated page is scheduled for a future time, shown in the Strategy, then cancelled and stays validated", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "site_page", channel: "site", title: "Nos horaires", outcome: "Des visites", originalOutcome: "Des visites", finding: "Horaires introuvables", scope: { page: "Nos horaires" }, status: "active", firstLaunchedAt: new Date(), position: 1 } });
    const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "site", format: "site_page", currentNumber: 1, validatedNumber: 1, validatedAt: new Date(), versions: { create: { number: 1, title: "Nos horaires", body: "Du lundi au vendredi.", author: "paul" } } } });
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await page.getByRole("button", { name: "Préparer la publication" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmer la diffusion" });
    await dialog.getByLabel("Programmer").check();
    const tomorrow = new Date(Date.now() + 24 * 3600_000);
    const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T09:00`;
    await dialog.getByLabel("Date et heure (heure de cet appareil)").fill(local);
    await dialog.getByLabel("Je confirme cette version, cette destination et ce moment").check();
    await dialog.getByRole("button", { name: "Programmer la diffusion" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V1 programmée" })).toBeVisible();
    await expect(page.locator(".atelier-decision")).toContainText("vers 09:00 sur Votre site vitrine, à quelques minutes près");
    await expect(page.getByLabel("Titre de la page")).toBeDisabled();

    await page.goto(`${baseURL}/strategie`);
    await expect(page.getByRole("region", { name: "À valider par vous" })).toContainText("Nos horaires · V1 · Site vitrine · diffusion programmée");
    await page.getByRole("region", { name: "À valider par vous" }).getByRole("link", { name: "Voir la programmation" }).click();
    await page.waitForURL(new RegExp(`/atelier/${content.id}$`));
    await page.getByRole("button", { name: "Annuler la programmation" }).click();
    const cancel = page.getByRole("dialog", { name: "Annuler cette programmation ?" });
    await expect(cancel).toContainText("Le contenu restera validé.");
    await cancel.getByRole("button", { name: "Annuler la programmation" }).click();
    await expect(cancel).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "V1 validée" })).toBeVisible();
    expect((await prisma.journalEntry.findMany({ where: { missionId: mission.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((entry) => entry.code)).toEqual(["J-21", "J-23"]);
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

test("V5.2 bilan: a report after a diffusion, a decision to continue or stop, and what Paul learns on the Strategy, at 1440 and 390 px", async ({ page, company }, testInfo) => {
  test.setTimeout(90000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const seed = async (title: string, outcome: string, position: number) => {
      const mission = await prisma.mission.create({ data: { companyId: company.id, template: "site_page", channel: "site", title, outcome, originalOutcome: outcome, finding: "Un constat", scope: { page: title }, status: "active", firstLaunchedAt: new Date(), stopRuleDays: 30, position } });
      const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "site", format: "site_page", currentNumber: 1, validatedNumber: 1, validatedAt: new Date(), versions: { create: { number: 1, title, body: "Sur devis.", author: "paul" } } } });
      await prisma.publication.create({ data: { companyId: company.id, missionId: mission.id, contentId: content.id, versionNumber: 1, title, channel: "site", channelLabel: "Votre site vitrine", mode: "confirmed", status: "sent", sentAt: new Date(Date.now() - 40 * 86_400_000), idempotencyKey: `${content.id}:v1:1` } });
      return { mission, content };
    };
    const tarifs = await seed("Nos tarifs", "Deux demandes de devis", 1);
    const horaires = await seed("Nos horaires", "Un rendez-vous qualifié", 2);
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    await prisma.journalEntry.createMany({ data: [
      { companyId: company.id, missionId: tarifs.mission.id, code: "J-20", params: { n: "1", titre: "Nos tarifs" }, createdAt: daysAgo(46) },
      { companyId: company.id, missionId: horaires.mission.id, code: "J-20", params: { n: "1", titre: "Nos horaires" }, createdAt: daysAgo(45) },
      { companyId: company.id, missionId: tarifs.mission.id, code: "J-22", params: { n: "1", canal: "Votre site vitrine", destinataires: "" }, createdAt: daysAgo(44) },
      { companyId: company.id, missionId: horaires.mission.id, code: "J-22", params: { n: "1", canal: "Votre site vitrine", destinataires: "" }, createdAt: daysAgo(43) },
      { companyId: company.id, missionId: horaires.mission.id, code: "J-17", params: { mission: "Nos horaires" }, createdAt: daysAgo(42) },
      { companyId: company.id, missionId: tarifs.mission.id, code: "J-17", params: { mission: "Nos tarifs" }, createdAt: daysAgo(41) },
    ] });

    // Résultats : la diffusion est listée ; « Poursuivre » reste indisponible sans bilan.
    await page.goto(`${baseURL}/resultats`);
    await expect(page.getByRole("heading", { level: 1, name: "L'activité n'est pas le résultat." })).toBeVisible();
    // Décisions & traçabilité (#41) : quoi, quand, par qui et pour quelle mission ; 5 entrées, puis le reste se déplie ; export du journal entier.
    const journal = page.getByRole("region", { name: "Décisions & traçabilité" });
    await expect(journal.locator("table").first().locator("tbody tr")).toHaveCount(5);
    const more = journal.locator("details.journal-more > summary");
    await expect(more).toHaveText("Tout le journal (6)");
    await expect(journal.getByText("V1 validée : Nos tarifs. Aucun envoi effectué.")).toBeHidden();
    await more.click();
    await expect(journal.getByText("V1 validée : Nos tarifs. Aucun envoi effectué.")).toBeVisible();
    const launchRow = journal.getByRole("row", { name: /Mission lancée \(ou reprise\) : Nos tarifs/ });
    await expect(launchRow.getByRole("cell")).toHaveText([/\d{4}/, "vous", "Nos tarifs", "Mission lancée (ou reprise) : Nos tarifs. Paul prépare le premier contenu."]);
    await expect(journal.getByRole("link", { name: "Exporter le journal (CSV)" })).toHaveAttribute("href", "/api/journal/export");
    await expect(journal).not.toContainText("{");
    const byMission = page.getByRole("region", { name: "Résultats par mission" });
    await expect(page.getByRole("region", { name: "La diffusion et son suivi" })).toContainText("Nos tarifs · V1 · Votre site vitrine");
    await byMission.getByRole("row", { name: /Nos tarifs/ }).getByRole("button", { name: "Décider la suite" }).click();
    const decide = page.getByRole("dialog", { name: "Décider la suite de la mission" });
    await expect(decide.getByRole("button", { name: "Poursuivre" })).toBeDisabled();
    await expect(decide).toContainText("Sans bilan, Paul ne peut pas comparer au résultat recherché");
    await decide.getByRole("button", { name: "Annuler" }).click();

    // Bilan : le contrôle des rendez-vous s'affiche en direct ; changer de mission recharge ses chiffres.
    const form = page.getByRole("region", { name: "Renseigner mon bilan" });
    await expect(form.getByLabel("Mission")).toHaveValue(tarifs.mission.id);
    await form.getByLabel("Demandes qualifiées").fill("1");
    await form.getByLabel("Rendez-vous").fill("2");
    await expect(form.getByRole("alert")).toHaveText("Vous ne pouvez pas avoir plus de rendez-vous que de demandes qualifiées. Vérifiez vos chiffres.");
    await form.getByLabel("Demandes qualifiées").fill("3");
    await form.getByLabel("Rendez-vous").fill("1");
    await form.getByLabel("Origine des demandes et contexte").fill("Deux appels du syndic");
    await form.getByRole("button", { name: "Enregistrer le bilan" }).click();
    await expect(form.getByRole("status")).toHaveText("Bilan enregistré. Attribution déclarative, non vérifiée.");
    const metric = (label: string) => page.locator(".metrics div", { hasText: label }).locator("dd");
    await expect(metric("Demandes qualifiées")).toHaveText("3");
    await expect(metric("CA signé")).toHaveText("—");
    await form.getByLabel("Mission").selectOption({ label: "Nos horaires" });
    await expect(page).toHaveURL(new RegExp(`mission=${horaires.mission.id}`));
    await expect(form.getByLabel("Demandes qualifiées")).toHaveValue("");
    await form.getByLabel("Mission").selectOption({ label: "Nos tarifs" });
    await expect(form.getByLabel("Demandes qualifiées")).toHaveValue("3");

    // Stratégie : ce que Paul apprend, comparé au résultat recherché, sans élargir.
    await page.goto(`${baseURL}/strategie`);
    const learning = page.getByRole("article", { name: "Ce que Paul apprend : Nos tarifs" });
    await expect(learning).toContainText("3 demandes qualifiées, 1 rendez-vous, chiffre d'affaires non déclaré.");
    await expect(learning).toContainText("Résultat recherché atteint");
    await expect(learning).toContainText("Proposition à confirmer : poursuivre dans les mêmes limites.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("strategie-bilan-1440.png"), fullPage: true });

    // Poursuivre ouvre l'atelier pour la série suivante ; arrêter clôt la mission.
    await page.goto(`${baseURL}/resultats`);
    await byMission.getByRole("row", { name: /Nos tarifs/ }).getByRole("button", { name: "Décider la suite" }).click();
    await page.getByRole("dialog", { name: "Décider la suite de la mission" }).getByRole("button", { name: "Poursuivre" }).click();
    await expect(page).toHaveURL(new RegExp(`/atelier/${tarifs.content.id}$`));
    await page.goto(`${baseURL}/resultats`);
    await expect(byMission.getByRole("row", { name: /Nos tarifs/ })).toContainText("Poursuivie, mêmes limites");
    await byMission.getByRole("row", { name: /Nos horaires/ }).getByRole("button", { name: "Décider la suite" }).click();
    await page.getByRole("dialog", { name: "Décider la suite de la mission" }).getByRole("button", { name: "Arrêter la mission" }).click();
    await expect(byMission.getByRole("row", { name: /Nos horaires/ })).toContainText("Arrêtée");
    await expect(byMission.getByRole("row", { name: /Nos horaires/ }).getByRole("button", { name: "Décider la suite" })).toHaveCount(0);
    expect(await prisma.mission.findUniqueOrThrow({ where: { id: horaires.mission.id } })).toMatchObject({ status: "stopped" });
    await page.screenshot({ path: testInfo.outputPath("resultats-1440.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${baseURL}/resultats`);
    await expect(page.getByRole("heading", { level: 1, name: "L'activité n'est pas le résultat." })).toBeVisible();
    // Au-delà de 5 entrées, les plus anciennes se déplient avec « Tout le journal (n) ».
    const phoneJournal = page.getByRole("region", { name: "Décisions & traçabilité" });
    const phoneMore = phoneJournal.locator("details.journal-more > summary");
    await expect(phoneMore).toHaveText(/^Tout le journal \(\d+\)$/);
    await phoneMore.click();
    await expect(phoneJournal.getByText("Mission lancée (ou reprise) : Nos tarifs. Paul prépare le premier contenu.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const wrap of await phoneJournal.locator(".table-wrap").all()) expect(await wrap.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("resultats-390.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("GH-310: with a session, the discovery page only offers to go back to the workspace", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
  } finally { await prisma.$disconnect(); }
  await page.goto(`${baseURL}/`);
  const back = page.getByRole("link", { name: "Retourner à mon espace", exact: true });
  await expect(back).toHaveCount(2);
  for (const link of await back.all()) await expect(link).toHaveAttribute("href", "/strategie");
  await expect(page.getByRole("link", { name: "Mon espace", exact: true })).toHaveAttribute("href", "/strategie");
  await expect(page.getByRole("link", { name: "C'est parti", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Retrouver mon compte", exact: true })).toHaveCount(0);
  await back.first().click();
  await expect(page).toHaveURL(`${baseURL}/strategie`);
});

test("GH-41: an empty journal says so on Résultats and offers no export", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    expect(await prisma.journalEntry.count({ where: { companyId: company.id } })).toBe(0);
    await page.goto(`${baseURL}/resultats`);
    const journal = page.getByRole("region", { name: "Décisions & traçabilité" });
    await expect(journal).toContainText("Aucune décision enregistrée pour l'instant.");
    await expect(journal.getByRole("link", { name: "Exporter le journal (CSV)" })).toHaveCount(0);
    await expect(journal.locator("table")).toHaveCount(0);
  } finally { await prisma.$disconnect(); }
});

test("GH-282: the ambition is changed with Paul from Entreprise, traced as J-03, and no mission moves", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true, ambitionText: "Plus de devis", objective: "Plus de devis" } });
    const mission = (status: string, position: number) => ({ companyId: company.id, template: "social_post", channel: "facebook", title: `Mission ${position}`, outcome: "Des demandes", originalOutcome: "Des demandes", finding: "Un constat", scope: { topic: "Un chantier" }, status, position });
    await prisma.mission.createMany({ data: [mission("proposed", 1), mission("active", 2), mission("paused", 3)] });
    const before = await prisma.mission.findMany({ where: { companyId: company.id }, orderBy: { position: "asc" }, select: { id: true, status: true, updatedAt: true } });

    await page.setViewportSize({ width: 360, height: 900 });
    // Les liens existants « Modifier l'objectif » mènent au bloc « Votre ambition ».
    await page.goto(`${baseURL}/entreprise?tab=objectifs#modifier`);
    const block = page.locator("#modifier");
    await expect(block.getByRole("heading", { name: "Votre ambition" })).toBeVisible();
    await expect(page.getByText("Objectif de ce mois")).toHaveCount(0);
    const field = block.getByLabel("Votre ambition");
    await expect(field).toHaveValue("Plus de devis");

    // Hors bornes : texte gardé, notes de Paul, rien d'enregistré avant « C'est bien ça ».
    await field.fill("Doubler mon CA en 5 ans");
    await block.getByRole("button", { name: "Interpréter" }).click();
    const understood = block.getByRole("region", { name: "Ce que Paul comprend" });
    await expect(understood).toContainText("Voici ce que je comprends.");
    await expect(understood).toContainText("C'est une cible, pas une promesse de résultat.");
    await expect(understood).toContainText("sans le convertir");
    expect(await noHorizontalScroll(page)).toBe(true);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).ambitionText).toBe("Plus de devis");

    // Texte modifié après l'interprétation : la reformulation disparaît.
    await field.fill("+20 % de CA en 12 mois, sans embaucher, 300 € de pub par mois");
    await expect(understood).toHaveCount(0);
    await expect(block.getByRole("button", { name: "C'est bien ça" })).toHaveCount(0);
    await block.getByRole("button", { name: "Interpréter" }).click();
    await expect(understood).toContainText("n'autorise aucune dépense");
    await block.getByRole("button", { name: "C'est bien ça" }).click();
    await expect(block.getByRole("status")).toHaveText("Votre ambition est enregistrée.");

    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.ambitionText).toBe("+20 % de CA en 12 mois, sans embaucher, 300 € de pub par mois");
    expect(saved.objective).toBe(saved.ambitionText);
    expect(saved.ambitionConfirmedAt).not.toBeNull();
    expect(saved.ambitionTerms).toMatchObject({ gainPercent: 20, horizonMonths: 12, mediaBudgetPerMonth: 300, recruitment: "no" });
    const after = await prisma.mission.findMany({ where: { companyId: company.id }, orderBy: { position: "asc" }, select: { id: true, status: true, updatedAt: true } });
    expect(after).toEqual(before);

    await page.goto(`${baseURL}/resultats`);
    await expect(page.getByRole("region", { name: "Décisions & traçabilité" })).toContainText("Cap mis à jour avec Paul : +20 % de CA en 12 mois, sans embaucher, 300 € de pub par mois.");
  } finally { await prisma.$disconnect(); }
});

test("GH-169: Entreprise shows the origin of each profile information and its landmarks; a correction puts the content to review in the mission and the atelier", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: {
      workspaceV52: true, firstName: "Claire", location: "Lyon 7e", trade: "Électricien", servingArea: "Lyon", targetClients: null, offers: "Mise aux normes", ambitionText: "Plus de devis", objective: "Plus de devis",
      profileOrigins: { firstName: "declared", name: "declared", location: "declared", trade: "observed", servingArea: "hypothesis", targetClients: "missing", offers: "observed" },
    } });
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "site_page", channel: "site", title: "Nos tarifs", outcome: "Des demandes", originalOutcome: "Des demandes", finding: "Un constat", scope: { page: "Nos tarifs" }, status: "active", firstLaunchedAt: new Date(), position: 1 } });
    const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "site", format: "site_page", currentNumber: 1, validatedNumber: 1, validatedAt: new Date(), versions: { create: { number: 1, title: "Nos tarifs", body: "Sur devis.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`${baseURL}/entreprise`);
    // Repères : ambition, localisation, zone, clients ; « À renseigner » pour une valeur vide.
    const landmarks = page.getByRole("region", { name: "Vos repères" });
    await expect(landmarks).toContainText("AmbitionPlus de devis");
    await expect(landmarks).toContainText("LocalisationLyon 7e");
    await expect(landmarks).toContainText("ZoneLyon");
    await expect(landmarks).toContainText("ClientsÀ renseigner");
    await expect(landmarks.getByRole("link", { name: "Modifier avec Paul" })).toHaveAttribute("href", "#modifier");

    // « Corriger mon profil » : chaque champ montre son origine, qui disparaît dès qu'il est modifié.
    await expect(page.getByRole("heading", { name: "Corriger mon profil" })).toBeVisible();
    await expect(page.locator('[data-origin="firstName"]')).toHaveText("Origine : Déclaré par vous");
    await expect(page.locator('[data-origin="trade"]')).toHaveText("Origine : Lu sur le site");
    await expect(page.locator('[data-origin="servingArea"]')).toHaveText("Origine : Proposé par Paul, confirmé par vous");
    await expect(page.locator('[data-origin="targetClients"]')).toHaveText("Origine : À renseigner par vous");
    await expect(page.locator('[data-origin="offers"]')).toHaveText("Origine : Lu sur le site");
    await expect(page.getByLabel("Ce que vous proposez (facultatif)")).toHaveValue("Mise aux normes");
    await page.getByLabel("Ce que vous proposez (facultatif)").fill("Bornes de recharge");
    await expect(page.locator('[data-origin="offers"]')).toHaveCount(0);
    await expect(page.getByText("Vos contenus en cours seront à relire et leurs programmations annulées.")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/strategie`);

    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.offers).toBe("Bornes de recharge");
    expect(saved.profileOrigins).toMatchObject({ offers: "declared", trade: "observed", servingArea: "hypothesis" });
    expect(await prisma.journalEntry.count({ where: { companyId: company.id, code: "J-02" } })).toBe(1);

    // La mission et l'atelier signalent « Profil à relire » ; la validation attend une nouvelle version.
    await page.goto(`${baseURL}/missions/${mission.id}`);
    await expect(page.getByText("Profil à relire")).toBeVisible();
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await expect(page.locator(".atelier .tags").first()).toContainText("Profil à relire");
    await expect(page.getByText("Profil corrigé : relisez ce contenu et enregistrez une nouvelle version avant de le valider.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider cette version" })).toBeDisabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await prisma.publication.count({ where: { contentId: content.id } })).toBe(0);
  } finally { await prisma.$disconnect(); }
});

test("Canaux & délégation: only active channels, honest states, scheduled diffusions listed before disconnecting, access requested for a reserved channel", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const previous = await prisma.channelRollout.findUnique({ where: { channel: "gmail" } });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    await prisma.channelConnection.createMany({ data: [
      { companyId: company.id, channel: "google_business_profile", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() - 60000) },
      { companyId: company.id, channel: "facebook", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() + 3600000) },
    ] });
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "social_post", channel: "facebook", title: "Chantier livré", outcome: "Des demandes", originalOutcome: "Des demandes", finding: "Un constat", scope: { topic: "Un chantier" }, status: "active", position: 1 } });
    const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, validatedNumber: 1, versions: { create: { number: 1, title: "Chantier livré", body: "Texte.", author: "paul" } } } });
    await prisma.publication.create({ data: { companyId: company.id, missionId: mission.id, contentId: content.id, versionNumber: 1, title: "Chantier livré", channel: "facebook", channelLabel: "Page Facebook", mode: "confirmed", status: "scheduled", scheduledAt: new Date("2030-01-07T08:00:00Z"), timezone: "Europe/Paris", idempotencyKey: `${content.id}:v1:1` } });

    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseURL}/connexions?retour=/atelier/${content.id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Canaux & délégation" })).toBeVisible();
      // Jeton en clair de l'ancien flux Facebook : jamais présenté comme une connexion, à refaire.
      await expect(page.getByText("Autorisation à refaire · reconnectez votre Page", { exact: true })).toBeVisible();
      await expect(page.getByText("Page vérifiée", { exact: true })).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("test-token-never-visible");
      // Canaux désactivés (§5.6) : ni affichés ni connectables.
      await expect(page.getByRole("region", { name: "Google Business Profile" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "LinkedIn · profil personnel" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Site vitrine · adresse publique" })).toContainText("Aucune page en ligne pour le moment");
      await expect(page.getByRole("link", { name: "Revenir au contenu" })).toHaveAttribute("href", `/atelier/${content.id}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`canaux-${width}.png`), fullPage: true });
    }

    // Déconnexion : les programmations qui seront annulées sont dites avant de confirmer.
    const facebook = page.getByRole("region", { name: "Facebook · Page" });
    await expect(facebook).toContainText("1 programmation en cours");
    await facebook.getByText("Déconnecter Facebook", { exact: true }).click();
    await expect(facebook).toContainText("Ces programmations seront annulées :");
    await expect(facebook).toContainText("Chantier livré · V1 · le 7 janvier vers 09:00");
    await facebook.getByLabel("Je confirme le retrait de ma Page Facebook.").check();
    await facebook.getByRole("button", { name: "Confirmer le retrait Facebook" }).click();
    await expect(facebook.getByText("Non autorisé", { exact: true })).toBeVisible();
    expect(await prisma.publication.findFirstOrThrow({ where: { contentId: content.id } })).toMatchObject({ status: "cancelled", cancelReason: "Page Facebook déconnectée" });

    // Canal réservé aux entreprises autorisées (#301) : pas de flux fournisseur, une demande d'accès.
    await prisma.channelRollout.upsert({ where: { channel: "gmail" }, create: { channel: "gmail", openToAll: false }, update: { openToAll: false } });
    await page.reload();
    const gmail = page.getByRole("region", { name: "Gmail · envoi de messages" });
    // La page arrive en flux : on attend le bloc avant de savoir si Gmail est configuré sur ce serveur.
    await expect(gmail.getByRole("heading", { name: "Gmail · envoi de messages" })).toBeVisible();
    if (await gmail.getByText("L'envoi Gmail n'est pas disponible sur cette version.").count() === 0) {
      await expect(gmail.getByRole("link", { name: /Relier/ })).toHaveCount(0);
      await expect(gmail).toContainText("Pas encore disponible pour votre compte.");
      await gmail.getByRole("button", { name: "Demander l'accès" }).click();
      await expect(gmail.getByRole("status")).toContainText("Demande envoyée.");
      expect(await prisma.channelAccess.findUniqueOrThrow({ where: { companyId_channel: { companyId: company.id, channel: "gmail" } } })).toMatchObject({ status: "requested" });
    }
    await page.goto(`${baseURL}/connexions?error=channel_unavailable`);
    await expect(page.getByText("Ce canal n'est pas disponible pour votre compte.", { exact: false })).toBeVisible();
    await page.goto(`${baseURL}/connexions?error=google_denied`);
    await expect(page.getByText("L'autorisation Google a été refusée ou annulée.", { exact: false })).toBeVisible();
  } finally {
    if (previous) await prisma.channelRollout.update({ where: { channel: "gmail" }, data: { openToAll: previous.openToAll } });
    else await prisma.channelRollout.deleteMany({ where: { channel: "gmail" } });
    await prisma.$disconnect();
  }
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
    await page.goto(`${baseURL}/dashboard?view=plan&onglet=menees`);
    await expect(page.getByRole("button", { name: "En cours et menées (1)" })).toHaveAttribute("aria-pressed", "true");
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

test("story 5.1: after a refresh, the diagnostic shows the latest audit and folds the previous one", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const hour = 60 * 60 * 1000;
    const run = (finishedAt: Date) => prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: `audit-${randomUUID()}`, payload: {}, status: "succeeded", finishedAt } });
    const [first, second] = [await run(new Date(Date.now() - 2 * hour)), await run(new Date(Date.now() - hour))];
    await prisma.auditFinding.create({ data: { companyId: company.id, agentRunId: first.id, category: "site_web", title: "Point réglé depuis", content: "Ancien." } });
    await prisma.auditFinding.create({ data: { companyId: company.id, agentRunId: second.id, category: "site_web", title: "Point actuel", content: "Actuel." } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/diagnostic`);
    await expect(page.getByText("DIAGNOSTIC · 1 CONSTAT", { exact: true })).toBeVisible();
    const current = page.locator("details.diagnostic-group");
    await expect(current).toHaveCount(1);
    await expect(current.getByRole("heading", { name: "Point actuel" })).toBeVisible();
    const previous = page.locator("details.diagnostic-previous");
    await expect(previous.locator("summary")).toContainText("Diagnostic précédent du");
    await expect(previous.getByRole("heading", { name: "Point réglé depuis" })).toBeHidden();
    await previous.locator("summary").click();
    await expect(previous.getByRole("heading", { name: "Point réglé depuis" })).toBeVisible();
  } finally { await prisma.$disconnect(); }
});

test("story 5.2: the diagnostic prepares the plan on a click, then links to it once the plan is up to date", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const audit = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: `audit-${randomUUID()}`, payload: {}, status: "succeeded", finishedAt: new Date(Date.now() - 60_000) } });
    await prisma.auditFinding.create({ data: { companyId: company.id, agentRunId: audit.id, category: "site_web", title: "Horaires absents", content: "Résumé." } });
    // Action d'avant l'audit : le plan reste à préparer.
    await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "marketing", title: "Répondre aux avis", rationale: "Test", timing: "Aujourd'hui", createdAt: new Date(Date.now() - 2 * 60_000) } });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Quota atteint : le message de limite, et rien n'est préparé.
    await page.route("**/api/co-ceo/plan", (route) => route.fulfill({ status: 429, json: { error: "Les agents ont atteint leur limite de lancements pour aujourd'hui. Ils reprendront demain matin.", reason: "quota_runs" } }));
    await page.goto(`${baseURL}/diagnostic`);
    const prepare = page.getByRole("button", { name: "Préparer le plan à partir du diagnostic" });
    await expect(prepare).toHaveClass(/primary/);
    await expect(page.getByRole("button", { name: /Actualiser le diagnostic/ })).not.toHaveClass(/primary/);
    await prepare.click();
    await expect(page.locator("main").getByRole("alert").filter({ hasText: "limite de lancements" })).toBeVisible();
    await page.unroute("**/api/co-ceo/plan");

    // Préparation : le bouton dit qu'elle est en cours, puis mène au plan.
    let finished = false;
    await page.route("**/api/co-ceo/plan", (route) => route.fulfill({ status: 202, json: { run: { id: "plan-run", status: "queued" } } }));
    await page.route("**/api/agent-runs/plan-run", (route) => route.fulfill({ json: { run: { id: "plan-run", agent: "co_ceo", status: finished ? "succeeded" : "running" } } }));
    await prepare.click();
    await expect(page.getByRole("button", { name: "Paul prépare le plan…" })).toBeDisabled();
    finished = true;
    await page.waitForURL(/\/dashboard\?view=plan/);

    // Une action ajoutée après l'audit ne suffit pas : le plan reste à préparer.
    await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Afficher les horaires sur le site", rationale: "Test", timing: "Cette semaine" } });
    await page.goto(`${baseURL}/diagnostic`);
    await expect(page.getByRole("button", { name: "Préparer le plan à partir du diagnostic" })).toBeVisible();
    // Plan à jour : une préparation de Paul réussie après la fin du dernier audit, même sans action créée (doublons).
    await prisma.agentRun.create({ data: { companyId: company.id, agent: "co_ceo", requestKey: `plan-generation:${randomUUID()}`, payload: { kind: "plan_generation" }, status: "succeeded", finishedAt: new Date() } });
    await page.goto(`${baseURL}/diagnostic`);
    await expect(page.getByRole("link", { name: "Voir le plan d’action", exact: true })).toHaveAttribute("href", "/dashboard?view=plan");
    await expect(page.getByRole("button", { name: "Préparer le plan à partir du diagnostic" })).toHaveCount(0);
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
    description: "Ancienne description de test",
    phone: "+33102030405",
    certifications: "Ancien label de test",
    openingHours: "Anciennes heures de test",
  };

  try {
    await prisma.company.update({ where: { id: company.id }, data: { ...previousProfile, objective: "Objectif gardé par Paul" } });
    await page.goto(`${baseURL}/entreprise`);
    await expect(page.getByPlaceholder("Site web (optionnel — beaucoup de TPE n'en ont pas)")).toHaveValue(previousProfile.website);
    await expect(page.locator('input[placeholder^="Compte Instagram/Facebook"]')).toHaveValue(previousProfile.socialHandles);

    // #282 : l'onglet « Objectifs » n'a plus de champ objectif ; l'ambition se modifie avec Paul.
    await page.getByRole("button", { name: "Objectifs", exact: true }).click();
    await expect(page.getByPlaceholder("ex: 10 nouveaux clients par mois")).toHaveCount(0);
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
    // Le formulaire n'envoie plus l'objectif : il reste inchangé, jamais vidé.
    expect(cleared.objective).toBe("Objectif gardé par Paul");
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
    await expect(page.getByRole("heading", { name: "Une entreprise bien comprise.", exact: true })).toBeVisible();
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
test("story 5.4: on a phone, Paul takes the whole screen, above the bottom bar, without zoom or page scroll", async ({ page, company }) => {
  expect(company.id).toBeTruthy(); // la fixture ouvre la session du dirigeant
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${baseURL}/dashboard`);
  // Position de lecture à retrouver à la fermeture.
  await page.evaluate(() => window.scrollTo(0, 200));
  const scrolledTo = await page.evaluate(() => window.scrollY);
  await page.locator('button[aria-controls="paul-panel"]:visible').first().click();
  const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
  await expect(panel).toBeVisible();
  // iOS fait défiler la page quand le clavier s'ouvre : le <body> est figé, pas seulement <html>.
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe("fixed");
  const layout = await page.evaluate(() => {
    const node = document.getElementById("paul-panel")!;
    const field = node.querySelector("textarea")!;
    const bar = document.querySelector("nav.journey-tabbar");
    const panelBox = node.getBoundingClientRect();
    const atBottom = document.elementFromPoint(187, panelBox.bottom - 20);
    return {
      panel: { top: panelBox.top, bottom: panelBox.bottom, width: panelBox.width },
      header: node.querySelector("header")!.getBoundingClientRect().height,
      log: node.querySelector('[role="log"]')!.getBoundingClientRect().height,
      fieldFont: parseFloat(getComputedStyle(field).fontSize),
      messagesFont: parseFloat(getComputedStyle(node.querySelector(".chat-messages")!).fontSize),
      barCoversPanel: Boolean(bar && atBottom && bar.contains(atBottom)),
      pageOverflow: getComputedStyle(document.documentElement).overflow,
      focused: document.activeElement === field,
    };
  });
  expect(layout.panel).toEqual({ top: 0, bottom: 812, width: 375 });
  expect(layout.header).toBeLessThanOrEqual(60);
  expect(layout.log / 812).toBeGreaterThanOrEqual(0.7);
  expect(layout.fieldFont).toBeGreaterThanOrEqual(16);
  expect(layout.messagesFont).toBeGreaterThanOrEqual(16);
  expect(layout.barCoversPanel).toBe(false);
  expect(layout.pageOverflow).toBe("hidden");
  // Pas de clavier ouvert d'office : le dirigeant lit d'abord.
  expect(layout.focused).toBe(false);
  // Le clavier ne s'émule pas ici : le champ reçoit le focus et le panneau reste en plein écran.
  await panel.getByLabel("Message à Paul").focus();
  await expect.poll(() => page.evaluate(() => document.getElementById("paul-panel")!.getBoundingClientRect().top)).toBe(0);
  // Saisie en cours : place laissée au clavier, sans barre de remplissage automatique.
  await expect(panel.locator(".chat-context")).toBeHidden();
  await expect(panel.locator(".chat-disclaimer")).toBeHidden();
  await expect(panel.getByLabel("Message à Paul")).toHaveAttribute("autocomplete", "off");
  // Pas de formulaire autour du champ : Safari y attache sa barre de remplissage au-dessus du clavier.
  expect(await panel.evaluate((node) => node.querySelector("form") === null && node.querySelector("textarea")?.form === null)).toBe(true);
  await expect(panel.getByRole("button", { name: "Agrandir la fenêtre" })).toBeHidden();
  await expect(panel).toHaveAttribute("aria-modal", "true");

  await panel.getByRole("button", { name: "Replier" }).click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).not.toBe("fixed");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);
});

test("story 5.3: the plan opens on the actions to do, the running and executed ones are in their own tab", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const base = { companyId: company.id, rationale: "Test", timing: "Cette semaine", theme: "Visibilité" };
    await prisma.actionPlanItem.createMany({ data: [
      { ...base, agent: "contenu", title: "Action à lancer", status: "propose" },
      { ...base, agent: "marketing", title: "Action en cours", status: "en_cours" },
      { ...base, agent: "demarchage", title: "Action menée", status: "lance" },
    ] });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}/dashboard?view=plan`);
    const plan = page.getByRole("region", { name: "Plan d'action", exact: true });
    await expect(plan.getByRole("button", { name: "À faire (1)" })).toHaveAttribute("aria-pressed", "true");
    await expect(plan.getByRole("heading", { name: "Action à lancer" })).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Action en cours" })).toHaveCount(0);
    await expect(plan.getByRole("heading", { name: "Action menée" })).toHaveCount(0);

    await plan.getByRole("button", { name: "En cours et menées (2)" }).click();
    await expect(page).toHaveURL(/onglet=menees/);
    await expect(plan.getByRole("heading", { name: "Action en cours" })).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Action menée" })).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Action à lancer" })).toHaveCount(0);

    await page.reload();
    await expect(plan.getByRole("button", { name: "En cours et menées (2)" })).toHaveAttribute("aria-pressed", "true");
    await plan.getByRole("button", { name: "À faire (1)" }).click();
    await expect(page).not.toHaveURL(/onglet=/);
    // Le retour arrière revient à l'onglet précédent, et le lien « Plan d'action » rouvre « À faire ».
    await page.goBack();
    await expect(plan.getByRole("button", { name: "En cours et menées (2)" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Plan d’action" }).first().click();
    await expect(plan.getByRole("button", { name: "À faire (1)" })).toHaveAttribute("aria-pressed", "true");
  } finally {
    await prisma.$disconnect();
  }
});

/** Mission « Publication » créée comme à la main, par l'API de la session du dirigeant. */
async function createMissionThroughApi(page: Page, title: string) {
  const created = await page.request.post(`${baseURL}/api/missions`, { headers: { Origin: baseURL }, data: { template: "social_post", title, outcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers de novembre" } } });
  expect(created.status()).toBe(201);
  return (await created.json()).mission as { id: string; title: string };
}

test("GH-288: a priority card is accepted in one click, another proposal is declined with « Garder le cap actuel »", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const { createPendingAction, toPendingActionView } = await import("../src/lib/agents/pending-actions");
    const first = await createMissionThroughApi(page, "Première publication");
    const second = await createMissionThroughApi(page, "Seconde publication");
    const priority = toPendingActionView(await createPendingAction(company.id, "mission_priority", { missionId: second.id, title: second.title }))!;
    const dismiss = toPendingActionView(await createPendingAction(company.id, "mission_dismiss", { missionId: first.id, title: first.title }))!;
    await page.route("**/api/co-ceo/message", (route) => route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "done", reply: "Je vous propose deux changements, à accepter ou non.", references: [], actions: [priority, dismiss] })}\n`,
    }));

    await page.goto(`${baseURL}/strategie`);
    await page.getByRole("button", { name: "Discuter avec Paul", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    await expect(panel.locator("header")).toContainText("Paul à propos de");
    await expect(panel.locator("header")).toContainText("Votre stratégie");
    await expect(panel.getByRole("button", { name: "Que faire maintenant ?" })).toBeVisible();
    for (const name of ["Martine", "Camille", "Jean-Claude", "Partenaire de croissance"]) await expect(panel).not.toContainText(name);
    const input = panel.getByLabel("Message à Paul");
    await input.fill("Quelle mission passe en premier ?");
    await input.press("Enter");

    const cards = panel.getByRole("group", { name: "Proposition de Paul à confirmer" });
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Paul · proposition à confirmer");
    await expect(cards.first()).toContainText("Faire de « Seconde publication » la priorité");
    // Rien ne change avant le clic.
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).priorityMissionId).toBeNull();

    await cards.first().getByRole("button", { name: "Retenir cette priorité" }).click();
    await expect(cards.first().getByRole("status")).toHaveText("Priorité retenue. Aucune mission lancée.");
    await expect.poll(async () => (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).priorityMissionId).toBe(second.id);
    expect((await prisma.mission.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("proposed");

    await cards.nth(1).getByRole("button", { name: "Garder le cap actuel" }).click();
    await expect(cards.nth(1).getByRole("status")).toHaveText("Proposition écartée : rien n'a changé.");
    await expect(panel.getByText("Nous gardons le cap actuel. Aucun changement appliqué.")).toBeVisible();
    expect((await prisma.mission.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("proposed");
    expect((await prisma.paulPendingAction.findUniqueOrThrow({ where: { id: dismiss.id } })).status).toBe("cancelled");
  } finally {
    await prisma.$disconnect();
  }
});

test("GH-312: « Noter l'idée » opens the prefilled frame, the mission created retires the idea; « Retirer l'idée » removes another", async ({ page, company }) => {
  test.setTimeout(90000);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });

    // Sans mission, une idée ouverte s'affiche dans Stratégie à la place de l'état vide, puis se retire.
    const other = await prisma.idea.create({ data: { companyId: company.id, text: "Une vitrine de Noël" } });
    await page.goto(`${baseURL}/strategie`);
    const row = page.getByRole("article", { name: "Idée : Une vitrine de Noël" });
    await expect(row).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aucune mission pour le moment" })).toHaveCount(0);
    await expect(row).toContainText("Idée notée avec Paul");
    await expect(row).toContainText("À cadrer");
    await expect(row.getByRole("link", { name: "Cadrer avec Paul" })).toHaveAttribute("href", `/missions/nouvelle?idee=${other.id}`);
    await expect(row.getByRole("button", { name: "Retirer l'idée" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await row.getByRole("button", { name: "Retirer l'idée" }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Aucune mission pour le moment" })).toBeVisible();
    expect(await prisma.idea.count({ where: { id: other.id } })).toBe(0);

    const { createPendingAction, toPendingActionView } = await import("../src/lib/agents/pending-actions");
    const text = "Tenir un stand au salon de mai du quartier";
    const card = toPendingActionView(await createPendingAction(company.id, "idea_note", { text }))!;
    await page.route("**/api/co-ceo/message", (route) => route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({ type: "done", reply: "Je vous propose de la noter, pour la cadrer ensuite.", references: [], actions: [card] })}\n`,
    }));

    await page.goto(`${baseURL}/strategie`);
    await page.getByRole("button", { name: "Discuter avec Paul", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    const input = panel.getByLabel("Message à Paul");
    await input.fill("J'ai envie de faire un salon");
    await input.press("Enter");
    const proposal = panel.getByRole("group", { name: "Proposition de Paul à confirmer" });
    await expect(proposal).toContainText("Noter cette idée");
    expect(await prisma.idea.count({ where: { companyId: company.id } })).toBe(0);
    await proposal.getByRole("button", { name: "Noter l'idée" }).click();
    await expect(page).toHaveURL(/\/missions\/nouvelle\?idee=[A-Za-z0-9_-]+$/);
    const idea = await prisma.idea.findFirstOrThrow({ where: { companyId: company.id } });
    await panel.getByRole("button", { name: "Replier" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Cadrons votre nouvelle mission." })).toBeVisible();
    await expect(page.getByLabel("Le constat de départ")).toHaveValue(text);
    await expect(page.getByRole("button", { name: "En discuter avec Paul" })).toBeVisible();
    await page.getByLabel("Nom de la mission").fill("Salon du quartier");
    await page.getByLabel("Type d'action").selectOption("custom");
    await page.getByLabel("Canal").selectOption("");
    await page.getByLabel("Ce que vous voulez faire").fill("Tenir un stand au salon de printemps du quartier");
    await page.getByLabel("Résultat recherché").fill("Dix contacts utiles");
    await page.getByRole("button", { name: "Créer la mission" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Salon du quartier" })).toBeVisible();
    expect((await prisma.idea.findUniqueOrThrow({ where: { id: idea.id } })).convertedMissionId).not.toBeNull();
    expect(await prisma.uncoveredRequest.count({ where: { companyId: company.id, source: "mission" } })).toBe(1);
    await page.goto(`${baseURL}/strategie`);
    await expect(page.getByRole("article", { name: "Salon du quartier" })).toBeVisible();
    await expect(page.getByRole("article", { name: `Idée : ${text}` })).toHaveCount(0);
    // Une adresse obsolète donne le formulaire vide.
    await page.goto(`${baseURL}/missions/nouvelle?idee=${idea.id}`);
    await expect(page.getByLabel("Le constat de départ")).toHaveValue("");
  } finally {
    await prisma.$disconnect();
  }
});

test("an expired profile card shows its expired message instead of the buttons", async ({ page, company }) => {
  const { expiredMessage, toPendingActionView } = await import("../src/lib/agents/pending-action-view");
  const view = toPendingActionView({ id: `expired-profile-${company.id}`, type: "update_profile", status: "expired", payload: { socialHandles: "@atelierlumen.nantes" }, expiresAt: new Date(Date.now() - 1000) })!;
  await page.route("**/api/co-ceo/message", (route) => route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    body: `${JSON.stringify({ type: "done", reply: "Voici votre profil, à confirmer.", references: [], actions: [view] })}\n`,
  }));
  await page.goto(`${baseURL}/dashboard`);
  await page.getByRole("button", { name: "Échanger avec Paul", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
  const input = panel.getByLabel("Message à Paul");
  await input.fill("Mon Instagram est @atelierlumen.nantes");
  await input.press("Enter");
  const cardGroup = panel.getByRole("group", { name: "Proposition de Paul à confirmer" });
  await expect(cardGroup.getByText("Compte Instagram ou Facebook : @atelierlumen.nantes", { exact: true })).toBeVisible();
  await expect(cardGroup.getByRole("status")).toHaveText(expiredMessage("update_profile"));
  await expect(cardGroup.getByRole("button", { name: "Confirmer" })).toHaveCount(0);
});

test("GH-288: one conversation per context, switched with the selector, and Lancer opens the mission frame, at 1440 and 360 px", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const { createPendingAction, toPendingActionView } = await import("../src/lib/agents/pending-actions");
    const mission = await createMissionThroughApi(page, "Publier un chantier");
    await prisma.chatMessage.createMany({ data: [
      { companyId: company.id, role: "user", content: "Question sur la stratégie", contextKey: "strategie" },
      { companyId: company.id, role: "user", content: "Question sur la mission", contextKey: `mission:${mission.id}` },
    ] });
    const launch = toPendingActionView(await createPendingAction(company.id, "mission_launch", { missionId: mission.id, title: mission.title }))!;
    const sent: Array<{ message: string; contextKey?: string }> = [];
    await page.route("**/api/co-ceo/message", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson; charset=utf-8",
        body: `${JSON.stringify({ type: "done", reply: "Je peux ouvrir le cadre de cette mission.", references: [], actions: [launch] })}\n`,
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/missions/${mission.id}`);
    await page.getByRole("button", { name: "Discuter avec Paul", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Discussion avec Paul" });
    // Sur la page d'une mission, la conversation de cette mission, et seulement elle.
    const selector = panel.getByLabel("Changer de conversation");
    await expect(selector.locator("option:checked")).toHaveText("Mission · Publier un chantier");
    await expect(panel.getByText("Question sur la mission")).toBeVisible();
    await expect(panel.getByText("Question sur la stratégie")).toHaveCount(0);
    await selector.selectOption({ label: "Votre stratégie" });
    await expect(panel.getByText("Question sur la stratégie")).toBeVisible();
    await expect(panel.getByText("Question sur la mission")).toHaveCount(0);
    await selector.selectOption({ label: "Mission · Publier un chantier" });
    await expect(panel.getByText("Question sur la mission")).toBeVisible();

    const input = panel.getByLabel("Message à Paul");
    await input.fill("Lance cette mission");
    await input.press("Enter");
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ message: "Lance cette mission", contextKey: `mission:${mission.id}` });

    // « Lancer » ouvre le cadre de la mission : rien n'est lancé ni débité avant « Confirmer le lancement ».
    const card = panel.getByRole("group", { name: "Proposition de Paul à confirmer" });
    await card.getByRole("button", { name: "Lancer" }).click();
    await expect(page).toHaveURL(new RegExp(`/missions/${mission.id}\\?cadre=1$`));
    await expect(page.getByRole("dialog", { name: "Confirmer le cadre de la mission" })).toBeVisible();
    expect(await prisma.mission.findUniqueOrThrow({ where: { id: mission.id } })).toMatchObject({ status: "proposed", firstLaunchedAt: null });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).creditBalance).toBe(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto(`${baseURL}/missions/${mission.id}`);
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Question sur la mission")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Sur téléphone, l'ouverture ne donne pas le focus au champ (le clavier ne recouvre pas la conversation).
    await expect(input).not.toBeFocused();
  } finally {
    await prisma.$disconnect();
  }
});

test("story 5.5: the Entreprise page shows the site photos section, reached from the site content card", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Page d'accueil de l'atelier", content: "Brief du site", status: "en_attente",
    } });
    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = await openProduction(page, "Page d'accueil de l'atelier");
    await expect(card.getByRole("link", { name: "Ajouter des photos" })).toHaveAttribute("href", "/entreprise#photos-site");
    await card.getByRole("link", { name: "Ajouter des photos" }).click();
    await expect(page).toHaveURL(`${baseURL}/entreprise#photos-site`);
    const section = page.locator("#photos-site");
    await expect(section.getByRole("heading", { name: "Photos du site" })).toBeVisible();
    await expect(section).toContainText("8 photos au plus, JPG, PNG ou WebP, 5 Mo au plus");
    // Aucun site en ligne : rien à republier.
    await expect(section.getByRole("button", { name: "Republier avec les photos" })).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("story 5.5: without the Blob store, the section says sending photos is not available yet, without a technical error", async ({ page, company }) => {
  test.skip(Boolean(process.env.BLOB_READ_WRITE_TOKEN), "Le serveur de test a un magasin Blob : l'état sans stockage ne s'observe pas.");
  expect(company.id).toBeTruthy(); // la fixture ouvre la session du dirigeant
  await page.goto(`${baseURL}/entreprise`);
  const section = page.locator("#photos-site");
  await expect(section.getByRole("status")).toHaveText("L’envoi de photos n’est pas encore disponible. Nous vous préviendrons dès qu’il le sera.");
  await expect(section.getByRole("button", { name: "Ajouter la photo" })).toHaveCount(0);
  await expect(section).not.toContainText("BLOB_READ_WRITE_TOKEN");
  const upload = await page.request.post(`${baseURL}/api/site/photos`, { headers: { Origin: baseURL }, multipart: { file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) } } });
  expect(upload.status()).toBe(503);
  expect((await upload.json()).error).toContain("pas encore disponible");
});

const UI_PLACE_ID = "ChIJ_ui_place_0001";

/** Le serveur de test n'a pas de clé Google : la lecture en direct de la fiche proposée est simulée dans le navigateur. */
async function mockProposedPlace(page: Page) {
  await page.route("**/api/google-place", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: { configured: true, candidate: { placeId: UI_PLACE_ID, name: "Atelier Test Parcours", address: "1 rue du Test, 75001 Paris", link: "https://maps.google.com/?cid=1" } } });
  });
}

test("US #252: the Google place found is shown with its link and saved only after the manager confirms it, then removable", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: UI_PLACE_ID } });
    await mockProposedPlace(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${baseURL}/diagnostic`);
    const dialog = page.getByRole("dialog", { name: "Est-ce bien votre fiche Google ?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Atelier Test Parcours");
    await expect(dialog).toContainText("1 rue du Test, 75001 Paris");
    await expect(dialog).toContainText("Rien n’est enregistré sans votre confirmation.");
    await expect(dialog.getByRole("link", { name: "Voir la fiche sur Google Maps" })).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Rien n'est enregistré tant que le dirigeant n'a pas cliqué.
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ googlePlaceId: null, googlePlaceCandidateId: UI_PLACE_ID });

    await dialog.getByRole("button", { name: "Oui, c’est ma fiche" }).click();
    const saved = page.getByRole("dialog", { name: "Fiche enregistrée" });
    await expect(saved).toContainText("Actualiser le diagnostic");
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ googlePlaceId: UI_PLACE_ID, googlePlaceCandidateId: null });
    await saved.getByRole("button", { name: "Fermer", exact: true }).last().click();

    await page.goto(`${baseURL}/entreprise`);
    const line = page.locator(".connection").filter({ hasText: "Fiche Google" });
    await expect(line.getByRole("link", { name: "Voir ma fiche sur Google Maps" })).toHaveAttribute("href", new RegExp(`query_place_id=${UI_PLACE_ID}$`));
    await line.getByRole("button", { name: "Retirer" }).click();
    await expect(page.locator(".connection").filter({ hasText: "Fiche Google" })).toHaveCount(0);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ googlePlaceId: null, googlePlaceDeclinedIds: [UI_PLACE_ID] });
  } finally {
    await prisma.$disconnect();
  }
});

test("US #252: declining the proposed Google place saves nothing on the company and is not asked again", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: UI_PLACE_ID } });
    await mockProposedPlace(page);
    await page.goto(`${baseURL}/diagnostic`);
    const dialog = page.getByRole("dialog", { name: "Est-ce bien votre fiche Google ?" });
    await dialog.getByRole("button", { name: "Ce n’est pas ma fiche" }).click();
    await expect(page.getByRole("dialog", { name: "Fiche écartée" })).toBeVisible();
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ googlePlaceId: null, googlePlaceCandidateId: null, googlePlaceDeclinedIds: [UI_PLACE_ID] });
    // Une confirmation tardive de la même fiche est refusée par le serveur.
    const late = await page.request.post(`${baseURL}/api/google-place`, { headers: { Origin: baseURL }, data: { action: "confirm", placeId: UI_PLACE_ID } });
    expect(late.status()).toBe(409);
    const forged = await page.request.post(`${baseURL}/api/google-place`, { headers: { Origin: baseURL }, data: { action: "confirm", placeId: "ChIJ_forged_place1", extra: true } });
    expect(forged.status()).toBe(400);
    expect((await page.request.post(`${baseURL}/api/google-place`, { headers: { Origin: "https://untrusted.example" }, data: { action: "remove" } })).status()).toBe(403);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ googlePlaceId: null });
  } finally {
    await prisma.$disconnect();
  }
});

test("US #252: the diagnostic lists what was really read and why a source was not", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const run = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", attempts: 1, startedAt: new Date(Date.now() - 60_000), finishedAt: new Date() } });
    await prisma.sourceRead.createMany({ data: [
      { companyId: company.id, agentRunId: run.id, source: "google_reviews", target: "own", status: "non_lue", reason: "to_confirm" },
      { companyId: company.id, agentRunId: run.id, source: "google_reviews", target: "competitor", subject: "Atelier Rival Paris", status: "lue", itemCount: 4 },
    ] });
    await page.goto(`${baseURL}/diagnostic`);
    const coverage = page.getByRole("region", { name: "Sources lues pour ce diagnostic" });
    await expect(coverage).toContainText("Avis Google de votre fiche");
    await expect(coverage).toContainText("Non lue : la fiche Google n'est pas encore confirmée par le dirigeant");
    await expect(coverage).toContainText("Avis Google d'un concurrent (« Atelier Rival Paris »)");
    await expect(coverage).toContainText("Lue, 4 avis lus");
    await expect(coverage).toContainText("Source des avis : Google Maps");
    // Sans clé Google côté serveur, aucune fenêtre n'est ouverte et aucune fiche n'est supposée.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});

const UI_FACEBOOK_PAGE = "https://www.facebook.com/atelier.parcours";

test("US #253: the Facebook Page found is shown with its link and saved only after the manager confirms it, then removable", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { facebookPageCandidateUrl: UI_FACEBOOK_PAGE } });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${baseURL}/diagnostic`);
    const dialog = page.getByRole("dialog", { name: "Est-ce bien votre Page Facebook ?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: UI_FACEBOOK_PAGE })).toHaveAttribute("href", UI_FACEBOOK_PAGE);
    await expect(dialog.getByRole("link", { name: UI_FACEBOOK_PAGE })).toHaveAttribute("rel", "noopener noreferrer");
    await expect(dialog).toContainText("Rien n’est enregistré sans votre confirmation.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Rien n'est enregistré tant que le dirigeant n'a pas cliqué.
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ facebookPageUrl: null, facebookPageCandidateUrl: UI_FACEBOOK_PAGE });

    await dialog.getByRole("button", { name: "Oui, c’est ma Page" }).click();
    const saved = page.getByRole("dialog", { name: "Page enregistrée" });
    await expect(saved).toContainText("Actualiser le diagnostic");
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ facebookPageUrl: UI_FACEBOOK_PAGE, facebookPageCandidateUrl: null });
    await saved.getByRole("button", { name: "Fermer", exact: true }).last().click();

    await page.goto(`${baseURL}/entreprise`);
    const line = page.locator(".connection").filter({ hasText: "Page Facebook" });
    await expect(line.getByRole("link", { name: "Voir ma Page sur Facebook" })).toHaveAttribute("href", UI_FACEBOOK_PAGE);
    await line.getByRole("button", { name: "Retirer" }).click();
    await expect(page.locator(".connection").filter({ hasText: "Page Facebook" })).toHaveCount(0);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ facebookPageUrl: null, facebookPageDeclinedUrls: [UI_FACEBOOK_PAGE] });
  } finally {
    await prisma.$disconnect();
  }
});

test("US #253: declining the proposed Facebook Page saves nothing on the company and is not asked again", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { facebookPageCandidateUrl: UI_FACEBOOK_PAGE } });
    await page.goto(`${baseURL}/diagnostic`);
    await page.getByRole("dialog", { name: "Est-ce bien votre Page Facebook ?" }).getByRole("button", { name: "Ce n’est pas ma Page" }).click();
    await expect(page.getByRole("dialog", { name: "Page écartée" })).toBeVisible();
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ facebookPageUrl: null, facebookPageCandidateUrl: null, facebookPageDeclinedUrls: [UI_FACEBOOK_PAGE] });
    // Une confirmation tardive du même lien est refusée par le serveur, un lien forgé ou une origine tierce aussi.
    const late = await page.request.post(`${baseURL}/api/facebook-page`, { headers: { Origin: baseURL }, data: { action: "confirm", url: UI_FACEBOOK_PAGE } });
    expect(late.status()).toBe(409);
    const forged = await page.request.post(`${baseURL}/api/facebook-page`, { headers: { Origin: baseURL }, data: { action: "confirm", url: "https://www.facebook.com/profile.php?id=1" } });
    expect(forged.status()).toBe(400);
    const extra = await page.request.post(`${baseURL}/api/facebook-page`, { headers: { Origin: baseURL }, data: { action: "confirm", url: UI_FACEBOOK_PAGE, extra: true } });
    expect(extra.status()).toBe(400);
    expect((await page.request.post(`${baseURL}/api/facebook-page`, { headers: { Origin: "https://untrusted.example" }, data: { action: "remove" } })).status()).toBe(403);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ facebookPageUrl: null });
  } finally {
    await prisma.$disconnect();
  }
});

test("US #253: the Google place is confirmed first, and the diagnostic lists the Facebook reads", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { googlePlaceCandidateId: UI_PLACE_ID, facebookPageCandidateUrl: UI_FACEBOOK_PAGE } });
    await mockProposedPlace(page);
    await page.goto(`${baseURL}/diagnostic`);
    // Une seule fenêtre à la fois : la fiche Google d'abord, la Page Facebook ensuite.
    await expect(page.getByRole("dialog", { name: "Est-ce bien votre fiche Google ?" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Est-ce bien votre Page Facebook ?" })).toHaveCount(0);
    const run = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: randomUUID(), payload: {}, status: "succeeded", attempts: 1, startedAt: new Date(Date.now() - 60_000), finishedAt: new Date() } });
    await prisma.sourceRead.createMany({ data: [
      { companyId: company.id, agentRunId: run.id, source: "facebook_page", target: "own", subject: "informations", status: "lue" },
      { companyId: company.id, agentRunId: run.id, source: "facebook_page", target: "own", subject: "publications", status: "non_lue", reason: "permission" },
    ] });
    await page.goto(`${baseURL}/diagnostic`);
    await page.getByRole("dialog", { name: "Est-ce bien votre fiche Google ?" }).getByRole("button", { name: "Plus tard" }).click();
    const coverage = page.getByRole("region", { name: "Sources lues pour ce diagnostic" });
    await expect(coverage).toContainText("Informations de votre Page Facebook");
    await expect(coverage).toContainText("Non lues : la permission de lire les publications n'est pas accordée");
  } finally {
    await prisma.$disconnect();
  }
});

test("US #258: the Studio turns a plain request into a new version, lets the owner go back to an older one, then validates without publishing", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const firstText = "Notre offre exceptionnelle : réservez vite votre isolation à prix cassé !";
  const secondText = "Chez M. Martin, l'isolation des combles a fait baisser la facture de chauffage.";
  try {
    const item = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Parler de la réalisation Martin", rationale: "Montrer une réalisation récente rassure les prospects.", timing: "Cette semaine", status: "lance" } });
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, planItemId: item.id, agent: "contenu", kind: "social_post", title: "Publication réalisation Martin", content: firstText,
    } });

    // L'agent est simulé : la demande écrit la version suivante en base, comme le ferait une révision réussie.
    const requests: { instruction: string; expectedVersion: number }[] = [];
    await page.route(`**/api/proposals/${proposal.id}/revise`, async (route) => {
      const body = route.request().postDataJSON() as { instruction: string; expectedVersion: number };
      requests.push(body);
      const current = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
      await prisma.$transaction([
        prisma.proposalRevision.create({ data: { proposalId: proposal.id, fromVersion: current.version, previousContent: current.content, source: "agent", instruction: body.instruction, note: "J'ai retiré le ton promotionnel." } }),
        prisma.agentProposal.update({ where: { id: proposal.id }, data: { content: secondText, version: current.version + 1 } }),
      ]);
      await route.fulfill({ status: 202, json: { runId: "run-studio-test", message: "Camille prépare la version 2." } });
    });
    const now = new Date().toISOString();
    await page.route("**/api/agent-runs/run-studio-test", (route) => route.fulfill({ json: { run: {
      id: "run-studio-test", agent: "contenu", planItemId: null, status: "succeeded", attempts: 1, maxDurationSeconds: 300,
      queuedAt: now, startedAt: now, finishedAt: now, resultCount: 1, errorMessage: null, failureReason: null,
    } } }));

    // Le lien de la carte ouvre le Studio de cette production.
    await page.goto(`${baseURL}/dashboard?view=validation`);
    await page.locator("article").filter({ hasText: proposal.title }).getByRole("link", { name: "Retravailler avec Camille" }).click();
    await expect(page).toHaveURL(`${baseURL}/studio/${proposal.id}`);
    await expect(page.getByRole("heading", { name: proposal.title, level: 1 })).toBeVisible();
    const preview = page.locator(".studio-preview .preview");
    const thread = page.getByRole("log", { name: "Conversation" });
    await expect(preview).toContainText(firstText);
    await expect(thread).toContainText("Voici ma proposition. Montrer une réalisation récente rassure les prospects.");

    // Une demande rapide devient une nouvelle version ; la précédente reste consultable.
    await page.getByRole("group", { name: "Demandes rapides" }).getByRole("button", { name: "Moins commercial" }).click();
    await expect(preview).toContainText(secondText);
    await expect(thread).toContainText("moins commercial");
    await expect(thread).toContainText("J'ai retiré le ton promotionnel.");
    expect(requests).toEqual([{ instruction: expect.stringContaining("moins commercial"), expectedVersion: 1 }]);
    const versions = page.getByRole("navigation", { name: "Versions" });
    await expect(versions.getByRole("button", { name: /^V2/ })).toHaveAttribute("aria-current", "true");

    // Consulter, comparer, puis reprendre la version 1 : la version 3 reprend son texte, rien n'est supprimé.
    await versions.getByRole("button", { name: /^V1/ }).click();
    await expect(preview).toContainText(firstText);
    await expect(page.getByText("Vous consultez la version 1, qui n’est plus la version actuelle.")).toBeVisible();
    await page.getByRole("button", { name: /Comparer avec l.actuelle/ }).click();
    await expect(page.locator(".studio-compare")).toContainText(firstText);
    await expect(page.locator(".studio-compare")).toContainText(secondText);
    await page.getByRole("button", { name: /Reprendre cette version/ }).click();
    await expect(page.getByText(/La version 3 reprend le contenu de la version 1/)).toBeVisible();
    await expect(preview).toContainText(firstText);
    let saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved).toMatchObject({ version: 3, content: firstText, status: "en_attente", approvedVersion: null });
    expect(await prisma.proposalRevision.findMany({ where: { proposalId: proposal.id }, orderBy: { fromVersion: "asc" }, select: { fromVersion: true, source: true, previousContent: true } })).toEqual([
      { fromVersion: 1, source: "agent", previousContent: firstText },
      { fromVersion: 2, source: "restore", previousContent: secondText },
    ]);

    // Valider la version courante ne publie rien et verrouille le Studio.
    await page.getByRole("button", { name: "Valider cette version" }).click();
    await expect(page.getByRole("link", { name: "Préparer la publication" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Votre demande à Camille/ })).toHaveCount(0);
    saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved).toMatchObject({ version: 3, status: "validee", approvedVersion: 3 });
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);

    // Une version validée n'accepte plus de demande ; une production inconnue n'existe pas.
    const revise = await page.request.post(`${baseURL}/api/proposals/${proposal.id}/revise`, { headers: { Origin: baseURL }, data: { instruction: "Plus court", expectedVersion: 3 } });
    expect(revise.status()).toBe(409);
    expect((await page.request.get(`${baseURL}/api/proposals/inconnue/versions`)).status()).toBe(404);
  } finally {
    await prisma.$disconnect();
  }
});

test("GH-168: Stratégie shows the finding behind each mission, its certainty and Paul's deduction, and opens its source", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    const run = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: `audit-${randomUUID()}`, payload: {}, status: "succeeded", finishedAt: new Date() } });
    const finding = await prisma.auditFinding.create({ data: {
      companyId: company.id, agentRunId: run.id, category: "site_web", title: "Le site ne montre aucun contact", content: "Aucun numéro ni formulaire sur la page d'accueil.",
      sourceUrl: "https://www.atelier-test.fr/", sourceStatus: "consultée", certainty: "observe", createdAt: new Date("2026-11-05T10:00:00Z"),
    } });
    const mission = (title: string, position: number, data: { createdBy: string; sourceFindingId?: string; deduction?: string }) => prisma.mission.create({ data: {
      companyId: company.id, template: "social_post", title, outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers" }, position, ...data,
    } });
    await mission("Montrer un chantier", 1, { createdBy: "paul", sourceFindingId: finding.id, deduction: "Un chantier publié avec un numéro visible peut ramener des demandes." });
    await mission("Mission ancienne de Paul", 2, { createdBy: "paul" });
    await mission("Publier un chantier", 3, { createdBy: "owner" });

    await page.goto(`${baseURL}/strategie`);
    const linked = page.getByRole("article", { name: "Montrer un chantier" });
    await expect(linked).toContainText("Le site ne montre aucun contact");
    await expect(linked).toContainText("Site web · atelier-test.fr");
    await expect(linked).toContainText("Observé");
    await expect(linked).toContainText("Aucune publication depuis trois mois");
    await expect(linked).toContainText("Un chantier publié avec un numéro visible peut ramener des demandes.");

    // Mission ancienne de Paul : ni constat relié ni déduction.
    const legacy = page.getByRole("article", { name: "Mission ancienne de Paul" });
    await expect(legacy).toContainText("Constat relevé par Paul");
    await expect(legacy).toContainText("Conversation avec Paul");
    await expect(legacy).toContainText("À vérifier");
    await expect(legacy).toContainText("—");
    await expect(legacy.getByRole("button", { name: /Voir la source/ })).toHaveCount(0);

    // Mission du dirigeant : déclarée, jamais observée.
    const owner = page.getByRole("article", { name: "Publier un chantier" });
    await expect(owner).toContainText("Votre constat");
    await expect(owner).toContainText("Déclaré à la création de la mission");
    await expect(owner).toContainText("Déclaré par vous");
    await expect(owner).toContainText("Vous avez choisi de le tester.");
    await expect(owner).not.toContainText("Observé");
    await expect(owner.getByRole("button", { name: /Voir la source/ })).toHaveCount(0);

    await linked.getByRole("button", { name: /Voir la source/ }).click();
    const source = page.getByRole("dialog", { name: "Le site ne montre aucun contact" });
    await expect(source).toContainText("Aucun numéro ni formulaire sur la page d'accueil.");
    await expect(source).toContainText("Site web · atelier-test.fr");
    await expect(source).toContainText("5 novembre 2026");
    await expect(source.getByRole("link", { name: "https://www.atelier-test.fr/" })).toHaveAttribute("href", "https://www.atelier-test.fr/");
    await page.keyboard.press("Escape");
    await expect(source).toBeHidden();

    await linked.getByRole("button", { name: /Voir la source/ }).click();
    await source.getByRole("button", { name: "Questionner ce constat" }).click();
    await expect(source).toBeHidden();
    const paul = page.getByRole("dialog", { name: "Discussion avec Paul" });
    await expect(paul.locator("header")).toContainText("Fiabilité des sources");
    // Le panneau reste ouvert d'une page à l'autre et couvre l'écran d'un téléphone : on le replie avant les largeurs étroites.
    await paul.getByRole("button", { name: "Replier" }).click();
    await expect(paul).toBeHidden();

    // Téléphone : la ligne et la fenêtre tiennent sans défilement horizontal.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${baseURL}/strategie`);
      await expect(page.getByRole("article", { name: "Montrer un chantier" })).toContainText("Observé");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("article", { name: "Montrer un chantier" }).getByRole("button", { name: /Voir la source/ }).click();
      await expect(source).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // L'adresse de la source ne dépasse pas de la fenêtre.
      expect(await source.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    }
  } finally {
    await prisma.$disconnect();
  }
});

// Parcours d'entrée en cinq étapes, compte créé en dernier (#279).
function journeyDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) throw new Error("DATABASE_URL and SESSION_SECRET are required for UX tests.");
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
    throw new Error("UX tests refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const stepHeading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });

/** Étapes 1 à 4 par l'API du parcours, avec les cookies de la page (#280 : la fin de l'analyse avant l'étape 2). */
async function draftToAccountStep(page: Page) {
  await discoverThenSeeFindings(page.request, baseURL, { firstName: "Claire", companyName: "Atelier Lumen", location: "Lyon" });
  const post = (data: Record<string, unknown>) => page.request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL }, data });
  expect((await post({ action: "confirm_profile", trade: "Électricien", servingArea: "Lyon", targetClients: "Particuliers", offers: "Rénovation électrique" })).status(), "confirm_profile").toBe(200);
  expect((await interpretThenConfirmAmbition(page.request, baseURL, "Plus de chantiers cette année")).confirmed.status(), "confirm_ambition").toBe(200);
  await waitForIntelligence(page.request, baseURL);
  expect((await post({ action: "interested" })).status(), "interested").toBe(200);
}

test("onboarding quality: no missions or account shortcut while research is running; failure is explicit", async ({ page }) => {
  const prisma = journeyDatabase();
  const draft = await createTestDraft(prisma, { step: 4 });
  try {
    const row = await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } });
    const intelligence = newIntelligence(intelligenceInputFor(readDraftState(row)), randomUUID());
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { intelligence } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`${baseURL}/bienvenue/missions`);
    await expect(page.getByRole("status")).toContainText("Vos pistes seront affichées à la fin");
    await expect(page.getByRole("list", { name: "Trois premières pistes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ça m'intéresse" })).toHaveCount(0);
    for (const data of [{ action: "interested" }, { action: "goto", step: 5 }]) {
      expect((await page.request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL }, data })).status()).toBe(409);
    }
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { intelligence: { ...intelligence, status: "failed", finishedAt: new Date().toISOString() } } });
    await expect(page.getByRole("status")).toContainText(INTELLIGENCE_MESSAGES.failed, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Ça m'intéresse" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.$disconnect();
  }
});

test("GH-279: five anonymous steps, back and reload keep the answers, and the account comes last", async ({ page }) => {
  test.setTimeout(120000);
  const prisma = journeyDatabase();
  const email = `ux-bienvenue-${randomUUID()}@example.invalid`;
  try {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.setExtraHTTPHeaders(testIpHeader());
    await page.goto(`${baseURL}/bienvenue`);
    await expect(stepHeading(page, "Votre entreprise. Notre point de départ.")).toBeFocused();
    await expect(page.getByText("1 sur 5", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Revoir le concept" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("navigation", { name: "Étapes du parcours" }).getByRole("listitem")).toHaveCount(5);
    expect(await noHorizontalScroll(page)).toBe(true);

    // Site invalide : rien n'est enregistré, le message est sous le champ et annoncé.
    await page.getByLabel("Votre prénom").fill("Claire");
    await page.getByLabel("Le nom de votre entreprise").fill("Atelier Lumen");
    await page.getByLabel("Sa localisation").fill("Lyon");
    await page.getByLabel("Votre site (facultatif)").fill("ftp://x");
    await page.getByRole("button", { name: "Découvrir mon entreprise" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Utilisez une adresse commençant par https:// ou http://.");
    await expect(page.getByLabel("Votre site (facultatif)")).toHaveAttribute("aria-invalid", "true");
    expect((await page.context().cookies()).some((cookie) => cookie.name === "pepito_draft")).toBe(false);

    // Clavier : le site corrigé, la découverte se lance au clavier ; un site illisible ne bloque pas la suite (#280).
    await page.getByLabel("Votre site (facultatif)").fill("https://atelier-lumen.invalid");
    await page.getByLabel("Votre site (facultatif)").press("Enter");
    const seeFindings = page.getByRole("button", { name: "Voir mes premiers constats" });
    await expect(seeFindings).toBeFocused({ timeout: 30000 });
    await expect(page.getByRole("region", { name: "Ce que Paul lit" }).getByRole("listitem").first()).toContainText("Non disponible (site illisible)");
    await page.keyboard.press("Enter");
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeFocused();
    await expect(page.getByText("2 sur 5", { exact: true })).toBeVisible();
    const draftCookie = (await page.context().cookies()).find((cookie) => cookie.name === "pepito_draft");
    expect(draftCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    expect(draftCookie!.expires * 1000 - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(0);

    // Saut d'étape : l'étape 5 renvoie à l'étape courante.
    await page.goto(`${baseURL}/bienvenue/compte`);
    await expect(page).toHaveURL(`${baseURL}/bienvenue`);
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeVisible();

    await page.getByRole("button", { name: "Oui, c'est bien moi" }).click();
    await expect(page.locator("main").getByRole("alert").first()).toHaveText("Complétez chaque information avant de confirmer.");
    await page.getByLabel("Votre activité").fill("Électricien");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveValue("Lyon");
    await page.getByLabel("Vos clients", { exact: true }).fill("Particuliers propriétaires");
    await page.getByLabel("Ce que vous proposez", { exact: true }).fill("Rénovation électrique");
    await page.getByRole("button", { name: "Oui, c'est bien moi" }).click();
    await expect(stepHeading(page, "Qu'aimeriez-vous changer ?")).toBeFocused();

    // Rechargement : l'étape 3 est réaffichée avec ses saisies.
    await page.getByLabel("Votre ambition").fill("court");
    await page.getByRole("button", { name: "Interpréter" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Décrivez votre ambition en une ou deux phrases (10 caractères au moins).");
    await expect(page.getByRole("button", { name: "C'est bien ça" })).toHaveCount(0);
    await page.reload();
    await expect(stepHeading(page, "Qu'aimeriez-vous changer ?")).toBeVisible();
    await expect(page.getByText("3 sur 5", { exact: true })).toBeVisible();
    // #282 : Paul reformule, sans rien enregistrer ; la mention de cible accompagne toujours la reformulation.
    const ambitionText = "+20 % de chiffre d'affaires en 12 mois, sans embaucher";
    await page.getByLabel("Votre ambition").fill(ambitionText);
    await page.getByRole("button", { name: "Interpréter" }).click();
    const understood = page.getByRole("region", { name: "Ce que Paul comprend" });
    await expect(understood).toContainText("Voici ce que je comprends.");
    await expect(understood).toContainText("+20 % de chiffre d'affaires");
    await expect(understood).toContainText("C'est une cible, pas une promesse de résultat. Vous pourrez la corriger à tout moment.");
    expect(await noHorizontalScroll(page)).toBe(true);
    // Modifier le texte après l'interprétation retire la reformulation et « C'est bien ça » : il faut interpréter de nouveau.
    await page.getByLabel("Votre ambition").fill(`${ambitionText} !`);
    await expect(understood).toHaveCount(0);
    await expect(page.getByRole("button", { name: "C'est bien ça" })).toHaveCount(0);
    await page.getByLabel("Votre ambition").fill(ambitionText);
    await page.getByRole("button", { name: "Interpréter" }).click();
    await expect(understood).toBeVisible();
    await page.getByRole("button", { name: "C'est bien ça" }).click();
    await expect(page).toHaveURL(`${baseURL}/bienvenue/missions`);
    await expect(stepHeading(page, "Un cap. Trois premières pistes.")).toBeFocused();
    const pistes = page.getByRole("list", { name: "Trois premières pistes" }).getByRole("listitem");
    await expect(pistes).toHaveCount(3, { timeout: 95_000 });
    await expect(pistes.first()).toContainText("Résultat recherché");
    // #284 : rappel, « Ce que nous retenons », la première piste repérée, l'origine et le périmètre de chaque piste.
    await expect(page.getByRole("heading", { name: "Ce que nous retenons" })).toBeVisible();
    await expect(page.getByText("Paul n'a pas pu lire votre site : ce qui suit repose sur ce que vous nous avez dit.")).toBeVisible();
    await expect(pistes.first()).toContainText("À examiner en premier");
    await expect(pistes.nth(1)).not.toContainText("À examiner en premier");
    for (let index = 0; index < 3; index += 1) {
      await expect(pistes.nth(index)).toContainText("Vous nous avez dit");
      await expect(pistes.nth(index)).toContainText("Périmètre proposé");
    }
    const stepTitles = await pistes.locator("h3").allTextContents();
    expect(new Set(stepTitles).size).toBe(3);
    await expect(page.getByRole("button", { name: "Ça m'intéresse" })).toHaveCount(1);
    expect(await noHorizontalScroll(page)).toBe(true);

    // Retour jusqu'à l'étape 2 : l'ambition est gardée mais à reconfirmer.
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(stepHeading(page, "Qu'aimeriez-vous changer ?")).toBeFocused();
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeFocused();
    await expect(page.getByLabel("Ce que vous proposez", { exact: true })).toHaveValue("Rénovation électrique");
    await page.goto(`${baseURL}/bienvenue/missions`);
    await expect(page).toHaveURL(`${baseURL}/bienvenue`);
    await page.getByRole("button", { name: "Oui, c'est bien moi" }).click();
    await expect(page.getByLabel("Votre ambition")).toHaveValue("+20 % de chiffre d'affaires en 12 mois, sans embaucher");
    await page.getByRole("button", { name: "Interpréter" }).click();
    await page.getByRole("button", { name: "C'est bien ça" }).click();
    await page.getByRole("button", { name: "Ça m'intéresse" }).click({ timeout: 95_000 });
    await expect(page).toHaveURL(`${baseURL}/bienvenue/compte`);
    await expect(stepHeading(page, "Retrouvez votre stratégie.")).toBeFocused();
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(0);

    // Étape 5 : deux mots de passe identiques, puis l'arrivée sur la stratégie.
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mot-de-passe-valide");
    await page.getByLabel("Confirmez le mot de passe").fill("autre-mot-de-passe");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Les deux mots de passe ne correspondent pas.");
    await page.getByLabel("Confirmez le mot de passe").fill("mot-de-passe-valide");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(`${baseURL}/strategie`);
    await expect(page.getByRole("heading", { name: "Bonjour Claire." })).toBeVisible();

    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email }, include: { missions: { orderBy: { position: "asc" } }, journalEntries: true } });
    expect(company).toMatchObject({
      name: "Atelier Lumen", firstName: "Claire", location: "Lyon", website: "https://atelier-lumen.invalid", trade: "Électricien", servingArea: "Lyon",
      targetClients: "Particuliers propriétaires", offers: "Rénovation électrique", ambitionText: "+20 % de chiffre d'affaires en 12 mois, sans embaucher",
      objective: "+20 % de chiffre d'affaires en 12 mois, sans embaucher",
      // #282 : le texte tel quel et les éléments retenus avec Paul.
      ambitionTerms: { gainPercent: 20, horizonMonths: 12, recruitment: "no" },
    });
    expect(company.ambitionConfirmedAt).not.toBeNull();
    // #169 : l'origine retenue à l'inscription ; site illisible, la zone reprise de la localisation reste une proposition de Paul.
    expect(company.profileOrigins).toEqual({ firstName: "declared", name: "declared", location: "declared", trade: "declared", servingArea: "hypothesis", targetClients: "declared", offers: "declared" });
    await page.goto(`${baseURL}/entreprise`);
    await expect(page.locator('[data-origin="servingArea"]')).toHaveText("Origine : Proposé par Paul, confirmé par vous");
    await expect(page.locator('[data-origin="offers"]')).toHaveText("Origine : Déclaré par vous");
    await expect(page.locator("[data-origin]")).toHaveCount(7);
    await page.goto(`${baseURL}/strategie`);
    // Le premier audit est mis au plan après la création du compte, une seule fois.
    expect(await prisma.actionPlanItem.count({ where: { companyId: company.id, agent: "marketing", timing: "Dès l'inscription" } })).toBe(1);
    expect(company.profileConfirmedAt).not.toBeNull();
    expect(company.missions).toHaveLength(3);
    expect(company.missions.every((mission) => mission.status === "proposed" && mission.firstLaunchedAt === null)).toBe(true);
    // #284 : les pistes de l'étape 4, dans l'ordre, avec leur déduction, leur agent et leur risque ; la première est prioritaire.
    expect(company.missions.map((mission) => mission.title)).toEqual(stepTitles);
    expect(company.missions.every((mission) => mission.deduction && mission.responsibleAgent && mission.risk)).toBe(true);
    expect(company.priorityMissionId).toBe(company.missions[0].id);
    await expect(page.getByRole("article", { name: stepTitles[0] })).toContainText("À décider");
    expect(company.journalEntries.filter((entry) => entry.code === "J-04")).toHaveLength(1);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "pepito_draft")).toBe(false);

    // Session ouverte : le parcours mène à la stratégie.
    await page.goto(`${baseURL}/bienvenue`);
    await expect(page).toHaveURL(`${baseURL}/strategie`);
    await page.goto(`${baseURL}/signup`);
    await expect(page).toHaveURL(`${baseURL}/strategie`);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("GH-284: Stratégie offers « Ouvrir mon diagnostic » without findings, « Préparer mes missions » with them, and shows who prepares a mission and its risk", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { workspaceV52: true } });
    // Sans constat : un lien vers le diagnostic, jamais le bouton.
    await page.goto(`${baseURL}/strategie`);
    await expect(page.getByRole("link", { name: "Ouvrir mon diagnostic" }).first()).toHaveAttribute("href", "/diagnostic");
    await expect(page.getByRole("button", { name: "Préparer mes missions" })).toHaveCount(0);

    // Un constat courant et une mission avec son agent et son risque (on ne lance pas le modèle).
    const audit = await prisma.agentRun.create({ data: { companyId: company.id, agent: "marketing", requestKey: `audit-${randomUUID()}`, payload: {}, status: "succeeded", finishedAt: new Date() } });
    await prisma.auditFinding.create({ data: { companyId: company.id, agentRunId: audit.id, category: "site_web", title: "Aucune page ne présente vos offres", content: "Le site ne détaille pas la rénovation." } });
    const risk = "Une seule publication donne un signal, pas une preuve.";
    const mission = await prisma.mission.create({ data: {
      companyId: company.id, template: "social_post", channel: "facebook", title: "Publier un chantier terminé", outcome: "2 demandes de devis d'ici 30 jours",
      originalOutcome: "2 demandes de devis d'ici 30 jours", finding: "Page Facebook peu active", position: 1, createdBy: "paul", responsibleAgent: "contenu", risk,
    } });
    await page.goto(`${baseURL}/strategie`);
    const prepare = page.getByRole("button", { name: "Préparer mes missions" });
    await expect(prepare).toHaveCount(1);
    await expect(prepare).not.toHaveClass(/primary/);
    await expect(page.getByRole("link", { name: "Ouvrir mon diagnostic" })).toHaveCount(0);
    const row = page.getByRole("article", { name: "Publier un chantier terminé" });
    await expect(row).toContainText("Paul, pour vos contenus et votre site");
    await expect(row).toContainText(`Risque ou limite : ${risk}`);

    await page.goto(`${baseURL}/missions/${mission.id}`);
    const contract = page.getByRole("complementary", { name: "Notre contrat de mission" });
    await expect(contract).toContainText("Préparée par");
    await expect(contract).toContainText("Paul, pour vos contenus et votre site");
    await expect(contract).toContainText("Risque ou limite");
    await expect(contract).toContainText(risk);
  } finally {
    await prisma.$disconnect();
  }
});

test("GH-279: an address already in use keeps the draft and points to « Retrouver mon compte » without saying the account exists", async ({ page }) => {
  const prisma = journeyDatabase();
  const email = `ux-bienvenue-taken-${randomUUID()}@example.invalid`;
  try {
    await prisma.company.create({ data: { ownerEmail: email, name: "Déjà inscrit", trade: "Artisan", servingArea: "Paris" } });
    await draftToAccountStep(page);
    await page.goto(`${baseURL}/bienvenue/compte`);
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mot-de-passe-valide");
    await page.getByLabel("Confirmez le mot de passe").fill("mot-de-passe-valide");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("Nous ne pouvons pas créer de compte avec cette adresse.");
    await expect(alert).not.toContainText(/existe|a déjà un compte/);
    await expect(alert.getByRole("link", { name: "Retrouver mon compte" })).toHaveAttribute("href", "/login");
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
    await page.reload();
    await expect(stepHeading(page, "Retrouvez votre stratégie.")).toBeVisible();
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("GH-279: an expired draft starts over at step 1, and existing accounts never re-enter the journey", async ({ page }) => {
  const prisma = journeyDatabase();
  const named = `ux-bienvenue-named-${randomUUID()}@example.invalid`;
  const unnamed = `ux-bienvenue-unnamed-${randomUUID()}@example.invalid`;
  const token = randomBytes(32).toString("base64url");
  try {
    await prisma.onboardingDraft.create({ data: {
      tokenHash: createHash("sha256").update(token).digest("hex"), step: 3, profileConfirmed: true,
      profile: { firstName: "Claire", companyName: "Atelier Lumen", location: "Lyon" }, expiresAt: new Date(Date.now() - 1000),
    } });
    await page.context().addCookies([{ name: "pepito_draft", value: token, url: baseURL }]);
    await page.goto(`${baseURL}/bienvenue`);
    await expect(stepHeading(page, "Votre entreprise. Notre point de départ.")).toBeVisible();
    await expect(page.getByLabel("Votre prénom")).toHaveValue("");

    // Sans session, l'ancienne étape de profil mène au parcours.
    await page.context().clearCookies();
    await page.goto(`${baseURL}/onboarding`);
    await expect(page).toHaveURL(`${baseURL}/bienvenue`);

    const withName = await prisma.company.create({ data: { ownerEmail: named, name: "Atelier existant", trade: "Artisan", servingArea: "Paris" } });
    await page.context().addCookies([{ name: "pepito_session", value: createSessionToken(named, withName.sessionVersion, process.env.SESSION_SECRET!), url: baseURL }]);
    for (const path of ["/bienvenue", "/bienvenue/missions", "/bienvenue/compte", "/onboarding"]) {
      await page.goto(`${baseURL}${path}`);
      await expect(page, path).toHaveURL(`${baseURL}/strategie`);
    }
    const refused = await page.request.post(`${baseURL}/api/bienvenue`, { headers: { Origin: baseURL }, data: { action: "discover", firstName: "Claire", companyName: "Atelier", location: "Lyon" } });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ href: "/strategie" });

    // Un ancien compte sans nom garde le formulaire de /onboarding, jamais /bienvenue.
    const withoutName = await prisma.company.create({ data: { ownerEmail: unnamed, name: "", trade: "", servingArea: "" } });
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "pepito_session", value: createSessionToken(unnamed, withoutName.sessionVersion, process.env.SESSION_SECRET!), url: baseURL }]);
    await page.goto(`${baseURL}/bienvenue`);
    await expect(page).toHaveURL(`${baseURL}/onboarding`);
    await expect(page.getByRole("button", { name: "Valider et lancer mon audit" })).toBeVisible();
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    await prisma.company.deleteMany({ where: { ownerEmail: { in: [named, unnamed] } } });
    await prisma.$disconnect();
  }
});

test("GH-280: « Je n'ai pas de site » reads no web page, announces the four rubrics, then opens step 2 « À renseigner par vous »", async ({ page }) => {
  test.setTimeout(90000);
  const prisma = journeyDatabase();
  const companyName = `Atelier Sans Site ${randomUUID().slice(0, 8)}`;
  let tokenHash = "";
  try {
    const before = { companies: await prisma.company.count(), usage: await prisma.usageEvent.count(), reads: await prisma.sourceRead.count(), findings: await prisma.auditFinding.count() };
    await page.setViewportSize({ width: 360, height: 800 });
    await page.setExtraHTTPHeaders(testIpHeader());
    await page.goto(`${baseURL}/bienvenue`);
    await expect(page.getByText("Aucun mot de passe ni accès privé nécessaire.", { exact: false })).toBeVisible();
    await page.getByLabel("Votre prénom").fill("Claire");
    await page.getByLabel("Le nom de votre entreprise").fill(companyName);
    await page.getByLabel("Sa localisation").fill("Lyon");
    await page.getByLabel("Votre site (facultatif)").fill("https://atelier-sans-site.invalid");
    await page.getByRole("button", { name: "Je n'ai pas de site" }).click();
    const rubrics = page.getByRole("region", { name: "Ce que Paul lit" });
    await expect(rubrics.getByRole("list")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("button", { name: "Voir mes premiers constats" })).toBeFocused({ timeout: 30000 });
    await expect(page.getByLabel("Votre site (facultatif)")).toHaveValue("");
    const items = rubrics.getByRole("listitem");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveText(/Site et offres\s*Non disponible \(pas de site\)/);
    await expect(items.nth(1)).toContainText("Informations publiques");
    await expect(items.nth(3)).toHaveText(/Identité visuelle\s*Non disponible \(pas de site\)/);
    // Un seul bouton principal : « Découvrir » passe en secondaire une fois les constats prêts.
    await expect(page.getByRole("button", { name: "Découvrir mon entreprise" })).not.toHaveClass(/bg-\[var\(--bd-brand\)\]/);
    expect(await noHorizontalScroll(page)).toBe(true);

    // Le brouillon garde l'état des rubriques et le coût ; aucune ligne liée à une entreprise n'est écrite.
    const token = (await page.context().cookies()).find((cookie) => cookie.name === "pepito_draft")!.value;
    tokenHash = createHash("sha256").update(token).digest("hex");
    const draft = await prisma.onboardingDraft.findUniqueOrThrow({ where: { tokenHash } });
    expect(draft.analysis).toMatchObject({ status: "done", input: { companyName, website: "" }, rubrics: { site: { status: "unavailable", reason: "no_site" }, identity: { status: "unavailable", reason: "no_site" } }, cost: { usd: 0 } });
    expect({ companies: await prisma.company.count(), usage: await prisma.usageEvent.count(), reads: await prisma.sourceRead.count(), findings: await prisma.auditFinding.count() }).toEqual(before);

    await page.getByRole("button", { name: "Voir mes premiers constats" }).click();
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeFocused();
    await expect(page.getByText("À renseigner par vous", { exact: true })).toHaveCount(3);
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveValue("Lyon");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveAccessibleDescription("À confirmer");
    expect((await prisma.onboardingDraft.findUniqueOrThrow({ where: { tokenHash } })).profileConfirmed).toBe(false);
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    if (tokenHash) await prisma.onboardingDraft.deleteMany({ where: { tokenHash } });
    await prisma.$disconnect();
  }
});

test("GH-280: step 2 shows Paul's hypotheses and what was observed, with its source and date", async ({ page }) => {
  const prisma = journeyDatabase();
  const draft = await createTestDraft(prisma, { step: 2, profile: { website: "https://atelier-lumen.test", trade: "", servingArea: "", targetClients: "", offers: "" } });
  const readAt = "2026-11-07T10:00:00.000Z";
  const observed = (source: string) => ({ kind: "observed", source, readAt });
  try {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { profileConfirmed: false, analysis: {
      runId: "run-vue", status: "done", startedAt: readAt, finishedAt: readAt,
      input: { companyName: "Atelier Lumen", location: "Lyon", website: "https://atelier-lumen.test" },
      rubrics: { site: { status: "read" }, google: { status: "read" }, zone: { status: "read" }, identity: { status: "read" } },
      findings: {
        trade: { value: "Électricien", provenance: { kind: "hypothesis" } }, servingArea: { value: "Lyon et Villeurbanne", provenance: { kind: "hypothesis" } },
        targetClients: { value: "Particuliers", provenance: { kind: "hypothesis" } }, offers: null, tone: null,
        contacts: [{ value: "contact@atelier-lumen.test", provenance: observed("https://atelier-lumen.test/contact") }],
        palette: { value: ["#176b50", "#e06a30"], provenance: observed("https://atelier-lumen.test/") }, logo: null,
        google: { value: "https://maps.google.com/?cid=42", provenance: observed("https://maps.google.com/?cid=42") },
        pages: [{ url: "https://atelier-lumen.test/", readAt }],
      },
      cost: { usd: 0.008, inputTokens: 3000, outputTokens: 200 },
    } } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL }]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/bienvenue`);
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeVisible();
    await expect(page.getByText("voici ce que Paul a compris de Atelier Lumen", { exact: false })).toBeVisible();
    await expect(page.getByText("À confirmer", { exact: true })).toHaveCount(3);
    await expect(page.getByText("À renseigner par vous", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Votre activité")).toHaveValue("Électricien");
    const seen = page.getByRole("region", { name: "Ce que Paul a observé" });
    await expect(seen).toContainText("Chaque champ ci-dessous indique d'où vient sa valeur");
    const contact = seen.getByRole("listitem").filter({ hasText: "contact@atelier-lumen.test" });
    await expect(contact).toContainText("Observé sur atelier-lumen.test le 7 novembre 2026");
    await expect(seen.getByRole("link", { name: "Fiche Google repérée, à vérifier", exact: true })).toHaveAttribute("href", "https://maps.google.com/?cid=42");
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.$disconnect();
  }
});

test("GH-281: step 2 says where each field comes from, and « Non, corriger mes informations » goes back to step 1 without a new analysis", async ({ page }) => {
  const prisma = journeyDatabase();
  const website = "https://atelier-lumen.test";
  const draft = await createTestDraft(prisma, { step: 2, profile: { website, trade: "", servingArea: "", targetClients: "", offers: "" } });
  const readAt = "2026-11-07T10:00:00.000Z";
  try {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { profileConfirmed: false, analysis: {
      runId: "run-corriger", status: "done", startedAt: readAt, finishedAt: readAt,
      input: { companyName: "Atelier Lumen", location: "Lyon", website },
      rubrics: { site: { status: "read" }, google: { status: "not_found" }, zone: { status: "read" }, identity: { status: "read" } },
      findings: {
        trade: { value: "Électricien", provenance: { kind: "hypothesis" } }, servingArea: null,
        targetClients: { value: "Particuliers", provenance: { kind: "hypothesis" } },
        offers: { value: "Rénovation électrique", provenance: { kind: "observed", source: `${website}/`, readAt } },
        tone: null, contacts: [], palette: null, logo: null, google: null, pages: [{ url: `${website}/`, readAt }],
      },
      cost: { usd: 0.008, inputTokens: 3000, outputTokens: 200, model: "claude-sonnet-5-5" },
    } } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL }]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/bienvenue`);
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeVisible();
    // Les offres lues sur le site, les hypothèses du modèle à confirmer ; la zone reprend la localisation, à confirmer aussi.
    await expect(page.getByText("Lu sur le site", { exact: true })).toHaveCount(1);
    await expect(page.getByText("À confirmer", { exact: true })).toHaveCount(3);
    await expect(page.getByLabel("Ce que vous proposez", { exact: true })).toHaveValue("Rénovation électrique");
    await expect(page.getByLabel("Ce que vous proposez", { exact: true })).toHaveAccessibleDescription("Lu sur le site");
    await expect(page.getByLabel("Vos clients", { exact: true })).toHaveAccessibleDescription("À confirmer");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveValue("Lyon");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveAccessibleDescription("À confirmer");
    // Une valeur modifiée par le dirigeant n'a plus d'étiquette ; la remettre telle quelle la fait revenir.
    await page.getByLabel("Votre zone d'intervention").fill("Lyon et Villeurbanne");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveAccessibleDescription("");
    await page.getByLabel("Votre zone d'intervention").fill("Lyon");
    await expect(page.getByLabel("Votre zone d'intervention")).toHaveAccessibleDescription("À confirmer");
    await expect(page.getByRole("button", { name: "Oui, c'est bien moi" })).toHaveClass(/bg-\[var\(--bd-brand\)\]/);
    await expect(page.getByRole("button", { name: "Non, corriger mes informations" })).not.toHaveClass(/bg-\[var\(--bd-brand\)\]/);
    expect(await noHorizontalScroll(page)).toBe(true);

    await page.getByRole("button", { name: "Non, corriger mes informations" }).click();
    await expect(stepHeading(page, "Votre entreprise. Notre point de départ.")).toBeFocused();
    await expect(page.getByLabel("Votre prénom")).toHaveValue("Claire");
    await expect(page.getByLabel("Le nom de votre entreprise")).toHaveValue("Atelier Lumen");
    await expect(page.getByLabel("Sa localisation")).toHaveValue("Lyon");
    await expect(page.getByLabel("Votre site (facultatif)")).toHaveValue(website);
    expect(await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ step: 1, analysis: { runId: "run-corriger" } });

    // Rien n'a changé : retour à l'étape 2 avec la même analyse, sans en relancer une.
    await page.getByRole("button", { name: "Voir mes premiers constats" }).click();
    await expect(stepHeading(page, "Paul semble avoir compris votre entreprise.")).toBeFocused();
    await expect(page.getByText("Lu sur le site", { exact: true })).toHaveCount(1);
    expect(await prisma.onboardingDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ step: 2, analysis: { runId: "run-corriger" } });
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.$disconnect();
  }
});

test("GH-169: the origins from the analysis, kept unchanged at step 2, are stored at signup and shown on Entreprise", async ({ page }) => {
  const prisma = journeyDatabase();
  const website = "https://atelier-lumen.test";
  const email = `ux-origines-${randomUUID()}@example.invalid`;
  // Étape 5 : activité (hypothèse) et offres (lues sur le site) gardées telles quelles ; clients modifiés ; zone reprise de la localisation.
  const draft = await createTestDraft(prisma, { profile: { website, trade: "Électricien", servingArea: "Lyon", targetClients: "Particuliers propriétaires", offers: "Rénovation électrique" } });
  const readAt = "2026-11-07T10:00:00.000Z";
  try {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { analysis: {
      runId: "run-origines", status: "done", startedAt: readAt, finishedAt: readAt,
      input: { companyName: "Atelier Lumen", location: "Lyon", website },
      rubrics: { site: { status: "read" }, google: { status: "not_found" }, zone: { status: "read" }, identity: { status: "read" } },
      findings: {
        trade: { value: "Électricien", provenance: { kind: "hypothesis" } }, servingArea: null,
        targetClients: { value: "Particuliers", provenance: { kind: "hypothesis" } },
        offers: { value: "Rénovation électrique", provenance: { kind: "observed", source: `${website}/`, readAt } },
        tone: null, contacts: [], palette: null, logo: null, google: null, pages: [{ url: `${website}/`, readAt }],
      },
      cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    } } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL }]);
    const password = "mot-de-passe-valide";
    const signup = await page.request.post(`${baseURL}/api/auth/signup`, { headers: { Origin: baseURL, ...testIpHeader() }, data: { email, password, passwordConfirmation: password } });
    expect(signup.status()).toBe(201);

    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email } });
    expect(company.profileOrigins).toEqual({ firstName: "declared", name: "declared", location: "declared", trade: "hypothesis", servingArea: "hypothesis", targetClients: "declared", offers: "observed" });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/entreprise`);
    await expect(page.locator('[data-origin="offers"]')).toHaveText("Origine : Lu sur le site");
    await expect(page.locator('[data-origin="trade"]')).toHaveText("Origine : Proposé par Paul, confirmé par vous");
    await expect(page.locator('[data-origin="targetClients"]')).toHaveText("Origine : Déclaré par vous");
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

function analysisWithConstats(website: string, readAt: string) {
  return {
    runId: "run-constats", status: "done", startedAt: readAt, finishedAt: readAt,
    input: { companyName: "Atelier Lumen", location: "Lyon", website },
    rubrics: { site: { status: "read" }, google: { status: "not_found" }, zone: { status: "read" }, identity: { status: "read" } },
    findings: { trade: null, servingArea: null, targetClients: null, offers: null, tone: null, contacts: [], palette: null, logo: null, google: null, pages: [{ url: `${website}/`, readAt }] },
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    constats: [
      { topic: "site_web", fact: "Votre site ne montre aucune réalisation.", consequence: "Vos clients ne voient pas ce que vous savez faire.", certainty: "observe", source: `${website}/`, readAt },
      { topic: "site_web", fact: "Vous semblez viser surtout les particuliers.", consequence: "Les syndics ne se sentent pas concernés.", certainty: "piste", source: null, readAt: null },
    ],
  };
}

test("GH-292: step 2 shows the first findings with their certainty, consequence, source and date; a hint never shows a source", async ({ page }) => {
  const prisma = journeyDatabase();
  const website = "https://atelier-lumen.test";
  const draft = await createTestDraft(prisma, { step: 2, profile: { website, trade: "", servingArea: "", targetClients: "", offers: "" } });
  try {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { profileConfirmed: false, analysis: analysisWithConstats(website, "2026-11-07T10:00:00.000Z") } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL }]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/bienvenue`);
    const constats = page.getByRole("region", { name: "Vos premiers constats" });
    await expect(constats.getByRole("listitem")).toHaveCount(2);
    const observed = constats.getByRole("listitem").filter({ hasText: "aucune réalisation" });
    await expect(observed).toContainText("Observé");
    await expect(observed).toContainText("Conséquence possible : Vos clients ne voient pas ce que vous savez faire.");
    await expect(observed).toContainText("Lu sur atelier-lumen.test le 7 novembre 2026");
    await expect(observed.getByRole("link", { name: "atelier-lumen.test" })).toHaveAttribute("href", `${website}/`);
    const hint = constats.getByRole("listitem").filter({ hasText: "particuliers" });
    await expect(hint).toContainText("Piste à qualifier");
    await expect(hint).toContainText("Déduction de Paul, sans source directe");
    await expect(hint.getByRole("link")).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.$disconnect();
  }
});

test("GH-290 GH-291 GH-283: confirm my brand, compose a visual, keep the archive and confirm the photo rights, at 360 px", async ({ page }) => {
  const prisma = journeyDatabase();
  const ownerEmail = `ux-marque-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail, name: "Plomberie Martin", trade: "Plombier", servingArea: "Lyon" } });
  try {
    await page.context().addCookies([{ name: "pepito_session", value: createSessionToken(ownerEmail, company.sessionVersion, process.env.SESSION_SECRET!), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "social_post", channel: "facebook", title: "Publier un chantier", outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune publication depuis trois mois", scope: { topic: "Nos chantiers" }, status: "active", position: 1 } });
    const content = await prisma.missionContent.create({ data: { companyId: company.id, missionId: mission.id, channel: "facebook", format: "social_post", currentNumber: 1, versions: { create: { number: 1, title: "Votre plombier à Lyon, disponible dès demain", body: "Une salle de bains refaite à neuf.", author: "paul", note: "Premier brouillon préparé par Paul" } } } });
    await page.setViewportSize({ width: 360, height: 800 });

    // Stratégie : la marque attend une décision.
    await page.goto(`${baseURL}/strategie`);
    const toValidate = page.getByRole("region", { name: "À valider par vous" });
    await expect(toValidate).toContainText("Votre marque");
    await expect(toValidate.getByRole("link", { name: "Confirmer ma marque" })).toHaveAttribute("href", "/entreprise#ma-marque");

    // Atelier : un visuel composé, sa validation refusée tant que la marque n'est pas confirmée.
    await page.goto(`${baseURL}/atelier/${content.id}`);
    const visual = page.getByRole("region", { name: "Visuel" });
    await visual.getByLabel("Composition").selectOption("photo_signature");
    await visual.getByRole("button", { name: "Enregistrer le visuel" }).click();
    await expect(visual.getByRole("group", { name: "Aperçu du visuel" }).locator("svg")).toBeVisible();
    await expect(visual).toContainText("Confirmez votre marque avant de valider un visuel.");
    await expect(page.getByRole("button", { name: "Valider cette version" })).toBeDisabled();
    expect(await noHorizontalScroll(page)).toBe(true);

    // Ma marque : la case est obligatoire, puis la marque est confirmée.
    await visual.getByRole("link", { name: "Confirmer ma marque" }).click();
    await expect(page).toHaveURL(/\/entreprise#ma-marque$/);
    const brand = page.getByRole("region", { name: "Ma marque" });
    await expect(brand).toContainText("À confirmer");
    await expect(brand).toContainText("Identité proposée, non issue d'un site");
    await brand.getByLabel("Couleur principale").fill("#1f5f4a");
    await brand.getByRole("button", { name: "Confirmer ma marque" }).click();
    await expect(brand.getByRole("alert").first()).toContainText("Je confirme ces éléments pour les prochaines créations");
    await brand.getByLabel("Je confirme ces éléments pour les prochaines créations").check();
    await brand.getByRole("button", { name: "Confirmer ma marque" }).click();
    await expect(brand.getByRole("status")).toContainText("Marque confirmée");
    await expect(brand).toContainText("Confirmé par vous");
    expect(await noHorizontalScroll(page)).toBe(true);

    // Changement de couleur : version suivante, l'archive garde l'ancienne couleur.
    await brand.getByLabel("Couleur principale").fill("#123456");
    await brand.getByLabel("Je confirme ces éléments pour les prochaines créations").check();
    const saved = page.waitForResponse((response) => response.url().endsWith("/api/entreprise/marque") && response.request().method() === "POST");
    await brand.getByRole("button", { name: "Mettre à jour ma marque" }).click();
    expect((await saved).status()).toBe(200);
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await expect(page.locator(".version-list")).toContainText("Marque modifiée : visuel à valider à nouveau");
    await expect(page.getByRole("group", { name: "Aperçu du visuel" }).locator('rect[fill="#123456"]').first()).toBeAttached();
    await page.goto(`${baseURL}/atelier/${content.id}?v=3`);
    const archive = page.getByRole("group", { name: "Aperçu du visuel" });
    await expect(archive.locator('rect[fill="#1f5f4a"]').first()).toBeAttached();
    await expect(archive.locator('rect[fill="#123456"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Confirmer ma marque" })).toHaveCount(0);

    // Photo importée (posée en base : pas de stockage en CI) : la case des droits s'ajoute à la relecture.
    const current = await prisma.missionContent.findUniqueOrThrow({ where: { id: content.id } });
    const number = current.currentNumber + 1;
    await prisma.contentVersion.create({ data: { contentId: content.id, number, title: "Votre plombier à Lyon, disponible dès demain", body: "Une salle de bains refaite à neuf.", author: "owner", note: "Photo importée par vous, droits à reconfirmer", photo: { url: "https://blob.example.invalid/photo.jpg", pathname: `content-photos/${company.id}/${content.id}/p1.jpg`, alt: "Salle de bains refaite", width: 800, height: 600 } } });
    await prisma.missionContent.update({ where: { id: content.id }, data: { currentNumber: number, version: { increment: 1 } } });
    await page.goto(`${baseURL}/atelier/${content.id}`);
    await expect(page.getByRole("region", { name: "Visuel" })).toContainText("Droits à confirmer à la validation.");
    await page.getByRole("button", { name: "Valider cette version" }).click();
    const dialog = page.getByRole("dialog", { name: `Valider la version V${number}` });
    await dialog.getByLabel("J'ai relu le contenu et vérifié les informations qui engagent mon entreprise").check();
    await expect(dialog.getByRole("button", { name: "Valider sans diffuser" })).toBeDisabled();
    await dialog.getByLabel("Je confirme le visuel et les droits d'utilisation").check();
    await dialog.getByRole("button", { name: "Valider sans diffuser" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Visuel" })).toContainText("Droits confirmés pour cette version.");
    expect((await prisma.contentVersion.findFirstOrThrow({ where: { contentId: content.id, number } })).rightsConfirmedAt).not.toBeNull();
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("GH-292: at signup the first findings become the starting diagnostic, read on Entreprise as findings leading to decisions", async ({ page }) => {
  const prisma = journeyDatabase();
  const website = "https://atelier-lumen.test";
  const email = `ux-constats-${randomUUID()}@example.invalid`;
  const draft = await createTestDraft(prisma, { profile: { website, trade: "Électricien", servingArea: "Lyon", targetClients: "Particuliers", offers: "Rénovation électrique" } });
  try {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { analysis: analysisWithConstats(website, "2026-11-07T10:00:00.000Z") } });
    await page.context().addCookies([{ name: "pepito_draft", value: draft.token, url: baseURL }]);
    const password = "mot-de-passe-valide";
    const signup = await page.request.post(`${baseURL}/api/auth/signup`, { headers: { Origin: baseURL, ...testIpHeader() }, data: { email, password, passwordConfirmation: password } });
    expect(signup.status()).toBe(201);
    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email } });
    const findings = await prisma.auditFinding.findMany({ where: { companyId: company.id }, orderBy: { title: "asc" } });
    expect(findings.map((finding) => [finding.title, finding.certainty, finding.sourceStatus, finding.sourceUrl, finding.agentRunId])).toEqual([
      ["Votre site ne montre aucune réalisation.", "observe", "consultée", `${website}/`, null],
      ["Vous semblez viser surtout les particuliers.", "piste", null, null, null],
    ]);
    // Missions de départ reliées au premier constat de leur sujet : ici, seule une page du site a un constat « site_web ».
    const observedId = findings.find((finding) => finding.certainty === "observe")!.id;
    for (const mission of await prisma.mission.findMany({ where: { companyId: company.id }, select: { template: true, sourceFindingId: true } })) {
      expect(mission.sourceFindingId, mission.template).toBe(mission.template === "site_page" ? observedId : null);
    }

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/entreprise`);
    const diagnostic = page.getByRole("region", { name: "Diagnostic & positionnement" });
    await expect(diagnostic).toContainText("Relevé du");
    const observed = diagnostic.getByRole("article", { name: "Constat : Votre site ne montre aucune réalisation." });
    await expect(observed).toContainText("Observé");
    await expect(observed).toContainText("Site web · atelier-lumen.test");
    const hint = diagnostic.getByRole("article", { name: "Constat : Vous semblez viser surtout les particuliers." });
    await expect(hint).toContainText("Piste à qualifier");
    await expect(hint.getByRole("button", { name: /À discuter avec Paul/ })).toBeVisible();
    await expect(diagnostic).toContainText("La performance réelle de vos concurrents : non accessible");
    await observed.getByRole("button", { name: /Voir la source/ }).click();
    const source = page.getByRole("dialog", { name: "Votre site ne montre aucune réalisation." });
    await expect(source.getByRole("link", { name: `${website}/` })).toHaveAttribute("href", `${website}/`);
    await page.keyboard.press("Escape");
    await expect(source).toBeHidden();
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally {
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("GH-169 GH-292: correct a finding from Entreprise and come back to it, see its mission to re-examine, undo, and confirm the available capacity, at 360 px", async ({ page }) => {
  const prisma = journeyDatabase();
  const ownerEmail = `ux-constat-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: { ownerEmail, name: "Atelier Lumen", trade: "Électricien", servingArea: "Lyon", location: "Lyon", targetClients: "Particuliers", monthlyRevenue: 10000, averageClientValue: 2000, ambitionText: "+15 % de chiffre d'affaires en 12 mois", ambitionTerms: { gainPercent: 15, horizonMonths: 12, mediaBudgetPerMonth: null, recruitment: "unspecified" }, ambitionConfirmedAt: new Date() } });
  const original = { title: "Votre site ne montre aucune réalisation.", content: "Vos clients ne voient pas ce que vous savez faire." };
  const corrected = { title: "Mon site montre douze chantiers.", content: "Les réalisations sont dans l'onglet Chantiers du site." };
  try {
    await page.context().addCookies([{ name: "pepito_session", value: createSessionToken(ownerEmail, company.sessionVersion, process.env.SESSION_SECRET!), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    const finding = await prisma.auditFinding.create({ data: { companyId: company.id, category: "site_web", ...original, sourceUrl: "https://atelier-lumen.test/", sourceStatus: "consultée", certainty: "observe" } });
    const mission = await prisma.mission.create({ data: { companyId: company.id, template: "site_page", channel: "site", title: "Montrer un chantier", outcome: "Des demandes de devis", originalOutcome: "Des demandes de devis", finding: "Aucune réalisation visible", deduction: "Un chantier montré rassure les particuliers.", scope: { page: "Nos chantiers" }, sourceFindingId: finding.id, createdBy: "paul", status: "proposed", position: 1 } });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseURL}/entreprise`);
    const diagnostic = page.getByRole("region", { name: "Diagnostic & positionnement" });
    const row = diagnostic.getByRole("article", { name: `Constat : ${original.title}` });
    await expect(row).toContainText("Observé");
    const fix = row.getByRole("button", { name: /Corriger cette information/ });

    // Le dialogue est rattaché au constat et prérempli ; Échap le ferme sans rien écrire et rend le focus au bouton.
    await fix.click();
    const dialog = page.getByRole("dialog", { name: "Corriger cette information" });
    await expect(dialog.getByLabel("Constat", { exact: true })).toHaveValue(original.title);
    await expect(dialog.getByLabel("Détail", { exact: true })).toHaveValue(original.content);
    await expect(dialog).toContainText("Les missions issues de ce constat seront à réexaminer. Rien n'est relancé ni publié.");
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(fix).toBeFocused();
    expect((await prisma.auditFinding.findUniqueOrThrow({ where: { id: finding.id } })).title).toBe(original.title);

    // Rien de changé : refus annoncé ; puis la correction, et le retour au point de départ.
    await fix.click();
    await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Rien n'a changé");
    await dialog.getByLabel("Constat", { exact: true }).fill(corrected.title);
    await dialog.getByLabel("Détail", { exact: true }).fill(corrected.content);
    await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(dialog).toBeHidden();
    const correctedRow = diagnostic.getByRole("article", { name: `Constat : ${corrected.title}` });
    await expect(correctedRow).toContainText("Déclaré par vous");
    await expect(correctedRow).toContainText("corrigé par vous le");
    await expect(correctedRow.getByRole("link", { name: "Montrer un chantier" })).toBeVisible();
    await expect(correctedRow).toContainText("À réexaminer");
    await expect(correctedRow.getByRole("status")).toHaveText("Constat corrigé. 1 mission à réexaminer, rien n'est relancé.");
    await expect(correctedRow.getByRole("button", { name: /Corriger cette information/ })).toBeFocused();
    await expect(diagnostic.getByRole("article", { name: `Constat : ${original.title}` })).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);

    // La mission est signalée, sans changer de statut ; « J'ai réexaminé cette mission » retire le signal.
    await page.goto(`${baseURL}/missions/${mission.id}`);
    const review = page.getByRole("note", { name: "Mission à réexaminer" });
    await expect(review).toContainText("Rien n'a été relancé ni publié.");
    await review.getByRole("button", { name: "J'ai réexaminé cette mission" }).click();
    await expect(review).toBeHidden();
    expect(await prisma.mission.findUniqueOrThrow({ where: { id: mission.id } })).toMatchObject({ status: "proposed", findingReviewAt: null });

    // Annuler la correction : le constat remplacé redevient le constat actuel, avec sa source.
    await page.goto(`${baseURL}/entreprise`);
    await diagnostic.getByRole("article", { name: `Constat : ${corrected.title}` }).getByRole("button", { name: /Corriger cette information/ }).click();
    const replaced = dialog.getByRole("region", { name: "Constat remplacé" });
    await expect(replaced).toContainText(original.title);
    await expect(replaced).toContainText("Observé");
    await replaced.getByRole("button", { name: "Revenir au constat remplacé" }).click();
    await expect(dialog).toBeHidden();
    await expect(diagnostic.getByRole("article", { name: `Constat : ${original.title}` })).toContainText("Observé");
    expect(await prisma.journalEntry.findMany({ where: { companyId: company.id, code: { in: ["J-34", "J-35", "J-36"] } }, orderBy: { createdAt: "asc" }, select: { code: true } })).toEqual([{ code: "J-34" }, { code: "J-36" }, { code: "J-35" }]);

    // Vos repères : l'écart part de l'ambition (D8), la capacité disponible se déclare puis s'affiche confirmée.
    const landmarks = page.getByRole("region", { name: "Vos repères" });
    await expect(landmarks).toContainText("ZoneLyonConfirmé");
    await expect(landmarks).toContainText("Écart à combler");
    await expect(landmarks).toContainText("Calculé à partir de vos chiffres déclarés et de votre ambition.");
    await expect(landmarks).toContainText("Capacité disponibleÀ renseigner");
    const editCapacity = landmarks.getByRole("button", { name: "Modifier la capacité disponible" });
    await editCapacity.click();
    const capacity = page.getByRole("dialog", { name: "Votre capacité disponible" });
    await capacity.getByLabel("Nouveaux projets clients que vous pouvez prendre par mois").fill("120");
    await capacity.getByRole("button", { name: "Confirmer ma capacité" }).click();
    await expect(capacity.getByRole("alert")).toContainText("de 0 à 99 nouveaux projets clients par mois");
    await capacity.getByLabel("Nouveaux projets clients que vous pouvez prendre par mois").fill("3");
    await capacity.getByRole("button", { name: "Confirmer ma capacité" }).click();
    await expect(capacity).toBeHidden();
    await expect(landmarks).toContainText("3 nouveaux projets clients par mois");
    await expect(landmarks).toContainText("à reconfirmer avant le");
    await expect(editCapacity).toBeFocused();
    expect(await noHorizontalScroll(page)).toBe(true);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).availableCapacity).toBe(3);
  } finally {
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});
