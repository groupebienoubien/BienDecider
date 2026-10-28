const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ structuredClone });
vm.runInContext(readFileSync(join(__dirname, "app.js"), "utf8"), context);
const { initialState, transition, currentVersion } = vm.runInContext(
  "({ initialState, transition, currentVersion })",
  context,
);

function readyDocument(document = "email") {
  let state = initialState();
  state.brand.confirmed = true;
  state.contactsConfirmed = true;
  state = transition(state, { type: "onboard" });
  state = transition(state, { type: "start", mission: state.documents[document].mission });
  state = transition(state, { type: "approve", document, rights: true });
  return transition(state, { type: "channel", channel: state.documents[document].channel, connected: true });
}

test("Le profil et le cap se transmettent sans démarrer de mission", () => {
  let state = transition(initialState(), { type: "profile", value: { name: "Maison Test" } });
  state = transition(state, { type: "goal", value: { growth: 25, time: 1 } });
  state = transition(state, { type: "onboard" });
  assert.equal(state.profile.name, "Maison Test");
  assert.equal(state.goal.growth, 25);
  assert.match(state.documents.email.versions[0].body, /Maison Test/);
  assert.ok(Object.values(state.missions).every((status) => status === "proposed"));
});

test("Valider un contenu ne le diffuse pas", () => {
  const state = readyDocument();
  assert.equal(state.documents.email.approved, 1);
  assert.equal(state.publications.length, 0);
});

test("La diffusion exige une mission active, une version validée et un canal connecté", () => {
  assert.throws(() => transition(initialState(), { type: "publish", document: "email" }), /active/);
  let state = readyDocument();
  state = transition(state, { type: "channel", channel: "gmail", connected: false });
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /Connectez/);
  state = transition(state, { type: "channel", channel: "gmail", connected: true });
  state = transition(state, { type: "revision", document: "email", value: { body: "Retouche" } });
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /Validez/);
});

test("Une révision retire la validation précédente sans supprimer la version", () => {
  const original = readyDocument();
  const state = transition(original, { type: "revision", document: "email", value: { body: "Retouche" } });
  assert.equal(state.documents.email.approved, null);
  assert.equal(state.documents.email.versions.length, 2);
  assert.equal(original.documents.email.versions.length, 1);
});

test("Une correction de profil impose une nouvelle revue et annule les programmations", () => {
  let state = transition(readyDocument(), { type: "publish", document: "email", date: "2099-01-15T10:00:00+01:00" });
  state = transition(state, { type: "profile", value: { area: "Marseille", offers: "Isolation seulement" } });
  assert.equal(state.documents.email.approved, null);
  assert.equal(state.documents.email.scheduled, null);
  assert.throws(() => transition(state, { type: "approve", document: "email" }), /profil a changé/);
  state = transition(state, { type: "revision", document: "email", value: { body: "Texte vérifié pour Marseille" } });
  assert.doesNotThrow(() => transition(state, { type: "approve", document: "email" }));
});

test("Les couleurs et le nom des versions archivées restent stables", () => {
  let state = readyDocument("post");
  const originalColor = state.documents.post.versions[0].color;
  state = transition(state, { type: "brand", value: { color: "#123456", confirmed: true } });
  state = transition(state, { type: "profile", value: { name: "Autre Maison" } });
  assert.equal(state.documents.post.versions[0].color, originalColor);
  assert.equal(state.documents.post.versions[0].companyName, "Dupont Rénovation");
  assert.equal(currentVersion(state.documents.post).companyName, "Autre Maison");
});

test("La programmation conserve un instant, refuse le passé et bloque les retouches", () => {
  const ready = readyDocument();
  assert.throws(() => transition(ready, { type: "publish", document: "email", date: "2020-01-01T10:00" }), /futures/);
  const state = transition(ready, { type: "publish", document: "email", date: "2099-01-15T10:00:00+01:00" });
  assert.equal(state.documents.email.scheduled, "2099-01-15T09:00:00.000Z");
  assert.ok(state.documents.email.scheduledTimezone);
  assert.throws(() => transition(state, { type: "revision", document: "email", value: { body: "Retouche" } }), /programmation/);
  assert.equal(state.publications.length, 0);
});

test("Annuler conserve la validation ; déconnecter annule les programmations", () => {
  let state = transition(readyDocument(), { type: "publish", document: "email", date: "2099-01-15T10:00Z" });
  state = transition(state, { type: "cancel-schedule", document: "email" });
  assert.equal(state.documents.email.approved, 1);
  state = transition(state, { type: "publish", document: "email", date: "2099-01-15T10:00Z" });
  state = transition(state, { type: "channel", channel: "gmail", connected: false });
  assert.equal(state.documents.email.scheduled, null);
});

test("Une version n'est diffusée qu'une fois et garde sa trace après révision", () => {
  let state = transition(readyDocument(), { type: "publish", document: "email" });
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /déjà été exécutée/);
  state = transition(state, { type: "revision", document: "email", value: { body: "Après diffusion" } });
  assert.equal(state.publications[0].version, 1);
  assert.equal(currentVersion(state.documents.email).number, 2);
});

test("La préparation seule interdit toute diffusion", () => {
  const state = readyDocument();
  state.delegation = "prepare";
  assert.throws(() => transition(state, { type: "publish", document: "email" }), /uniquement la préparation/);
});

test("Une ancienne confirmation est refusée après changement de version", () => {
  const state = transition(readyDocument(), { type: "revision", document: "email", value: { body: "Nouvelle version" } });
  assert.throws(() => transition(state, { type: "approve", document: "email", expectedVersion: 1 }), /version a changé/);
});

test("Les prospects requièrent un contrôle préalable ; changer de priorité ne lance rien", () => {
  const state = initialState();
  assert.throws(() => transition(state, { type: "start", mission: "leads" }), /droit de recontact/);
  const proposed = transition(state, { type: "strategy", priority: "leads" });
  assert.equal(proposed.priority, "leads");
  assert.equal(proposed.missions.leads, "proposed");
});

test("Mettre une mission en pause annule sa programmation", () => {
  const scheduled = transition(readyDocument(), { type: "publish", document: "email", date: "2099-01-15T10:00Z" });
  const state = transition(scheduled, { type: "pause", mission: "agencies" });
  assert.equal(state.documents.email.scheduled, null);
  assert.equal(state.missions.agencies, "paused");
});

test("Le visuel exige une marque et des droits confirmés", () => {
  let state = transition(initialState(), { type: "start", mission: "proof" });
  assert.throws(() => transition(state, { type: "approve", document: "post", rights: true }), /marque/);
  state.brand.confirmed = true;
  assert.throws(() => transition(state, { type: "approve", document: "post", rights: false }), /droits/);
});