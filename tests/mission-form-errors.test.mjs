import test from "node:test";
import assert from "node:assert/strict";
import { missionFormErrors } from "../src/lib/missions/form-errors.ts";

const valid = {
  finding: "Aucune publication depuis trois mois.",
  title: "Publier un chantier",
  outcome: "Deux demandes de devis",
  scopeValue: "Nos chantiers récents",
  stopRuleDays: "30",
  templateKey: "social_post",
  hasChannelChoice: true,
};

test("mission form validation maps M-20 only to fields that fail the server constraints", () => {
  assert.deepEqual(missionFormErrors("M-20", { ...valid, title: "Titre <incorrect>" }), {
    title: "Précisez le titre en 5 à 80 caractères, sans balise HTML.",
  });
  assert.deepEqual(missionFormErrors("M-20", {
    ...valid,
    title: "ok",
    finding: "court",
    outcome: "Résultat <incorrect>",
  }), {
    title: "Précisez le titre en 5 à 80 caractères, sans balise HTML.",
    outcome: "Décrivez le résultat recherché en 5 à 120 caractères, sans balise HTML.",
    finding: "Précisez le constat en 10 à 300 caractères, sans balise HTML.",
  });
});

test("mission form validation maps template-specific refusals to the relevant field", () => {
  assert.deepEqual(missionFormErrors("M-17", { ...valid, scopeValue: "a" }), {
    scope: "Précisez le sujet de la publication en 5 à 120 caractères.",
  });
  assert.deepEqual(missionFormErrors("M-18", { ...valid, templateKey: "custom", scopeValue: "court", stopRuleDays: "120" }), {
    scope: "Décrivez le périmètre en 10 à 300 caractères, sans balise HTML.",
    stopRuleDays: "Choisissez une règle d'arrêt comprise entre 7 et 90 jours.",
  });
  assert.deepEqual(missionFormErrors("M-25", valid), {
    outcome: "Décrivez le résultat recherché en 5 à 120 caractères.",
  });
  assert.deepEqual(missionFormErrors("M-69", valid), {
    channel: "Choisissez un canal proposé pour ce type d'action.",
  });
  assert.deepEqual(missionFormErrors("M-69", { ...valid, hasChannelChoice: false }), {});
  assert.deepEqual(missionFormErrors("M-76", valid), {
    template: "Choisissez un type d'action disponible.",
  });
  assert.deepEqual(missionFormErrors("M-75", valid), {});
});

test("mission form validation identifies a malformed optional site-page title", () => {
  assert.deepEqual(missionFormErrors("M-20", { ...valid, templateKey: "site_page", scopeValue: "Titre <incorrect>" }), {
    scope: "Précisez le titre de la page en 1 à 80 caractères, sans balise HTML.",
  });
});
