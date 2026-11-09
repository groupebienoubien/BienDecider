import assert from "node:assert/strict";
import test from "node:test";
import {
  AGGREGATE_THRESHOLD, OTHERS_LABEL, OTHER_TRADE, VISIT_TRACE_FIELDS, VISIT_TRACE_NOTICE, aggregateVisits, buildVisitTrace, catalogTrade,
  departmentFromLocation, retentionCutoff, roundCost, thresholdGroups, visitsCsv,
} from "../src/lib/onboarding/visit-trace-rules.ts";

// Valeurs identifiantes d'un brouillon fictif : aucune ne doit se retrouver dans la trace.
const IDENTIFYING = {
  firstName: "Claire",
  companyName: "Atelier Lumen Dupont",
  location: "12 rue des Lilas, 69003 Lyon",
  website: "https://atelier-lumen.example",
  servingArea: "Lyon et Villeurbanne",
  targetClients: "Particuliers propriétaires du quartier",
  offers: "Rénovation électrique sur mesure",
  ambition: "Je veux 20 % de chiffre d'affaires en plus en 12 mois, sans embaucher, pour Atelier Lumen",
  retained: "Atelier Lumen : électricien sur la zone Lyon et Villeurbanne.",
  contact: "contact@atelier-lumen.example",
  constat: "Votre fiche Google affiche des horaires anciens.",
};

function draft(overrides = {}) {
  const state = {
    step: 5,
    profile: {
      firstName: IDENTIFYING.firstName, companyName: IDENTIFYING.companyName, location: IDENTIFYING.location, website: IDENTIFYING.website,
      trade: "Électricien", servingArea: IDENTIFYING.servingArea, targetClients: IDENTIFYING.targetClients, offers: IDENTIFYING.offers,
    },
    ambition: {
      text: IDENTIFYING.ambition,
      terms: { gainPercent: 20, horizonMonths: 12, mediaBudgetPerMonth: null, recruitment: "no" },
      retained: [IDENTIFYING.retained, "Votre cap : +20 % en 12 mois.", "C'est une cible, pas une promesse de résultat."],
      retainedCost: { usd: 0.004, inputTokens: 900, outputTokens: 200, model: "claude-haiku" },
    },
    profileConfirmed: true,
    diagnosticReady: true,
    analysis: {
      runId: "run-1", status: "done", startedAt: "2026-11-09T09:00:00.000Z", finishedAt: "2026-11-09T09:00:30.000Z",
      input: { companyName: IDENTIFYING.companyName, location: IDENTIFYING.location, website: IDENTIFYING.website },
      rubrics: { site: { status: "read" }, google: { status: "not_found" }, zone: { status: "read" }, identity: { status: "unavailable", reason: "unreadable" } },
      findings: {
        trade: { value: "Électricien", provenance: { kind: "observed", source: IDENTIFYING.website, readAt: "2026-11-09T09:00:10.000Z" } },
        servingArea: null, targetClients: null, offers: null, tone: null,
        contacts: [{ value: IDENTIFYING.contact, provenance: { kind: "observed", source: IDENTIFYING.website, readAt: "2026-11-09T09:00:10.000Z" } }],
        palette: null, logo: null, google: null, pages: [{ url: IDENTIFYING.website, readAt: "2026-11-09T09:00:10.000Z" }],
      },
      cost: { usd: 0.0213, inputTokens: 8000, outputTokens: 900, model: "claude-sonnet" },
      constats: [{ topic: "fiche_google", fact: IDENTIFYING.constat, consequence: "Des clients peuvent trouver porte close.", certainty: "piste", source: null, readAt: null }],
    },
    ...overrides,
  };
  return { state, furthestStep: 5, createdAt: new Date("2026-11-08T23:30:00.000Z") };
}

test("la trace ne contient que les champs prévus (liste blanche)", () => {
  const trace = buildVisitTrace(draft(), { accountCreated: true, proposedTemplates: ["site_page", "social_post", "google_profile"] });
  assert.deepEqual(Object.keys(trace).sort(), [...VISIT_TRACE_FIELDS].sort());
});

