import { expect, test } from "@playwright/test";
import { EMPTY_TERMS } from "../src/lib/ambition-rules";
import { newAnalysis, ruleFirstFindings } from "../src/lib/onboarding/analysis-rules";
import {
  analysisMatchesProfile, applyDraftAction, checkDraftForAccount, emptyDraft, intelligenceInputFor,
  matchingIntelligence, prefillWebsite, readDraftState, starterMarketFinding, starterPlan, type DraftState,
} from "../src/lib/onboarding/draft-rules";
import { buildMarketPrompt, runDraftIntelligence } from "../src/lib/onboarding/intelligence";
import { INTELLIGENCE_MESSAGES, INTELLIGENCE_STALE_MS, intelligenceNotice, needsNewIntelligence, newIntelligence, readIntelligence } from "../src/lib/onboarding/intelligence-rules";
import { synthesisInput } from "../src/lib/onboarding/synthesis";

const NOW = new Date("2026-11-12T10:00:00Z");
const WEBSITE = "https://restaurant.example/";

function draft(): DraftState {
  const state = emptyDraft();
  return {
    ...state, step: 4, profileConfirmed: true, diagnosticReady: true,
    profile: { ...state.profile, firstName: "Alex", companyName: "Restaurant Exemple", location: "Maurepas", trade: "Restaurant", servingArea: "Maurepas", targetClients: "Particuliers, Familles", offers: "burger" },
    ambition: { text: "Plus de clients en semaine", terms: { ...EMPTY_TERMS } },
  };
}

function discoveredDraft(): DraftState {
  const state = draft();
  const analysis = newAnalysis({ companyName: state.profile.companyName, location: state.profile.location, website: "" }, "analysis", NOW, "done");
  analysis.rubrics.site = { status: "read" };
  analysis.findings.pages = [{ url: WEBSITE, readAt: NOW.toISOString() }];
  return { ...state, step: 2, profileConfirmed: false, analysis };
}

test("onboarding quality: discovered website is editable, confirmed and survives draft serialization", () => {
  const state = discoveredDraft();
  expect(prefillWebsite(state)).toBe(WEBSITE);
  const confirmed = applyDraftAction({ ...state, step: 2 }, { action: "confirm_profile", ...state.profile, website: prefillWebsite(state) }, NOW);
  expect(confirmed.ok).toBe(true);
  if (!confirmed.ok) throw new Error("Profile confirmation failed");
  const persisted: DraftState = JSON.parse(JSON.stringify(confirmed.state));
  expect(persisted.profile.website).toBe(WEBSITE);
  expect(analysisMatchesProfile(persisted)).toBe(true);
  expect(starterPlan(persisted).recap.notes.join(" ")).not.toMatch(/Aucun site|pas pu lire/);
  expect(synthesisInput(persisted)).not.toContain("aucun site indiqué");
  const changed = { ...persisted, profile: { ...persisted.profile, website: "https://another.example/" } };
  expect(analysisMatchesProfile(changed)).toBe(false);
  expect(prefillWebsite(changed)).toBe("https://another.example/");
  const removed = applyDraftAction({ ...state, step: 2 }, { action: "confirm_profile", ...state.profile, website: "" }, NOW);
  expect(removed.ok).toBe(true);
  if (!removed.ok) throw new Error("Profile confirmation failed");
  expect(prefillWebsite(removed.state)).toBe("");
  expect(analysisMatchesProfile(removed.state)).toBe(false);
  const back = applyDraftAction(removed.state, { action: "back", step: 2 }, NOW);
  if (!back.ok) throw new Error("Profile reopening failed");
  expect(prefillWebsite(back.state)).toBe("");
});

test("onboarding quality: a discovered website never overrides another company or an explicit correction", () => {
  const state = discoveredDraft();
  expect(prefillWebsite({ ...state, profile: { ...state.profile, companyName: "Autre entreprise" } })).toBe("");
  expect(prefillWebsite({ ...state, analysis: { ...state.analysis!, status: "running" } })).toBe("");
  expect(prefillWebsite({ ...state, profile: { ...state.profile, website: "https://declared.example/" } })).toBe("https://declared.example/");
  for (const website of ["javascript:alert(1)", "https://example.test/<script>", `https://example.test/${"x".repeat(500)}`]) {
    expect(applyDraftAction({ ...state, step: 2 }, { action: "confirm_profile", ...state.profile, website }, NOW)).toMatchObject({ ok: false, kind: "invalid" });
  }
});

