import { expect, test } from "@playwright/test";
import { EMPTY_TERMS } from "../src/lib/ambition-rules";
import { MISSION_PLANNING_MODEL } from "../src/lib/anthropic";
import { newAnalysis } from "../src/lib/onboarding/analysis-rules";
import { emptyDraft, intelligenceInputFor, matchingIntelligence, readDraftState, starterPlan, type DraftState } from "../src/lib/onboarding/draft-rules";
import { runDraftIntelligence } from "../src/lib/onboarding/intelligence";
import { INTELLIGENCE_MESSAGES, missionPlanningUsage, needsNewIntelligence, newIntelligence, readIntelligence, type DraftIntelligence } from "../src/lib/onboarding/intelligence-rules";
import { buildMissionPlanningPrompt, checkMissionProposal, type MissionProposal } from "../src/lib/onboarding/mission-planning-rules";
import { prepareMissionPlanning } from "../src/lib/onboarding/mission-planner";
import { validateNewMission } from "../src/lib/missions/rules";
import { hasNoAvailableCapacity, needsWeekdayClarification } from "../src/lib/missions/decision-rules";

const NOW = new Date("2026-11-12T12:00:00Z");

test("mission planning: a weekly volume target is not confused with an unspecified weekday", () => {
  expect(needsWeekdayClarification("Recevoir trois demandes de dépannage qualifiées par semaine")).toBe(false);
  expect(needsWeekdayClarification("Recevoir davantage de demandes chaque semaine")).toBe(false);
  expect(needsWeekdayClarification("Avoir plus de clients en semaine")).toBe(true);
  expect(needsWeekdayClarification("Avoir plus de clients le mardi en semaine")).toBe(false);
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

test("mission planning: live Opus comparison on two synthetic businesses", async () => {
  test.skip(process.env.MISSION_PLANNER_LIVE !== "1", "Opt-in paid API evaluation, without database reads or writes.");
  test.setTimeout(150_000);
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
