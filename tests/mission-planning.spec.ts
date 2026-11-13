import Anthropic from "@anthropic-ai/sdk";
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { EMPTY_TERMS } from "../src/lib/ambition-rules";
import { anthropic, MISSION_PLANNING_MODEL } from "../src/lib/anthropic";
import { newAnalysis } from "../src/lib/onboarding/analysis-rules";
import { applyDraftAction, emptyDraft, intelligenceInputFor, matchingIntelligence, readDraftState, starterPlan, type DraftState } from "../src/lib/onboarding/draft-rules";
import { runDraftIntelligence } from "../src/lib/onboarding/intelligence";
import { INTELLIGENCE_MESSAGES, INTELLIGENCE_STALE_MS, missionPlanningUsage, needsNewIntelligence, newIntelligence, readIntelligence, type DraftIntelligence } from "../src/lib/onboarding/intelligence-rules";
import { buildMissionPlanningPrompt, checkMissionProposal, type MissionProposal } from "../src/lib/onboarding/mission-planning-rules";
import { prepareMissionPlanning } from "../src/lib/onboarding/mission-planner";
import { validateNewMission } from "../src/lib/missions/rules";
import { evaluateMissionObjective, hasNoAvailableCapacity, needsWeekdayClarification } from "../src/lib/missions/decision-rules";

const NOW = new Date("2026-11-12T12:00:00Z");

test("mission planning: a weekly volume target is not confused with an unspecified weekday", () => {
  expect(needsWeekdayClarification("Recevoir trois demandes de dépannage qualifiées par semaine")).toBe(false);
  expect(needsWeekdayClarification("Recevoir davantage de demandes chaque semaine")).toBe(false);
  expect(needsWeekdayClarification("Avoir plus de clients en semaine")).toBe(true);
  expect(needsWeekdayClarification("Avoir plus de clients le mardi en semaine")).toBe(false);
  expect(evaluateMissionObjective({ template: "social_post", objective: "Avoir plus de clients en semaine" })).toEqual({ allowed: true });
  expect(evaluateMissionObjective({ template: "social_post", objective: "Je suis complet et je veux plus de clients en semaine" }).allowed).toBe(false);
});

test("mission planning: complete websites are not confused with full business capacity", () => {
  expect(hasNoAvailableCapacity("Avoir un site complet pour obtenir plus de demandes de devis")).toBe(false);
  expect(hasNoAvailableCapacity("Avoir une fiche Google complète pour recevoir plus de demandes de devis")).toBe(false);
  expect(hasNoAvailableCapacity("Je suis complet et ne peux pas accueillir de nouveau client")).toBe(true);
  expect(hasNoAvailableCapacity("Mon planning est complet")).toBe(true);
  expect(hasNoAvailableCapacity("Je ne suis pas complet")).toBe(false);
  expect(hasNoAvailableCapacity("Mon site n'est pas complet, mais je suis complet")).toBe(true);
});

test("mission planning: the real draft serializer preserves the no-fallback marker without intelligence", async () => {
  const { toJson } = await import("../src/lib/onboarding/draft");
  const state = restaurant();
  const persisted = readDraftState(toJson(state));
  expect(persisted.ambition?.planningVersion).toBe(1);
  expect(starterPlan(persisted).missions).toEqual([]);
});

test("mission planning: reconfirming an unchanged objective refreshes the old approach, not a page reload", async () => {
  const state = restaurant();
  state.intelligence = research(state);
  expect(matchingIntelligence(state)).toEqual(state.intelligence);
  const updated = applyDraftAction({ ...state, step: 3 }, { action: "confirm_ambition", ambition: state.ambition!.text, terms: state.ambition!.terms, token: "test" }, NOW, () => true);
  if (!updated.ok) throw new Error("Objective confirmation failed");
  expect(updated.state.ambition?.planningVersion).toBe(2);
  expect(matchingIntelligence(updated.state)).toBeNull();
  expect(needsNewIntelligence(state.intelligence, intelligenceInputFor(updated.state), NOW)).toBe(true);
  const { toJson } = await import("../src/lib/onboarding/draft");
  expect(readDraftState(toJson(updated.state)).ambition?.planningVersion).toBe(2);
  const current = research(updated.state);
  expect(readIntelligence(current)?.input.planningContext?.approachVersion).toBe(2);
  expect(matchingIntelligence({ ...updated.state, intelligence: current })).toEqual(current);
});

