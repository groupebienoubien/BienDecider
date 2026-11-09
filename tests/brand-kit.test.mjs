import assert from "node:assert/strict";
import test from "node:test";
import { brandProposalFromAnalysis, checkBrandInput, contrastRatio, normalizeHex, proposeBrand, readableOn, readBrandSnapshot } from "../src/lib/brand/rules.ts";
import { fitHeadline, renderVisual, wrapWords } from "../src/lib/brand/render.ts";

const proposed = proposeBrand(null);
const base = { primary: "#1F5F4A", accent: "#e0a030", tone: "clair", confirmed: true };
const input = { composition: "photo_signature", primary: "#1f5f4a", accent: "#e0a030", tone: "clair", headline: "Votre plombier à Lyon, disponible dès demain", signature: "Plomberie Martin" };

test("normalizeHex accepte #rgb et #rrggbb, refuse le reste", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex(" #1F5F4A "), "#1f5f4a");
  for (const bad of ["red", "#12", "#12345g", "", null, 12]) assert.equal(normalizeHex(bad), null);
});

test("sans palette lue : identité proposée, marquée non issue d'un site", () => {
  assert.equal(proposed.fromSite, false);
  assert.deepEqual(proposed.origins, { primary: "proposal", accent: "proposal", tone: "proposal" });
});

test("avec une palette lue : origine « site » et couleur principale lisible", () => {
  const result = proposeBrand({ palette: ["#fafafa", "#b3261e", "#1f5f4a"] });
  assert.equal(result.fromSite, true);
  assert.equal(result.origins.primary, "site");
  assert.ok(contrastRatio(result.kit.primary, readableOn(result.kit.primary)) >= 4.5);
  assert.notEqual(result.kit.primary, result.kit.accent);
});

test("la proposition d'inscription ne retient qu'une palette observée", () => {
  const observed = { findings: { palette: { value: ["#1f5f4a", "nope"], provenance: { kind: "observed", source: "exemple.fr" } } } };
  assert.deepEqual(brandProposalFromAnalysis(observed), { palette: ["#1f5f4a"], source: "exemple.fr" });
  assert.equal(brandProposalFromAnalysis({ findings: { palette: { value: ["#1f5f4a"], provenance: { kind: "hypothesis" } } } }), null);
  assert.equal(brandProposalFromAnalysis(null), null);
});

test("le formulaire exige la case de confirmation, des couleurs valides et un ton", () => {
  assert.deepEqual(Object.keys(checkBrandInput({ ...base, confirmed: false }, proposed).errors), ["confirmed"]);
  const bad = checkBrandInput({ ...base, primary: "vert", tone: "drôle" }, proposed);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["confirmed", "primary", "tone"].filter((key) => key !== "confirmed"));
});

test("l'origine reste celle de la proposition tant que l'élément n'est pas changé", () => {
  const same = checkBrandInput({ ...base, primary: proposed.kit.primary, accent: proposed.kit.accent, tone: proposed.kit.tone }, proposed);
  assert.equal(same.ok, true);
  assert.deepEqual(same.value.origins, proposed.origins);
  const changed = checkBrandInput({ ...base, primary: "#123456", accent: proposed.kit.accent, tone: "expert" }, proposed);
  assert.deepEqual(changed.value.origins, { primary: "declared", accent: "proposal", tone: "declared" });
});

test("le rendu est déterministe : mêmes entrées, même sortie", () => {
  for (const composition of ["photo_signature", "cadre_editorial"]) {
    const a = renderVisual({ ...input, composition, photoUrl: "https://blob.example/photo.jpg" });
    assert.equal(a, renderVisual({ ...input, composition, photoUrl: "https://blob.example/photo.jpg" }));
    assert.match(a, /^<svg /);
    assert.ok(a.includes("#1f5f4a") && a.includes("Plomberie Martin"));
  }
  assert.notEqual(renderVisual(input), renderVisual({ ...input, composition: "cadre_editorial" }));
  assert.notEqual(renderVisual(input), renderVisual({ ...input, primary: "#123456" }));
});

test("le rendu échappe le texte, n'accepte qu'une photo https et refuse un kit invalide", () => {
  const svg = renderVisual({ ...input, headline: `<script>alert("x")</script> & "co"`, signature: "A<B", photoUrl: "javascript:alert(1)" });
  assert.ok(!svg.includes("<script>") && !svg.includes("javascript:") && !svg.includes("<image"));
  assert.throws(() => renderVisual({ ...input, primary: "red" }));
  assert.throws(() => renderVisual({ ...input, composition: "inconnue" }));
});

test("l'accroche s'ajuste au cadre : jamais plus de cinq lignes, jamais hors du cadre", () => {
  for (const text of ["Oui", "Une accroche de longueur moyenne pour une publication locale", "mot ".repeat(200), "x".repeat(400)]) {
    const fit = fitHeadline(text, 920, 280);
    assert.ok(fit.lines.length >= 1 && fit.lines.length <= 5, text.slice(0, 20));
    assert.ok(fit.lines.length * fit.size * 1.18 <= 280 + fit.size, "hauteur");
    assert.ok(fit.lines.every((line) => line.length * fit.size * 0.56 <= 920 + fit.size), "largeur");
  }
  assert.equal(fitHeadline("mot ".repeat(200), 920, 280).truncated, true);
  assert.deepEqual(wrapWords("aaaa bbbb cccc", 9), ["aaaa bbbb", "cccc"]);
});

test("un instantané de marque illisible est ignoré", () => {
  assert.equal(readBrandSnapshot({ name: "A", primary: "#1f5f4a", accent: "#e0a030", tone: "clair" }), null);
  assert.deepEqual(readBrandSnapshot({ name: "A", primary: "#1F5F4A", accent: "#e0a030", tone: "clair", composition: "cadre_editorial" }), { name: "A", primary: "#1f5f4a", accent: "#e0a030", tone: "clair", composition: "cadre_editorial" });
});
