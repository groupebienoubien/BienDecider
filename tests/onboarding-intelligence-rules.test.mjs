import assert from "node:assert/strict";
import test from "node:test";
import {
  INTELLIGENCE_STALE_MS, effectiveIntelligence, intelligenceFinished, intelligenceNotice, intelligenceRunning, intelligenceUsage, intelligenceView,
  needsNewIntelligence, newIntelligence, readCompetitorFacts, readIntelligence,
} from "../src/lib/onboarding/intelligence-rules.ts";

const INPUT = { trade: "Électricien", servingArea: "Lyon et alentours", offers: "Rénovation électrique, dépannage", targetClients: "Particuliers propriétaires", ambitionText: "+20 % de chiffre d'affaires en 12 mois" };
const NOW = new Date("2026-11-12T10:00:00Z");

test("une recherche neuve est « en cours », sans fait, coût à zéro", () => {
  const intelligence = newIntelligence(INPUT, "run-1", NOW);
  assert.equal(intelligence.status, "running");
  assert.equal(intelligence.competitor, null);
  assert.equal(intelligence.opportunity, null);
  assert.deepEqual(intelligence.cost, { usd: 0, inputTokens: 0, outputTokens: 0 });
  assert.equal(intelligenceRunning(intelligence, NOW), true);
});

test("une recherche « en cours » devient « en échec » une fois le délai dépassé", () => {
  const intelligence = newIntelligence(INPUT, "run-1", NOW);
  assert.equal(INTELLIGENCE_STALE_MS, 240_000);
  const later = new Date(NOW.getTime() + INTELLIGENCE_STALE_MS);
  assert.equal(intelligenceRunning(intelligence, later), false);
  assert.equal(intelligenceFinished(intelligence, later), true);
  assert.equal(effectiveIntelligence(intelligence, later).status, "failed");
  // Toujours « en cours » dans le délai.
  const soon = new Date(NOW.getTime() + INTELLIGENCE_STALE_MS - 1);
  assert.equal(intelligenceRunning(intelligence, soon), true);
  assert.equal(effectiveIntelligence(intelligence, soon).status, "running");
});

test("le message de plafond annonce dix recherches par connexion et par jour", () => {
  const limited = newIntelligence(INPUT, "limited", NOW, "limited", { scope: "ip", retryAt: "2026-11-13T10:00:00Z" });
  assert.match(intelligenceNotice(limited, NOW), /depuis cette connexion \(10 recherches par jour\)/);
});

test("needsNewIntelligence : jamais relancée pour le même profil déjà cherché, relancée après un refus ou un échec", () => {
  assert.equal(needsNewIntelligence(null, INPUT, NOW), true);
  const running = newIntelligence(INPUT, "run-1", NOW);
  assert.equal(needsNewIntelligence(running, INPUT, NOW), false);
  const done = { ...running, status: "done", finishedAt: NOW.toISOString() };
  assert.equal(needsNewIntelligence(done, INPUT, NOW), false);
  assert.equal(needsNewIntelligence(done, { ...INPUT, offers: "Autre chose" }, NOW), true);
  const limited = { ...running, status: "limited", finishedAt: NOW.toISOString() };
  assert.equal(needsNewIntelligence(limited, INPUT, NOW), true);
  const failed = { ...running, status: "failed", finishedAt: NOW.toISOString() };
  assert.equal(needsNewIntelligence(failed, INPUT, NOW), true);
  // Une recherche encore en cours, même interrompue au-delà du délai, peut être relancée.
  const stale = newIntelligence(INPUT, "run-1", NOW);
  const later = new Date(NOW.getTime() + INTELLIGENCE_STALE_MS + 1000);
  assert.equal(needsNewIntelligence(stale, INPUT, later), true);
});

test("intelligenceView : jamais l'entrée, le coût ni le contenu des faits, seulement leur présence", () => {
  assert.equal(intelligenceView(null), null);
  const running = newIntelligence(INPUT, "run-1", NOW);
  assert.deepEqual(intelligenceView(running, NOW), { status: "running", finished: false, hasCompetitor: false, hasOpportunity: false, notice: null });
  const done = {
    ...running, status: "done", finishedAt: NOW.toISOString(),
    competitor: { name: "Électricité Dupont", fact: "4,8/5 sur 120 avis Google", source: "https://maps.example/dupont" },
    opportunity: { title: "Salon de l'habitat de Lyon", description: "Salon local pertinent pour un électricien.", source: "https://salon.example", isEvent: true, eventEndDate: "2026-12-01" },
  };
  const view = intelligenceView(done, NOW);
  assert.equal(view.status, "done");
  assert.equal(view.finished, true);
  assert.equal(view.hasCompetitor, true);
  assert.equal(view.hasOpportunity, true);
  assert.equal("competitor" in view, false);
  assert.equal("opportunity" in view, false);
  assert.equal("input" in view, false);
  assert.equal("cost" in view, false);
});