function restaurant(): DraftState {
  const state = emptyDraft();
  const profile = {
    ...state.profile, companyName: "Restaurant Test", location: "Lyon", website: "https://restaurant.example/",
    trade: "Restaurant", servingArea: "Lyon", offers: "Menu déjeuner, repas de groupe", targetClients: "Salariés du quartier, familles",
  };
  const analysis = newAnalysis({ companyName: profile.companyName, location: profile.location, website: profile.website }, "site-1", NOW, "done");
  analysis.rubrics.site = { status: "read" };
  analysis.findings.pages = [{ url: profile.website, readAt: NOW.toISOString() }];
  analysis.constats = [{
    topic: "site_web", fact: "Le menu déjeuner est présenté sans jours de service ni durée indicative du repas.",
    consequence: "Un salarié ne peut pas vérifier si son déjeuner tient dans sa pause.",
    certainty: "observe", source: profile.website, readAt: NOW.toISOString(),
  }];
  return {
    ...state, profile, analysis, step: 4, profileConfirmed: true, diagnosticReady: true,
    ambition: { text: "Remplir quatre tables supplémentaires le mardi midi avec les salariés du quartier, sans publicité payante.", terms: { ...EMPTY_TERMS, mediaBudgetPerMonth: 0 }, planningVersion: 1 },
  };
}

function research(state = restaurant()): DraftIntelligence {
  return { ...newIntelligence(intelligenceInputFor(state), "research-1", NOW), status: "done", finishedAt: NOW.toISOString() };
}

function proposal(): MissionProposal {
  return {
    retained: [
      "Le menu déjeuner existe, mais ses horaires et sa durée ne permettent pas aux salariés de prévoir leur pause.",
      "Le premier test vise le mardi midi : clarifier cette offre avant de chercher davantage de visibilité.",
    ],
    notice: null,
    missions: [{
      template: "site_page", channel: "site", title: "Clarifier le déjeuner du mardi pour les salariés",
      outcome: "Tester quatre tables supplémentaires le mardi midi",
      evidenceIds: ["analysis:0", "profile:targetClients"],
      scope: { page: "Menu du mardi midi et durée de la pause déjeuner" }, stopRuleDays: 30,
      deduction: "Les salariés doivent pouvoir vérifier les horaires du menu et prévoir leur pause avant de réserver le mardi.",
      risk: "Le contenu ne suffit pas à attirer les salariés : leur connaissance de l'offre reste à tester.",
      decisionPlan: {
        selectionReason: "Clarifier l'offre déjà visible avant de publier : une publication ne résout pas l'incertitude sur les horaires et la durée.",
        indicator: "Nombre de tables de salariés réservées le mardi midi après lecture de la page.",
        collectionMethod: "Demander lors de la réservation comment la personne a trouvé le menu ; saisir les réponses au bilan.",
        effort: "Préparer les horaires et la durée réelle du service dans une courte page à relire.",
        prerequisites: "Confirmer les horaires, la durée et les tables disponibles le mardi ; disposer de l'accès au site.",
        ownerAction: "Valider les informations, publier après relecture et relever les réservations attribuées au menu.",
      },
    }],
  };
}

test("mission planning: the dossier carries the actual finding, sources, objective and reading limitations", () => {
  const state = restaurant();
  const prompt = buildMissionPlanningPrompt(research(state));
  expect(prompt).toContain(state.analysis!.constats![0].fact);
  expect(prompt).toContain(state.analysis!.constats![0].source!);
  expect(prompt).toContain(state.ambition!.text);
  expect(prompt).toContain("publications sociales n'ont pas été lues");
  expect(prompt).toContain('"mediaBudgetPerMonth":0');
  expect(prompt).toContain("Vise trois missions complémentaires");
  expect(prompt).toContain("ne remplis jamais un quota sans preuve");
  expect(prompt).toContain("Chaque clé du catalogue sert au plus une fois");
  expect(prompt).toContain("title 80, outcome 120, scope.topic 120");
  expect(prompt).toContain("chaque champ de decisionPlan 240");
  expect(prompt).toContain("mesure légère intégrée");
  expect(prompt).toContain("L'absence de chiffres de référence ne justifie pas à elle seule");
  expect(prompt).toContain("un seul signal principal");
  expect(prompt).toContain("sans titres Markdown");
  expect(prompt).not.toContain('"key":"agencies"');
  expect(prompt).not.toContain('"key":"review_reply"');
});

