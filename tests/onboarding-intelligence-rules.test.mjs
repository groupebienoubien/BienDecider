import assert from "node:assert/strict";
import test from "node:test";
import {
  INTELLIGENCE_STALE_MS, effectiveIntelligence, intelligenceFinished, intelligenceRunning, intelligenceUsage, intelligenceView,
  needsNewIntelligence, newIntelligence, readIntelligence,
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
  const later = new Date(NOW.getTime() + INTELLIGENCE_STALE_MS + 1000);
  assert.equal(intelligenceRunning(intelligence, later), false);
  assert.equal(intelligenceFinished(intelligence, later), true);
  assert.equal(effectiveIntelligence(intelligence, later).status, "failed");
  // Toujours « en cours » dans le délai.
  const soon = new Date(NOW.getTime() + 1000);
  assert.equal(intelligenceRunning(intelligence, soon), true);
  assert.equal(effectiveIntelligence(intelligence, soon).status, "running");
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

test("intelligenceUsage : seulement si un coût positif et un modèle connu, comme analysisUsage", () => {
  assert.equal(intelligenceUsage(null), null);
  const running = newIntelligence(INPUT, "run-1", NOW);
  assert.equal(intelligenceUsage(running), null);
  const costed = { ...running, cost: { usd: 0.012, inputTokens: 1500.4, outputTokens: 300.9, model: "claude-sonnet-5-5" } };
  assert.deepEqual(intelligenceUsage(costed), { agent: "onboarding_intelligence", model: "claude-sonnet-5-5", inputTokens: 1500, outputTokens: 301, costUsd: 0.012 });
  const freeCall = { ...running, cost: { usd: 0, inputTokens: 100, outputTokens: 20, model: "claude-sonnet-5-5" } };
  assert.equal(intelligenceUsage(freeCall), null);
});
