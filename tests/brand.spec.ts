import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Loading from "../src/app/loading";
import ErrorPage from "../src/app/error";
import { BrandLogo } from "../src/components/brand-logo";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";

test("brand variants share the wordmark and explicit slogan", () => {
  for (const light of [false, true]) {
    const markup = renderToStaticMarkup(createElement(BrandLogo, { light, slogan: true }));
    expect(markup).toContain("BienDecider");
    expect(markup).toContain("Vous décidez. Votre activité avance.");
    expect(markup).toContain('class="brand-mark"');
    expect(markup).toContain(light ? "brand-logo-light" : "brand-logo ");
  }
});

test("loading and error states are French and do not expose technical details", () => {
  const loading = renderToStaticMarkup(createElement(Loading));
  expect(loading).toContain('role="status"');
  expect(loading).toContain("Chargement en cours");
  expect(loading).toContain("Retour à l&#x27;accueil");
  const props = { error: Object.assign(new Error("private-database-credentials"), { digest: "private-digest" }), retry: () => {} };
  for (const component of [ErrorPage]) {
    const html = renderToStaticMarkup(createElement(component, props));
    expect(html).toContain("Réessayer");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("private-database-credentials");
    expect(html).not.toContain("private-digest");
  }
});

test("unknown pages offer a French return route on desktop and mobile", async ({ page }, testInfo) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(`${baseURL}/page-inexistante-test-96`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'accueil", exact: true })).toHaveAttribute("href", "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`not-found-${width}.png`), fullPage: true });
  }
  await page.getByRole("link", { name: "Retour à l'accueil", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vous décidez. Votre activité avance.", exact: true })).toBeVisible();
});

test("BienDecider public identity, metadata, contact and responsive pages", async ({ page }, testInfo) => {
  await page.goto(baseURL);
  await expect(page).toHaveTitle("BienDecider");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Vous décidez. Votre activité avance.", exact: true })).toBeVisible();
  await expect(page.getByText("Vous décidez. Votre activité avance.", { exact: true })).toBeVisible();
  // La marque est portée par le logo ; le titre principal est la promesse (#86).
  await expect(page.getByRole("link", { name: "BienDecider, accueil" })).toBeVisible();
  // Un appel à l'action en haut et en bas de l'accueil (#86).
  const signups = page.getByRole("link", { name: "Créer mon compte", exact: true });
  await expect(signups).toHaveCount(2);
  for (const link of await signups.all()) await expect(link).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "J'ai déjà un compte", exact: true }).first()).toHaveAttribute("href", "/login");
  await expect(page.getByText("Exemple fictif, aucune donnée client")).toBeVisible();
  await expect(page.getByRole("img", { name: /Aperçu BienDecider/ })).toBeVisible();
  await expect(page.locator('link[rel="icon"][href="/brand/symbol.svg"]')).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/gratuit pendant le pilote/i);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "BienDecider");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "fr_FR");
  await expect(page.getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("href", "mailto:contact@biendecider.com");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/signup", "/canaux", "/cgu", "/confidentialite", "/mentions-legales"]) {
      await page.goto(`${baseURL}${path}`);
      await expect(page.locator("h1").filter({ hasNotText: /^Chargement en cours$/ })).toBeVisible();
      await expect(page).toHaveTitle("BienDecider");
      await expect(page.locator("body")).not.toContainText("Pepito");
      await expect(page.locator("body")).not.toContainText(/\S+@gmail\.com/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.goto(baseURL);
    await page.screenshot({ path: testInfo.outputPath(`brand-${width}.png`), fullPage: true });
  }
  for (const path of ["/cgu", "/confidentialite", "/mentions-legales"]) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator("main").getByRole("link", { name: "contact@biendecider.com", exact: true }).first()).toHaveAttribute("href", "mailto:contact@biendecider.com");
  }
  await page.goto(`${baseURL}/login`);
  await expect(page.getByRole("link", { name: "Créer un compte", exact: true })).toHaveAttribute("href", "/signup");
  await page.goto(`${baseURL}/signup`);
  await expect(page.getByRole("heading", { name: "Créer un compte", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Se connecter", exact: true })).toHaveAttribute("href", "/login");
});
test("login and signup fields have permanent labels, autocomplete and a password toggle", async ({ page }) => {
  for (const [path, autocomplete] of [["/login", "current-password"], ["/signup", "new-password"]] as const) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${baseURL}${path}`);
    const email = page.getByLabel("Adresse e-mail", { exact: true });
    const password = page.getByLabel("Mot de passe", { exact: true });
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(password).toHaveAttribute("autocomplete", autocomplete);
    await password.fill("secret-test");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByLabel("Afficher le mot de passe", { exact: true }).check();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("secret-test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("the privacy policy distinguishes processing from publication and is reachable without a session", async ({ page }) => {
  await page.goto(`${baseURL}/confidentialite#traitement`);
  await expect(page.getByRole("heading", { name: "Sous-traitants et destinataires" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Traitement et publication sont deux choses distinctes");
  await expect(page.locator("body")).not.toContainText("Rien n'est partagé");
});

test("public pages keep named fields, a visible focus ring and readable text", async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/signup", "/canaux", "/cgu", "/confidentialite", "/mentions-legales"]) {
      await page.goto(`${baseURL}${path}`);
      const unnamed = await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter((field) => !(field.getAttribute("aria-label") || field.getAttribute("aria-labelledby") || (field as HTMLInputElement).labels?.length))
        .map((field) => field.outerHTML.slice(0, 80)));
      expect(unnamed, `${path} champs sans libellé`).toEqual([]);

      // Contraste mesuré sur le rendu réel : Tailwind 4 exprime ses couleurs en oklch, que le canvas convertit en rgb.
      const low = await page.evaluate(() => {
        const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const toRgb = (css: string) => {
          canvas.clearRect(0, 0, 1, 1);
          canvas.fillStyle = "#000";
          canvas.fillStyle = css;
          canvas.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
          return { r, g, b, a: a / 255 };
        };
        const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const [lr, lg, lb] = [r, g, b].map((value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        };
        const background = (element: Element | null) => {
          for (let node = element; node; node = node.parentElement) {
            const color = toRgb(getComputedStyle(node).backgroundColor);
            if (color.a > 0.99) return color;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        };
        const failures: string[] = [];
        for (const element of document.querySelectorAll("main *, footer *, aside *")) {
          if (![...element.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim())) continue;
          const style = getComputedStyle(element);
          if (style.visibility === "hidden" || style.display === "none") continue;
          const foreground = toRgb(style.color);
          const back = background(element);
          const [a, b] = [luminance(foreground), luminance(back)];
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          const size = parseFloat(style.fontSize);
          if (ratio < 4.5 || size < 12) failures.push(`${element.tagName.toLowerCase()} « ${(element.textContent ?? "").trim().slice(0, 30)} » ${ratio.toFixed(2)}:1 ${size}px`);
        }
        return failures.slice(0, 5);
      });
      expect(low, `${path} contraste ou taille de texte`).toEqual([]);
    }
  }

  await page.goto(`${baseURL}/login`);
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => { const style = getComputedStyle(document.activeElement!); return { width: parseFloat(style.outlineWidth), style: style.outlineStyle }; });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("the channels page says, channel by channel, what BienDecider publishes and what the owner does", async ({ page }) => {
  await page.goto(`${baseURL}/`);
  await page.getByRole("link", { name: "Ce que fait chaque canal" }).first().click();
  await expect(page).toHaveURL(`${baseURL}/canaux`);
  await expect(page.getByRole("heading", { level: 1, name: "Ce que fait chaque canal" })).toBeVisible();
  for (const channel of ["Site vitrine", "Page Facebook", "Email avec Gmail", "Instagram", "Profil LinkedIn", "Fiche établissement Google"]) {
    await expect(page.getByRole("heading", { level: 2, name: channel })).toBeVisible();
  }
  const card = (name: string) => page.locator(".channel-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card("Page Facebook")).toContainText("Diffusé par BienDecider, après votre confirmation");
  await expect(card("Instagram")).toContainText("Préparé par l’équipe, publié par vous");
});