test("mission planning: displayed missions and synthesis survive storage unchanged and respect creation rules", () => {
  const state = restaurant();
  const intelligence = research(state);
  const checked = checkMissionProposal(proposal(), intelligence);
  expect(checked.ok).toBe(true);
  state.intelligence = { ...intelligence, planning: { status: "done", proposal: proposal(), cost: { usd: 0.03, inputTokens: 1000, outputTokens: 500, model: MISSION_PLANNING_MODEL } } };
  const displayed = starterPlan(state);
  expect(displayed.missions[0].title).toBe(proposal().missions[0].title);
  expect(displayed.retained).toEqual(proposal().retained);
  expect(displayed.missions[0].decisionPlan.indicator).toContain("mardi midi");
  expect(displayed.missions[0].decisionPlan.evidence?.[0].fact).toBe(state.analysis!.constats![0].fact);
  expect(validateNewMission(displayed.missions[0], 0).ok).toBe(true);
  const persisted = readDraftState({
    step: 5, profile: state.profile, ambition: state.ambition, profileConfirmed: true, diagnosticReady: true,
    analysis: state.analysis, intelligence: JSON.parse(JSON.stringify(state.intelligence)),
  });
  expect(readIntelligence(state.intelligence)).toEqual(state.intelligence);
  expect(starterPlan(persisted)).toEqual(displayed);
  expect(missionPlanningUsage(persisted.intelligence)).toMatchObject({ agent: "onboarding_mission_planning", model: MISSION_PLANNING_MODEL, costUsd: 0.03 });
});

test("mission planning: three complementary missions survive storage without another analysis", () => {
  const state = restaurant();
  const intelligence = research(state);
  const source = proposal();
  const first = source.missions[0];
  const expanded: MissionProposal = { ...source, missions: [first, {
    ...first, template: "social_post", channel: "facebook", title: "Présenter les repas de groupe aux familles",
    outcome: "Mesurer les demandes de repas de groupe après une publication",
    evidenceIds: ["profile:offers", "profile:targetClients"], scope: { topic: "Repas de groupe pour les familles lyonnaises" }, stopRuleDays: 7,
    decisionPlan: { ...first.decisionPlan, selectionReason: "Tester une deuxième offre auprès des familles, sans répéter la page du déjeuner des salariés.", indicator: "Demandes de repas de groupe déclarées après la publication." },
  }, {
    ...first, template: "custom", channel: null, title: "Tester les réservations auprès des salariés voisins",
    outcome: "Recueillir les freins à la réservation du mardi midi",
    evidenceIds: ["profile:targetClients"], scope: { description: "Interroger les salariés du quartier sur les conditions d'une réservation le mardi midi." },
    decisionPlan: { ...first.decisionPlan, selectionReason: "Explorer les freins auprès de la clientèle déclarée avant de multiplier les publications.", indicator: "Freins à la réservation déclarés par les salariés interrogés." },
  }] };
  expect(checkMissionProposal(expanded, intelligence).ok).toBe(true);
  const stored = readDraftState({
    step: 5, profile: state.profile, ambition: state.ambition, profileConfirmed: true, diagnosticReady: true,
    analysis: state.analysis, intelligence: { ...intelligence, planning: { status: "done", proposal: expanded, cost: { usd: 0.03, inputTokens: 1000, outputTokens: 500, model: MISSION_PLANNING_MODEL } } },
  });
  expect(starterPlan(stored).missions.map(({ title }) => title)).toEqual(expanded.missions.map(({ title }) => title));
  expect(starterPlan(stored).missions.map(({ first }) => first)).toEqual([true, false, false]);
  expect(missionPlanningUsage(stored.intelligence)?.costUsd).toBe(0.03);
});

