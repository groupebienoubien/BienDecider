import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVATION_STEPS, activationCsv, cohortMeasures, companyJourney, funnelSummary, inPeriod, isDayKey, median, parisDay, reachedCaps, readPeriod, returnDay7,
} from "../src/lib/activation-rules.ts";

const DAY = 24 * 3_600_000;
const T0 = new Date("2026-11-02T09:00:00.000Z");
const at = (days, hours = 0) => new Date(T0.getTime() + days * DAY + hours * 3_600_000);

// Entreprises fictives, avancées à différents stades.
const facts = (id, dates = {}) => ({
  id, name: `Entreprise ${id}`, createdAt: T0, emailVerifiedAt: null, workspaceAt: null, firstLaunchAt: null, firstValidationAt: null,
  firstDiffusionAt: null, firstReportAt: null, ownerActivity: [], ...dates,
});
const signedUp = facts("inscrite");
const verified = facts("confirmee", { emailVerifiedAt: at(0, 1), workspaceAt: at(0) });
const launched = facts("lancee", { emailVerifiedAt: at(0, 2), workspaceAt: at(0), firstLaunchAt: at(2) });
const complete = facts("complete", {
  emailVerifiedAt: at(1), workspaceAt: at(0), firstLaunchAt: at(3), firstValidationAt: at(4), firstDiffusionAt: at(5), firstReportAt: at(12),
  ownerActivity: [at(6), at(9), at(20), null],
});
// E-mail confirmé après le lancement : délai compté nul, pas négatif.
const late = facts("tardive", { emailVerifiedAt: at(10), workspaceAt: at(0), firstLaunchAt: at(1) });

test("huit étapes, dans l'ordre de la story, chacune rattachée à une question de #100", () => {
  assert.deepEqual(ACTIVATION_STEPS.map((step) => step.label), [
    "Inscription", "E-mail confirmé", "Espace créé", "Première mission lancée", "Premier contenu validé", "Première diffusion", "Premier bilan", "Retour à J+7",
  ]);
  assert.deepEqual([...new Set(ACTIVATION_STEPS.map((step) => step.theme))].sort(), ["Activation", "Réalisation", "Validation"]);
});

test("dernière étape atteinte par entreprise", () => {
  assert.equal(companyJourney(signedUp).lastStep, "signup");
  assert.equal(companyJourney(verified).lastStep, "workspace");
  assert.equal(companyJourney(launched).lastStep, "firstLaunch");
  assert.equal(companyJourney(complete).lastStep, "returnDay7");
  assert.equal(companyJourney(late).lastStep, "firstLaunch");
});

test("retour à J+7 : première activité 7 jours ou plus après l'inscription", () => {
  assert.deepEqual(returnDay7(T0, [at(6), at(9), at(20)]), at(9));
  assert.deepEqual(returnDay7(T0, [at(7)]), at(7));
  assert.equal(returnDay7(T0, [at(6, 23), null]), null);
  assert.deepEqual(companyJourney(complete).dates.returnDay7, at(9));
});

test("entonnoir : nombre, part et temps médian depuis l'étape précédente", () => {
  const journeys = [signedUp, verified, launched, complete, late].map(companyJourney);
  const funnel = funnelSummary(journeys);
  const step = (key) => funnel.find((item) => item.key === key);
  assert.equal(step("signup").reached, 5);
  assert.equal(step("signup").share, 1);
  assert.equal(step("signup").medianDaysFromPrevious, null);
  assert.equal(step("emailVerified").reached, 4);
  assert.equal(step("firstLaunch").reached, 3);
  assert.equal(step("firstLaunch").share, 0.6);
  // Depuis « Espace créé » : 2, 3 et 1 jours → médiane 2.
  assert.equal(step("firstLaunch").medianDaysFromPrevious, 2);
  // « Espace créé » depuis l'e-mail confirmé : avant lui pour toutes, délai nul.
  assert.equal(step("workspace").medianDaysFromPrevious, 0);
  assert.equal(step("firstReport").medianDaysFromPrevious, 7);
  assert.equal(step("returnDay7").reached, 1);
  assert.equal(funnelSummary([]).every((item) => item.share === null && item.reached === 0), true);
});