test("onboarding quality: a Google listing is read only after explicit selection and that choice survives the draft", () => {
  const state = discoveredDraft();
  const candidateIds = ["ChIJatelierLumen01", "ChIJatelierLumen02"];
  const analysis = {
    ...state.analysis!,
    findings: { ...state.analysis!.findings, googlePlaceCandidates: candidateIds },
  };
  const candidates = { ...state, analysis };
  const profile = { trade: "Restaurant", servingArea: "Maurepas", targetClients: "Familles", offers: "Déjeuner" };
  expect(applyDraftAction(candidates, { action: "confirm_profile", ...profile }, NOW)).toMatchObject({
    ok: false, kind: "invalid", error: "Choisissez la fiche de votre entreprise ou indiquez qu'aucune ne correspond.",
  });

  const choice = { status: "confirmed" as const, placeId: candidateIds[1] };
  const selected = applyDraftAction(candidates, { action: "confirm_profile", ...profile, googlePlaceChoice: choice }, NOW);
  expect(selected).toMatchObject({ ok: true, state: { step: 1, googlePlaceChoice: choice, profileConfirmed: false } });
  if (!selected.ok) throw new Error("Google place selection failed");
  const correctedWithSelection = applyDraftAction(candidates, {
    action: "confirm_profile",
    ...profile,
    website: "https://atelier-lumen.example/",
    googlePlaceChoice: choice
  }, NOW);
  expect(correctedWithSelection).toMatchObject({
    ok: true,
    state: {
      step: 1,
      profile: { website: "https://atelier-lumen.example/" },
      googlePlaceChoice: choice,
      profileConfirmed: false
    }
  });
  if (!correctedWithSelection.ok) throw new Error("Concurrent website correction and place selection failed");

  const input = {
    companyName: state.profile.companyName, location: state.profile.location, website: "",
    googlePlaceId: candidateIds[1], googlePlaceCandidateIds: candidateIds,
  };
  const selectedAnalysis = newAnalysis(input, "confirmed-place", NOW, "done");
  selectedAnalysis.findings.googlePlaceCandidates = candidateIds;
  const ready = { ...selected.state, step: 2 as const, analysis: selectedAnalysis };
  const confirmed = applyDraftAction(ready, { action: "confirm_profile", ...profile, googlePlaceChoice: choice }, NOW);
  expect(confirmed).toMatchObject({ ok: true, state: { step: 3, googlePlaceChoice: choice, profileConfirmed: true } });
  if (!confirmed.ok) throw new Error("Profile confirmation failed");

  const persisted = readDraftState({
    step: confirmed.state.step,
    profile: { ...confirmed.state.profile, googlePlaceChoice: confirmed.state.googlePlaceChoice, websiteRejected: confirmed.state.websiteRejected },
    ambition: confirmed.state.ambition,
    profileConfirmed: confirmed.state.profileConfirmed,
    diagnosticReady: confirmed.state.diagnosticReady,
    analysis: confirmed.state.analysis,
  });
  expect(persisted.googlePlaceChoice).toEqual(choice);
  expect(analysisMatchesProfile(persisted)).toBe(true);

  const rejected = applyDraftAction(candidates, { action: "confirm_profile", ...profile, googlePlaceChoice: { status: "rejected" } }, NOW);
  expect(rejected).toMatchObject({ ok: true, state: { step: 3, googlePlaceChoice: { status: "rejected" } } });
});

test("onboarding quality: no input or failed reading never proves an absent website", () => {
  const state = draft();
  const page = starterPlan(state, ["site_page"]).missions[0];
  expect(page.deduction).toContain("vérifiez d'abord");
  expect(page.deduction).not.toContain("vous n'avez pas encore de page");
  expect(starterPlan(state).recap.notes[0]).toContain("ne signifie pas");
  const finding = ruleFirstFindings({ site: null, google: null })[0];
  expect(finding.certainty).toBe("piste");
  expect(finding.consequence).toContain("ne prouve pas");
  expect(starterPlan(discoveredDraft()).recap.notes.join(" ")).not.toMatch(/Aucun site|pas pu lire/);
});