test("mission planning: fabricated proofs, duplicate actions, incompatible scope and promises are refused as a whole", () => {
  const intelligence = research();
  const source = proposal();
  const candidate = source.missions[0];
  const invalid: MissionProposal[] = [
    { ...source, missions: [{ ...candidate, evidenceIds: ["invented:fact"] }] },
    { ...source, missions: [candidate, candidate] },
    { ...source, missions: [{ ...candidate, scope: { topic: "Un sujet sans page" } }] },
    { ...source, missions: [{ ...candidate, outcome: "Quatre tables garanties chaque mardi" }] },
    { ...source, missions: [{ ...candidate, stopRuleDays: 7 }] },
    { ...source, missions: [{ ...candidate, channel: "instagram" }] },
    { ...source, missions: [{ ...candidate, evidenceIds: ["profile:offers"] }] },
    { ...source, missions: [], notice: null },
  ];
  for (const raw of invalid) expect(checkMissionProposal(raw, intelligence).ok, JSON.stringify(raw)).toBe(false);
  expect(checkMissionProposal(source, intelligence, ["custom"]).ok).toBe(false);
});

test("mission planning: text limits accept the boundary and identify an overflowing field without exposing its contents", () => {
  const cases: { path: string; max: number; set: (plan: MissionProposal, value: string) => void }[] = [
    { path: "retained.0", max: 240, set: (plan, value) => { plan.retained[0] = value; } },
    { path: "notice", max: 600, set: (plan, value) => { plan.notice = value; } },
    ...(["title", "outcome", "deduction", "risk"] as const).map((field) => ({
      path: `missions.0.${field}`,
      max: { title: 80, outcome: 120, deduction: 500, risk: 200 }[field],
      set: (plan: MissionProposal, value: string) => { plan.missions[0][field] = value; },
    })),
    ...(["selectionReason", "indicator", "collectionMethod", "effort", "prerequisites", "ownerAction"] as const).map((field) => ({
      path: `missions.0.decisionPlan.${field}`, max: 240,
      set: (plan: MissionProposal, value: string) => { plan.missions[0].decisionPlan[field] = value; },
    })),
    { path: "missions.0.scope.page", max: 80, set: (plan, value) => { plan.missions[0].scope = { page: value }; } },
    { path: "missions.0.scope.topic", max: 120, set: (plan, value) => {
      Object.assign(plan.missions[0], { template: "social_post", channel: "facebook", stopRuleDays: 7, scope: { topic: value } });
    } },
    { path: "missions.0.scope.description", max: 300, set: (plan, value) => {
      Object.assign(plan.missions[0], { template: "custom", channel: null, scope: { description: value } });
    } },
  ];
  const intelligence = research();
  for (const { path, max, set } of cases) {
    const raw = proposal();
    set(raw, "x".repeat(max));
    expect(checkMissionProposal(raw, intelligence).ok, `${path} at its limit`).toBe(true);
    set(raw, "x".repeat(max + 1));
    expect(checkMissionProposal(raw, intelligence)).toEqual({
      ok: false, error: `Format des propositions de missions invalide (${path} : too_big).`,
    });
  }
  const markup = proposal();
  markup.missions[0].decisionPlan.indicator = "Nombre de demandes > 4";
  expect(checkMissionProposal(markup, intelligence)).toEqual({
    ok: false, error: "Format des propositions de missions invalide (missions.0.decisionPlan.indicator : custom).",
  });
  expect(checkMissionProposal(undefined, intelligence)).toEqual({
    ok: false, error: "Format des propositions de missions invalide (racine : invalid_type).",
  });
});

test("mission planning: two supported mission types suffice without duplicating custom to reach three", () => {
  const state = { ...restaurant(), analysis: null };
  const intelligence = research(state);
  const source = proposal();
  const first = source.missions[0];
  const plan: MissionProposal = {
    retained: [
      "Le menu déjeuner peut être testé auprès des salariés du quartier.",
      "Les repas de groupe offrent une autre piste auprès des familles.",
    ],
    notice: "Sans constat observé sur le site ou la fiche Google, seules deux missions distinctes sont étayées.",
    missions: [
      { ...first, template: "social_post", channel: "facebook", evidenceIds: ["profile:offers"],
        scope: { topic: "Présenter les repas de groupe aux familles" }, stopRuleDays: 7 },
      { ...first, template: "custom", channel: null, evidenceIds: ["profile:targetClients"],
        scope: { description: "Tester les réservations du mardi auprès des salariés voisins." } },
    ],
  };
  expect(checkMissionProposal(plan, intelligence).ok).toBe(true);
  const stored = readDraftState({
    ...state, intelligence: { ...intelligence, planning: {
      status: "done", proposal: plan, cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    } },
  });
  expect(starterPlan(stored).missions.map((mission) => mission.template)).toEqual(["social_post", "custom"]);
  expect(checkMissionProposal({ ...plan, missions: [...plan.missions, plan.missions[1]] }, intelligence)).toEqual({
    ok: false, error: "Un même modèle de mission est proposé deux fois.",
  });
  expect(checkMissionProposal(plan, intelligence, ["custom"])).toEqual({
    ok: false, error: "Une mission est indisponible ou incompatible avec l'objectif.",
  });
});