test("la trace garde chaque champ prévu sous une forme non identifiante", () => {
  const trace = buildVisitTrace(draft(), { accountCreated: true, proposedTemplates: ["site_page", "social_post", "google_profile"] });
  // Jour de Paris (23 h 30 UTC le 8 = 0 h 30 le 9 à Paris), sans heure.
  assert.equal(trace.startedOn.toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(trace.lastStep, 5);
  assert.equal(trace.abandonedStep, null);
  assert.equal(trace.trade, "Électricien");
  assert.equal(trace.department, "69");
  assert.equal(trace.hasWebsite, true);
  assert.deepEqual(trace.sourcesRead, { site: { status: "read" }, google: { status: "not_found" }, zone: { status: "read" }, identity: { status: "unavailable", reason: "unreadable" } });
  assert.deepEqual(trace.ambition, { gainPercent: 20, horizonMonths: 12, mediaBudgetPerMonth: null, recruitment: "no" });
  assert.deepEqual(trace.proposedTemplates, ["site_page", "social_post", "google_profile"]);
  assert.equal(trace.accountCreated, true);
  // Analyse et « Ce que nous retenons », arrondis au cent.
  assert.equal(trace.analysisCostUsd, 0.03);
});

test("la trace ne garde jamais prénom, entreprise, site, localisation, texte libre, contact ni constat", () => {
  const trace = buildVisitTrace(draft(), { accountCreated: true, proposedTemplates: ["site_page"] });
  const serialized = JSON.stringify(trace).toLowerCase();
  for (const [field, value] of Object.entries(IDENTIFYING)) {
    assert.equal(serialized.includes(value.toLowerCase()), false, `${field} se retrouve dans la trace`);
  }
  for (const fragment of ["claire", "lumen", "dupont", "lilas", "lyon", "villeurbanne", "atelier-lumen", "http", "@", "run-1", "claude"]) {
    assert.equal(serialized.includes(fragment), false, `« ${fragment} » se retrouve dans la trace`);
  }
  // Ni IP, ni jeton, ni lien vers le compte ou le brouillon : ces clés n'existent pas.
  for (const key of ["ip", "ipHash", "tokenHash", "token", "companyId", "draftId", "email", "ownerEmail", "createdAt", "id"]) assert.equal(key in trace, false, key);
});

test("sans compte : étape d'abandon = étape courante, étape atteinte = la plus avancée", () => {
  const trace = buildVisitTrace({ ...draft({ step: 2, ambition: null, diagnosticReady: false }), furthestStep: 4 }, { accountCreated: false, proposedTemplates: ["site_page", "social_post"] });
  assert.equal(trace.lastStep, 4);
  assert.equal(trace.abandonedStep, 2);
  assert.equal(trace.accountCreated, false);
  assert.equal(trace.ambition, null);
  assert.deepEqual(trace.proposedTemplates, ["site_page", "social_post"]);
});

test("avant l'étape 4 : aucun modèle proposé ; sans analyse ni site : rubriques vides, site absent", () => {
  const base = draft({ step: 1, ambition: null, analysis: null });
  base.state.profile = { ...base.state.profile, website: "", trade: "", location: "Ville inconnue" };
  const trace = buildVisitTrace({ ...base, furthestStep: 1 }, { accountCreated: false, proposedTemplates: ["site_page"] });
  assert.deepEqual(trace.proposedTemplates, []);
  assert.deepEqual(trace.sourcesRead, {});
  assert.equal(trace.hasWebsite, false);
  assert.equal(trace.trade, null);
  assert.equal(trace.department, null);
  assert.equal(trace.analysisCostUsd, 0);
});

test("une activité hors catalogue devient « Autre activité » : un texte libre peut nommer l'entreprise", () => {
  assert.equal(catalogTrade("électricien"), "Électricien");
  assert.equal(catalogTrade("  PAYSAGISTE / jardinier "), "Paysagiste / Jardinier");
  assert.equal(catalogTrade("Boulangerie Dupont"), OTHER_TRADE);
  assert.equal(catalogTrade(""), null);
});

test("département : code postal, code explicite, nom, jamais la commune", () => {
  const cases = {
    "69003 Lyon": "69", "Lyon 3e": "69", "Paris 11e": "75", "75011": "75", "Bordeaux (33)": "33", "33": "33",
    "20090 Ajaccio": "2A", "20200 Bastia": "2B", "2B": "2B", "97400 Saint-Denis": "974", "Pointe-à-Pitre": "971",
    "Nantes, Loire-Atlantique": "44", "Le Puy-en-Velay": "43", "Saint-Étienne": "42", "Marseille nord": "13",
    "Les Sables-d'Olonne": "85", "Saint-Denis": null, "Ville inconnue": null, "": null, "Paris 11": "75",
  };
  for (const [location, code] of Object.entries(cases)) assert.equal(departmentFromLocation(location), code, location);
});

test("coût arrondi au cent, jamais négatif", () => {
  assert.equal(roundCost(0.0213), 0.02);
  assert.equal(roundCost(0.025), 0.03);
  assert.equal(roundCost(-1), 0);
  assert.equal(roundCost(Number.NaN), 0);
});

test("conservation de 25 mois, jour borné à la fin du mois (heure de Paris)", () => {
  assert.equal(retentionCutoff(new Date("2026-11-09T10:00:00Z")).toISOString(), "2024-10-09T00:00:00.000Z");
  assert.equal(retentionCutoff(new Date("2027-05-31T10:00:00Z")).toISOString(), "2025-04-30T00:00:00.000Z");
  // 23 h 30 UTC le 31 décembre = 1er janvier à Paris.
  assert.equal(retentionCutoff(new Date("2026-12-31T23:30:00Z")).toISOString(), "2024-12-01T00:00:00.000Z");
});

test("la phrase de l'étape 1 et de la page de confidentialité est celle de FR-60", () => {
  assert.equal(VISIT_TRACE_NOTICE, "Nous gardons une trace anonyme de votre visite pour améliorer BienDecider.");
});

const row = (overrides = {}) => ({
  startedOn: new Date("2026-11-03T00:00:00.000Z"), lastStep: 1, abandonedStep: 1, trade: "Plombier", department: "69", hasWebsite: false,
  sourcesRead: {}, proposedTemplates: [], accountCreated: false, analysisCostUsd: 0.02, ...overrides,
});

test("seuil d'affichage : un groupe de moins de 5 visites est fondu dans « Autres », masqué s'il reste petit", () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row({ trade: "Plombier" })),
    ...Array.from({ length: 2 }, () => row({ trade: "Fleuriste", accountCreated: true })),
    row({ trade: "Coiffeur" }),
  ];
  const groups = thresholdGroups(rows, (item) => item.trade);
  assert.deepEqual(groups, [{ label: "Plombier", visits: 6, accounts: 0 }, { label: OTHERS_LABEL, visits: null, accounts: null }]);
  assert.equal(AGGREGATE_THRESHOLD, 5);
  const wide = thresholdGroups([...rows, ...Array.from({ length: 3 }, () => row({ trade: "Traiteur" }))], (item) => item.trade);
  assert.deepEqual(wide.at(-1), { label: OTHERS_LABEL, visits: 6, accounts: null });
});