test("médiane", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

const mission = (companyId, overrides = {}) => ({
  companyId, template: "social_post", channel: "facebook", firstLaunchedAt: null, stopRuleDays: 30, firstDiffusionAt: null,
  confirmedDiffusions: 0, declaredDiffusions: 0, firstReportAt: null, firstDecisionAt: null, dismissedAt: null, ...overrides,
});

test("cohorte : lancement en 7 jours, diffusion puis bilan puis décision, modèles, canaux, déclarées, contre-mesures", () => {
  const journeys = [signedUp, verified, launched, complete, late].map(companyJourney);
  const now = at(60);
  const missions = [
    mission("complete", { firstLaunchedAt: at(3), firstDiffusionAt: at(5), confirmedDiffusions: 1, declaredDiffusions: 1, firstReportAt: at(12), firstDecisionAt: at(13) }),
    // Diffusée, sans bilan, règle d'arrêt dépassée : contre-mesure.
    mission("lancee", { firstLaunchedAt: at(2), firstDiffusionAt: at(4), declaredDiffusions: 1, template: "site_page", channel: "site" }),
    // Écartée 30 minutes après son lancement : contre-mesure.
    mission("tardive", { firstLaunchedAt: at(1), dismissedAt: at(1, 0.5), template: "custom", channel: null }),
    // Jamais lancée : ne compte pas.
    mission("confirmee"),
    // Hors cohorte : ne compte pas.
    mission("autre", { firstLaunchedAt: at(1), firstDiffusionAt: at(2) }),
  ];
  const measures = cohortMeasures(journeys, missions, now);
  assert.equal(measures.accounts, 5);
  assert.equal(measures.launchedWithin7Days, 3);
  assert.equal(measures.launched, 3);
  assert.equal(measures.withDiffusion, 2);
  assert.equal(measures.withReport, 1);
  assert.equal(measures.withDecision, 1);
  assert.deepEqual(measures.byTemplate, [{ key: "custom", count: 1 }, { key: "site_page", count: 1 }, { key: "social_post", count: 1 }]);
  assert.deepEqual(measures.byChannel.map((row) => row.key).sort(), [null, "facebook", "site"].sort());
  assert.equal(measures.confirmedDiffusions, 1);
  assert.equal(measures.declaredDiffusions, 2);
  assert.equal(measures.diffusedWithoutReportAfterStopRule, 1);
  assert.equal(measures.dismissedWithinHour, 1);
  // Avant la fin de la règle d'arrêt, une diffusion sans bilan n'est pas encore une contre-mesure.
  assert.equal(cohortMeasures(journeys, missions, at(20)).diffusedWithoutReportAfterStopRule, 0);
});

test("lancement après 7 jours : hors de la part « dans les 7 jours »", () => {
  const journeys = [companyJourney(facts("lente", { firstLaunchAt: at(8) }))];
  assert.equal(cohortMeasures(journeys, [], at(30)).launchedWithin7Days, 0);
});

const limits = { dailyAgentRunLimit: 10, monthlyAgentRunLimit: 100, dailyChatMessageLimit: 50, monthlyChatMessageLimit: 500, dailySpendLimitUsd: 5, monthlySpendLimitUsd: 25 };
const usage = { dailyRuns: 0, monthlyRuns: 0, dailyMessages: 0, monthlyMessages: 0, dailyCostUsd: 0, monthlyCostUsd: 0 };

test("plafonds atteints, crédits épuisés et alertes de consommation", () => {
  assert.deepEqual(reachedCaps(limits, usage, 20, 0), []);
  assert.deepEqual(reachedCaps(limits, { ...usage, dailyRuns: 10, monthlyCostUsd: 25.5 }, 0, 2), ["Lancements du jour", "Dépense du mois", "Crédits épuisés", "2 alertes de consommation"]);
  assert.deepEqual(reachedCaps(limits, { ...usage, monthlyMessages: 500 }, 3, 1), ["Messages du mois", "1 alerte de consommation"]);
});

test("période : jours valides, bornes incluses, inversées remises dans l'ordre", () => {
  assert.equal(isDayKey("2026-11-09"), true);
  assert.equal(isDayKey("2026-02-31"), false);
  assert.equal(isDayKey("09/11/2026"), false);
  assert.deepEqual(readPeriod({ du: "2026-11-30", au: "2026-11-01" }), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(readPeriod({ du: "n'importe quoi", au: ["2026-11-05"] }), { from: null, to: "2026-11-05" });
  assert.equal(inPeriod("2026-11-05", { from: "2026-11-05", to: "2026-11-05" }), true);
  assert.equal(inPeriod("2026-11-06", { from: null, to: "2026-11-05" }), false);
  // Jour de Paris : 23 h 30 UTC le 31 octobre = 0 h 30 le 1er novembre à Paris.
  assert.equal(parisDay(new Date("2026-10-31T23:30:00.000Z")), "2026-11-01");
});

test("export de l'activation : agrégé, sans nom d'entreprise", () => {
  const journeys = [signedUp, complete].map(companyJourney);
  const csv = activationCsv({ from: "2026-11-01", to: null }, funnelSummary(journeys), cohortMeasures(journeys, [], at(30)), { template: (key) => key, channel: (key) => key ?? "Hors canal" });
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes(`"Entonnoir";"Inscription";"2";"100 %"`));
  assert.ok(csv.includes(`"Entonnoir";"Retour à J+7";"1";"50 %"`));
  assert.equal(csv.includes("Entreprise "), false);
});