test("mission planning: changes to objective, budget, analysis or source decisions invalidate the stored plan", () => {
  const state = restaurant();
  state.intelligence = { ...research(state), planning: { status: "done", proposal: proposal(), cost: { usd: 0, inputTokens: 0, outputTokens: 0 } } };
  const changes: DraftState[] = [
    { ...state, ambition: { ...state.ambition!, text: "Développer les repas de groupe le vendredi" } },
    { ...state, ambition: { ...state.ambition!, terms: { ...state.ambition!.terms, mediaBudgetPerMonth: 100 } } },
    { ...state, analysis: { ...state.analysis!, runId: "site-2" } },
    { ...state, analysis: { ...state.analysis!, constats: [{ ...state.analysis!.constats![0], fact: "Les horaires et la durée figurent maintenant sur la page." }] } },
  ];
  for (const changed of changes) {
    expect(matchingIntelligence(changed)).toBeNull();
    expect(needsNewIntelligence(state.intelligence, intelligenceInputFor(changed), NOW)).toBe(true);
    expect(starterPlan(changed).missions).toEqual([]);
  }
});

test("mission planning: no fixed-text fallback on missing, failed or invalid generation", () => {
  const state = restaurant();
  expect(starterPlan(state).missions).toEqual([]);
  for (const planning of [
    { status: "failed" as const, cost: { usd: 0, inputTokens: 0, outputTokens: 0 } },
    { status: "done" as const, proposal: {}, cost: { usd: 0, inputTokens: 0, outputTokens: 0 } },
  ]) {
    const failed = { ...state, intelligence: { ...research(state), planning } };
    expect(starterPlan(failed).missions).toEqual([]);
    expect(starterPlan(failed).recap.notes).toContain(INTELLIGENCE_MESSAGES.planningFailed);
  }
});

test("mission planning: generation follows search, retains Opus cost even on invalid output and persists only the final plan", async () => {
  const initial = { ...research(), status: "running" as const };
  const saved: DraftIntelligence[] = [];
  let calledAfterSearch = false;
  const done = await runDraftIntelligence("fixture", {
    intelligence: initial, now: () => NOW,
    search: async () => ({ ok: true, competitor: null, opportunity: null, usage: {}, model: "claude-sonnet-5-5" }),
    planner: async (intelligence) => {
      calledAfterSearch = intelligence.status === "done";
      return { proposal: proposal(), usage: { input_tokens: 1000, output_tokens: 500 }, model: MISSION_PLANNING_MODEL };
    },
    save: async (intelligence) => { saved.push(intelligence); return true; },
  });
  expect(calledAfterSearch).toBe(true);
  expect(done.planning?.status).toBe("done");
  expect(saved).toEqual([done]);
  expect(missionPlanningUsage(done)?.costUsd).toBeCloseTo(0.014);
  const invalid = await prepareMissionPlanning(research(), async () => ({ proposal: {}, usage: { input_tokens: 1000, output_tokens: 500 }, model: MISSION_PLANNING_MODEL }));
  expect(invalid.status).toBe("failed");
  expect(invalid.cost.usd).toBeCloseTo(0.014);
  const unavailable = await prepareMissionPlanning(research(), async () => { throw new Error("provider unavailable"); });
  expect(unavailable.status).toBe("failed");
});