test("vue agrégée : étape atteinte, abandon, étape 4, comptes, mois, coût moyen sans compte", () => {
  const rows = [
    row({ lastStep: 1, abandonedStep: 1 }),
    row({ lastStep: 3, abandonedStep: 2, hasWebsite: true, sourcesRead: { site: { status: "read" } } }),
    row({ lastStep: 4, abandonedStep: 4, proposedTemplates: ["site_page", "social_post"], analysisCostUsd: 0.04 }),
    row({ lastStep: 5, abandonedStep: null, accountCreated: true, proposedTemplates: ["site_page"], startedOn: new Date("2026-10-30T00:00:00.000Z"), analysisCostUsd: 0.05 }),
  ];
  const aggregate = aggregateVisits(rows);
  assert.equal(aggregate.total, 4);
  assert.equal(aggregate.accounts, 1);
  assert.equal(aggregate.reachedPlan, 2);
  assert.equal(aggregate.reachedPlanAccounts, 1);
  assert.deepEqual(aggregate.byStep.map((step) => [step.reached, step.abandoned]), [[4, 1], [3, 1], [3, 0], [2, 1], [1, 0]]);
  assert.deepEqual(aggregate.byMonth, [{ month: "2026-10", visits: 1, reachedPlan: 1, accounts: 1 }, { month: "2026-11", visits: 3, reachedPlan: 1, accounts: 0 }]);
  assert.deepEqual(aggregate.proposedTemplates, [{ key: "site_page", count: 2 }, { key: "social_post", count: 1 }]);
  assert.equal(aggregate.sourcesRead.find((item) => item.key === "site").read, 1);
  assert.ok(Math.abs(aggregate.averageCostWithoutAccount - (0.02 + 0.02 + 0.04) / 3) < 1e-9);
  assert.equal(aggregateVisits([]).averageCostWithoutAccount, null);
});

test("export des visites : agrégé, seuil compris, formules neutralisées", () => {
  const rows = Array.from({ length: 3 }, () => row({ trade: "Plombier" }));
  const csv = visitsCsv(aggregateVisits(rows), { step: (step) => `Étape ${step}`, rubric: (key) => key, template: (key) => key, period: "=HYPERLINK()" });
  assert.ok(csv.startsWith("﻿\"Dimension\";\"Valeur\";\"Visites\";\"Comptes créés\""));
  assert.ok(csv.includes(`"Activité";"${OTHERS_LABEL}";"moins de 5";"0"`));
  assert.ok(csv.includes(`"'=HYPERLINK()"`));
  assert.equal(csv.includes("Plombier"), false);
});