test("onboarding quality: research blocks every account transition while running, but not forever", () => {
  const state = draft();
  state.intelligence = newIntelligence(intelligenceInputFor(state), "research", NOW);
  expect(applyDraftAction(state, { action: "interested" }, NOW)).toMatchObject({ ok: false, kind: "busy" });
  expect(applyDraftAction(state, { action: "goto", step: 5 }, NOW)).toMatchObject({ ok: false });
  expect(checkDraftForAccount({ ...state, step: 5 }, NOW)).toMatchObject({ ok: false, code: "intelligence", step: 4 });
  const later = new Date(NOW.getTime() + INTELLIGENCE_STALE_MS + 1);
  expect(intelligenceNotice(state.intelligence, later)).toBe(INTELLIGENCE_MESSAGES.failed);
  expect(applyDraftAction(state, { action: "interested" }, later)).toMatchObject({ ok: true, state: { step: 5 } });
  for (const status of ["done", "failed", "limited"] as const) {
    const finished = { ...state, intelligence: { ...state.intelligence, status } };
    expect(applyDraftAction(finished, { action: "interested" }, NOW)).toMatchObject({ ok: true });
  }
});

test("onboarding quality: market research follows identity and objective, never a stale profile", () => {
  const state = draft();
  const input = intelligenceInputFor(state);
  state.intelligence = { ...newIntelligence(input, "market", NOW), status: "done", finishedAt: NOW.toISOString() };
  expect(readIntelligence(state.intelligence)).toEqual(state.intelligence);
  expect(matchingIntelligence(state)).toEqual(state.intelligence);
  for (const field of ["companyName", "location", "website", "trade", "servingArea", "offers", "targetClients"] as const) {
    const changed = { ...state, profile: { ...state.profile, [field]: "changed" } };
    expect(matchingIntelligence(changed), field).toBeNull();
    expect(needsNewIntelligence(state.intelligence, intelligenceInputFor(changed), NOW), field).toBe(true);
  }
  const changedGoal = { ...state, ambition: { text: "Augmenter mon panier moyen", terms: { ...EMPTY_TERMS } } };
  expect(matchingIntelligence(changedGoal)).toBeNull();
  const prompt = buildMarketPrompt(input, NOW);
  expect(prompt).toContain(state.profile.companyName);
  expect(prompt).toContain(state.ambition!.text);
  expect(prompt).toContain("2026-11-12");
  expect(prompt).toContain("jamais l'entreprise elle-même");
});

test("onboarding quality: unavailable or failed search is not a successful empty analysis; cost is retained", async () => {
  const initial = newIntelligence(intelligenceInputFor(draft()), "market", NOW);
  const saved: unknown[] = [];
  const deps = { intelligence: initial, now: () => NOW, save: async (value: unknown) => { saved.push(value); return true; } };
  const unavailable = await runDraftIntelligence("test", { ...deps, search: async () => null });
  expect(unavailable.status).toBe("failed");
  expect(intelligenceNotice(unavailable, NOW)).toBe(INTELLIGENCE_MESSAGES.failed);
  const failed = await runDraftIntelligence("test", { ...deps, search: async () => ({ ok: false, competitor: null, opportunity: null, usage: { input_tokens: 1000, output_tokens: 100 }, model: "claude-sonnet-5-5" }) });
  expect(failed.status).toBe("failed");
  expect(failed.cost.usd).toBeGreaterThan(0);
  const emptySuccess = await runDraftIntelligence("test", { ...deps, search: async () => ({ ok: true, competitor: null, opportunity: null, usage: {}, model: "claude-sonnet-5-5" }) });
  expect(emptySuccess.status).toBe("done");
  expect(intelligenceNotice(emptySuccess, NOW)).toContain("aucun repère de marché");
  expect(saved).toHaveLength(3);
  await expect(runDraftIntelligence("test", { ...deps, save: async () => { throw new Error("storage unavailable"); }, search: async () => null })).rejects.toThrow("storage unavailable");
});

test("onboarding quality: a market reference survives signup as unverified, never as proof of a publication", () => {
  const state = draft();
  const competitor = { name: "Autre Restaurant", fact: "Propose un menu du midi en semaine.", source: "https://competitor.example/menu" };
  state.intelligence = { ...newIntelligence(intelligenceInputFor(state), "market", NOW), status: "done", competitor };
  expect(starterMarketFinding(state)).toEqual({
    category: "concurrence", title: competitor.name, content: competitor.fact,
    sourceUrl: competitor.source, sourceStatus: null, certainty: "a_verifier",
  });
  expect(starterPlan(state, ["social_post"]).missions[0].finding).not.toContain(competitor.source);
  expect(starterMarketFinding({ ...state, profile: { ...state.profile, companyName: "Autre entreprise" } })).toBeNull();
});