for (const elapsed of [90_000, 120_000]) {
  test(`mission planning: the real SDK ${elapsed === 90_000 ? "accepts a response after 60 seconds" : "stops at 120 seconds without retrying"}`, async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-only-no-network";
    let requests = 0;
    const client = new Anthropic({
      apiKey: "test-only-no-network", authToken: null,
      fetch: async (_url, init) => {
        requests++;
        mock.timers.tick(elapsed);
        if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return Response.json({
          id: "mission-plan", type: "message", role: "assistant", model: MISSION_PLANNING_MODEL,
          stop_reason: "tool_use", stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 500 },
          content: [{ type: "tool_use", id: "record-plan", name: "record_mission_plan", input: proposal() }],
        });
      },
    });
    const create = mock.method(anthropic.messages, "create", client.messages.create.bind(client.messages));
    const errors = mock.method(console, "error", () => {});
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const planning = await prepareMissionPlanning(research());
      expect(planning.status).toBe(elapsed === 90_000 ? "done" : "failed");
      expect(requests).toBe(1);
      expect(create.mock.calls[0].arguments[0]).toMatchObject({ max_tokens: 6500 });
      expect(create.mock.calls[0].arguments[1]).toEqual({ timeout: 120_000, maxRetries: 0 });
      if (elapsed === 90_000) {
        expect(starterPlan({ ...restaurant(), intelligence: { ...research(), planning } }).missions).toHaveLength(1);
        expect(errors.mock.callCount()).toBe(0);
      } else {
        expect(errors.mock.calls.map((call) => call.arguments)).toEqual([
          ["Préparation des missions impossible : Request timed out."],
        ]);
      }
    } finally {
      mock.timers.reset();
      create.mock.restore();
      errors.mock.restore();
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });
}

test("mission planning: route and progress leave time for search, generation and persistence", async () => {
  const { maxDuration } = await import("../src/app/api/bienvenue/route");
  expect(maxDuration).toBe(240);
  expect(INTELLIGENCE_STALE_MS).toBe(maxDuration * 1000);
  expect(60_000 + 120_000).toBeLessThan(INTELLIGENCE_STALE_MS);
});

test("mission planning: live Opus comparison on two synthetic businesses", async () => {
  test.skip(process.env.MISSION_PLANNER_LIVE !== "1", "Opt-in paid API evaluation, without database reads or writes.");
  test.setTimeout(270_000);
  const first = restaurant();
  const second = restaurant();
  second.profile = { ...second.profile, companyName: "Atelier Test", trade: "Électricien", offers: "Dépannage électrique", targetClients: "Propriétaires lyonnais", website: "https://electricien.example/" };
  second.ambition = { text: "Recevoir trois demandes de dépannage électrique qualifiées par semaine, sans publicité payante.", terms: { ...EMPTY_TERMS, mediaBudgetPerMonth: 0 }, planningVersion: 1 };
  second.analysis = newAnalysis({ companyName: second.profile.companyName, location: second.profile.location, website: second.profile.website }, "electrical-site", NOW, "done");
  second.analysis.rubrics.site = { status: "read" };
  second.analysis.findings.pages = [{ url: second.profile.website, readAt: NOW.toISOString() }];
  second.analysis.constats = [{
    topic: "site_web", fact: "La page dépannage ne précise ni les quartiers desservis ni comment demander une intervention.",
    consequence: "Un propriétaire ne peut pas vérifier si son logement est couvert ni engager sa demande.",
    certainty: "observe", source: second.profile.website, readAt: NOW.toISOString(),
  }];
  const plans = [];
  for (const state of [first, second]) {
    const intelligence = research(state);
    const planning = await prepareMissionPlanning(intelligence);
    expect(planning.status, "Opus must return a valid, evidence-backed plan").toBe("done");
    expect(planning.cost.model).toBe(MISSION_PLANNING_MODEL);
    const plan = starterPlan({ ...state, intelligence: { ...intelligence, planning } });
    expect(plan.missions.length).toBeGreaterThan(0);
    expect(plan.missions.length).toBeLessThanOrEqual(3);
    expect(plan.missions[0].decisionPlan.evidence?.length).toBeGreaterThan(0);
    plans.push(plan);
    console.log(JSON.stringify({ company: state.profile.companyName, costUsd: planning.cost.usd, retained: plan.retained, missions: plan.missions.map(({ title, scope, decisionPlan }) => ({ title, scope, decisionPlan })) }));
  }
  const firstText = JSON.stringify(plans[0].missions);
  const secondText = JSON.stringify(plans[1].missions);
  expect(firstText).toMatch(/mardi|déjeuner/i);
  expect(secondText).toMatch(/dépannage|intervention|quartiers/i);
  expect(plans[0].missions[0].title).not.toBe(plans[1].missions[0].title);
});