test("readIntelligence : lecture défensive, toute valeur illisible vaut « pas de recherche »", () => {
  const running = newIntelligence(INPUT, "run-1", NOW);
  assert.deepEqual(readIntelligence(running), running);
  assert.equal(readIntelligence(null), null);
  assert.equal(readIntelligence("texte"), null);
  assert.equal(readIntelligence({ runId: "x" }), null);
});

test("#370 : comparables sourcés et datés seulement, jamais l'entreprise, un homonyme ou une note isolée", () => {
  const direct = {
    name: "Électricité Dupont", relationship: "direct", comparabilityReason: "Même activité, clientèle et zone.",
    fact: "Propose le dépannage électrique aux particuliers.", source: "https://dupont.example/services",
    comparisons: [{ dimension: "offers", competitorValue: "Dépannage électrique" }],
  };
  const indirect = {
    name: "Maison Énergie Lyon", relationship: "indirect", comparabilityReason: "Alternative d'équipement pour le même besoin.",
    fact: "Propose la vente de kits de rénovation électrique.", source: "https://energie.example/offres",
    comparisons: [{ dimension: "trade", competitorValue: "Vente de matériel électrique" }],
  };
  const invalid = [
    { ...direct, name: "Atelier Lumen (Lyon)" },
    { ...direct, name: "Atelier-Lumën, autre ville" },
    { ...direct, name: "Avis Google Lyon", comparisons: [] },
    { ...direct, name: "Source non publique", source: "javascript:alert(1)" },
  ];
  const facts = readCompetitorFacts([direct, indirect, ...invalid], {
    ...INPUT, companyName: "Atelier Lumen", website: "https://atelier-lumen.example/",
  }, NOW);
  assert.deepEqual(facts.map(({ name, relationship }) => ({ name, relationship })), [
    { name: "Électricité Dupont", relationship: "direct" },
    { name: "Maison Énergie Lyon", relationship: "indirect" },
  ]);
  assert.deepEqual(facts[0].comparisons, [{ dimension: "offers", businessValue: INPUT.offers, competitorValue: "Dépannage électrique" }]);
  assert.equal(facts[0].readAt, NOW.toISOString());
});

test("#370 : les exclusions sont respectées, les doublons contradictoires ne sont pas multipliés", () => {
  const candidate = {
    name: "Électricité Dupont", relationship: "direct", comparabilityReason: "Même zone et métier.",
    fact: "Propose le dépannage.", source: "https://dupont.example/services",
    comparisons: [{ dimension: "offers", competitorValue: "Dépannage" }],
  };
  const excluded = readCompetitorFacts([candidate], {
    ...INPUT, excludedCompetitors: [{ name: candidate.name, source: candidate.source }],
  }, NOW);
  assert.deepEqual(excluded, []);
  const duplicate = readCompetitorFacts([candidate, { ...candidate, source: "https://another.example", fact: "Fact contradictoire." }], INPUT, NOW);
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].fact, candidate.fact);
});

test("intelligenceUsage : seulement si un coût positif et un modèle connu, comme analysisUsage", () => {
  assert.equal(intelligenceUsage(null), null);
  const running = newIntelligence(INPUT, "run-1", NOW);
  assert.equal(intelligenceUsage(running), null);
  const costed = { ...running, cost: { usd: 0.012, inputTokens: 1500.4, outputTokens: 300.9, model: "claude-sonnet-5-5" } };
  assert.deepEqual(intelligenceUsage(costed), { agent: "onboarding_intelligence", model: "claude-sonnet-5-5", inputTokens: 1500, outputTokens: 301, costUsd: 0.012 });
  const freeCall = { ...running, cost: { usd: 0, inputTokens: 100, outputTokens: 20, model: "claude-sonnet-5-5" } };
  assert.equal(intelligenceUsage(freeCall), null);
});
